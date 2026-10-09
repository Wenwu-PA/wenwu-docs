import type { ArchiveNode } from '../types';

export function taskActivityTime(node: ArchiveNode): number {
  if (node.activityDate) {
    const parsed = Date.parse(node.activityDate);
    if (Number.isFinite(parsed)) return parsed;
  }
  const match = node.date?.match(/^(\d{1,2})[.-](\d{1,2})[.-](\d{2,4})$/);
  if (!match) return 0;
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  const parsed = Date.parse(`${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sortLatestTasks(nodes: ArchiveNode[]): ArchiveNode[] {
  return [...nodes].sort((a, b) => taskActivityTime(b) - taskActivityTime(a) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
