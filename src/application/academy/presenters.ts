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
    // Row ids, not the text. Keying by objective text collided whenever two
    // objectives read the same.
    objectives: objectives.map((objective) => ({ id: objective._id, text: objective.text })),
    stats: [
      { label: "Lessons", value: `${lessons.length}` },
      { label: "Assets", value: `${assets.length}` },
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
