import type {
  AssetKind,
  EnrollmentStatus,
  LessonKind,
  ModuleCategory,
  PublishState,
  QuestionDifficulty,
} from "../validators";

/**
 * Seed content for the Cliffview Academy backend.
 *
 * This began as a cleaned-up copy of an in-memory repository in `src/infrastructure`.
 * It is a copy rather than an import because `convex/` cannot import from
 * `@/domain` — different tsconfig, and it would bundle app code into the
 * backend. The duplication is deliberate and temporary: Phase 8 deletes the
 * in-memory repository, leaving this as the only copy.
 *
 * What changed on the way in, and why:
 *
 * - `sectionCount` is gone. It disagreed with the real lesson list on seven of
 *   nine modules and nothing recomputed it. Counts are derived now.
 * - Per-learner `progressPercent` / `status` / `isCurrent` / `isComplete` are
 *   gone from content. They described one hypothetical learner and belong in
 *   `enrollments`.
 * - `publishState` is a real editorial field. Lesson state used to be computed
 *   from that demo learner's progress.
 * - `documentIds` arrays become `lessonAssets` join rows.
 * - Honorifics move out of `lastName` into `honorific`.
 * - Prose timestamps ("Updated 2 days ago") become offsets in ms, applied
 *   against the seed run time.
 * - Staff aggregate counters are not seeded. They contradicted their own
 *   progress rows, so the seed writes enrollments and derives the counters.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

/**
 * The union of both free-text phase lists in the old seed: the dashboard used
 * Foundation / Intersen / Senior Management / Support Staff, while staff
 * records used Foundation / Senior / Intersen. They could not be joined, which
 * is why per-phase compliance was never derived from staff.
 */
export const phases = [
  { name: "Foundation Phase", order: 1 },
  { name: "Intersen Phase", order: 2 },
  { name: "Senior Phase", order: 3 },
  { name: "Senior Management", order: 4 },
  { name: "Support Staff", order: 5 },
] as const;

// ---------------------------------------------------------------------------
// Content generators — the shape most modules share
// ---------------------------------------------------------------------------

export type SeedAsset = {
  title: string;
  kind: AssetKind;
  description: string;
  metaNote: string;
  publishState: PublishState;
};

export type SeedLesson = {
  slug: string;
  title: string;
  summary: string;
  kind: LessonKind;
  durationMinutes?: number;
  heroTitleOverride?: string;
  heroDescriptionOverride?: string;
  scenarioTitle?: string;
  scenarioBody?: string;
  reflectionPrompt?: string;
  /** Asset titles to attach, resolved to ids by the seed mutation. */
  attachAssetTitles: string[];
};

function standardAssets(title: string): SeedAsset[] {
  return [
    {
      title: `${title} walkthrough`,
      kind: "video",
      description: `Primary lesson video placeholder for ${title}.`,
      metaNote: "MP4 placeholder · 1080p",
      publishState: "published",
    },
    {
      title: `${title} narrated summary`,
      kind: "audio",
      description: `Narration or recap audio for ${title}.`,
      metaNote: "Audio placeholder · 5 min",
      publishState: "published",
    },
    {
      title: `${title} policy pack`,
      kind: "document",
      description: `Reference document bundle attached to ${title}.`,
      metaNote: "PDF · 12 pages",
      publishState: "published",
    },
    {
      title: `${title} facilitator worksheet`,
      kind: "worksheet",
      description: `Editable staff worksheet for follow-up discussions on ${title}.`,
      metaNote: "DOCX placeholder · editable",
      publishState: "draft",
    },
  ];
}

