export interface AIReport {
  score: number;

  summary: string;

  strengths: string[];

  weaknesses: string[];

  security: string[];

  performance: string[];

  roadmap: string[];
}