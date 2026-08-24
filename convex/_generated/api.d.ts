/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as checkin from "../checkin.js";
import type * as classSessions from "../classSessions.js";
import type * as crons from "../crons.js";
import type * as demo from "../demo.js";
import type * as devices from "../devices.js";
import type * as enrollment from "../enrollment.js";
import type * as history from "../history.js";
import type * as invites from "../invites.js";
import type * as ledger from "../ledger.js";
import type * as lib_actor from "../lib/actor.js";
import type * as maintenance from "../maintenance.js";
import type * as passkeys from "../passkeys.js";
import type * as passkeysInternal from "../passkeysInternal.js";
import type * as seed from "../seed.js";
import type * as sessions from "../sessions.js";
import type * as stepup from "../stepup.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  checkin: typeof checkin;
  classSessions: typeof classSessions;
  crons: typeof crons;
  demo: typeof demo;
  devices: typeof devices;
  enrollment: typeof enrollment;
  history: typeof history;
  invites: typeof invites;
  ledger: typeof ledger;
  "lib/actor": typeof lib_actor;
  maintenance: typeof maintenance;
  passkeys: typeof passkeys;
  passkeysInternal: typeof passkeysInternal;
  seed: typeof seed;
  sessions: typeof sessions;
  stepup: typeof stepup;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
