
export interface EnvironmentIssue {
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  impactCategory: string;
  impactScore: number;
}

export interface ActionStep {
  step: string;
  priority: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface ActionPlan {
  summary: string;
  steps: ActionStep[];
  longTermGoal: string;
}

export interface GroundingLink {
  title: string;
  uri: string;
}

export interface LocationData {
  latitude: number;
  longitude: number;
}

export interface CustomMarker {
  id: string;
  label: string;
  type: 'park' | 'garden' | 'cleanup' | 'other';
  lat: number;
  lng: number;
  timestamp: number;
}

export interface FeedbackEntry {
  id: string;
  issueTitle: string;
  rating: 'up' | 'down';
  comment: string;
  timestamp: string;
}

export interface DetectedObject {
  id: string;
  label: string;
  category: 'pollution' | 'waste' | 'vegetation' | 'water' | 'habitat' | 'other';
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax]
  score: number;
  explanation: string;
}

export interface DetectionFeedback {
  detectionId: string;
  label: string;
  isCorrect: boolean;
  comment: string;
  timestamp: string;
}

export interface AnalysisHistoryEntry {
  id: string;
  timestamp: string;
  issue: EnvironmentIssue;
  actionPlan: ActionPlan;
  mediaUrl?: string;
}

export interface SectorTask {
  id: string;
  title: string;
  type: 'pollution' | 'restoration' | 'habitat' | 'intelligence';
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in-progress' | 'completed';
  latOffset: number;
  lngOffset: number;
  description: string;
  uri?: string;
}
