import type { ArchiveNode } from '../types';

export const VISIT_HISTORY_KEY = 'wenwu-recent-visits-v1';
const LEGACY_HISTORY_KEYS = ['wenwu-recently-opened', 'wenwu-history-v0'];
const DEFAULT_MAX_VISITS = 20;

export interface VisitEntry {
  id: string;
  path: string;
  title: string;
  visitedAt: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type StoredEntry = { id?: unknown; path?: unknown; href?: unknown; title?: unknown; name?: unknown; visitedAt?: unknown; timestamp?: unknown; openedAt?: unknown; ts?: unknown };
const listeners = new Set<() => void>();
let memoryHistory: VisitEntry[] = [];
let memoryAuthoritative = false;
const CHANGE_EVENT = 'wenwu:visit-history-change';

function browserStorage(): StorageLike | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; }
  catch { return null; }
}

function parseRecords(raw: string | null): StoredEntry[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    const records = Array.isArray(value) ? value : value && typeof value === 'object' && 'items' in value && Array.isArray(value.items) ? value.items : [];
    return records.map((item) => typeof item === 'string' ? { id: item } : item).filter((item): item is StoredEntry => Boolean(item) && typeof item === 'object');
  } catch { return []; }
}

function getTimestamp(record: StoredEntry, index: number): number {
  const value = record.visitedAt ?? record.timestamp ?? record.openedAt ?? record.ts;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return Date.now() - index;
}

function nodeForRecord(record: StoredEntry, nodes: ArchiveNode[]): ArchiveNode | undefined {
  if (typeof record.id === 'string') {
    const byId = nodes.find((node) => node.id === record.id);
    if (byId) return byId;
  }
  const path = typeof record.path === 'string' ? record.path.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '') : '';
  if (path) return nodes.find((node) => node.path === path);
  const href = typeof record.href === 'string' ? record.href : '';
  const routeId = href.match(/(?:#\/file\/|\/file\/)([^/?#]+)/)?.[1];
  if (!routeId) return undefined;
  try { return nodes.find((node) => node.id === decodeURIComponent(routeId)); } catch { return undefined; }
}

function historyLimit() {
  let limit = DEFAULT_MAX_VISITS;
  try {
    const settings = JSON.parse(window.localStorage.getItem('wenwu-settings-v1') ?? 'null') as { historyLimit?: number } | null;
    if ([10, 20, 50].includes(Number(settings?.historyLimit))) limit = Number(settings?.historyLimit);
  } catch { /* Use the default when storage is restricted or malformed. */ }
  return limit;
}

function normalize(records: StoredEntry[], nodes: ArchiveNode[]): VisitEntry[] {
  const merged = new Map<string, VisitEntry>();
  records.forEach((record, index) => {
    const node = nodeForRecord(record, nodes);
    if (!node) return;
    const entry = { id: node.id, path: node.path, title: node.title || node.name, visitedAt: getTimestamp(record, index) };
    const previous = merged.get(node.id);
    if (!previous || entry.visitedAt > previous.visitedAt) merged.set(node.id, entry);
  });
  return [...merged.values()].sort((a, b) => b.visitedAt - a.visitedAt || a.path.localeCompare(b.path)).slice(0, historyLimit());
}

export function notifyVisitHistoryChange() {
  try { window.dispatchEvent(new Event(CHANGE_EVENT)); }
  catch { for (const listener of listeners) listener(); /* The store also works without a DOM. */ }
}

export function readVisitHistory(nodes: ArchiveNode[], storage: StorageLike | null = browserStorage()): VisitEntry[] {
  if (!storage || memoryAuthoritative) return normalize(memoryHistory, nodes);
  try {
    const currentRaw = storage.getItem(VISIT_HISTORY_KEY);
    let records = parseRecords(currentRaw);
    let migrated = false;
    if (!currentRaw) {
      for (const key of LEGACY_HISTORY_KEYS) {
        const legacy = storage.getItem(key);
        if (legacy) { records = parseRecords(legacy); migrated = true; break; }
      }
    }
    const result = normalize(records, nodes);
    memoryHistory = result;
    if (migrated || (currentRaw && JSON.stringify(parseRecords(currentRaw)) !== JSON.stringify(result))) storage.setItem(VISIT_HISTORY_KEY, JSON.stringify(result));
    if (migrated) for (const key of LEGACY_HISTORY_KEYS) storage.removeItem(key);
    return result;
  } catch { return normalize(memoryHistory, nodes); }
}

export function recordVisit(node: ArchiveNode, nodes: ArchiveNode[], visitedAt = Date.now(), storage: StorageLike | null = browserStorage()): VisitEntry[] {
  const existing = readVisitHistory(nodes, storage);
  const entry = { id: node.id, path: node.path, title: node.title || node.name, visitedAt };
  const next = [entry, ...existing.filter((item) => item.id !== node.id && item.path !== node.path)]
    .sort((a, b) => b.visitedAt - a.visitedAt || a.path.localeCompare(b.path)).slice(0, historyLimit());
  memoryHistory = next;
  try {
    storage?.setItem(VISIT_HISTORY_KEY, JSON.stringify(next));
    memoryAuthoritative = false;
  } catch { memoryAuthoritative = true; /* Keep the in-memory history for this tab. */ }
  notifyVisitHistoryChange();
  return next;
}

export function clearVisitHistory(storage: StorageLike | null = browserStorage()): void {
  memoryHistory = [];
  try {
    storage?.removeItem(VISIT_HISTORY_KEY);
    if (storage) for (const key of LEGACY_HISTORY_KEYS) storage.removeItem(key);
    memoryAuthoritative = false;
  } catch { memoryAuthoritative = true; /* Clearing the in-memory history still works in restricted storage modes. */ }
  notifyVisitHistoryChange();
}

export function subscribeVisitHistory(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === VISIT_HISTORY_KEY || event.key === null || LEGACY_HISTORY_KEYS.includes(event.key)) {
      memoryAuthoritative = false;
      listener();
    }
  };
  try {
    window.addEventListener('storage', onStorage);
    window.addEventListener(CHANGE_EVENT, listener);
  } catch { /* Non-browser test and private contexts can still use the local store. */ }
  return () => {
    listeners.delete(listener);
    try {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(CHANGE_EVENT, listener);
    } catch { /* No browser listeners to remove. */ }
  };
}