function standardLessons(title: string): SeedLesson[] {
  const policyPack = `${title} policy pack`;
  const worksheet = `${title} facilitator worksheet`;
  return [
    {
      slug: "why-this-matters",
      title: "Why this matters",
      summary: "Context and policy framing",
      kind: "video",
      durationMinutes: 5,
      heroTitleOverride: `${title}: orientation`,
      heroDescriptionOverride: `Opening lesson placeholder introducing ${title}.`,
      attachAssetTitles: [policyPack],
    },
    {
      slug: "key-guidelines",
      title: "Key guidelines",
      summary: "Practical staff guidance",
      kind: "reading",
      durationMinutes: 7,
      heroTitleOverride: `${title}: guidance review`,
      heroDescriptionOverride: `A guided content placeholder covering the key guidelines in ${title}.`,
      attachAssetTitles: [policyPack, worksheet],
    },
    {
      slug: "real-world-scenarios",
      title: "Real-world scenarios",
      summary: "Case studies and examples",
      kind: "case-study",
      durationMinutes: 6,
      attachAssetTitles: [policyPack],
    },
    {
      slug: "your-responsibilities",
      title: "Your responsibilities",
      summary: "What is expected of you",
      kind: "audio",
      durationMinutes: 5,
      attachAssetTitles: [worksheet],
    },
    {
      slug: "module-assessment",
      title: "Module assessment",
      summary: "Knowledge check and sign-off",
      kind: "assessment",
      // No durationMinutes: "Quiz" was never a duration. The presenter renders
      // "Quiz" from kind === "assessment".
      attachAssetTitles: [policyPack],
    },
  ];
}

// ---------------------------------------------------------------------------
// Per-module overrides
// ---------------------------------------------------------------------------

const socialMediaAssets: SeedAsset[] = [
  {
    title: "Social Media Awareness lesson reel",
    kind: "video",
    description: "Main video placeholder used in the academy lesson player.",
    metaNote: "MP4 placeholder · 6 min",
    publishState: "published",
  },
  {
    title: "Narrated acceptable use summary",
    kind: "audio",
    description: "Narrated recap for busy staff who want the policy summary in audio form.",
    metaNote: "Audio placeholder · 4 min",
    publishState: "published",
  },
  {
    title: "Social media policy handbook",
    kind: "document",
    description: "Primary policy document shown alongside the learner-side module.",
    metaNote: "PDF · 14 pages",
    publishState: "published",
  },
  {
    title: "Incident response checklist",
    kind: "worksheet",
    description: "Downloadable checklist for staff handling social-media incidents.",
    metaNote: "DOCX placeholder · editable",
    publishState: "draft",
  },
];

const socialMediaLessons: SeedLesson[] = [
  {
    slug: "why-this-matters",
    title: "Why this matters",
    summary: "Narrated intro",
    kind: "audio",
    durationMinutes: 4,
    heroTitleOverride: "Opening briefing",
    heroDescriptionOverride:
      "Audio placeholder introducing why personal social-media conduct affects the school.",
    attachAssetTitles: ["Social media policy handbook"],
  },
  {
    slug: "acceptable-use",
    title: "What is acceptable use?",
    summary: "Narrated + visuals",
    kind: "reading",
    durationMinutes: 8,
    heroTitleOverride: "Acceptable use breakdown",
    heroDescriptionOverride:
      "Video placeholder showing acceptable use examples and policy highlights.",
    attachAssetTitles: ["Social media policy handbook", "Incident response checklist"],
  },
  {
    slug: "real-world-scenarios",
    title: "Real-world scenarios",
    summary: "Case studies",
    kind: "case-study",
    durationMinutes: 6,
    heroTitleOverride: "Scenario review",
    heroDescriptionOverride: "Video placeholder for guided case-study analysis.",
    scenarioTitle: "Scenario: The viral parent post",
    scenarioBody:
      "A parent posts a complaint about Cliffview on a community Facebook group. Within an hour it has 200 shares. Three staff members have already been tagged in the comments.",
    reflectionPrompt: "Take a moment before the next slide. The right move is not the loudest one.",
    attachAssetTitles: ["Social media policy handbook", "Incident response checklist"],
  },
  {
    slug: "your-responsibilities",
    title: "Your responsibilities",
    summary: "Narrated summary",
    kind: "audio",
    durationMinutes: 5,
    heroTitleOverride: "Responsibilities recap",
    heroDescriptionOverride:
      "Audio placeholder that closes the module with staff obligations and escalation reminders.",
    attachAssetTitles: ["Incident response checklist"],
  },
  {
    slug: "module-assessment",
    title: "Module Assessment",
    summary: "AI-generated questions",
    kind: "assessment",
    heroTitleOverride: "Assessment view",
    heroDescriptionOverride: "Assessment placeholder before backend question delivery is added.",
    attachAssetTitles: ["Social media policy handbook"],
  },
];

