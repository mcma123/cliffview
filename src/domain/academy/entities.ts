export type ModuleStatus = "complete" | "in-progress" | "available" | "locked";

export type ModuleCategory = "Core Policies" | "SMT Pathway" | "Staff Development";

export type ReviewDecision = "pending" | "approved" | "rejected" | "edited";

export type ModuleLessonKind = "video" | "audio" | "reading" | "case-study" | "assessment";

export type ModuleAssetKind = "video" | "audio" | "document" | "worksheet";

export interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  phase: string;
}

export interface ModuleAsset {
  id: string;
  title: string;
  kind: ModuleAssetKind;
  meta: string;
  description: string;
  status: "published" | "draft";
}

export interface ModuleSection {
  id: string;
  order: number;
  title: string;
  summary: string;
  durationLabel: string;
  kind: ModuleLessonKind;
  isCurrent?: boolean;
  isComplete?: boolean;
  mediaTitle?: string;
  mediaDescription?: string;
  scenarioTitle?: string;
  scenarioBody?: string;
  reflectionPrompt?: string;
  documentIds?: string[];
}

export interface TrainingModule {
  id: string;
  number: string;
  slug: string;
  title: string;
  category: ModuleCategory;
  description: string;
  audience: string;
  outcome: string;
  durationMinutes: number;
  sectionCount: number;
  cptdPoints: number;
  passMark: number;
  format: string;
  progressPercent: number;
  status: ModuleStatus;
  learningObjectives: string[];
  featuredAssetId?: string;
  resources: ModuleAsset[];
  sections: ModuleSection[];
  lastUpdatedLabel: string;
}

export interface LeaderboardEntry {
  rank: number;
  participantName: string;
  xp: number;
  isCurrentUser?: boolean;
}

export interface StaffDashboardSnapshot {
  staffMember: StaffMember;
  dateLabel: string;
  completedModuleCount: number;
  totalModuleCount: number;
  xpEarnedThisMonth: number;
  cptdPointsYearToDate: number;
  streakDays: number;
  activeModuleSlug: string;
  activeModuleSectionLabel: string;
  activeModuleProgressPercent: number;
  remainingMinutes: number;
  upcomingModuleSlugs: string[];
  leaderboard: LeaderboardEntry[];
  recentAchievements: string[];
}

export interface CompliancePhase {
  name: string;
  completionPercent: number;
}

export interface CompletionTrendPoint {
  month: string;
  completedModules: number;
}

export interface AdminDashboardSnapshot {
  dateLabel: string;
  totalStaff: number;
  activeAccountsDelta: number;
  completedModules: number;
  completedModulesDelta: number;
  averageCompliancePercent: number;
  averageComplianceDeltaPercent: number;
  pendingAiReviewCount: number;
  editedAiReviewCount: number;
  phases: CompliancePhase[];
  completionTrend: CompletionTrendPoint[];
}

export interface ReviewOption {
  key: string;
  text: string;
  isCorrect?: boolean;
}

export interface AiReviewQuestion {
  id: number;
  moduleTitle: string;
  difficulty: "Easy" | "Medium" | "Hard";
  confidencePercent: number;
  prompt: string;
  options: ReviewOption[];
}
