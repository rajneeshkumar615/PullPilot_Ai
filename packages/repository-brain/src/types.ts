export interface RepositoryFile {
  absolutePath: string;
  path: string;
  extension: string;
  size: number;
}

export interface RepositorySnapshot {
  root: string;
  files: RepositoryFile[];
}

export interface LanguageStat {
  language: string;
  files: number;
}

export interface RepositoryStats {
  totalFiles: number;
  totalLines: number;
  languages: LanguageStat[];
}