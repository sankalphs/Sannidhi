/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accessRequests from "../accessRequests.js";
import type * as accounts from "../accounts.js";
import type * as accountsInternal from "../accountsInternal.js";
import type * as analytics from "../analytics.js";
import type * as attendanceRequests from "../attendanceRequests.js";
import type * as challenges from "../challenges.js";
import type * as checkin from "../checkin.js";
import type * as classSessions from "../classSessions.js";
import type * as crons from "../crons.js";
import type * as demo from "../demo.js";
import type * as departments from "../departments.js";
import type * as devices from "../devices.js";
import type * as enrollment from "../enrollment.js";
import type * as history from "../history.js";
import type * as institutionPolicies from "../institutionPolicies.js";
import type * as invites from "../invites.js";
import type * as ledger from "../ledger.js";
import type * as lib_actor from "../lib/actor.js";
import type * as lib_analytics_projection from "../lib/analytics_projection.js";
import type * as lib_attendance_event from "../lib/attendance_event.js";
import type * as lib_policyContext from "../lib/policyContext.js";
import type * as lib_policyStore from "../lib/policyStore.js";
import type * as lib_retentionSweep from "../lib/retentionSweep.js";
import type * as lib_rosterSyncRows from "../lib/rosterSyncRows.js";
import type * as maintenance from "../maintenance.js";
import type * as offlineSync from "../offlineSync.js";
import type * as passkeys from "../passkeys.js";
import type * as passkeysInternal from "../passkeysInternal.js";
import type * as reviewAlerts from "../reviewAlerts.js";
import type * as rosterSync from "../rosterSync.js";
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
  accessRequests: typeof accessRequests;
  accounts: typeof accounts;
  accountsInternal: typeof accountsInternal;
  analytics: typeof analytics;
  attendanceRequests: typeof attendanceRequests;
  challenges: typeof challenges;
  checkin: typeof checkin;
  classSessions: typeof classSessions;
  crons: typeof crons;
  demo: typeof demo;
  departments: typeof departments;
  devices: typeof devices;
  enrollment: typeof enrollment;
  history: typeof history;
  institutionPolicies: typeof institutionPolicies;
  invites: typeof invites;
  ledger: typeof ledger;
  "lib/actor": typeof lib_actor;
  "lib/analytics_projection": typeof lib_analytics_projection;
  "lib/attendance_event": typeof lib_attendance_event;
  "lib/policyContext": typeof lib_policyContext;
  "lib/policyStore": typeof lib_policyStore;
  "lib/retentionSweep": typeof lib_retentionSweep;
  "lib/rosterSyncRows": typeof lib_rosterSyncRows;
  maintenance: typeof maintenance;
  offlineSync: typeof offlineSync;
  passkeys: typeof passkeys;
  passkeysInternal: typeof passkeysInternal;
  reviewAlerts: typeof reviewAlerts;
  rosterSync: typeof rosterSync;
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