const parentCommsAssets: SeedAsset[] = [
  {
    title: "Parent communication overview reel",
    kind: "video",
    description: "Hero lesson video placeholder introducing the communication framework.",
    metaNote: "MP4 placeholder · 5 min",
    publishState: "published",
  },
  {
    title: "Escalation script audio",
    kind: "audio",
    description: "Audio recap of the escalation script staff can listen to on the go.",
    metaNote: "Audio placeholder · 4 min",
    publishState: "published",
  },
  {
    title: "Email and meeting note templates",
    kind: "document",
    description:
      "Downloadable message templates, acknowledgement language, and meeting note layouts.",
    metaNote: "DOCX · 6 templates",
    publishState: "published",
  },
  {
    title: "Escalation checklist",
    kind: "worksheet",
    description: "Editable escalation checklist attached to the learner-facing module.",
    metaNote: "DOCX placeholder · editable",
    publishState: "draft",
  },
];

const parentCommsLessons: SeedLesson[] = [
  {
    slug: "message-triage",
    title: "Message triage",
    summary: "Classify the message and choose the right lane",
    kind: "video",
    durationMinutes: 6,
    heroTitleOverride: "Triage framework",
    heroDescriptionOverride:
      "Video placeholder explaining how staff sort parent messages by urgency and channel.",
    scenarioTitle: "Scenario: The Friday-night complaint",
    scenarioBody:
      "A parent sends a frustrated WhatsApp message at 20:45 on Friday night and copies two other parents into the thread. The issue is emotional but not yet a safeguarding concern.",
    reflectionPrompt:
      "Before replying, decide whether the issue needs acknowledgement, escalation, or a scheduled conversation.",
    attachAssetTitles: ["Email and meeting note templates"],
  },
  {
    slug: "response-language",
    title: "Response language",
    summary: "Tone, boundaries, and approved wording",
    kind: "reading",
    durationMinutes: 8,
    heroTitleOverride: "Response language walkthrough",
    heroDescriptionOverride:
      "Lesson placeholder with approved wording patterns for difficult conversations.",
    attachAssetTitles: ["Email and meeting note templates", "Escalation checklist"],
  },
  {
    slug: "meeting-preparation",
    title: "Meeting preparation",
    summary: "Prepare notes, facts, and participants",
    kind: "case-study",
    durationMinutes: 7,
    heroTitleOverride: "Meeting prep scenario",
    heroDescriptionOverride:
      "Case-study placeholder showing how to prepare for an escalated parent meeting.",
    scenarioTitle: "Scenario: Escalating to a grade-level meeting",
    scenarioBody:
      "A recurring classroom concern has now become a meeting request involving the grade head. Staff need a consistent packet of facts, previous communication, and next-step options.",
    reflectionPrompt:
      "What should be documented before the meeting begins, and what should never be improvised live?",
    attachAssetTitles: ["Email and meeting note templates", "Escalation checklist"],
  },
  {
    slug: "module-assessment",
    title: "Module assessment",
    summary: "Knowledge check and sign-off",
    kind: "assessment",
    heroTitleOverride: "Assessment placeholder",
    heroDescriptionOverride:
      "Assessment placeholder before backend question delivery is connected.",
    attachAssetTitles: ["Email and meeting note templates"],
  },
];

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

export type SeedModule = {
  slug: string;
  number: string;
  sequence: number;
  title: string;
  category: ModuleCategory;
  description: string;
  audience: string;
  outcome: string;
  durationMinutes: number;
  cptdPoints: number;
  passMark: number;
  format: string;
  publishState: PublishState;
  objectives: string[];
  /** Title of the asset to use as the module hero. */
  featuredAssetTitle: string;
  /** How long before the seed run this module was last edited. */
  updatedAgoMs: number;
  assets: SeedAsset[];
  lessons: SeedLesson[];
};

