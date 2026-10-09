import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ArchiveManifest, ArchiveNode } from '../types';

export default function TreePage({ manifest }: { manifest: ArchiveManifest }) {
  const { nodeId = 'root' } = useParams();
  const selected = manifest.nodes.find((node) => node.id === nodeId);
  const children = useMemo(() => {
    const map = new Map<string | null, ArchiveNode[]>();
    for (const node of manifest.nodes) {
      const group = map.get(node.parentId) ?? [];
      group.push(node);
      map.set(node.parentId, group);
    }
    for (const group of map.values()) group.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' }) : a.type === 'dir' ? -1 : 1);
    return map;
  }, [manifest.nodes]);

  if (nodeId !== 'root' && !selected) return <main id="main" className="tree-page"><h1>Раздел не найден</h1><Link to="/tree">К корню архива</Link></main>;
  const startId = nodeId;
  const startChildren = children.get(startId) ?? [];
  const title = selected?.path ? selected.title : 'Дерево файлов / IT-TOP_academy';

  return <main id="main" className="tree-page">
    <p className="breadcrumbs">АРХИВ / СТРУКТУРА / {selected?.path || 'IT-TOP_ACADEMY'}</p>
    <div className="tree-heading"><div><h1>{title}</h1><p className="assignment-path">{manifest.nodes.length.toLocaleString('ru-RU')} папок и файлов · источник IT-TOP_academy</p></div><Link className="text-link" to="/">← В архив</Link></div>
    {startId && <Link className="tree-up" to={selected?.parentId ? `/tree/${selected.parentId}` : '/tree'}>↑ На уровень выше</Link>}
    <nav className="file-tree" aria-label="Дерево файлов"><ul role="tree">{startChildren.map((node) => <TreeNode key={node.id} node={node} childrenByParent={children} depth={0} />)}</ul></nav>
  </main>;
}

function TreeNode({ node, childrenByParent, depth }: { node: ArchiveNode; childrenByParent: Map<string | null, ArchiveNode[]>; depth: number }) {
  const children = childrenByParent.get(node.id) ?? [];
  if (node.type === 'file') return <li role="treeitem" className="tree-file"><span className="tree-type">{node.language || node.ext.slice(1).toUpperCase() || 'FILE'}</span><Link to={`/file/${node.id}`}>{node.name}</Link><span className="path-label">{node.size.toLocaleString('ru-RU')} Б</span></li>;
  return <li role="treeitem" aria-expanded={depth < 1}>
    <details open={depth < 1}>
      <summary><span className="tree-type">DIR</span><Link to={`/file/${node.id}`} onClick={(event) => event.stopPropagation()}>{node.name}</Link><Link className="tree-open" to={`/tree/${node.id}`} aria-label={`Открыть раздел ${node.name}`}>↗</Link></summary>
      {children.length > 0 ? <ul role="group">{children.map((child) => <TreeNode key={child.id} node={child} childrenByParent={childrenByParent} depth={depth + 1} />)}</ul> : <p className="tree-empty">Папка пуста</p>}
    </details>
  </li>;
}
