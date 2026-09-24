import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  accessRole,
  assetKind,
  assessmentQuestionKind,
  auditFields,
  employmentStatus,
  enrollmentStatus,
  generationStatus,
  lessonKind,
  lessonProgressStatus,
  moduleCategory,
  progressEventKind,
  publishState,
  questionDifficulty,
  reviewDecision,
  reviewStatus,
} from "./validators";

/**
 * Cliffview Academy schema.
 *
 * Two rules shape everything here:
 *
 * 1. Content and per-learner state are different tables. The old seed stored
 *    one hypothetical learner's `progressPercent` / `isCurrent` / `isComplete`
 *    on the shared content row, which is why a lesson's editorial publish state
 *    was derived from whether a demo user had finished it.
 * 2. Nothing derivable is stored. Counts, percentages and averages are computed
 *    from indexed rows or maintained in `counters` — never duplicated onto a
 *    parent document where they can silently disagree.
 *
 * Index names list every field in order, per Convex convention:
 * ["moduleId", "order"] becomes by_moduleId_and_order. The one exception is
 * `users.email`, which Convex Auth queries by the literal index name `email`.
 */
export default defineSchema({
  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  /**
   * Convex Auth tables: authSessions, authAccounts, authRefreshTokens,
   * authVerificationCodes, authVerifiers, authRateLimits. `users` is spread in
   * here too and then deliberately overridden below, because our staff profile
   * is the auth user — see the note on that table.
   */
  ...authTables,

  // ---------------------------------------------------------------------------
  // People and organisation
  // ---------------------------------------------------------------------------

  /**
   * School phases. A table, not a union: the dashboard phase list and the staff
   * records' phase strings used to be two unjoinable free-text lists, which is
   * why per-phase compliance could not be derived from staff at all. A school
   * can now add a phase without a deploy.
   */
  phases: defineTable({
    name: v.string(),
    order: v.number(),
    isActive: v.boolean(),
  }).index("by_order", ["order"]),

  /**
   * Staff profiles, and simultaneously the Convex Auth user table.
   *
   * They are one table on purpose. Convex Auth wants a `users` table it can
   * link accounts to, and a school already has exactly one list of people. The
   * `createOrUpdateUser` callback in `convex/auth.ts` never inserts here — it
   * resolves a sign-in to a pre-provisioned row by email and returns that id,
   * so our required fields can stay required and nobody can self-register into
   * the school.
   *
   * The optional `name` / `image` / `phone` / verification-time / `isAnonymous`
   * fields and the index literally named `email` are Convex Auth requirements,
   * not ours.
   */
  users: defineTable({
    // Name parts are split. The seed baked the honorific into `lastName`
    // ("Priya" / "Ms. Naidoo"), forcing a string-replace chain to get initials.
    honorific: v.optional(v.string()),
    firstName: v.string(),
    lastName: v.string(),
    preferredName: v.optional(v.string()),
    email: v.string(),
    /** Human job title: Teacher, Head of Department. Display only. */
    jobTitle: v.string(),
    /** Authorization fact. Never inferred from jobTitle. */
    accessRole,
    phaseId: v.id("phases"),
    employmentStatus,
    /** Awards, not derivable from progress rows, so genuinely stored. */
    cptdPoints: v.number(),
    xpTotal: v.number(),
    /**
     * Rollup recomputed from `enrollments` by a single writer, never
     * incremented blindly. Stored so the directory does not have to read every
     * enrollment row per staff member.
     */
    compliancePercent: v.number(),
    lastActiveAt: v.optional(v.number()),
    /**
     * Time-boxed permission for an admin row to be claimed by a sign-up.
     *
     * Admin profiles never self-claim: without email verification configured,
     * anyone who knew an admin address could otherwise become that admin. An
     * operator opens a short window with `internal.auth.allowAdminClaim`, and
     * the claim clears it.
     *
     * Staff rows use `staffInvites` instead: a mailed, hashed, single-use
     * token rather than a bare time window, because a teacher is invited by
     * email while an operator provisions an admin out of band.
     */
    adminClaimAllowedUntil: v.optional(v.number()),

    // --- Convex Auth's own optional user fields ---
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    phone: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
  })
    // Convex Auth looks this index up by the literal name `email`.
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_phaseId_and_employmentStatus", ["phaseId", "employmentStatus"])
    .index("by_accessRole", ["accessRole"])
    .index("by_employmentStatus_and_xpTotal", ["employmentStatus", "xpTotal"]),

  /**
   * Invitations to set a first password.
   *
   * A table rather than fields on `users` because an invitation is an event
   * with a lifetime — issued, superseded, spent exactly once — and not a
   * property of a person. Putting it on `users` would also park a live
   * credential on the row that every admin directory read already returns.
   *
   * Only the SHA-256 of the token is stored. The raw value exists in exactly
   * two places, the sent email and the invitee's URL bar, so a dump of this
   * table yields nothing redeemable. Convex Auth stores its own verification
   * codes the same way.
   */
  staffInvites: defineTable({
    userId: v.id("users"),
    /**
     * The address the link was posted to, frozen at issue time. Not a
     * duplicate of `users.email` but a fact about a delivery: it is what makes
     * correcting a mistyped address invalidate the old link automatically,
     * with no second rule for `staff.update` to remember.
     */
    email: v.string(),
    /** Lowercase hex SHA-256 of the raw token. Never the token itself. */
    tokenHash: v.string(),
    expiresAt: v.number(),
    invitedBy: v.id("users"),
    /** Stamped in the same transaction that inserts the credential. */
    consumedAt: v.optional(v.number()),
    /** Stamped when a newer invitation supersedes this one. */
    revokedAt: v.optional(v.number()),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_userId", ["userId"]),

  // ---------------------------------------------------------------------------
  // Content
  // ---------------------------------------------------------------------------

  modules: defineTable({
    /** Durable, shareable address. Uniqueness is a mutation invariant. */
    slug: v.string(),
    /** Display ordinal shown as "Module 01". Cosmetic. */
    number: v.string(),
    /** Real ordering key, and the input to deriving learner locked state. */
    sequence: v.number(),
    title: v.string(),
    description: v.string(),
    audience: v.string(),
    outcome: v.string(),
    category: moduleCategory,
    durationMinutes: v.number(),
    cptdPoints: v.number(),
    passMark: v.number(),
    format: v.string(),
    /** Editorial state. Replaced a learner-progress union misused as one. */
    publishState,
    publishedAt: v.optional(v.number()),
    featuredAssetId: v.optional(v.id("assets")),
    ...auditFields,
  })
    .index("by_slug", ["slug"])
    .index("by_sequence", ["sequence"])
    .index("by_publishState_and_sequence", ["publishState", "sequence"])
    .index("by_category_and_sequence", ["category", "sequence"]),

  /**
   * Objectives are rows, not a string array on the module: the admin UI adds,
   * edits and reorders them individually, an array field means a
   * read-modify-write of the whole parent document, and row ids fix the
   * duplicate-text React key collision in the module editor.
   */
  moduleObjectives: defineTable({
    moduleId: v.id("modules"),
    text: v.string(),
    order: v.number(),
  }).index("by_moduleId_and_order", ["moduleId", "order"]),

  lessons: defineTable({
    moduleId: v.id("modules"),
    /**
     * Module-scoped slug, so existing learner URLs keep working. The seed ids
     * such as why-this-matters repeat across modules, which is fine once the
     * parent scopes the lookup.
     */
    slug: v.string(),
    title: v.string(),
    summary: v.string(),
    kind: lessonKind,
    order: v.number(),
    /**
     * A number, not "5 min". "Quiz" was never a duration; it follows from
     * kind === "assessment" and is rendered by the presenter.
     */
    durationMinutes: v.optional(v.number()),
    publishState,
    /** Hero media is an asset reference, matching modules. */
    heroAssetId: v.optional(v.id("assets")),
    heroTitleOverride: v.optional(v.string()),
    heroDescriptionOverride: v.optional(v.string()),
    scenarioTitle: v.optional(v.string()),
    scenarioBody: v.optional(v.string()),
    reflectionPrompt: v.optional(v.string()),
    ...auditFields,
  })
    .index("by_moduleId_and_order", ["moduleId", "order"])
    .index("by_moduleId_and_slug", ["moduleId", "slug"])
    .index("by_moduleId_and_publishState", ["moduleId", "publishState"]),

  assets: defineTable({
    moduleId: v.id("modules"),
    title: v.string(),
    description: v.string(),
    kind: assetKind,
    publishState,
    order: v.number(),
    /**
     * File storage is Cloudflare R2, reached through the `@convex-dev/r2`
     * component, so this is an opaque R2 object key and not an `Id<"_storage">`.
     * Phase 1 guessed the built-in storage and declared `storageId` early to
     * avoid a schema change here; that guess was wrong, and the rename is what
     * consent gate G8 actually covered. Every row had the field unset, so no
     * data moved.
     *
     * All optional: a seeded placeholder asset has no file yet.
     */
    r2Key: v.optional(v.string()),
    fileName: v.optional(v.string()),
    contentType: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
    pageCount: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    /**
     * Free-text note standing in for derived file facts until a real file is
     * attached — where the seed prose such as "PDF, 12 pages" lands. Once a
     * file exists the presenter derives the meta line from contentType and
     * sizeBytes and falls back to this.
     */
    metaNote: v.optional(v.string()),
    ...auditFields,
  })
    .index("by_moduleId_and_order", ["moduleId", "order"])
    .index("by_moduleId_and_kind", ["moduleId", "kind"])
    /**
     * Reverse lookup by object key. Two assets must never share one blob, or
     * deleting either would break the other, and `onSyncMetadata` needs to find
     * the asset a freshly-synced key belongs to.
     */
    .index("by_r2Key", ["r2Key"]),

  /**
   * Lesson-to-asset join. Replaces the inline documentIds string array, whose
   * resolver silently returned every non-video asset when the join was empty or
   * dangling, so a brand-new lesson reported three attached assets. An empty
   * join now returns nothing, and by_assetId gives the reverse lookup the asset
   * editor usage panel needs.
   */
  lessonAssets: defineTable({
    lessonId: v.id("lessons"),
    assetId: v.id("assets"),
    order: v.number(),
  })
    .index("by_lessonId_and_order", ["lessonId", "order"])
    .index("by_assetId", ["assetId"])
    .index("by_lessonId_and_assetId", ["lessonId", "assetId"]),

  /**
   * The module's assessment questions.
   *
   * Scoped to the module, like `moduleObjectives`, not to the assessment
   * lesson. A module has one assessment; the lesson of kind `assessment` is
   * merely where a learner sits it, which is what `assessmentAttempts.lessonId`
   * records.
   *
   * Deliberately NOT `aiQuestions`. That table is the AI review staging queue,
   * carrying a `reviewStatus` and a confidence score for work nobody has
   * approved yet. This one is authored content an admin stands behind. The two
   * have different lifecycles, and `aiQuestions.prompt` plus its options map
   * one-to-one onto `questions.save`, so importing an approved question later
   * is a small function rather than a schema migration.
   *
   * No `publishState`. The module's own state gates the assessment, and
   * `questions.save` refuses to write a question that is not gradable, so a
   * stored question is always well-formed. A third editorial state here would
   * be one nobody could reconcile against the module's.
   */
  assessmentQuestions: defineTable({
    moduleId: v.id("modules"),
    kind: assessmentQuestionKind,
    prompt: v.string(),
    order: v.number(),
    ...auditFields,
  }).index("by_moduleId_and_order", ["moduleId", "order"]),

  /**
   * Options for one question. Exactly one has `isCorrect: true`.
   *
   * That invariant spans the whole set, which is why `questions.save` writes a
   * question and all of its options in one transaction rather than exposing a
   * per-option mutation: there would otherwise be reachable instants where zero
   * or two options were correct, and the learner reads live data.
   *
   * Required rather than optional, for the reason already recorded on
   * `aiQuestionOptions`: the seed omitted it on wrong answers, so `undefined`
   * and `false` both meant wrong.
   *
   * No `key` field. `aiQuestionOptions` stores "A"/"B"/"C"/"D", which is
   * display prose derived from `order`; the presenter builds it.
   */
  assessmentQuestionOptions: defineTable({
    questionId: v.id("assessmentQuestions"),
    text: v.string(),
    isCorrect: v.boolean(),
    order: v.number(),
  }).index("by_questionId_and_order", ["questionId", "order"]),

  // ---------------------------------------------------------------------------
  // Per-learner state
  // ---------------------------------------------------------------------------

  /** One row per user and module: the assignment plus its progress rollup. */
  enrollments: defineTable({
    userId: v.id("users"),
    moduleId: v.id("modules"),
    status: enrollmentStatus,
    progressPercent: v.number(),
    assignedAt: v.number(),
    dueAt: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    lastAccessedAt: v.optional(v.number()),
    /** Best assessment score as a percent. Undefined means never attempted. */
    score: v.optional(v.number()),
  })
    .index("by_userId_and_moduleId", ["userId", "moduleId"])
    .index("by_userId_and_status", ["userId", "status"])
    .index("by_moduleId_and_status", ["moduleId", "status"]),

  /**
   * High-churn per-lesson state, deliberately its own table rather than an
   * array on enrollments: every lesson view would otherwise rewrite and
   * contend on the enrollment document.
   */
  lessonProgress: defineTable({
    userId: v.id("users"),
    lessonId: v.id("lessons"),
    moduleId: v.id("modules"),
    status: lessonProgressStatus,
    lastViewedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_userId_and_lessonId", ["userId", "lessonId"])
    .index("by_userId_and_moduleId", ["userId", "moduleId"])
    // Needed so deleting a lesson can clear its progress rows.
    .index("by_lessonId", ["lessonId"]),

  assessmentAttempts: defineTable({
    userId: v.id("users"),
    moduleId: v.id("modules"),
    lessonId: v.optional(v.id("lessons")),
    scorePercent: v.number(),
    passed: v.boolean(),
    attemptedAt: v.number(),
  })
    .index("by_userId_and_moduleId", ["userId", "moduleId"])
    .index("by_moduleId_and_attemptedAt", ["moduleId", "attemptedAt"]),

  /**
   * Badges a person has earned, one row per award.
   *
   * A deliberate exception to "nothing derivable is stored", and worth stating
   * why. Most badge conditions could be recomputed at read time — but a badge
   * like a three-day streak must stay earned once the streak lapses, and
   * "when did I earn this" is not derivable from anything. Storing the award
   * is what makes it an achievement rather than a live status light.
   *
   * `badgeKey` is a string, not a union, so adding a badge to
   * `convex/lib/awards.ts` needs no schema push. An unknown key is ignored at
   * read time rather than rendered as a hole.
   */
  badgeAwards: defineTable({
    userId: v.id("users"),
    badgeKey: v.string(),
    awardedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    // Awarding probes this first, which is what makes it idempotent.
    .index("by_userId_and_badgeKey", ["userId", "badgeKey"]),

  // ---------------------------------------------------------------------------
  // AI question review
  // ---------------------------------------------------------------------------

  /**
   * A generation run. Phase 7 subscribes to this instead of the client-side
   * interval simulation. No generation pipeline exists yet, so rows come from
   * the seed or a later import.
   */
  aiGenerations: defineTable({
    status: generationStatus,
    sourceFileName: v.optional(v.string()),
    /** R2 object key, same as `assets.r2Key`. Renamed here in Phase 6 too, so
     * Phase 7 needs no second schema gate to attach a real source file. */
    r2Key: v.optional(v.string()),
    moduleId: v.optional(v.id("modules")),
    requestedBy: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    questionCount: v.number(),
    errorMessage: v.optional(v.string()),
  }).index("by_status_and_startedAt", ["status", "startedAt"]),

  aiQuestions: defineTable({
    /** A real reference. The seed carried only a moduleTitle display string. */
    moduleId: v.id("modules"),
    generationId: v.optional(v.id("aiGenerations")),
    prompt: v.string(),
    difficulty: questionDifficulty,
    confidencePercent: v.number(),
    /**
     * Server-owned. Decisions used to live in React state and vanish on
     * refresh.
     */
    status: reviewStatus,
    reviewedBy: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    /**
     * The assessment question an approval produced.
     *
     * Optional because a rejected draft produces none, and because every row
     * written before this field existed has none. Without it there is no way
     * to find what a draft became — which is how an approval could be
     * reversed on the draft while the real question stayed on the module with
     * nothing pointing at it.
     */
    assessmentQuestionId: v.optional(v.id("assessmentQuestions")),
  })
    .index("by_status", ["status"])
    .index("by_moduleId_and_status", ["moduleId", "status"])
    .index("by_generationId", ["generationId"]),

  aiQuestionOptions: defineTable({
    questionId: v.id("aiQuestions"),
    /** Display key: A, B, C, D. */
    key: v.string(),
    text: v.string(),
    /**
     * Required. The seed omitted it on wrong answers, so undefined and false
     * both meant wrong.
     */
    isCorrect: v.boolean(),
    order: v.number(),
  }).index("by_questionId_and_order", ["questionId", "order"]),

  /** Append-only audit, never updated, so review history survives. */
  aiReviewDecisions: defineTable({
    questionId: v.id("aiQuestions"),
    decision: reviewDecision,
    reviewerId: v.optional(v.string()),
    decidedAt: v.number(),
    /** Set when the decision is edited, preserving what the reviewer changed. */
    editedPrompt: v.optional(v.string()),
    note: v.optional(v.string()),
  })
    .index("by_questionId_and_decidedAt", ["questionId", "decidedAt"])
    .index("by_decidedAt", ["decidedAt"]),

  // ---------------------------------------------------------------------------
  // Analytics
  // ---------------------------------------------------------------------------

  /**
   * Append-only record of when things happened. Indexed on an explicit
   * occurredAt rather than _creationTime so it is unambiguously
   * range-scannable, and it is the only thing that can rebuild a rollup after a
   * bug — the alternative, trusting an incremented counter forever, is how the
   * seed numbers came to contradict their own rows.
   */
  progressEvents: defineTable({
    userId: v.id("users"),
    moduleId: v.optional(v.id("modules")),
    lessonId: v.optional(v.id("lessons")),
    kind: progressEventKind,
    occurredAt: v.number(),
    /** Sortable YYYY-MM, denormalized so rollups are one index range scan. */
    monthKey: v.string(),
  })
    .index("by_occurredAt", ["occurredAt"])
    .index("by_userId_and_occurredAt", ["userId", "occurredAt"])
    .index("by_monthKey_and_kind", ["monthKey", "kind"]),

  /**
   * The six-month completion trend, and the only honest source for a
   * month-over-month delta: a delta needs a past value, and nothing in the app
   * stored one, which is why the dashboard deltas were literals.
   */
  monthlyRollups: defineTable({
    monthKey: v.string(),
    completedModules: v.number(),
    averageCompliancePercent: v.optional(v.number()),
    totalStaff: v.optional(v.number()),
    snapshotAt: v.number(),
  }).index("by_monthKey", ["monthKey"]),

  /**
   * Denormalized counters, because Convex has no COUNT operator and
   * collect().length is forbidden on growable tables.
   */
  counters: defineTable({
    name: v.string(),
    value: v.number(),
  }).index("by_name", ["name"]),

  /** Who changed what. Written by admin mutations from Phase 5 onward. */
  auditLog: defineTable({
    actorId: v.optional(v.string()),
    action: v.string(),
    entityTable: v.string(),
    entityId: v.string(),
    at: v.number(),
    summary: v.optional(v.string()),
  })
    .index("by_at", ["at"])
    .index("by_entityTable_and_entityId", ["entityTable", "entityId"]),
});
