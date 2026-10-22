import type { ArchiveNode } from '../types';

export function renderDiaryTemplate(template: string, node: ArchiveNode, topicName: string, githubUrl = node.githubUrl, siteUrl = '') {
  const values = {
    title: node.title || node.name, topic: topicName,
    type: node.workType === 'HW' ? 'Домашняя работа' : node.workType === 'CW' ? 'Классная работа' : 'Работа',
    date: node.date ?? node.lastCommit.date ?? '—', path: node.path, githubUrl, siteUrl,
  };
  return template.replace(/\{\{?(title|topic|type|date|path|githubUrl|siteUrl)\}\}?/g, (_, key: keyof typeof values) => values[key]);
}
