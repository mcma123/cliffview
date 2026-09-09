import type { ModuleSection, ReviewDecision, TrainingModule } from "@/domain/academy/entities";
import type { AcademyRepository } from "@/domain/academy/repositories";

function formatModuleMeta(module: TrainingModule) {
  return `${module.sectionCount} sections · ${module.durationMinutes} min`;
}

function formatSectionMeta(section: ModuleSection) {
  return `${section.summary} · ${section.durationLabel}`;
}

function getLessonHref(module: TrainingModule, section: ModuleSection) {
  return `/academy/modules/${module.slug}/lesson/${section.id}`;
}

function getFeaturedAsset(module: TrainingModule) {
  return (
    module.resources.find((resource) => resource.id === module.featuredAssetId) ??
    module.resources[0]
  );
}

function getSupportingResources(module: TrainingModule, section?: ModuleSection) {
  const resourceIds = new Set(section?.documentIds ?? []);
  const filtered = section
    ? module.resources.filter((resource) => resourceIds.has(resource.id))
    : module.resources.filter((resource) => resource.kind !== "video");

  return filtered.length > 0
    ? filtered
    : module.resources.filter((resource) => resource.kind !== "video");
}

export function getStaffDashboard(repo: AcademyRepository) {
  const snapshot = repo.getStaffDashboardSnapshot();
  const activeModule = repo.getTrainingModuleBySlug(snapshot.activeModuleSlug);
  const upcomingModules = snapshot.upcomingModuleSlugs
    .map((slug) => repo.getTrainingModuleBySlug(slug))
    .filter((module): module is TrainingModule => Boolean(module));

  const activeSection = activeModule?.sections.find((section) => section.isCurrent);

  return {
    greeting: `Welcome back, ${snapshot.staffMember.lastName}`,
    phaseLabel: `${snapshot.staffMember.phase} · ${snapshot.dateLabel}`,
    stats: [
      {
        label: "Modules",
        value: `${snapshot.completedModuleCount} / ${snapshot.totalModuleCount}`,
        sub: "complete",
      },
      { label: "XP Earned", value: snapshot.xpEarnedThisMonth.toLocaleString(), sub: "this month" },
      { label: "CPTD Points", value: `${snapshot.cptdPointsYearToDate}`, sub: "year-to-date" },
      { label: "Streak", value: `${snapshot.streakDays} days`, sub: "keep going" },
    ],
    activeModule: activeModule
      ? {
          title: activeModule.title,
          moduleLabel: `Module ${activeModule.number} of ${snapshot.totalModuleCount}`,
          sectionLabel: snapshot.activeModuleSectionLabel,
          progressPercent: snapshot.activeModuleProgressPercent,
          remainingMinutes: snapshot.remainingMinutes,
          resumePath: activeSection
            ? getLessonHref(activeModule, activeSection)
            : `/academy/modules/${activeModule.slug}`,
        }
      : null,
    upcomingModules: upcomingModules.map((module) => ({
      title: module.title,
      meta: formatModuleMeta(module),
      href: `/academy/modules/${module.slug}`,
    })),
    leaderboard: snapshot.leaderboard,
    recentAchievements: snapshot.recentAchievements,
  };
}

export function getModuleLibrary(repo: AcademyRepository) {
  const modules = repo.listTrainingModules();
  const featuredModule =
    modules.find((module) => module.slug === "parent-communication-protocol") ?? modules[0];
  const categoryCounts = modules.reduce<Record<string, number>>((counts, module) => {
    counts[module.category] = (counts[module.category] ?? 0) + 1;
    return counts;
  }, {});

  return {
    summary: `${modules.length} modules across 3 pathways. Complete in order.`,
    featuredModule: featuredModule
      ? {
          title: featuredModule.title,
          category: featuredModule.category,
          description: featuredModule.description,
          audience: featuredModule.audience,
          progressPercent: featuredModule.progressPercent,
          meta: formatModuleMeta(featuredModule),
          href: `/academy/modules/${featuredModule.slug}`,
          lastUpdatedLabel: featuredModule.lastUpdatedLabel,
        }
      : null,
    tabs: [
      { label: "All Modules", count: modules.length, active: true },
      { label: "Core Policies", count: categoryCounts["Core Policies"] ?? 0, active: false },
      { label: "SMT Pathway", count: categoryCounts["SMT Pathway"] ?? 0, active: false },
      {
        label: "Staff Development",
        count: categoryCounts["Staff Development"] ?? 0,
        active: false,
      },
    ],
    modules: modules
      .filter((module) => module.id !== featuredModule?.id)
      .map((module) => ({
        number: module.number,
        title: module.title,
        meta: formatModuleMeta(module),
        progressPercent: module.progressPercent,
        status: module.status,
        href: `/academy/modules/${module.slug}`,
      })),
  };
}

