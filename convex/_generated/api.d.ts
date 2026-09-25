/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiReview from "../aiReview.js";
import type * as aiReviewQueue from "../aiReviewQueue.js";
import type * as aiVideo from "../aiVideo.js";
import type * as aiVideoQueue from "../aiVideoQueue.js";
import type * as assets from "../assets.js";
import type * as auth from "../auth.js";
import type * as dashboard from "../dashboard.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as learn from "../learn.js";
import type * as lessons from "../lessons.js";
import type * as lib_aiDrafts from "../lib/aiDrafts.js";
import type * as lib_assessments from "../lib/assessments.js";
import type * as lib_assets from "../lib/assets.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_awards from "../lib/awards.js";
import type * as lib_counts from "../lib/counts.js";
import type * as lib_credentials from "../lib/credentials.js";
import type * as lib_deletion from "../lib/deletion.js";
import type * as lib_email from "../lib/email.js";
import type * as lib_enrollment from "../lib/enrollment.js";
import type * as lib_invitationEmail from "../lib/invitationEmail.js";
import type * as lib_invites from "../lib/invites.js";
import type * as lib_lessonMaterial from "../lib/lessonMaterial.js";
import type * as lib_openrouter from "../lib/openrouter.js";
import type * as lib_openrouterVideo from "../lib/openrouterVideo.js";
import type * as lib_ordering from "../lib/ordering.js";
import type * as lib_progress from "../lib/progress.js";
import type * as lib_questions from "../lib/questions.js";
import type * as lib_staffImport from "../lib/staffImport.js";
import type * as lib_storage from "../lib/storage.js";
import type * as lib_time from "../lib/time.js";
import type * as modules from "../modules.js";
import type * as objectives from "../objectives.js";
import type * as questions from "../questions.js";
import type * as reports from "../reports.js";
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
  aiReview: typeof aiReview;
  aiReviewQueue: typeof aiReviewQueue;
  aiVideo: typeof aiVideo;
  aiVideoQueue: typeof aiVideoQueue;
  assets: typeof assets;
  auth: typeof auth;
  dashboard: typeof dashboard;
  http: typeof http;
  invites: typeof invites;
  learn: typeof learn;
  lessons: typeof lessons;
  "lib/aiDrafts": typeof lib_aiDrafts;
  "lib/assessments": typeof lib_assessments;
  "lib/assets": typeof lib_assets;
  "lib/audit": typeof lib_audit;
  "lib/authz": typeof lib_authz;
  "lib/awards": typeof lib_awards;
  "lib/counts": typeof lib_counts;
  "lib/credentials": typeof lib_credentials;
  "lib/deletion": typeof lib_deletion;
  "lib/email": typeof lib_email;
  "lib/enrollment": typeof lib_enrollment;
  "lib/invitationEmail": typeof lib_invitationEmail;
  "lib/invites": typeof lib_invites;
  "lib/lessonMaterial": typeof lib_lessonMaterial;
  "lib/openrouter": typeof lib_openrouter;
  "lib/openrouterVideo": typeof lib_openrouterVideo;
  "lib/ordering": typeof lib_ordering;
  "lib/progress": typeof lib_progress;
  "lib/questions": typeof lib_questions;
  "lib/staffImport": typeof lib_staffImport;
  "lib/storage": typeof lib_storage;
  "lib/time": typeof lib_time;
  modules: typeof modules;
  objectives: typeof objectives;
  questions: typeof questions;
  reports: typeof reports;
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
