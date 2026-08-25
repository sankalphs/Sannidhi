"use node";

import { ConvexError, v } from "convex/values";

import {
  classifyIdentifier,
  describePasswordIssues,
  normalizeUsn,
  validateEmail,
  validatePassword,
  validateUsn,
} from "../src/lib/auth/password-policy";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";
import type { Role } from "../src/lib/auth/session";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import {
  LOGIN_FAILURE_MAX_ATTEMPTS,
  LOGIN_FAILURE_WINDOW_MS,
  MAX_SIGNUPS_PER_INSTITUTION_PER_HOUR,
  SIGNUP_WINDOW_MS,
} from "./accountsInternal";

const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 120;

type SessionIssued = { userId: string; role: Role; sid: string; expiresAt: number };

/**
 * Verifying a throwaway password against a fixed hash when the account does
 * not exist equalizes scrypt work between the "unknown identifier" and "wrong
 * password" paths, so response timing cannot enumerate users.
 */
let dummyHashCache: string | null = null;
async function burnScryptWork(password: string): Promise<void> {
  if (dummyHashCache === null) {
    dummyHashCache = await hashPassword("sannidhi-timing-equalizer-9f27c1d4b8a6");
  }
  await verifyPassword(password, dummyHashCache);
}

function assertValidSignupInput(args: {
  name: string;
  email: string;
  usn: string;
  password: string;
}): { name: string; email: string; usn: string; password: string } {
  const name = args.name.trim();
  if (name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH) {
    throw new ConvexError("Enter your full name (2–120 characters).");
  }

  const email = args.email.trim().toLowerCase();
  if (!validateEmail(email)) {
    throw new ConvexError("Enter a valid email address.");
  }

  const usnIssues = validateUsn(args.usn);
  if (usnIssues.length > 0) {
    throw new ConvexError("Enter a valid USN (4–24 letters and numbers).");
  }

  const passwordIssues = validatePassword(args.password);
  if (passwordIssues.length > 0) {
    throw new ConvexError(describePasswordIssues(passwordIssues));
  }

  return { name, email, usn: normalizeUsn(args.usn), password: args.password };
}

export const signUpWithPassword = action({
  args: {
    institutionCode: v.string(),
    name: v.string(),
    email: v.string(),
    usn: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args): Promise<SessionIssued> => {
    const input = assertValidSignupInput(args);

    const code = args.institutionCode.trim().toUpperCase();
    if (code.length === 0) {
      throw new ConvexError("Enter your institution's signup code.");
    }
    const institution = await ctx.runQuery(internal.accountsInternal.getInstitutionByCode, {
      code,
    });
    if (institution === null) {
      throw new ConvexError("No institution matches that signup code.");
    }

    const recentSignups = await ctx.runQuery(
      internal.accountsInternal.countInstitutionSignupsSince,
      { institutionId: institution._id, cutoff: Date.now() - SIGNUP_WINDOW_MS },
    );
    if (recentSignups >= MAX_SIGNUPS_PER_INSTITUTION_PER_HOUR) {
      throw new ConvexError("signup_rate_limited");
    }

    const existingByEmail = await ctx.runQuery(internal.accountsInternal.getUserByEmail, {
      email: input.email,
    });
    if (existingByEmail !== null) {
      throw new ConvexError("account_exists");
    }
    const existingByUsn = await ctx.runQuery(internal.accountsInternal.getUserByInstitutionUsn, {
      institutionId: institution._id,
      usn: input.usn,
    });
    if (existingByUsn !== null) {
      throw new ConvexError("usn_taken");
    }

    const passwordHash = await hashPassword(input.password);

    const created = await ctx.runMutation(internal.accountsInternal.createPasswordUser, {
      institutionId: institution._id,
      email: input.email,
      name: input.name,
      usn: input.usn,
      passwordHash,
    });

    const session = await ctx.runMutation(internal.sessions.createSession, {
      userId: created.userId,
    });
    return {
      userId: created.userId,
      role: "student" as const,
      sid: session.sid,
      expiresAt: session.expiresAt,
    };
  },
});

export const loginWithPassword = action({
  args: {
    identifier: v.string(),
    password: v.string(),
    institutionCode: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SessionIssued> => {
    const identifier = args.identifier.trim();
    const password = args.password;
    if (identifier.length === 0 || password.length === 0) {
      throw new ConvexError("invalid_credentials");
    }

    const kind = classifyIdentifier(identifier);
    let user: {
      _id: Id<"users">;
      institutionId: Id<"institutions">;
      status?: "invited" | "active" | "suspended";
    } | null = null;

    if (kind === "email") {
      user = await ctx.runQuery(internal.accountsInternal.getUserByEmail, {
        email: identifier.toLowerCase(),
      });
    } else {
      const code = (args.institutionCode ?? "").trim().toUpperCase();
      if (code.length === 0) {
        throw new ConvexError("USN sign-in needs your institution code.");
      }
      const institution = await ctx.runQuery(internal.accountsInternal.getInstitutionByCode, {
        code,
      });
      if (institution === null) {
        await burnScryptWork(password);
        throw new ConvexError("invalid_credentials");
      }
      user = await ctx.runQuery(internal.accountsInternal.getUserByInstitutionUsn, {
        institutionId: institution._id,
        usn: normalizeUsn(identifier),
      });
    }

    if (user === null) {
      await burnScryptWork(password);
      throw new ConvexError("invalid_credentials");
    }
    if (user.status === "suspended") {
      throw new ConvexError("account suspended");
    }

    const now = Date.now();
    const failures = await ctx.runQuery(
      internal.accountsInternal.countRecentPasswordLoginFailures,
      {
        userId: user._id,
        sinceMs: LOGIN_FAILURE_WINDOW_MS,
        now,
      },
    );
    if (failures >= LOGIN_FAILURE_MAX_ATTEMPTS) {
      await ctx.runMutation(internal.ledger.appendLedgerEvent, {
        institutionId: user.institutionId,
        category: "identity",
        type: "identity.password_login_rate_limited",
        subjectUserId: user._id,
        payload: { windowMs: LOGIN_FAILURE_WINDOW_MS, maxAttempts: LOGIN_FAILURE_MAX_ATTEMPTS },
      });
      throw new ConvexError("rate_limited");
    }

    const credential = await ctx.runQuery(internal.accountsInternal.getPasswordCredential, {
      userId: user._id,
    });
    const ok = credential !== null && (await verifyPassword(password, credential.hash));
    if (!ok) {
      await ctx.runMutation(internal.ledger.appendLedgerEvent, {
        institutionId: user.institutionId,
        category: "identity",
        type: "identity.password_login_failed",
        subjectUserId: user._id,
        payload: { via: kind },
      });
      throw new ConvexError("invalid_credentials");
    }

    const result = await ctx.runMutation(internal.accountsInternal.completePasswordLogin, {
      userId: user._id,
      via: kind,
    });
    return { userId: user._id, role: result.role, sid: result.sid, expiresAt: result.expiresAt };
  },
});
