import {
  applyAiReviewDecision,
  getAdminAssetDetail,
  getAdminLessonDetail,
  getAdminModuleDetail,
  getAdminModuleLibrary,
  getAdminOverview,
  getAdminStaffDirectory,
  getAdminStaffDetail,
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
  getAdminOverview: () => getAdminOverview(academyRepository),
  getAdminModuleLibrary: () => getAdminModuleLibrary(academyRepository),
  getAdminModuleDetail: (slug: string) => getAdminModuleDetail(academyRepository, slug),
  getAdminLessonDetail: (slug: string, lessonId: string) =>
    getAdminLessonDetail(academyRepository, slug, lessonId),
  getAdminAssetDetail: (slug: string, assetId: string) =>
    getAdminAssetDetail(academyRepository, slug, assetId),
  getAdminStaffDirectory: () => getAdminStaffDirectory(academyRepository),
  getAdminStaffDetail: (staffId: string) => getAdminStaffDetail(academyRepository, staffId),
  getAiReviewQueue: () => getAiReviewQueue(academyRepository),
};

export const academyCommands = {
  applyAiReviewDecision,
};
