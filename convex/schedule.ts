import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAdminUser } from "./lib/actor";

/**
 * Venues and the weekly timetable — what faculty start sessions from and
 * what the presence check measures against. Admin-only writes; every change
 * lands in the institution ledger.
 */

const MINUTES_PER_DAY = 24 * 60;
const MAX_GEOFENCE_METERS = 5000;

export type VenueRow = {
  id: Id<"venues">;
  name: string;
  capacity: number | null;
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusMeters: number | null;
  slotCount: number;
};

export type SlotRow = {
  id: Id<"timetable_slots">;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  sectionId: Id<"sections">;
  sectionLabel: string;
  venueId: Id<"venues">;
  venueName: string;
  facultyId: Id<"users"> | null;
  facultyName: string | null;
};

export type ScheduleOverview = {
  venues: VenueRow[];
  slots: SlotRow[];
  sections: Array<{ id: Id<"sections">; label: string }>;
  faculty: Array<{ id: Id<"users">; name: string; email: string }>;
};

async function institutionSections(
  ctx: QueryCtx | MutationCtx,
  institutionId: Id<"institutions">,
): Promise<Array<{ section: Doc<"sections">; course: Doc<"courses"> }>> {
  const courses = await ctx.db
    .query("courses")
    .withIndex("by_institution_code", (q) => q.eq("institutionId", institutionId))
    .collect();
  const rows: Array<{ section: Doc<"sections">; course: Doc<"courses"> }> = [];
  for (const course of courses) {
    const sections = await ctx.db
      .query("sections")
      .withIndex("by_course", (q) => q.eq("courseId", course._id))
      .collect();
    for (const section of sections) rows.push({ section, course });
  }
  return rows;
}

function sectionLabel(course: Doc<"courses">, section: Doc<"sections">): string {
  return section.name.startsWith(course.code) ? section.name : `${course.code} · ${section.name}`;
}

