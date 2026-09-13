import type { FunctionReturnType } from "convex/server";

import type { api } from "../../../convex/_generated/api";

/**
 * Admin presenters.
 *
 * These are pure functions from Convex query results to view-models. They own
 * every user-facing string and every route href, which is why the backend
 * returns numbers and timestamps rather than prose: the same data can serve a
 * different label without a schema change or a deploy.
 *
 * They take no repository. The old `getAdminX(repo, ...)` use-cases have moved
 * here and lost that first argument — data now arrives from a route loader.
 *
 * `now` is passed in rather than read from the clock, so a presenter stays pure
 * and testable and matches the backend rule against wall-clock reads.
 */

type AdminOverview = FunctionReturnType<typeof api.dashboard.adminOverview>;
type ModuleLibrary = FunctionReturnType<typeof api.modules.listForAdmin>;
type ModuleDetail = FunctionReturnType<typeof api.modules.adminDetail>;
type LessonDetail = FunctionReturnType<typeof api.lessons.adminDetail>;
type AssetDetail = FunctionReturnType<typeof api.assets.adminDetail>;
type StaffDirectory = FunctionReturnType<typeof api.staff.directory>;
type StaffDetail = FunctionReturnType<typeof api.staff.detail>;

type PublishState = "draft" | "published" | "archived";
type AssetKind = "video" | "audio" | "document" | "worksheet";
type LessonKind = "video" | "audio" | "reading" | "case-study" | "assessment";
type AssessmentQuestionKind = "multiple_choice" | "true_false";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "Updated 2 days ago" — the label the seed used to store as prose. */
export function formatRelativeTime(at: number, now: number): string {
  const diff = Math.max(0, now - at);
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) {
    const mins = Math.floor(diff / MINUTE);
    return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(diff / DAY);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 31) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  }
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

export function formatUpdatedLabel(at: number, now: number): string {
  return `Updated ${formatRelativeTime(at, now)}`;
}

/**
 * "Quiz" was never a duration — it follows from the lesson being an
 * assessment. That is why the backend stores minutes and nothing else.
 */
export function formatLessonDuration(
  kind: LessonKind,
  durationMinutes: number | undefined,
): string {
  if (durationMinutes !== undefined) return `${durationMinutes} min`;
  return kind === "assessment" ? "Quiz" : "—";
}

/**
 * The asset meta line. Derived from real file facts once a file is attached in
 * Phase 6, falling back to the seeded note until then.
 */
export function formatAssetMeta(asset: {
  contentType?: string;
  sizeBytes?: number;
  pageCount?: number;
  durationSeconds?: number;
  metaNote?: string;
}): string {
  const parts: string[] = [];
  if (asset.contentType !== undefined) {
    parts.push((asset.contentType.split("/").pop() ?? asset.contentType).toUpperCase());
  }
  if (asset.sizeBytes !== undefined) parts.push(formatBytes(asset.sizeBytes));
  if (asset.pageCount !== undefined) parts.push(`${asset.pageCount} pages`);
  if (asset.durationSeconds !== undefined) {
    parts.push(`${Math.round(asset.durationSeconds / 60)} min`);
  }
  if (parts.length > 0) return parts.join(" · ");
  return asset.metaNote ?? "No file attached";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "Dec" from a sortable "YYYY-MM" month key. */
export function formatMonthShort(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-ZA", {
    month: "short",
    timeZone: "UTC",
  });
}

/** Human label for the editorial lifecycle. */
export function formatPublishState(state: PublishState): string {
  return state === "published" ? "Published" : state === "draft" ? "Draft" : "Archived";
}

// ---------------------------------------------------------------------------
// Hrefs — the single place admin and learner paths are constructed
// ---------------------------------------------------------------------------

export function getAdminModuleHref(slug: string): string {
  return `/academy/admin/modules/${slug}`;
}

export function getAdminLessonHref(moduleSlug: string, lessonSlug: string): string {
  return `/academy/admin/modules/${moduleSlug}/lessons/${lessonSlug}`;
}

export function getAdminStaffHref(staffId: string): string {
  return `/academy/admin/staff/${staffId}`;
}

export function getAdminAssetHref(moduleSlug: string, assetId: string): string {
  return `/academy/admin/modules/${moduleSlug}/assets/${assetId}`;
}

export function getModulePreviewHref(slug: string): string {
  return `/academy/modules/${slug}`;
}

export function getLessonPreviewHref(moduleSlug: string, lessonSlug: string): string {
  return `/academy/modules/${moduleSlug}/lesson/${lessonSlug}`;
}

// ---------------------------------------------------------------------------
// Screen presenters
// ---------------------------------------------------------------------------

