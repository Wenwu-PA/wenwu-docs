import { useEffect, useState } from 'react';
import type { ArchiveNode } from '../types';
import { readVisitHistory, subscribeVisitHistory, type VisitEntry } from '../utils/visitHistory';

export function useVisitHistory(nodes: ArchiveNode[]): VisitEntry[] {
  const [history, setHistory] = useState(() => readVisitHistory(nodes));
  useEffect(() => {
    const refresh = () => setHistory(readVisitHistory(nodes));
    const unsubscribe = subscribeVisitHistory(refresh);
    refresh();
    return unsubscribe;
  }, [nodes]);
  return history;
}