export const getScheduleOverview = query({
  args: { actorToken: v.string() },
  handler: async (ctx, args): Promise<ScheduleOverview> => {
    const admin = await requireAdminUser(ctx, args.actorToken);
    const [venues, sections, users] = await Promise.all([
      ctx.db
        .query("venues")
        .withIndex("by_institution", (q) => q.eq("institutionId", admin.institutionId))
        .collect(),
      institutionSections(ctx, admin.institutionId),
      ctx.db
        .query("users")
        .withIndex("by_institution", (q) => q.eq("institutionId", admin.institutionId))
        .collect(),
    ]);

    const venueById = new Map(venues.map((venue) => [venue._id, venue]));
    const userById = new Map(users.map((user) => [user._id, user]));
    const slots: SlotRow[] = [];
    const slotCountByVenue = new Map<Id<"venues">, number>();
    for (const { section, course } of sections) {
      const sectionSlots = await ctx.db
        .query("timetable_slots")
        .withIndex("by_section", (q) => q.eq("sectionId", section._id))
        .collect();
      for (const slot of sectionSlots) {
        slotCountByVenue.set(slot.venueId, (slotCountByVenue.get(slot.venueId) ?? 0) + 1);
        const faculty = slot.facultyId !== undefined ? userById.get(slot.facultyId) : undefined;
        slots.push({
          id: slot._id,
          dayOfWeek: slot.dayOfWeek,
          startMinutes: slot.startMinutes,
          endMinutes: slot.endMinutes,
          sectionId: section._id,
          sectionLabel: sectionLabel(course, section),
          venueId: slot.venueId,
          venueName: venueById.get(slot.venueId)?.name ?? "Unknown venue",
          facultyId: faculty?._id ?? null,
          facultyName: faculty?.name ?? null,
        });
      }
    }

    return {
      venues: venues
        .map((venue) => ({
          id: venue._id,
          name: venue.name,
          capacity: venue.capacity ?? null,
          latitude: venue.latitude ?? null,
          longitude: venue.longitude ?? null,
          geofenceRadiusMeters: venue.geofenceRadiusMeters ?? null,
          slotCount: slotCountByVenue.get(venue._id) ?? 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      slots: slots.sort(
        (a, b) =>
          a.dayOfWeek - b.dayOfWeek ||
          a.startMinutes - b.startMinutes ||
          a.sectionLabel.localeCompare(b.sectionLabel),
      ),
      sections: sections
        .map(({ section, course }) => ({ id: section._id, label: sectionLabel(course, section) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      faculty: users
        .filter((user) => user.role === "faculty" && user.status !== "suspended")
        .map((user) => ({ id: user._id, name: user.name, email: user.email }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});

type VenueInput = {
  name: string;
  capacity?: number;
  latitude?: number;
  longitude?: number;
  geofenceRadiusMeters?: number;
};

const venueFields = {
  name: v.string(),
  capacity: v.optional(v.number()),
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
  geofenceRadiusMeters: v.optional(v.number()),
};

/** Validates venue input; coordinates come as a pair with a radius, or not at all. */
export function normalizeVenueInput(input: VenueInput): VenueInput {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80)
    throw new ConvexError("Venue name must be 2–80 characters");
  const out: VenueInput = { name };
  if (input.capacity !== undefined) {
    if (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 5000) {
      throw new ConvexError("Capacity must be a whole number between 1 and 5000");
    }
    out.capacity = input.capacity;
  }
  const hasLat = input.latitude !== undefined;
  const hasLng = input.longitude !== undefined;
  if (hasLat !== hasLng) throw new ConvexError("Enter both latitude and longitude, or neither");
  if (hasLat && hasLng) {
    const lat = input.latitude as number;
    const lng = input.longitude as number;
    if (!Number.isFinite(lat) || lat < -90 || lat > 90)
      throw new ConvexError("Latitude must be between -90 and 90");
    if (!Number.isFinite(lng) || lng < -180 || lng > 180)
      throw new ConvexError("Longitude must be between -180 and 180");
    const radius = input.geofenceRadiusMeters ?? 100;
    if (!Number.isFinite(radius) || radius < 10 || radius > MAX_GEOFENCE_METERS) {
      throw new ConvexError(`Geofence radius must be between 10 and ${MAX_GEOFENCE_METERS} metres`);
    }
    out.latitude = lat;
    out.longitude = lng;
    out.geofenceRadiusMeters = Math.round(radius);
  } else if (input.geofenceRadiusMeters !== undefined) {
    throw new ConvexError("A geofence radius needs venue coordinates");
  }
  return out;
}

async function requireInstitutionVenue(
  ctx: MutationCtx,
  admin: Doc<"users">,
  venueId: Id<"venues">,
): Promise<Doc<"venues">> {
  const venue = await ctx.db.get(venueId);
  if (venue === null || venue.institutionId !== admin.institutionId) {
    throw new ConvexError("Venue not found");
  }
  return venue;
}

async function assertUniqueVenueName(
  ctx: MutationCtx,
  institutionId: Id<"institutions">,
  name: string,
  exceptId?: Id<"venues">,
): Promise<void> {
  const venues = await ctx.db
    .query("venues")
    .withIndex("by_institution", (q) => q.eq("institutionId", institutionId))
    .collect();
  const clash = venues.find(
    (venue) => venue._id !== exceptId && venue.name.toLowerCase() === name.toLowerCase(),
  );
  if (clash !== undefined) throw new ConvexError("A venue with that name already exists");
}

async function logScheduleEvent(
  ctx: MutationCtx,
  admin: Doc<"users">,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await ctx.runMutation(internal.ledger.appendLedgerEvent, {
    institutionId: admin.institutionId,
    category: "attendance",
    type,
    actorUserId: admin._id,
    payload,
  });
}

export const createVenue = mutation({
  args: { actorToken: v.string(), ...venueFields },
  handler: async (ctx, { actorToken, ...input }) => {
    const admin = await requireAdminUser(ctx, actorToken);
    const venue = normalizeVenueInput(input);
    await assertUniqueVenueName(ctx, admin.institutionId, venue.name);
    const venueId = await ctx.db.insert("venues", { institutionId: admin.institutionId, ...venue });
    await logScheduleEvent(ctx, admin, "schedule.venue_created", { venueId, name: venue.name });
    return { venueId };
  },
});

export const updateVenue = mutation({
  args: { actorToken: v.string(), venueId: v.id("venues"), ...venueFields },
  handler: async (ctx, { actorToken, venueId, ...input }) => {
    const admin = await requireAdminUser(ctx, actorToken);
    await requireInstitutionVenue(ctx, admin, venueId);
    const venue = normalizeVenueInput(input);
    await assertUniqueVenueName(ctx, admin.institutionId, venue.name, venueId);
    // Replace, not merge: clearing coordinates must actually clear them.
    await ctx.db.patch(venueId, {
      name: venue.name,
      capacity: venue.capacity,
      latitude: venue.latitude,
      longitude: venue.longitude,
      geofenceRadiusMeters: venue.geofenceRadiusMeters,
    });
    await logScheduleEvent(ctx, admin, "schedule.venue_updated", { venueId, name: venue.name });
    return { ok: true as const };
  },
});

/** Venues referenced by a timetable slot or any past session stay, so history keeps its place. */
export const deleteVenue = mutation({
  args: { actorToken: v.string(), venueId: v.id("venues") },
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx, args.actorToken);
    const venue = await requireInstitutionVenue(ctx, admin, args.venueId);
    const slot = await ctx.db
      .query("timetable_slots")
      .withIndex("by_venue", (q) => q.eq("venueId", args.venueId))
      .first();
    if (slot !== null) throw new ConvexError("Remove this venue's timetable slots first");
    const sessions = await ctx.db
      .query("class_sessions")
      .withIndex("by_institution_status", (q) => q.eq("institutionId", admin.institutionId))
      .filter((q) => q.eq(q.field("venueId"), args.venueId))
      .first();
    if (sessions !== null)
      throw new ConvexError("This venue has session history and cannot be deleted");
    const policy = await ctx.db
      .query("policy_rows")
      .withIndex("by_institution_scope_venue", (q) =>
        q.eq("institutionId", admin.institutionId).eq("scope", "venue").eq("venueId", args.venueId),
      )
      .first();
    if (policy !== null) throw new ConvexError("Clear this venue's policy override first");
    await ctx.db.delete(args.venueId);
    await logScheduleEvent(ctx, admin, "schedule.venue_deleted", {
      venueId: args.venueId,
      name: venue.name,
    });
    return { ok: true as const };
  },
});

/** Pure overlap check on half-open [start, end) minute ranges. */
export function rangesOverlap(
  a: { startMinutes: number; endMinutes: number },
  b: { startMinutes: number; endMinutes: number },
): boolean {
  return a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}

export const createSlot = mutation({
  args: {
    actorToken: v.string(),
    sectionId: v.id("sections"),
    venueId: v.id("venues"),
    dayOfWeek: v.number(),
    startMinutes: v.number(),
    endMinutes: v.number(),
    facultyId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx, args.actorToken);
    if (!Number.isInteger(args.dayOfWeek) || args.dayOfWeek < 0 || args.dayOfWeek > 6) {
      throw new ConvexError("Pick a day of the week");
    }
    const { startMinutes, endMinutes } = args;
    if (
      !Number.isInteger(startMinutes) ||
      !Number.isInteger(endMinutes) ||
      startMinutes < 0 ||
      endMinutes > MINUTES_PER_DAY ||
      endMinutes <= startMinutes
    ) {
      throw new ConvexError("End time must be after start time on the same day");
    }

    const section = await ctx.db.get(args.sectionId);
    const course = section !== null ? await ctx.db.get(section.courseId) : null;
    if (section === null || course === null || course.institutionId !== admin.institutionId) {
      throw new ConvexError("Section not found");
    }
    const venue = await requireInstitutionVenue(ctx, admin, args.venueId);
    if (args.facultyId !== undefined) {
      const faculty = await ctx.db.get(args.facultyId);
      if (
        faculty === null ||
        faculty.institutionId !== admin.institutionId ||
        faculty.role !== "faculty"
      ) {
        throw new ConvexError("Faculty member not found");
      }
      const facultySlots = await ctx.db
        .query("timetable_slots")
        .withIndex("by_faculty_day", (q) =>
          q.eq("facultyId", args.facultyId).eq("dayOfWeek", args.dayOfWeek),
        )
        .collect();
      if (facultySlots.some((slot) => rangesOverlap(slot, args))) {
        throw new ConvexError("That faculty member already teaches at this time");
      }
    }

    const venueSlots = await ctx.db
      .query("timetable_slots")
      .withIndex("by_venue", (q) => q.eq("venueId", args.venueId))
      .collect();
    if (venueSlots.some((slot) => slot.dayOfWeek === args.dayOfWeek && rangesOverlap(slot, args))) {
      throw new ConvexError(`${venue.name} is already booked at this time`);
    }
    const sectionSlots = await ctx.db
      .query("timetable_slots")
      .withIndex("by_section", (q) => q.eq("sectionId", args.sectionId))
      .collect();
    if (
      sectionSlots.some((slot) => slot.dayOfWeek === args.dayOfWeek && rangesOverlap(slot, args))
    ) {
      throw new ConvexError("This section already has a class at this time");
    }

    const slotId = await ctx.db.insert("timetable_slots", {
      sectionId: args.sectionId,
      venueId: args.venueId,
      dayOfWeek: args.dayOfWeek,
      startMinutes,
      endMinutes,
      ...(args.facultyId !== undefined ? { facultyId: args.facultyId } : {}),
    });
    await logScheduleEvent(ctx, admin, "schedule.slot_created", {
      slotId,
      sectionId: args.sectionId,
      venueId: args.venueId,
      dayOfWeek: args.dayOfWeek,
      startMinutes,
      endMinutes,
    });
    return { slotId };
  },
});

/** Past sessions keep their own section/venue copy, so removing a slot never rewrites history. */
export const deleteSlot = mutation({
  args: { actorToken: v.string(), slotId: v.id("timetable_slots") },
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx, args.actorToken);
    const slot = await ctx.db.get(args.slotId);
    const section = slot !== null ? await ctx.db.get(slot.sectionId) : null;
    const course = section !== null ? await ctx.db.get(section.courseId) : null;
    if (slot === null || course === null || course.institutionId !== admin.institutionId) {
      throw new ConvexError("Timetable slot not found");
    }
    await ctx.db.delete(args.slotId);
    await logScheduleEvent(ctx, admin, "schedule.slot_deleted", {
      slotId: args.slotId,
      sectionId: slot.sectionId,
    });
    return { ok: true as const };
  },
});
