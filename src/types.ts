export type WorkType = 'HW' | 'CW' | null;

export interface ArchiveNode {
  id: string;
  path: string;
  name: string;
  type: 'dir' | 'file';
  ext: string;
  language: string;
  size: number;
  lines: number | null;
  lastCommit: { date: string | null; hash: string | null; message: string | null };
  firstCommit: { date: string | null; hash: string | null; message: string | null };
  activityDate: string | null;
  githubUrl: string;
  rawUrl: string | null;
  editUrl: string;
  githubDevUrl: string;
  topic: string | null;
  tags: string[];
  title: string;
  status: string | null;
  contentFile: string | null;
  previewHtml?: string | null;
  notebookFile?: string | null;
  conversionError?: string | null;
  parentId: string | null;
  statement: string | null;
  method: string | null;
  date: string | null;
  workType: WorkType;
}

export interface ArchiveManifest {
  generatedAt: string;
  source: string;
  commit: string;
  buildId?: string;
  site?: { course?: number; courseLabel?: string; heroTitle?: string; heroTitleSecond?: string; tagline?: string; heroNote?: string };
  taskSummary?: { cwCount: number; hwCount: number; total: number; fileCount?: number };
  topics: { id: string; title: string; cwCount?: number; hwCount?: number; total?: number; fileCount?: number; periodCounts?: { year: string; cwCount: number; hwCount: number; total: number; fileCount?: number }[] }[];
  nodes: ArchiveNode[];
}

export type ArchiveSearchIndex = unknown;