export const modules: SeedModule[] = [
  {
    slug: "school-code-of-conduct",
    number: "01",
    sequence: 1,
    title: "School Code of Conduct",
    category: "Core Policies",
    description: "Core behaviour standards, staff expectations, and escalation boundaries.",
    audience: "All staff",
    outcome: "Build confidence applying the school code consistently across everyday decisions.",
    durationMinutes: 30,
    cptdPoints: 2,
    passMark: 80,
    format: "Self-paced",
    publishState: "published",
    objectives: [
      "Recognise the core behavioural standards expected of staff.",
      "Apply the code consistently when dealing with learners and families.",
      "Use the right escalation path when boundaries are crossed.",
    ],
    featuredAssetTitle: "School Code of Conduct walkthrough",
    updatedAgoMs: 2 * DAY,
    assets: standardAssets("School Code of Conduct"),
    lessons: standardLessons("School Code of Conduct"),
  },
  {
    slug: "social-media-awareness",
    number: "02",
    sequence: 2,
    title: "Social Media Awareness",
    category: "Core Policies",
    description:
      "How Cliffview staff represent the school online: what is expected, what is not, and how to respond when things go sideways.",
    audience: "Teaching staff and school-facing support teams",
    outcome:
      "Help staff respond to online incidents without escalating legal, reputational, or safeguarding risk.",
    durationMinutes: 23,
    cptdPoints: 3,
    passMark: 80,
    format: "Self-paced",
    publishState: "published",
    objectives: [
      "Identify the difference between personal posting and school representation.",
      "Recognise risky public responses and choose policy-safe alternatives.",
      "Use the right documents and escalation paths during social-media incidents.",
    ],
    featuredAssetTitle: "Social Media Awareness lesson reel",
    updatedAgoMs: 3 * HOUR,
    assets: socialMediaAssets,
    lessons: socialMediaLessons,
  },
  {
    slug: "learner-discipline",
    number: "03",
    sequence: 3,
    title: "Learner Discipline",
    category: "Core Policies",
    description: "Discipline workflows, due process, and practical classroom interventions.",
    audience: "Teachers, heads of department, and pastoral staff",
    outcome:
      "Give staff a repeatable discipline response that is fair, documentable, and aligned to policy.",
    durationMinutes: 25,
    cptdPoints: 2,
    passMark: 80,
    format: "Self-paced",
    publishState: "published",
    objectives: [
      "Choose the right intervention for low, medium, and high-severity behaviour issues.",
      "Document incidents in a way SMT can act on.",
      "Maintain due process while protecting the classroom environment.",
    ],
    featuredAssetTitle: "Learner Discipline walkthrough",
    updatedAgoMs: 1 * DAY,
    assets: standardAssets("Learner Discipline"),
    lessons: standardLessons("Learner Discipline"),
  },
  {
    slug: "health-and-safety",
    number: "04",
    sequence: 4,
    title: "Health & Safety",
    category: "Core Policies",
    description: "Operational readiness, incident response, and reporting requirements.",
    audience: "All operational and teaching staff",
    outcome:
      "Ensure staff can respond quickly, log incidents properly, and protect learners during disruptions.",
    durationMinutes: 20,
    cptdPoints: 2,
    passMark: 80,
    format: "Self-paced",
    publishState: "published",
    objectives: [
      "Recognise the immediate steps required during school safety incidents.",
      "Use reporting templates consistently.",
      "Know which documents and contacts are required during escalation.",
    ],
    featuredAssetTitle: "Health & Safety walkthrough",
    updatedAgoMs: 4 * DAY,
    assets: standardAssets("Health & Safety"),
    lessons: standardLessons("Health & Safety"),
  },
  {
    slug: "safeguarding-and-reporting",
    number: "05",
    sequence: 5,
    title: "Safeguarding & Reporting",
    category: "Core Policies",
    description: "Escalation duties, safeguarding signals, and statutory reporting expectations.",
    audience: "Teachers, student-facing support staff, and SMT",
    outcome: "Strengthen response quality when a learner disclosure or welfare concern is raised.",
    durationMinutes: 35,
    cptdPoints: 3,
    passMark: 80,
    format: "Self-paced",
    publishState: "published",
    objectives: [
      "Identify reportable safeguarding concerns faster.",
      "Use immediate response language that protects learners.",
      "Complete the right reporting steps without delay.",
    ],
    featuredAssetTitle: "Safeguarding & Reporting walkthrough",
    updatedAgoMs: 7 * DAY,
    assets: standardAssets("Safeguarding & Reporting"),
    lessons: standardLessons("Safeguarding & Reporting"),
  },
  {
    slug: "disciplinary-hearings",
    number: "06",
    sequence: 6,
    title: "Disciplinary Hearings",
    category: "SMT Pathway",
    description: "Preparation, notices, hearing conduct, and defensible documentation.",
    audience: "Senior management and disciplinary panel leads",
    outcome: "Help SMT run hearings that are procedurally sound and clearly documented.",
    durationMinutes: 45,
    cptdPoints: 4,
    passMark: 80,
    format: "Self-paced",
    publishState: "published",
    objectives: [
      "Prepare hearing packs correctly.",
      "Run hearings with defensible documentation.",
      "Separate process from emotion during complex cases.",
    ],
    featuredAssetTitle: "Disciplinary Hearings walkthrough",
    updatedAgoMs: 3 * DAY,
    assets: standardAssets("Disciplinary Hearings"),
    lessons: standardLessons("Disciplinary Hearings"),
  },
  {
    slug: "sasa-and-bela-compliance",
    number: "07",
    sequence: 7,
    title: "SASA & BELA Compliance",
    category: "SMT Pathway",
    description: "Policy obligations and operational changes arising from current school law.",
    audience: "Senior management and policy owners",
    outcome:
      "Translate regulation changes into practical school procedures and documented controls.",
    durationMinutes: 40,
    cptdPoints: 4,
    passMark: 80,
    format: "Self-paced",
    publishState: "published",
    objectives: [
      "Identify the school procedures affected by new legal requirements.",
      "Spot compliance gaps before audit or incident review.",
      "Prepare policy updates and communications for staff rollout.",
    ],
    featuredAssetTitle: "SASA & BELA Compliance walkthrough",
    updatedAgoMs: 3 * HOUR,
    assets: standardAssets("SASA & BELA Compliance"),
    lessons: standardLessons("SASA & BELA Compliance"),
  },
  {
    slug: "responsible-ai-usage",
    number: "08",
    sequence: 8,
    title: "Responsible AI Usage",
    category: "Staff Development",
    description: "School-safe AI usage, review requirements, and data handling boundaries.",
    audience: "All staff using generative tools for planning or communication",
    outcome: "Help staff use AI productively without creating privacy, safety, or accuracy risks.",
    durationMinutes: 30,
    cptdPoints: 2,
    passMark: 80,
    format: "Self-paced",
    publishState: "published",
    objectives: [
      "Use AI within approved data and privacy boundaries.",
      "Recognise when AI output still needs human review.",
      "Document responsible usage in school workflows.",
    ],
    featuredAssetTitle: "Responsible AI Usage walkthrough",
    updatedAgoMs: 5 * DAY,
    assets: standardAssets("Responsible AI Usage"),
    lessons: standardLessons("Responsible AI Usage"),
  },
  {
    slug: "parent-communication-protocol",
    number: "09",
    sequence: 9,
    title: "Parent Communication Protocol",
    category: "Staff Development",
    description:
      "A practical communication module for handling sensitive parent messages, escalations, and follow-up documentation across email, WhatsApp, and meetings.",
    audience: "Teachers, grade leads, front office staff, and pastoral teams",
    outcome:
      "Give staff a clear communication structure so parent interactions stay calm, documented, and aligned with school expectations.",
    durationMinutes: 28,
    cptdPoints: 3,
    passMark: 80,
    format: "Self-paced",
    // The only draft module. Its old label was "Draft synced 10 minutes ago",
    // and keeping it in draft gives the admin library a real mix of states to
    // render now that the badge shows editorial state rather than progress.
    publishState: "draft",
    objectives: [
      "Identify when to acknowledge, escalate, or move a parent conversation offline.",
      "Use school-approved language when responding to emotional or high-risk messages.",
      "Attach the right supporting documents and meeting notes after each interaction.",
    ],
    featuredAssetTitle: "Parent communication overview reel",
    updatedAgoMs: 10 * MINUTE,
    assets: parentCommsAssets,
    lessons: parentCommsLessons,
  },
];