export function getModuleOverview(repo: AcademyRepository, slug: string) {
  const module = repo.getTrainingModuleBySlug(slug);
  if (!module) {
    throw new Error(`Module not found for slug "${slug}"`);
  }

  return {
    breadcrumb: ["Modules", module.category, module.title],
    moduleNumberLabel: `Module ${module.number} · ${module.category}`,
    title: module.title,
    description: module.description,
    sections: module.sections.map((section) => ({
      ...section,
      meta: formatSectionMeta(section),
    })),
    details: [
      { label: "Duration", value: `${module.durationMinutes} min` },
      { label: "Sections", value: `${module.sectionCount} + assessment` },
      { label: "CPTD Points", value: `${module.cptdPoints} points` },
      { label: "Pass Mark", value: `${module.passMark}%` },
      { label: "Format", value: module.format },
    ],
    startPath: getLessonHref(module, module.sections[0]),
  };
}

export function getModuleExperience(repo: AcademyRepository, slug: string) {
  const module = repo.getTrainingModuleBySlug(slug);
  if (!module) {
    throw new Error(`Module not found for slug "${slug}"`);
  }

  const featuredAsset = getFeaturedAsset(module);
  const currentSection =
    module.sections.find((section) => section.isCurrent) ??
    module.sections.find((section) => !section.isComplete) ??
    module.sections[0];

  return {
    breadcrumb: ["Modules", module.category, module.title],
    moduleNumberLabel: `Module ${module.number} · ${module.category}`,
    title: module.title,
    description: module.description,
    audience: module.audience,
    outcome: module.outcome,
    objectives: module.learningObjectives,
    progressPercent: module.progressPercent,
    details: [
      { label: "Duration", value: `${module.durationMinutes} min` },
      { label: "Sections", value: `${module.sectionCount} + assessment` },
      { label: "CPTD Points", value: `${module.cptdPoints} points` },
      { label: "Pass Mark", value: `${module.passMark}%` },
      { label: "Format", value: module.format },
    ],
    featuredMedia: featuredAsset
      ? {
          title: featuredAsset.title,
          typeLabel:
            featuredAsset.kind === "video"
              ? "Lesson video placeholder"
              : "Audio lesson placeholder",
          description: featuredAsset.description,
          meta: featuredAsset.meta,
        }
      : null,
    lessons: module.sections.map((section) => ({
      id: section.id,
      order: section.order,
      title: section.title,
      kind: section.kind,
      meta: formatSectionMeta(section),
      href: getLessonHref(module, section),
      isCurrent: section.id === currentSection?.id,
      isComplete: section.isComplete,
    })),
    resources: getSupportingResources(module).map((resource) => ({
      title: resource.title,
      kind: resource.kind,
      meta: resource.meta,
      description: resource.description,
    })),
    continuePath: currentSection
      ? getLessonHref(module, currentSection)
      : `/academy/modules/${module.slug}`,
    lastUpdatedLabel: module.lastUpdatedLabel,
  };
}

export function getModuleLessonExperience(repo: AcademyRepository, slug: string, lessonId: string) {
  const module = repo.getTrainingModuleBySlug(slug);
  if (!module) {
    throw new Error(`Module not found for slug "${slug}"`);
  }

  const lesson = module.sections.find((section) => section.id === lessonId);
  if (!lesson) {
    throw new Error(`Lesson not found for module "${slug}" and lesson "${lessonId}"`);
  }

  const lessonIndex = module.sections.findIndex((section) => section.id === lessonId);
  const previousLesson = lessonIndex > 0 ? module.sections[lessonIndex - 1] : null;
  const nextLesson =
    lessonIndex < module.sections.length - 1 ? module.sections[lessonIndex + 1] : null;
  const resources = getSupportingResources(module, lesson);
  const progressPercent = Math.round(((lessonIndex + 1) / module.sections.length) * 100);

  return {
    moduleTitle: module.title,
    modulePath: `/academy/modules/${module.slug}`,
    lessonTitle: lesson.title,
    lessonOrderLabel: `Section ${lesson.order} of ${module.sections.length}`,
    progressPercent,
    mediaCard: {
      typeLabel:
        lesson.kind === "audio"
          ? "Audio placeholder"
          : lesson.kind === "assessment"
            ? "Assessment prompt"
            : "Video placeholder",
      title: lesson.mediaTitle ?? `${lesson.title} walkthrough`,
      description: lesson.mediaDescription ?? lesson.summary,
      durationLabel: lesson.durationLabel,
    },
    sidebarLessons: module.sections.map((section) => ({
      id: section.id,
      title: section.title,
      durationLabel: section.durationLabel,
      href: getLessonHref(module, section),
      state: section.id === lesson.id ? "current" : section.isComplete ? "complete" : "upcoming",
      isAssessment: section.kind === "assessment",
    })),
    scenarioTitle: lesson.scenarioTitle ?? lesson.title,
    scenarioBody:
      lesson.scenarioBody ??
      `${lesson.title} is presented here as guided training content for ${module.title}.`,
    reflectionPrompt:
      lesson.reflectionPrompt ??
      "Review the scenario, consider the policy implications, and prepare for the next step.",
    resources: resources.map((resource) => ({
      title: resource.title,
      kind: resource.kind,
      meta: resource.meta,
      description: resource.description,
    })),
    previousPath: previousLesson
      ? getLessonHref(module, previousLesson)
      : `/academy/modules/${module.slug}`,
    nextPath: nextLesson ? getLessonHref(module, nextLesson) : `/academy/modules/${module.slug}`,
  };
}