/**
 * The SMT compliance overview.
 *
 * Every tile is derived. The old view-model carried four "+N this month"
 * deltas that were literals; a delta needs a past value, so a tile only gets a
 * `sub` line when the backend actually has one to compare against.
 */
export function presentAdminOverview(data: AdminOverview, now: number) {
  const complianceDelta =
    data.previousAverageCompliancePercent === null
      ? null
      : data.averageCompliancePercent - data.previousAverageCompliancePercent;

  return {
    dateLabel: new Date(now).toLocaleDateString("en-ZA", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    stats: [
      {
        label: "Total Staff",
        value: `${data.totalStaff}`,
        sub: "active staff accounts",
      },
      {
        label: "Modules Completed",
        value: `${data.completedModules}`,
        sub: "all time, across all staff",
      },
      {
        label: "Avg. Compliance",
        value: `${data.averageCompliancePercent}%`,
        // Signed, and only when a prior month was actually recorded.
        sub:
          complianceDelta === null
            ? "across active staff"
            : `${complianceDelta >= 0 ? "+" : ""}${complianceDelta}% vs last month`,
      },
      {
        label: "Pending AI Review",
        value: `${data.pendingAiReviewCount}`,
        sub:
          data.editedAiReviewCount > 0
            ? `${data.editedAiReviewCount} edited so far`
            : "questions awaiting review",
        actionHref: "/academy/admin/ai-review",
      },
    ],
    // Phases with nobody in them still render, at 0%, rather than being hidden:
    // an empty phase is a real fact about the school.
    phases: data.phases.map((phase) => ({
      name: phase.name,
      completionPercent: phase.completionPercent,
      staffCount: phase.staffCount,
    })),
    completionTrend: data.completionTrend.map((point) => ({
      monthKey: point.monthKey,
      month: formatMonthShort(point.monthKey),
      completedModules: point.completedModules,
    })),
    // Guard the divisor: an all-zero trend would otherwise divide by zero and
    // render NaN-height bars.
    trendMax: Math.max(1, ...data.completionTrend.map((p) => p.completedModules)),
  };
}

export function presentAdminModuleLibrary(rows: ModuleLibrary, now: number) {
  return {
    summary: `${rows.length} modules. Manage copy, lessons, and media placeholders.`,
    modules: rows.map(({ module, lessonCount, assetCount }) => ({
      id: module._id,
      number: module.number,
      title: module.title,
      category: module.category,
      publishState: module.publishState,
      publishLabel: formatPublishState(module.publishState),
      lessonCount,
      assetCount,
      updatedLabel: formatUpdatedLabel(module.contentUpdatedAt, now),
      href: getAdminModuleHref(module.slug),
    })),
  };
}

export function presentAdminModuleDetail(data: ModuleDetail, now: number) {
  const { module, objectives, lessons, assets, featuredAsset } = data;

  return {
    title: module.title,
    moduleNumberLabel: `Module ${module.number} · ${module.category}`,
    description: module.description,
    audience: module.audience,
    outcome: module.outcome,
    publishState: module.publishState,
    publishLabel: formatPublishState(module.publishState),
    previewPath: getModulePreviewHref(module.slug),
    format: module.format,
    questionCountLabel:
      data.questionCount === 0
        ? "No questions yet"
        : `${data.questionCount} question${data.questionCount === 1 ? "" : "s"}`,
    // Row ids, not the text. Keying by objective text collided whenever two
    // objectives read the same.
    objectives: objectives.map((objective) => ({ id: objective._id, text: objective.text })),
    stats: [
      { label: "Lessons", value: `${lessons.length}` },
      { label: "Assets", value: `${assets.length}` },
      { label: "Questions", value: `${data.questionCount}` },
      { label: "Pass Mark", value: `${module.passMark}%` },
      { label: "Updated", value: formatRelativeTime(module.contentUpdatedAt, now) },
    ],
    // Null when unset. The old resolver silently fell back to the first asset,
    // so a broken reference looked deliberate.
    featuredMedia:
      featuredAsset === null
        ? null
        : {
            id: featuredAsset._id,
            title: featuredAsset.title,
            kind: featuredAsset.kind,
            description: featuredAsset.description,
            meta: formatAssetMeta(featuredAsset),
            hasFile: featuredAsset.r2Key !== undefined,
            fileName: featuredAsset.fileName ?? null,
            href: getAdminAssetHref(module.slug, featuredAsset._id),
          },
    lessons: lessons.map(({ lesson, attachedAssetIds }) => ({
      id: lesson._id,
      slug: lesson.slug,
      order: lesson.order,
      title: lesson.title,
      kind: lesson.kind,
      summary: lesson.summary,
      durationLabel: formatLessonDuration(lesson.kind, lesson.durationMinutes),
      // A real count now. The old join returned every non-video asset when a
      // lesson had nothing attached, so a new lesson claimed three.
      attachedAssets: attachedAssetIds.length,
      attachedAssetIds,
      publishState: lesson.publishState,
      publishLabel: formatPublishState(lesson.publishState),
      href: getAdminLessonHref(module.slug, lesson.slug),
    })),
    resources: assets.map((asset) => ({
      id: asset._id,
      title: asset.title,
      kind: asset.kind,
      description: asset.description,
      meta: formatAssetMeta(asset),
      publishState: asset.publishState,
      publishLabel: formatPublishState(asset.publishState),
      hasFile: asset.r2Key !== undefined,
      fileName: asset.fileName ?? null,
      href: getAdminAssetHref(module.slug, asset._id),
    })),
  };
}

export function presentAdminLessonDetail(data: LessonDetail) {
  const { module, lesson, lessonCount, linkedAssets, heroAsset } = data;

  return {
    moduleTitle: module.title,
    modulePath: getAdminModuleHref(module.slug),
    previewPath: getLessonPreviewHref(module.slug, lesson.slug),
    lessonTitle: lesson.title,
    lessonOrderLabel: `Lesson ${lesson.order} of ${lessonCount}`,
    kind: lesson.kind,
    durationMinutes: lesson.durationMinutes ?? null,
    durationLabel: formatLessonDuration(lesson.kind, lesson.durationMinutes),
    summary: lesson.summary,
    publishState: lesson.publishState,
    publishLabel: formatPublishState(lesson.publishState),
    // Null, never synthesised prose. The old view-model filled these with
    // generated sentences, so an unauthored field was indistinguishable from an
    // authored one and a save would have persisted the placeholder as content.
    heroTitle: lesson.heroTitleOverride ?? heroAsset?.title ?? null,
    heroDescription: lesson.heroDescriptionOverride ?? heroAsset?.description ?? null,
    scenarioTitle: lesson.scenarioTitle ?? null,
    scenarioBody: lesson.scenarioBody ?? null,
    reflectionPrompt: lesson.reflectionPrompt ?? null,
    heroAsset:
      heroAsset === null
        ? null
        : {
            id: heroAsset._id,
            title: heroAsset.title,
            kind: heroAsset.kind,
            meta: formatAssetMeta(heroAsset),
            hasFile: heroAsset.r2Key !== undefined,
            fileName: heroAsset.fileName ?? null,
            href: getAdminAssetHref(module.slug, heroAsset._id),
          },
    linkedResources: linkedAssets.map((asset) => ({
      id: asset._id,
      title: asset.title,
      kind: asset.kind,
      meta: formatAssetMeta(asset),
      hasFile: asset.r2Key !== undefined,
      fileName: asset.fileName ?? null,
      publishState: asset.publishState,
      publishLabel: formatPublishState(asset.publishState),
      // The lesson editor could not open its own resources before: the old
      // view-model omitted the href.
      href: getAdminAssetHref(module.slug, asset._id),
    })),
  };
}

export function presentAdminAssetDetail(data: AssetDetail, now: number) {
  const { module, asset, usageReferences, isFeatured } = data;

  return {
    moduleTitle: module.title,
    modulePath: getAdminModuleHref(module.slug),
    previewPath: getModulePreviewHref(module.slug),
    assetTitle: asset.title,
    assetKind: asset.kind as AssetKind,
    assetMeta: formatAssetMeta(asset),
    assetDescription: asset.description,
    publishState: asset.publishState,
    publishLabel: formatPublishState(asset.publishState),
    isFeatured,
    hasFile: asset.r2Key !== undefined,
    fileName: asset.fileName ?? null,
    /**
     * Presigned and short-lived. Rendered straight into an href and never
     * stored anywhere — it is a credential, not an address.
     */
    fileUrl: data.fileUrl,
    updatedLabel: formatUpdatedLabel(asset.contentUpdatedAt, now),
    placeholderState:
      asset.r2Key !== undefined
        ? "File attached and ready for learner-side display"
        : asset.publishState === "published"
          ? "Published, but no file is attached yet"
          : "Draft placeholder pending upload",
    // Exact join matches only. The module editor and this panel used to
    // disagree, because one fell back to all non-video assets and the other
    // did not.
    usageReferences: usageReferences.map((lesson) => ({
      id: lesson._id,
      title: lesson.title,
      kind: lesson.kind,
      durationLabel: formatLessonDuration(lesson.kind, lesson.durationMinutes),
      href: getAdminLessonHref(module.slug, lesson.slug),
      previewHref: getLessonPreviewHref(module.slug, lesson.slug),
    })),
  };
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

/** Name parts are stored split, so a display name is assembled, never parsed. */
type NameParts = {
  /**
   * Nullable, not just optional. A cleared optional field can come back as
   * `null` rather than absent, and an `=== undefined` check would then render
   * the string "null" in front of somebody's name.
   */
  honorific?: string | null;
  firstName: string;
  lastName: string;
  preferredName?: string | null;
};

export function formatStaffName(user: NameParts): string {
  const honorific =
    user.honorific === undefined || user.honorific === null || user.honorific.trim().length === 0
      ? ""
      : `${user.honorific.trim()} `;
  return `${honorific}${user.firstName} ${user.lastName}`.trim();
}

/**
 * Initials from the two name fields.
 *
 * The old version did
 * `lastName.replace("Ms. ", "").replace("Mr. ", "").replace("Mrs. ", "")[0]`,
 * because the seed had baked the honorific into `lastName`. The schema splits
 * them, so there is nothing to strip — and that chain silently produced the
 * wrong letter for any honorific it did not list, "Dr." among them.
 */
export function formatStaffInitials(user: NameParts): string {
  return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
}

/** Never "0%" for someone who has simply never been assigned anything. */
export function formatCompliance(assignedModules: number, compliancePercent: number): string {
  return assignedModules === 0 ? "No modules assigned" : `${compliancePercent}%`;
}

function formatLastActive(lastActiveAt: number | undefined, now: number): string {
  return lastActiveAt === undefined ? "Never signed in" : formatRelativeTime(lastActiveAt, now);
}

const ROLE_LABELS: Record<string, string> = {
  staff: "Staff",
  smt_admin: "SMT admin",
  super_admin: "System operator",
};

export function formatAccessRole(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export function presentAdminStaffDirectory(data: StaffDirectory, now: number) {
  const rows = data.staff.map((row) => ({
    id: row.user._id,
    name: formatStaffName(row.user),
    initials: formatStaffInitials(row.user),
    email: row.user.email,
    jobTitle: row.user.jobTitle,
    accessRole: row.user.accessRole,
    accessRoleLabel: formatAccessRole(row.user.accessRole),
    phaseName: row.phaseName,
    isActive: row.user.employmentStatus === "active",
    compliancePercent: row.user.compliancePercent,
    complianceLabel: formatCompliance(row.assignedModules, row.user.compliancePercent),
    assignedModules: row.assignedModules,
    completedModules: row.completedModules,
    cptdPoints: row.user.cptdPoints,
    lastActiveLabel: formatLastActive(row.user.lastActiveAt, now),
    href: getAdminStaffHref(row.user._id),
  }));

  // Summaries describe **active** staff only, matching dashboard.adminOverview.
  // Averaging in someone who has left would make the school look less compliant
  // than it is, and the two screens would disagree.
  const active = rows.filter((row) => row.isActive);
  const totalStaff = active.length;

  return {
    summary: {
      totalStaff,
      inactiveStaff: rows.length - totalStaff,
      avgCompliance:
        totalStaff === 0
          ? 0
          : Math.round(active.reduce((sum, row) => sum + row.compliancePercent, 0) / totalStaff),
      highPerformers: active.filter((row) => row.compliancePercent >= 80).length,
    },
    rows,
    phaseOptions: data.phases.map((phase) => ({ id: phase._id, name: phase.name })),
  };
}

const ENROLLMENT_LABELS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  waived: "Waived",
};

export function presentAdminStaffDetail(data: StaffDetail, now: number) {
  const { user, modules } = data;
  const completed = modules.filter((row) => row.enrollment.status === "completed").length;
  const assignedIds = new Set(modules.map((row) => row.module._id));

  // Derived here, never stored: the backend returns `hasPassword` and a raw
  // expiry, and `now` arrives from the route loader, because a Convex query
  // may not read the clock.
  const { hasPassword, inviteExpiresAt, invitable } = data.credential;
  const inviteLive = inviteExpiresAt !== null && inviteExpiresAt > now;
  const inviteStatusLabel = hasPassword
    ? "Password set"
    : inviteLive
      ? `Invitation sent — expires ${formatRelativeTime(inviteExpiresAt, now).replace(" ago", " from now")}`
      : inviteExpiresAt === null
        ? "No invitation sent yet"
        : "Invitation expired";

  return {
    id: user._id,
    name: formatStaffName(user),
    initials: formatStaffInitials(user),
    email: user.email,
    jobTitle: user.jobTitle,
    accessRole: user.accessRole,
    accessRoleLabel: formatAccessRole(user.accessRole),
    phaseId: user.phaseId,
    phaseName: data.phaseName,
    isActive: user.employmentStatus === "active",
    compliancePercent: user.compliancePercent,
    complianceLabel: formatCompliance(modules.length, user.compliancePercent),
    // The edit form needs the raw fields, not the display strings, or saving
    // would write "Mr. Hendrik" back into firstName.
    form: {
      honorific: user.honorific ?? "",
      firstName: user.firstName,
      lastName: user.lastName,
      preferredName: user.preferredName ?? "",
      email: user.email,
      jobTitle: user.jobTitle,
      accessRole: user.accessRole,
      phaseId: user.phaseId,
    },
    phaseOptions: data.phases.map((phase) => ({ id: phase._id, name: phase.name })),
    invite: {
      hasPassword,
      /** Whether the server will accept a resend, so the UI does not offer a doomed button. */
      canInvite: invitable,
      isLive: inviteLive,
      statusLabel: inviteStatusLabel,
    },
    stats: [
      { label: "Modules completed", value: `${completed} / ${modules.length}` },
      { label: "CPTD points", value: `${user.cptdPoints} pts` },
      { label: "Total XP", value: `${user.xpTotal}` },
      { label: "Last active", value: formatLastActive(user.lastActiveAt, now) },
    ],
    modules: modules.map(({ enrollment, module }) => ({
      id: enrollment._id,
      moduleId: module._id,
      moduleTitle: module.title,
      category: module.category,
      status: enrollment.status,
      statusLabel: ENROLLMENT_LABELS[enrollment.status] ?? enrollment.status,
      progressPercent: enrollment.progressPercent,
      scoreLabel: enrollment.score === undefined ? "—" : `${enrollment.score}%`,
      lastAccessedLabel:
        enrollment.lastAccessedAt === undefined
          ? "Not opened"
          : formatRelativeTime(enrollment.lastAccessedAt, now),
      // Mirrors what `staff.unassignModule` will allow. The server decides; this
      // only stops the screen offering a button that is going to be refused.
      canUnassign:
        enrollment.status === "not_started" &&
        enrollment.progressPercent === 0 &&
        enrollment.score === undefined &&
        enrollment.startedAt === undefined,
      href: getAdminModuleHref(module.slug),
    })),
    /**
     * The whole catalogue for the assign picker, already-assigned rows
     * included and flagged. Drafts are listed but not assignable, because a
     * module missing from the list with no explanation reads as a bug, whereas
     * a disabled row with "Draft" on it reads as the instruction it is.
     */
    assignable: data.catalog.map((module) => ({
      id: module._id,
      number: module.number,
      title: module.title,
      category: module.category,
      durationMinutes: module.durationMinutes,
      cptdPoints: module.cptdPoints,
      publishState: module.publishState,
      assigned: assignedIds.has(module._id),
      canAssign: module.publishState === "published" && !assignedIds.has(module._id),
      href: getAdminModuleHref(module.slug),
    })),
  };
}

// ---------------------------------------------------------------------------
// Learner
// ---------------------------------------------------------------------------

type LearnerModules = FunctionReturnType<typeof api.learn.myModules>;
type LearnerModuleDetail = FunctionReturnType<typeof api.learn.moduleDetail>;
type LearnerLesson = FunctionReturnType<typeof api.learn.lesson>;

const LESSON_PROGRESS_LABELS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};

/**
 * The learner's own modules, for the dashboard and the library.
 *
 * Deliberately no notion of "locked": the old seed stored a `ModuleStatus`
 * union that conflated entitlement with progress. Entitlement is now the
 * enrollment row — if it is not assigned, it is not in this list at all.
 */
export function presentLearnerModules(data: LearnerModules, now: number) {
  const rows = data.modules.map(({ enrollment, module, lessonCount, completedLessons }) => ({
    id: module._id,
    slug: module.slug,
    number: module.number,
    title: module.title,
    description: module.description,
    category: module.category,
    durationMinutes: module.durationMinutes,
    cptdPoints: module.cptdPoints,
    status: enrollment.status,
    statusLabel: ENROLLMENT_LABELS[enrollment.status] ?? enrollment.status,
    progressPercent: enrollment.progressPercent,
    lessonCount,
    completedLessons,
    lessonsLabel:
      lessonCount === 0 ? "No lessons yet" : `${completedLessons} of ${lessonCount} lessons`,
    dueLabel:
      enrollment.dueAt === undefined
        ? null
        : enrollment.dueAt < now
          ? "Overdue"
          : `Due ${formatRelativeTime(enrollment.dueAt, now).replace(" ago", " from now")}`,
    lastAccessedLabel:
      enrollment.lastAccessedAt === undefined
        ? "Not opened yet"
        : formatRelativeTime(enrollment.lastAccessedAt, now),
    href: getModulePreviewHref(module.slug),
  }));

  const completed = rows.filter((row) => row.status === "completed").length;
  const inProgress = rows.filter((row) => row.status === "in_progress").length;

  return {
    greetingName: data.user.preferredName ?? data.user.firstName,
    jobTitle: data.user.jobTitle,
    stats: [
      { label: "Modules assigned", value: `${rows.length}` },
      { label: "Completed", value: `${completed}` },
      { label: "In progress", value: `${inProgress}` },
      { label: "CPTD points", value: `${data.user.cptdPoints}` },
    ],
    compliancePercent: data.user.compliancePercent,
    xpTotal: data.user.xpTotal,
    modules: rows,
    /** The first thing not yet finished — what the dashboard should point at. */
    nextUp: rows.find((row) => row.status !== "completed") ?? null,
  };
}

/** One assigned module, including its featured media. */
export function presentLearnerModuleDetail(data: LearnerModuleDetail, now: number) {
  const { module, enrollment, featured } = data;

  return {
    slug: module.slug,
    number: module.number,
    title: module.title,
    description: module.description,
    audience: module.audience,
    outcome: module.outcome,
    category: module.category,
    durationMinutes: module.durationMinutes,
    cptdPoints: module.cptdPoints,
    passMark: module.passMark,
    format: module.format,
    statusLabel: ENROLLMENT_LABELS[enrollment.status] ?? enrollment.status,
    progressPercent: enrollment.progressPercent,
    lastAccessedLabel:
      enrollment.lastAccessedAt === undefined
        ? "Not opened yet"
        : formatRelativeTime(enrollment.lastAccessedAt, now),
    objectives: data.objectives.map((objective) => ({
      id: objective._id,
      text: objective.text,
    })),
    /**
     * The module hero. `url` is a short-lived signed R2 link resolved per read
     * — never stored, and it expires, so it must not be cached anywhere that
     * outlives the page.
     */
    featured:
      featured === null
        ? null
        : {
            title: featured.asset.title,
            description: featured.asset.description,
            kind: featured.asset.kind,
            contentType: featured.asset.contentType ?? null,
            fileName: featured.asset.fileName ?? null,
            url: featured.url,
            meta: formatAssetMeta(featured.asset),
          },
    lessons: data.lessons.map(({ lesson, status, assetCount }) => ({
      id: lesson._id,
      slug: lesson.slug,
      title: lesson.title,
      summary: lesson.summary,
      kind: lesson.kind,
      order: lesson.order,
      status,
      statusLabel: LESSON_PROGRESS_LABELS[status] ?? status,
      durationLabel: formatLessonDuration(lesson.kind, lesson.durationMinutes),
      assetCount,
      href: getLessonPreviewHref(module.slug, lesson.slug),
    })),
  };
}

/** One lesson, with any playable or downloadable media attached to it. */
export function presentLearnerLesson(data: LearnerLesson) {
  const { module, lesson } = data;

  return {
    moduleSlug: module.slug,
    moduleTitle: module.title,
    moduleHref: getModulePreviewHref(module.slug),
    title: lesson.title,
    summary: lesson.summary,
    kind: lesson.kind,
    durationLabel: formatLessonDuration(lesson.kind, lesson.durationMinutes),
    scenarioTitle: lesson.scenarioTitle ?? null,
    scenarioBody: lesson.scenarioBody ?? null,
    reflectionPrompt: lesson.reflectionPrompt ?? null,
    status: data.status,
    statusLabel: LESSON_PROGRESS_LABELS[data.status] ?? data.status,
    isComplete: data.status === "completed",
    positionLabel: `Lesson ${data.position} of ${data.total}`,
    heroUrl: data.heroUrl,
    assets: data.assets.map(({ asset, url }) => ({
      id: asset._id,
      title: asset.title,
      description: asset.description,
      kind: asset.kind,
      contentType: asset.contentType ?? null,
      url,
      meta: formatAssetMeta(asset),
    })),
    previousHref:
      data.previousSlug === null ? null : getLessonPreviewHref(module.slug, data.previousSlug),
    nextHref: data.nextSlug === null ? null : getLessonPreviewHref(module.slug, data.nextSlug),
  };
}

type LearnerProfile = FunctionReturnType<typeof api.learn.profile>;
type LearnerLeaderboard = FunctionReturnType<typeof api.learn.leaderboard>;

/** "12 May 2026". A real date, from a real timestamp. */
export function formatAwardDate(at: number): string {
  return new Date(at).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * How to describe a streak honestly.
 *
 * `progressEvents` has no history before this feature shipped and nothing
 * backfills it, so every streak genuinely starts at one. Saying "start a
 * streak" at zero is truthful; "0-day streak" reads like a bug.
 */
export function formatStreak(days: number): string {
  if (days === 0) return "No streak yet";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export function presentLearnerProfile(data: LearnerProfile) {
  const earned = data.badges.filter((badge) => badge.awardedAt !== null);

  return {
    name: data.name,
    initials: data.initials,
    jobTitle: data.jobTitle,
    phaseName: data.phaseName,
    email: data.email,
    joinedLabel: `Joined ${formatAwardDate(data.joinedAt)}`,
    xpTotal: data.xpTotal,
    cptdPoints: data.cptdPoints,
    compliancePercent: data.compliancePercent,
    streakDays: data.streakDays,
    streakLabel: formatStreak(data.streakDays),
    // Module-level, never lesson-level: `lessonProgress` is empty for seeded
    // enrollments that report 100%, so a lesson counter would contradict the
    // percentage sitting beside it.
    modulesLabel: `${data.modulesCompleted} of ${data.modulesAssigned} modules complete`,
    badgesLabel: `${earned.length} of ${data.badges.length} unlocked`,
    badges: data.badges.map((badge) => ({
      key: badge.key,
      label: badge.label,
      description: badge.description,
      earned: badge.awardedAt !== null,
      earnedLabel: badge.awardedAt === null ? null : formatAwardDate(badge.awardedAt),
    })),
    ledger: data.ledger.map((row) => ({
      id: row.moduleId,
      title: row.title,
      slug: row.slug,
      href: getModulePreviewHref(row.slug),
      cptdPoints: row.cptdPoints,
      dateLabel: row.completedAt === null ? "Date not recorded" : formatAwardDate(row.completedAt),
      scoreLabel: row.score === null ? null : `${row.score}%`,
    })),
    ledgerTotal: data.ledger.reduce((sum, row) => sum + row.cptdPoints, 0),
  };
}

export function presentLearnerLeaderboard(data: LearnerLeaderboard) {
  return {
    rows: data.rows,
    podium: data.rows.slice(0, 3),
    rest: data.rows.slice(3),
    myRank: data.myRank,
    /**
     * Says something true or says nothing. The page this replaces told every
     * visitor they were "#1, 60 XP ahead of #2" regardless of who they were.
     */
    standingLabel:
      data.myRank === null
        ? null
        : data.myRank === 1
          ? "You are top of the board."
          : data.xpToNextRank === null
            ? `You are #${data.myRank}.`
            : `You are #${data.myRank} — ${data.xpToNextRank} XP behind #${data.myRank - 1}.`,
  };
}

// ---------------------------------------------------------------------------
// Assessments
// ---------------------------------------------------------------------------

type AdminAssessment = FunctionReturnType<typeof api.questions.adminList>;
type LearnerAssessment = FunctionReturnType<typeof api.learn.assessment>;
type AssessmentResult = FunctionReturnType<typeof api.learn.submitAssessment>;

export function formatQuestionKind(kind: AssessmentQuestionKind): string {
  return kind === "true_false" ? "True or false" : "Multiple choice";
}

/**
 * The display letter for an answer.
 *
 * Derived from position, never stored. `aiQuestionOptions` keeps a `key` column
 * holding "A"/"B"/"C"/"D", which is display prose that cannot survive a
 * reorder; the assessment tables deliberately do not repeat that.
 */
export function optionKey(index: number): string {
  return String.fromCharCode(65 + index);
}

/**
 * How many answers a learner actually has to get right.
 *
 * With three questions and a pass mark of 80%, the only passing score is 3 of
 * 3 — 2 of 3 is 67%. That is arithmetic, not a bug, but it reads like one, so
 * the builder says it out loud rather than leaving an admin to discover it from
 * a teacher's complaint.
 */
export function formatPassMarkHint(questionCount: number, passMark: number): string {
  if (questionCount === 0) {
    return `Pass mark ${passMark}%. Add a question to see what that means in practice.`;
  }
  const needed = Math.ceil((passMark / 100) * questionCount);
  return `With ${questionCount} question${questionCount === 1 ? "" : "s"} and a pass mark of ${passMark}%, a learner must get ${needed} of ${questionCount} right.`;
}

export function presentAdminAssessment(data: AdminAssessment, now: number) {
  const { module, assessmentLessons, questions } = data;

  return {
    moduleTitle: module.title,
    moduleSlug: module.slug,
    modulePath: getAdminModuleHref(module.slug),
    passMark: module.passMark,
    passMarkHint: formatPassMarkHint(questions.length, module.passMark),
    /**
     * Where a learner would actually sit this. Empty is worth saying out loud:
     * the questions are stored and gradable, but nothing links to them, so no
     * teacher will ever be shown them.
     */
    sittingLabel:
      assessmentLessons.length === 0
        ? "No assessment lesson yet — add a lesson of kind Assessment so staff can sit this."
        : `Sat in: ${assessmentLessons.map((lesson) => lesson.title).join(", ")}`,
    hasAssessmentLesson: assessmentLessons.length > 0,
    questions: questions.map(({ question, options }, index) => ({
      id: question._id,
      number: index + 1,
      kind: question.kind,
      kindLabel: formatQuestionKind(question.kind),
      prompt: question.prompt,
      updatedLabel: formatUpdatedLabel(question.contentUpdatedAt, now),
      isFirst: index === 0,
      isLast: index === questions.length - 1,
      options: options.map((option, optionIndex) => ({
        id: option._id,
        key: optionKey(optionIndex),
        text: option.text,
        isCorrect: option.isCorrect,
      })),
    })),
  };
}

export function presentLearnerAssessment(data: LearnerAssessment) {
  return {
    moduleTitle: data.module.title,
    moduleSlug: data.module.slug,
    moduleHref: getModulePreviewHref(data.module.slug),
    lessonTitle: data.lesson.title,
    passMark: data.passMark,
    passMarkLabel: `Pass mark ${data.passMark}%`,
    isComplete: data.status === "completed",
    // Structurally free of an answer key: the query never returns one.
    questions: data.questions.map((question) => ({
      id: question.questionId,
      prompt: question.prompt,
      kindLabel: formatQuestionKind(question.kind),
      options: question.options.map((option, index) => ({
        id: option.optionId,
        key: optionKey(index),
        text: option.text,
      })),
    })),
    bestScoreLabel: data.bestScorePercent === null ? null : `Best score ${data.bestScorePercent}%`,
    /**
     * What a returning teacher sees instead of the results screen they saw
     * right after submitting. The per-question breakdown is the submit
     * mutation's return value and is deliberately not stored, so this banner is
     * what the page degrades to on a refresh.
     */
    lastAttemptLabel:
      data.lastAttempt === null
        ? null
        : `Last attempt ${data.lastAttempt.scorePercent}% — ${data.lastAttempt.passed ? "passed" : "not passed"}`,
    attemptLabel:
      data.attemptCount === 0
        ? "Not attempted yet"
        : `${data.attemptCount} attempt${data.attemptCount === 1 ? "" : "s"} so far`,
  };
}

/**
 * The results screen, built from what the grader returned.
 *
 * Pure, and takes the questions already on screen rather than re-reading them:
 * there is no second query after submitting, which is why no per-answer table
 * is needed. It reports right or wrong and never which option was correct, so a
 * retake still asks something.
 */
export function presentAssessmentResult(
  result: AssessmentResult,
  questions: ReadonlyArray<{ id: string; prompt: string }>,
) {
  const byId = new Map(result.results.map((row) => [row.questionId as string, row.correct]));

  return {
    scoreLabel: `${result.scorePercent}%`,
    passed: result.passed,
    headline: result.passed ? "Assessment passed" : "Not passed yet",
    subline: result.passed
      ? `You scored ${result.correctCount} of ${result.totalCount}, against a pass mark of ${result.passMark}%.`
      : `You scored ${result.correctCount} of ${result.totalCount}. You need ${result.passMark}% to pass — have another go.`,
    rows: questions.map((question, index) => ({
      id: question.id,
      number: index + 1,
      prompt: question.prompt,
      correct: byId.get(question.id) ?? false,
    })),
    xpLabel: result.xpAwarded === 0 ? null : `+${result.xpAwarded} XP`,
    cptdLabel: result.cptdAwarded === 0 ? null : `+${result.cptdAwarded} CPTD points`,
    /**
     * How many, not which. The badge catalogue lives in `convex/lib/awards.ts`
     * and nowhere else — a label table here would be a second copy that drifts
     * the first time a badge is renamed. The profile page already names them.
     */
    badgeLabel:
      result.badgesAwarded.length === 0
        ? null
        : `${result.badgesAwarded.length} new badge${result.badgesAwarded.length === 1 ? "" : "s"} unlocked`,
  };
}
