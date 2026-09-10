import type {
  AdminDashboardSnapshot,
  AiReviewQuestion,
  StaffDashboardSnapshot,
  TrainingModule,
} from "@/domain/academy/entities";

export interface AcademyRepository {
  getStaffDashboardSnapshot(): StaffDashboardSnapshot;
  listTrainingModules(): TrainingModule[];
  getTrainingModuleBySlug(slug: string): TrainingModule | undefined;
  getAdminDashboardSnapshot(): AdminDashboardSnapshot;
  listAiReviewQuestions(): AiReviewQuestion[];
}
