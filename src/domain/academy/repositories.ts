import type {
  AdminDashboardSnapshot,
  AiReviewQuestion,
  StaffDashboardSnapshot,
  TrainingModule,
  AdminStaffProfile,
} from "@/domain/academy/entities";

export interface AcademyRepository {
  getStaffDashboardSnapshot(): StaffDashboardSnapshot;
  listTrainingModules(): TrainingModule[];
  getTrainingModuleBySlug(slug: string): TrainingModule | undefined;
  getAdminDashboardSnapshot(): AdminDashboardSnapshot;
  listAiReviewQuestions(): AiReviewQuestion[];
  listAdminStaffProfiles(): AdminStaffProfile[];
  getAdminStaffProfileById(id: string): AdminStaffProfile | undefined;
}
