export interface LanguageStat {
  language: string;
  files: number;
}

export interface RecentCommit {
  hash: string;
  author: string;
  message: string;
  date: string;
}

export interface GitMetrics {
  totalCommits: number;
  contributors: number;
  recentCommits: RecentCommit[];
}

export interface RepositoryIntelligence {
  overallScore: number;
  maintainability: number;
  scalability: number;
  architecture: number;
  dependencyHealth: number;
  codeQuality: number;
  summary: string;
}

export interface RepositoryReport {
  generatedAt: string;

  summary: {
    totalFiles: number;
    totalLines: number;
    languages: LanguageStat[];
  };

  architecture: {
    framework: string[];
    language: string[];
    packageManager: string[];
    database: string[];
    deployment: string[];
    structure: string[];
  };

  dependencies: {
    total: number;
    external: number;
    internal: number;
  };

  cycles: unknown[];

  complexity: {
    files: number;
    highRisk: number;
  };

  symbols: number;

  knowledgeGraph: {
    nodes: number;
    edges: number;
  };

  git: GitMetrics;

  intelligence: RepositoryIntelligence;
}