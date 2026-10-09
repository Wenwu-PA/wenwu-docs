export function normalizePath(value) {
  return value.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
}

export function stableId(relativePath) {
  return relativePath ? `p_${Buffer.from(normalizePath(relativePath), 'utf8').toString('base64url')}` : 'root';
}

export function normalizeTopic(value) {
  return value.toLocaleLowerCase('ru').replaceAll('ё', 'е').replace(/[^\p{L}\p{N}+#]+/gu, ' ').trim();
}

export function classifyTopic(relativePath, topicRows, customTopic) {
  if (customTopic) {
    const custom = topicRows.find((topic) => topic.id === customTopic || normalizeTopic(topic.title) === normalizeTopic(customTopic));
    return custom?.id ?? `custom:${normalizeTopic(customTopic).replaceAll(' ', '-')}`;
  }
  const normalized = normalizePath(relativePath);
  const parts = normalized.split('/').filter(Boolean);
  const root = parts[0]?.match(/^(?:classwork|homework)-(\d{4})$/i);
  // In the course trees, only the subject directory directly under the year is
  // authoritative. This avoids accidental matches in filenames and nested folders.
  if (root && parts[1]) {
    const subject = normalizeTopic(parts[1]);
    const match = topicRows.find((topic) => topic.tokens.includes(subject));
    if (match) return match.id;
    return `custom:${subject.replaceAll(' ', '-')}`;
  }
  const segments = parts.map(normalizeTopic).filter(Boolean);
  const match = topicRows.find((topic) => segments.some((segment) => topic.tokens.includes(segment)));
  return match?.id ?? null;
}

export function classifyWorkPath(relativePath) {
  const normalized = normalizePath(relativePath);
  const parts = normalized.split('/').filter(Boolean);
  const year = parts[0]?.match(/^(?:homework|classwork)-(\d{4})$/i)?.[1];
  const dateFolder = parts.length === 3 ? parts[2] : '';
  const match = dateFolder.match(/(?:^|[^\d])(\d{1,2})[.-](\d{1,2})(?:[.-](\d{2,4}))?(?:$|[^\d])/);
  const day = Number(match?.[1]);
  const month = Number(match?.[2]);
  const validDate = match && day >= 1 && day <= 31 && month >= 1 && month <= 12;
  const date = validDate ? `${match[1].padStart(2, '0')}.${match[2].padStart(2, '0')}.${(match[3] ?? year ?? '').slice(-4)}` : null;
  const type = normalized.match(/(?:^|\/)(homework|classwork|hw|cw)(?:-\d{4})?(?:\/|$)/i)?.[1]?.toLowerCase() ?? null;
  return { date, kind: type === 'homework' || type === 'hw' ? 'HW' : type === 'classwork' || type === 'cw' ? 'CW' : null };
}

export function latestTaskActivityDate(folderDate, commitDate) {
  const folderParts = folderDate?.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  const folderTimestamp = folderParts ? Date.parse(`${folderParts[3]}-${folderParts[2]}-${folderParts[1]}T00:00:00.000Z`) : Number.NaN;
  const commitTimestamp = commitDate ? Date.parse(commitDate) : Number.NaN;
  const timestamps = [folderTimestamp, commitTimestamp].filter(Number.isFinite);
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
}

export function githubPathUrl(base, relativePath, mode = 'blob') {
  const suffix = normalizePath(relativePath).split('/').map(encodeURIComponent).join('/');
  return `${base}/${mode}/main${suffix ? `/${suffix}` : ''}`;
}
