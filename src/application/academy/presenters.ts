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

type ModuleLibrary = FunctionReturnType<typeof api.modules.listForAdmin>;
type ModuleDetail = FunctionReturnType<typeof api.modules.adminDetail>;
type LessonDetail = FunctionReturnType<typeof api.lessons.adminDetail>;
type AssetDetail = FunctionReturnType<typeof api.assets.adminDetail>;

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
  fileName?: string;
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
            href: getAdminAssetHref(module.slug, featuredAsset._id),
          },
    lessons: lessons.map(({ lesson, attachedAssetCount }) => ({
      id: lesson._id,
      slug: lesson.slug,
      order: lesson.order,
      title: lesson.title,
      kind: lesson.kind,
      summary: lesson.summary,
      durationLabel: formatLessonDuration(lesson.kind, lesson.durationMinutes),
      // A real count now. The old join returned every non-video asset when a
      // lesson had nothing attached, so a new lesson claimed three.
      attachedAssets: attachedAssetCount,
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
      hasFile: asset.storageId !== undefined,
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
            href: getAdminAssetHref(module.slug, heroAsset._id),
          },
    linkedResources: linkedAssets.map((asset) => ({
      id: asset._id,
      title: asset.title,
      kind: asset.kind,
      meta: formatAssetMeta(asset),
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
    hasFile: asset.storageId !== undefined,
    fileName: asset.fileName ?? null,
    updatedLabel: formatUpdatedLabel(asset.contentUpdatedAt, now),
    placeholderState:
      asset.storageId !== undefined
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