export function getAdminOverview(repo: AcademyRepository) {
  const snapshot = repo.getAdminDashboardSnapshot();
  const trendMax = Math.max(...snapshot.completionTrend.map((point) => point.completedModules));

  return {
    dateLabel: snapshot.dateLabel,
    stats: [
      {
        label: "Total Staff",
        value: `${snapshot.totalStaff}`,
        sub: `+${snapshot.activeAccountsDelta} active accounts`,
      },
      {
        label: "Modules Completed",
        value: `${snapshot.completedModules}`,
        sub: `+${snapshot.completedModulesDelta} this month`,
      },
      {
        label: "Avg. Compliance",
        value: `${snapshot.averageCompliancePercent}%`,
        sub: `+${snapshot.averageComplianceDeltaPercent}% across all staff`,
      },
      {
        label: "Pending AI Review",
        value: `${snapshot.pendingAiReviewCount}`,
        sub: "Action questions queued",
        actionHref: "/academy/admin/ai-review",
      },
    ],
    phases: snapshot.phases,
    completionTrend: snapshot.completionTrend,
    trendMax,
  };
}

export function getAiReviewQueue(repo: AcademyRepository) {
  const questions = repo.listAiReviewQuestions();

  return {
    summary: {
      pendingCount: questions.length,
      approvedCount: 142,
      editedCount: 12,
    },
    questions,
  };
}

export function applyAiReviewDecision(
  current: Record<number, ReviewDecision>,
  questionId: number,
  decision: Exclude<ReviewDecision, "pending">,
) {
  return {
    ...current,
    [questionId]: decision,
  };
}

export function getAdminStaffDirectory(repo: AcademyRepository) {
  const staffProfiles = repo.listAdminStaffProfiles();
  const totalStaff = staffProfiles.length;
  const avgCompliance =
    totalStaff > 0
      ? Math.round(
          staffProfiles.reduce((acc, curr) => acc + curr.compliancePercent, 0) / totalStaff,
        )
      : 0;

  const highPerformers = staffProfiles.filter((s) => s.compliancePercent >= 80).length;

  return {
    summary: {
      totalStaff,
      avgCompliance,
      highPerformers,
    },
    directory: staffProfiles.map((staff) => ({
      id: staff.id,
      name: `${staff.firstName} ${staff.lastName}`,
      role: staff.role,
      phase: staff.phase,
      compliancePercent: staff.compliancePercent,
      completedModulesCount: staff.completedModulesCount,
      totalAssignedModules: staff.totalAssignedModules,
      cptdPoints: staff.cptdPoints,
      recentActivityLabel: staff.recentActivityLabel,
      href: `/academy/admin/staff/${staff.id}`,
    })),
  };
}

export function getAdminStaffDetail(repo: AcademyRepository, staffId: string) {
  const staff = repo.getAdminStaffProfileById(staffId);
  if (!staff) {
    throw new Error(`Staff not found with ID "${staffId}"`);
  }

  return {
    id: staff.id,
    name: `${staff.firstName} ${staff.lastName}`,
    role: staff.role,
    phase: staff.phase,
    initials:
      `${staff.firstName[0]}${staff.lastName.replace("Ms. ", "").replace("Mr. ", "").replace("Mrs. ", "")[0]}`.toUpperCase(),
    compliancePercent: staff.compliancePercent,
    stats: [
      {
        label: "Modules Completed",
        value: `${staff.completedModulesCount} / ${staff.totalAssignedModules}`,
      },
      { label: "CPTD Points", value: `${staff.cptdPoints} pts` },
      { label: "Total XP", value: `${staff.xpTotal}` },
      { label: "Last Active", value: staff.recentActivityLabel },
    ],
    modules: staff.modules.map((mod) => ({
      ...mod,
      href: `/academy/admin/modules/${mod.moduleSlug}`,
    })),
  };
}
