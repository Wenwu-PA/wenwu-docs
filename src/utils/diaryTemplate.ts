import type { ArchiveNode } from '../types';

export function renderDiaryTemplate(template: string, node: ArchiveNode, topicName: string) {
  return template
    .replaceAll('{{title}}', node.title || node.name)
    .replaceAll('{{topic}}', topicName)
    .replaceAll('{{type}}', node.workType === 'HW' ? 'Домашняя работа' : node.workType === 'CW' ? 'Классная работа' : 'Работа')
    .replaceAll('{{date}}', node.date ?? node.lastCommit.date ?? '—')
    .replaceAll('{{path}}', node.path);
}
