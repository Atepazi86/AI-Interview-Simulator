export type InterviewerType = 'hrd' | 'tech' | 'mixed';
export type ExperienceLevel = 'fresh_grad' | 'junior' | 'senior';
export type InterviewLanguage = 'id' | 'en';
export type QuestionCount = 5 | 8;

export interface InterviewConfig {
  position: string;
  interviewerType: InterviewerType;
  experienceLevel: ExperienceLevel;
  language: InterviewLanguage;
  questionCount: QuestionCount;
  candidateName: string;
}

export interface TranscriptMessage {
  id: string;
  role: 'interviewer' | 'candidate';
  text: string;
  timestamp: string;
  questionNumber: number;
  topic?: string;
  isFollowUp?: boolean;
}

export interface AspectEvaluation {
  id: string;
  name: string;
  score: number;
  feedback: string;
}

export interface QuestionBreakdownItem {
  questionNumber: number;
  question: string;
  candidateAnswer: string;
  score: number;
  critique: string;
  improvedAnswer: string;
}

export interface EvaluationReportData {
  overallScore: number;
  readinessLabel: string;
  executiveSummary: string;
  aspects: AspectEvaluation[];
  questionBreakdown: QuestionBreakdownItem[];
  actionableNextSteps: string[];
}

export type AppStage = 'lobby' | 'room' | 'report';

export interface InterviewerProfile {
  id: InterviewerType;
  name: string;
  roleTitleId: string;
  roleTitleEn: string;
  focusId: string;
  focusEn: string;
  imageUrl: string;
}

export const INTERVIEWER_PROFILES: Record<InterviewerType, InterviewerProfile> = {
  hrd: {
    id: 'hrd',
    name: 'Nadia Kusuma',
    roleTitleId: 'HRD Recruiter · Talent Acquisition',
    roleTitleEn: 'HR Recruiter · Talent Acquisition',
    focusId: 'Kepribadian, motivasi karier, budaya kerja & negosiasi gaji',
    focusEn: 'Personality, career motivation, culture fit & compensation expectations',
    imageUrl: '/src/assets/images/portrait_hrd_clean_1794883325906.jpg',
  },
  tech: {
    id: 'tech',
    name: 'Rama Wijaya',
    roleTitleId: 'User / Tech Lead · Hiring Manager',
    roleTitleEn: 'Tech Lead · Hiring Manager',
    focusId: 'Studi kasus teknis, problem solving, trade-off & pengalaman proyek',
    focusEn: 'Technical case studies, problem solving, trade-offs & project depth',
    imageUrl: '/src/assets/images/portrait_tech_clean_1794883326005.jpg',
  },
  mixed: {
    id: 'mixed',
    name: 'Clara Halim',
    roleTitleId: 'Mode Campuran · Hiring Director',
    roleTitleEn: 'Full Panel · Hiring Director',
    focusId: 'Kombinasi budaya kerja HRD & pendalaman studi kasus User/Lead',
    focusEn: 'Combined HR culture fit & technical/role-specific case probing',
    imageUrl: '/src/assets/images/portrait_panel_clean_1794883326548.jpg',
  },
};
