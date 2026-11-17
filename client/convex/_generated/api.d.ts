/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _lib_workerAuth from "../_lib/workerAuth.js";
import type * as answers from "../answers.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as interviews from "../interviews.js";
import type * as maintenance from "../maintenance.js";
import type * as rateLimits from "../rateLimits.js";
import type * as reports from "../reports.js";
import type * as resume from "../resume.js";
import type * as transcriptText from "../transcriptText.js";
import type * as users from "../users.js";
import type * as worker from "../worker.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_lib/workerAuth": typeof _lib_workerAuth;
  answers: typeof answers;
  auth: typeof auth;
  crons: typeof crons;
  http: typeof http;
  interviews: typeof interviews;
  maintenance: typeof maintenance;
  rateLimits: typeof rateLimits;
  reports: typeof reports;
  resume: typeof resume;
  transcriptText: typeof transcriptText;
  users: typeof users;
  worker: typeof worker;
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