// ---------------------------------------------------------------------------
// Staff and enrollments
// ---------------------------------------------------------------------------

export type SeedEnrollment = {
  moduleSlug: string;
  status: EnrollmentStatus;
  progressPercent: number;
  score?: number;
  /** How long before the seed run this module was last opened. */
  lastAccessedAgoMs?: number;
};

export type SeedUser = {
  honorific: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  accessRole: "staff" | "smt_admin" | "super_admin";
  phaseName: string;
  cptdPoints: number;
  xpTotal: number;
  lastActiveAgoMs: number;
  enrollments: SeedEnrollment[];
};

/**
 * Four staff. The fourth, Mr Pillay, existed only as a leaderboard row with no
 * profile in the old seed, so `getAdminStaffProfileById` would have thrown for
 * him.
 *
 * Enrollments are backfilled so the aggregates are true by construction rather
 * than asserted. In the old seed staff-01 claimed 3 of 5 complete against an
 * array holding 2, and staff-02 claimed 6 of 6 against an array holding 2.
 * `compliancePercent` is derived as the mean of enrollment progress, which
 * reproduces the original 100 for van Wyk and 40 for Dlamini exactly; Naidoo
 * lands on 73 rather than her asserted 88, because 88 was not derivable from
 * any row.
 */
export const users: SeedUser[] = [
  {
    honorific: "Ms.",
    firstName: "Priya",
    lastName: "Naidoo",
    email: "priya.naidoo@cliffview.example",
    jobTitle: "Teacher",
    accessRole: "staff",
    phaseName: "Foundation Phase",
    cptdPoints: 12,
    xpTotal: 3450,
    lastActiveAgoMs: 4 * HOUR,
    enrollments: [
      {
        moduleSlug: "school-code-of-conduct",
        status: "completed",
        progressPercent: 100,
        score: 95,
        lastAccessedAgoMs: 2 * DAY,
      },
      {
        moduleSlug: "social-media-awareness",
        status: "in_progress",
        progressPercent: 65,
        lastAccessedAgoMs: 4 * HOUR,
      },
      {
        moduleSlug: "learner-discipline",
        status: "completed",
        progressPercent: 100,
        score: 88,
        lastAccessedAgoMs: 9 * DAY,
      },
      { moduleSlug: "parent-communication-protocol", status: "not_started", progressPercent: 0 },
      {
        moduleSlug: "responsible-ai-usage",
        status: "completed",
        progressPercent: 100,
        score: 80,
        lastAccessedAgoMs: 7 * DAY,
      },
    ],
  },
  {
    honorific: "Mr.",
    firstName: "Hendrik",
    lastName: "van Wyk",
    email: "hendrik.vanwyk@cliffview.example",
    jobTitle: "Head of Department",
    // The one admin, so the Phase 4 guard has an account that can get in.
    accessRole: "smt_admin",
    phaseName: "Senior Phase",
    cptdPoints: 24,
    xpTotal: 5200,
    lastActiveAgoMs: 2 * DAY,
    enrollments: [
      {
        moduleSlug: "school-code-of-conduct",
        status: "completed",
        progressPercent: 100,
        score: 100,
        lastAccessedAgoMs: 90 * DAY,
      },
      {
        moduleSlug: "disciplinary-hearings",
        status: "completed",
        progressPercent: 100,
        score: 92,
        lastAccessedAgoMs: 2 * DAY,
      },
      {
        moduleSlug: "sasa-and-bela-compliance",
        status: "completed",
        progressPercent: 100,
        score: 96,
        lastAccessedAgoMs: 12 * DAY,
      },
      {
        moduleSlug: "safeguarding-and-reporting",
        status: "completed",
        progressPercent: 100,
        score: 90,
        lastAccessedAgoMs: 21 * DAY,
      },
      {
        moduleSlug: "learner-discipline",
        status: "completed",
        progressPercent: 100,
        score: 94,
        lastAccessedAgoMs: 30 * DAY,
      },
      {
        moduleSlug: "health-and-safety",
        status: "completed",
        progressPercent: 100,
        score: 87,
        lastAccessedAgoMs: 45 * DAY,
      },
    ],
  },
  {
    honorific: "Mrs.",
    firstName: "Zanele",
    lastName: "Dlamini",
    email: "zanele.dlamini@cliffview.example",
    jobTitle: "Teacher",
    accessRole: "staff",
    phaseName: "Intersen Phase",
    cptdPoints: 8,
    xpTotal: 1800,
    lastActiveAgoMs: 7 * DAY,
    enrollments: [
      {
        moduleSlug: "school-code-of-conduct",
        status: "completed",
        progressPercent: 100,
        score: 85,
        lastAccessedAgoMs: 30 * DAY,
      },
      {
        moduleSlug: "health-and-safety",
        status: "completed",
        progressPercent: 100,
        score: 78,
        lastAccessedAgoMs: 40 * DAY,
      },
      { moduleSlug: "social-media-awareness", status: "not_started", progressPercent: 0 },
      { moduleSlug: "learner-discipline", status: "not_started", progressPercent: 0 },
      { moduleSlug: "safeguarding-and-reporting", status: "not_started", progressPercent: 0 },
    ],
  },
  {
    honorific: "Mr.",
    firstName: "Thabo",
    lastName: "Pillay",
    email: "thabo.pillay@cliffview.example",
    jobTitle: "Support Staff Coordinator",
    accessRole: "staff",
    phaseName: "Support Staff",
    cptdPoints: 4,
    xpTotal: 970,
    lastActiveAgoMs: 14 * DAY,
    enrollments: [
      {
        moduleSlug: "school-code-of-conduct",
        status: "completed",
        progressPercent: 100,
        score: 82,
        lastAccessedAgoMs: 14 * DAY,
      },
      { moduleSlug: "health-and-safety", status: "not_started", progressPercent: 0 },
      { moduleSlug: "social-media-awareness", status: "not_started", progressPercent: 0 },
      { moduleSlug: "responsible-ai-usage", status: "not_started", progressPercent: 0 },
    ],
  },
];

