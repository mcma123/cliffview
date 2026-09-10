import {
  applyAiReviewDecision,
  getAiReviewQueue,
  getModuleExperience,
  getModuleLessonExperience,
  getModuleLibrary,
  getModuleOverview,
  getStaffDashboard,
} from "@/application/academy/use-cases";
import { InMemoryAcademyRepository } from "@/infrastructure/academy/in-memory-academy-repository";

const academyRepository = new InMemoryAcademyRepository();

export const academyQueries = {
  getStaffDashboard: () => getStaffDashboard(academyRepository),
  getModuleLibrary: () => getModuleLibrary(academyRepository),
  getModuleOverview: (slug: string) => getModuleOverview(academyRepository, slug),
  getModuleExperience: (slug: string) => getModuleExperience(academyRepository, slug),
  getModuleLessonExperience: (slug: string, lessonId: string) =>
    getModuleLessonExperience(academyRepository, slug, lessonId),
  getAiReviewQueue: () => getAiReviewQueue(academyRepository),
};

export const academyCommands = {
  applyAiReviewDecision,
};
