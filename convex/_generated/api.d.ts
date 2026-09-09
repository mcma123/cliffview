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
import type * as dashboard from "../dashboard.js";
import type * as lessons from "../lessons.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_counts from "../lib/counts.js";
import type * as lib_ordering from "../lib/ordering.js";
import type * as lib_time from "../lib/time.js";
import type * as modules from "../modules.js";
import type * as seed from "../seed.js";
import type * as seed_data from "../seed/data.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  assets: typeof assets;
  dashboard: typeof dashboard;
  lessons: typeof lessons;
  "lib/audit": typeof lib_audit;
  "lib/authz": typeof lib_authz;
  "lib/counts": typeof lib_counts;
  "lib/ordering": typeof lib_ordering;
  "lib/time": typeof lib_time;
  modules: typeof modules;
  seed: typeof seed;
  "seed/data": typeof seed_data;
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

export declare const components: {};
