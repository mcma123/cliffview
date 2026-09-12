/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as assets from "../assets.js";
import type * as auth from "../auth.js";
import type * as dashboard from "../dashboard.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as learn from "../learn.js";
import type * as lessons from "../lessons.js";
import type * as lib_assessments from "../lib/assessments.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_awards from "../lib/awards.js";
import type * as lib_counts from "../lib/counts.js";
import type * as lib_email from "../lib/email.js";
import type * as lib_invitationEmail from "../lib/invitationEmail.js";
import type * as lib_invites from "../lib/invites.js";
import type * as lib_ordering from "../lib/ordering.js";
import type * as lib_progress from "../lib/progress.js";
import type * as lib_storage from "../lib/storage.js";
import type * as lib_time from "../lib/time.js";
import type * as modules from "../modules.js";
import type * as objectives from "../objectives.js";
import type * as questions from "../questions.js";
import type * as seed from "../seed.js";
import type * as seed_data from "../seed/data.js";
import type * as staff from "../staff.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  assets: typeof assets;
  auth: typeof auth;
  dashboard: typeof dashboard;
  http: typeof http;
  invites: typeof invites;
  learn: typeof learn;
  lessons: typeof lessons;
  "lib/assessments": typeof lib_assessments;
  "lib/audit": typeof lib_audit;
  "lib/authz": typeof lib_authz;
  "lib/awards": typeof lib_awards;
  "lib/counts": typeof lib_counts;
  "lib/email": typeof lib_email;
  "lib/invitationEmail": typeof lib_invitationEmail;
  "lib/invites": typeof lib_invites;
  "lib/ordering": typeof lib_ordering;
  "lib/progress": typeof lib_progress;
  "lib/storage": typeof lib_storage;
  "lib/time": typeof lib_time;
  modules: typeof modules;
  objectives: typeof objectives;
  questions: typeof questions;
  seed: typeof seed;
  "seed/data": typeof seed_data;
  staff: typeof staff;
  validators: typeof validators;
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

export declare const components: {
  r2: import("@convex-dev/r2/_generated/component.js").ComponentApi<"r2">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
};