// ---------------------------------------------------------------------------
// AI review queue
// ---------------------------------------------------------------------------

export type SeedQuestion = {
  moduleSlug: string;
  prompt: string;
  difficulty: QuestionDifficulty;
  confidencePercent: number;
  options: { key: string; text: string; isCorrect: boolean }[];
};

/**
 * `moduleTitle` was a display string with no reference; these resolve to a real
 * `moduleId`. `isCorrect` is now required — the old seed omitted it on wrong
 * answers, so `undefined` and `false` both meant wrong.
 */
export const aiQuestions: SeedQuestion[] = [
  {
    moduleSlug: "disciplinary-hearings",
    prompt: "Which document must be served before a disciplinary hearing under SASA?",
    difficulty: "Medium",
    confidencePercent: 94,
    options: [
      { key: "A", text: "Notice of Hearing", isCorrect: true },
      { key: "B", text: "Verbal warning letter", isCorrect: false },
      { key: "C", text: "School circular", isCorrect: false },
      { key: "D", text: "Email summary", isCorrect: false },
    ],
  },
  {
    moduleSlug: "safeguarding-and-reporting",
    prompt:
      "A learner discloses abuse outside school hours. Within what timeframe must you report?",
    difficulty: "Hard",
    confidencePercent: 89,
    options: [
      { key: "A", text: "24 hours", isCorrect: false },
      { key: "B", text: "Immediately", isCorrect: true },
      { key: "C", text: "End of next school day", isCorrect: false },
      { key: "D", text: "After confirming with parents", isCorrect: false },
    ],
  },
];

/**
 * Six-month completion trend, oldest first, anchored to the month the seed
 * runs so the dashboard always shows a populated window.
 *
 * The old values ramped to 127, which was invented for a school of 42 staff.
 * With four seeded staff the true all-time completion count is 12, so the ramp
 * ends there and the "Modules Completed" tile agrees with the last bar instead
 * of contradicting it.
 */
export const trendCompletions = [2, 4, 6, 9, 11, 12] as const;
