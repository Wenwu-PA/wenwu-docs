import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import MiniSearch from 'minisearch';
import YAML from 'yaml';
import { manifestSchema } from './manifest-schema.mjs';
import { classifyTopic, classifyWorkPath, githubPathUrl, latestTaskActivityDate, normalizeTopic, stableId } from './manifest-utils.mjs';
import { countSubjectTasks } from './lib/task-detection.mjs';
import { convertNotebook } from './lib/notebook-convert.mjs';

const sourceDir = path.resolve(process.env.CONTENT_DIR ?? 'content-src');
const outDir = path.resolve('public');
const gitUrl = 'https://github.com/Wenwu-PA/IT-TOP_academy';
const maxPreviewBytes = 1024 * 1024;
const maxNotebookBytes = 5 * 1024 * 1024;
const searchableTextBytes = 32 * 1024;
const textualExts = new Set([
  '.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.hh', '.cs', '.py', '.js', '.jsx', '.ts', '.tsx',
  '.html', '.htm', '.css', '.scss', '.sql', '.md', '.markdown', '.txt', '.json', '.xml', '.yml',
  '.yaml', '.toml', '.ini', '.cfg', '.cmake', '.sh', '.ps1', '.bat', '.java', '.kt', '.go', '.rs',
  '.php', '.rb', '.swift', '.ipynb', '.vue', '.svelte', '.make', '.mk', '.gradle', '.tex',
]);
const mediaExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf']);
const documentExts = new Set(['.docx', '.pptx', '.xlsx', '.csv']);
const ignoredServiceDirs = new Set(['.vscode', '.vs', '.idea', '.cache', '.pytest_cache', '.mypy_cache', '__pycache__', '.venv', 'venv', 'node_modules', 'packages', 'build', 'cmake-build-debug', 'cmake-build-release', 'bin', 'obj', 'debug', 'release', 'x64', 'win32', 'ipch', 'out', 'dist', 'site-packages']);
const ignoredServiceFiles = new Set(['.ds_store', 'thumbs.db', 'desktop.ini', '.gitignore', '.gitattributes', '.gitmodules', 'cmakecache.txt', 'compile_commands.json']);
const ignoredGitExtensions = new Set(['.exe', '.obj', '.pdb', '.ilk']);
const conversionCache = path.resolve('node_modules/.cache/archive-conversions');
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
async function cachedConversion(filePath, convert) {
  const bytes = await readFile(filePath);
  const key = createHash('sha256').update('archive-conversion-v2\0').update(bytes).digest('hex');
  const cacheFile = path.join(conversionCache, `${key}.json`);
  try { return JSON.parse(await readFile(cacheFile, 'utf8')); } catch { /* Cache miss. */ }
  const result = await convert(bytes);
  await mkdir(conversionCache, { recursive: true });
  await writeFile(cacheFile, JSON.stringify(result));
  return result;
}
const languageMap = new Map([
  ['.c', 'C'], ['.h', 'C/C++'], ['.cc', 'C++'], ['.cpp', 'C++'], ['.cxx', 'C++'], ['.hpp', 'C++'],
  ['.cs', 'C#'], ['.py', 'Python'], ['.js', 'JavaScript'], ['.jsx', 'JavaScript'], ['.ts', 'TypeScript'],
  ['.tsx', 'TypeScript'], ['.html', 'HTML'], ['.htm', 'HTML'], ['.css', 'CSS'], ['.scss', 'SCSS'],
  ['.sql', 'SQL'], ['.md', 'Markdown'], ['.markdown', 'Markdown'], ['.json', 'JSON'], ['.xml', 'XML'],
  ['.yml', 'YAML'], ['.yaml', 'YAML'], ['.java', 'Java'], ['.kt', 'Kotlin'], ['.go', 'Go'], ['.rs', 'Rust'], ['.ipynb', 'Python'],
  ['.php', 'PHP'], ['.rb', 'Ruby'], ['.swift', 'Swift'], ['.ipynb', 'Jupyter'], ['.pdf', 'PDF'],
  ['.png', 'Image'], ['.jpg', 'Image'], ['.jpeg', 'Image'], ['.gif', 'Image'], ['.webp', 'Image'], ['.svg', 'Image'],
]);
const config = YAML.parse(await readFile('topics.config.yml', 'utf8'));
const siteConfig = YAML.parse(await readFile('site.config.yml', 'utf8'));
let topicRows = config.topics.map((topic) => ({
  ...topic,
  tokens: [topic.title, ...topic.aliases].map(normalizeTopic),
}));

function decodeTopicName(id, fallback = 'Без темы') {
  return topicRows.find((row) => row.id === id)?.title ?? (id?.startsWith('custom:') ? id.slice(7).replaceAll('-', ' ') : fallback);
}

function commitMap() {
  const raw = execFileSync('git', ['-C', sourceDir, 'log', '--format=%H%x09%cI%x09%s', '--name-only', '--no-renames'], {
    encoding: 'utf8', maxBuffer: 128 * 1024 * 1024,
  });
  const last = new Map();
  const first = new Map();
  let current = null;
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([a-f0-9]{40})\t(\d{4}-\d{2}-\d{2}T[^\t]+)\t(.*)$/);
    if (match) {
      current = { hash: match[1], date: match[2], message: match[3] };
    } else if (current && line.trim()) {
      const normalized = line.replaceAll('\\', '/');
      const segments = normalized.split('/');
      const paths = [normalized];
      for (let i = 1; i < segments.length; i++) paths.push(segments.slice(0, i).join('/'));
      for (const item of paths) {
        if (!last.has(item)) last.set(item, current);
        first.set(item, current);
      }
    }
  }
  return { last, first };
}

function parseReadme(text) {
  let metadata = {};
  let body = text;
  const frontmatter = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  if (frontmatter) {
    try { metadata = YAML.parse(frontmatter[1]) ?? {}; } catch (error) {
      throw new Error(`Ошибка frontmatter README: ${error.message}`, { cause: error });
    }
    body = text.slice(frontmatter[0].length);
  }
  const title = metadata.title || body.match(/^#\s+(.+)$/m)?.[1] || null;
  return { metadata, body, title };
}

function readmeForDir(relativePath, allFiles) {
  const candidates = [`${relativePath}/README.md`, `${relativePath}/readme.md`, `${relativePath}/README.MD`];
  const pathFound = candidates.find((candidate) => allFiles.has(candidate));
  return pathFound ? allFiles.get(pathFound) : null;
}

if (!existsSync(path.join(sourceDir, '.git'))) {
  throw new Error('Не найдена content-src/.git. Выполните npm run content:sync для загрузки IT-TOP_academy.');
}

const git = commitMap();
const sourceCommit = execFileSync('git', ['-C', sourceDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const files = new Map();
const dirs = new Set(['']);
const trackedFiles = new Set(execFileSync('git', ['-C', sourceDir, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean).map((item) => item.replaceAll('\\', '/')));
const ignoredByGit = new Set(execFileSync('git', ['-C', sourceDir, 'check-ignore', '--no-index', '--stdin'], {
  input: [...trackedFiles].join('\n'), encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'],
}).split(/\r?\n/).filter(Boolean).map((item) => item.replaceAll('\\', '/')));
const trackedPrefixes = new Set();
for (const file of trackedFiles) {
  const parts = file.split('/');
  for (let index = 1; index < parts.length; index++) trackedPrefixes.add(parts.slice(0, index).join('/'));
}

async function walk(directory, relative = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' }));
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory() && ignoredServiceDirs.has(entry.name.toLocaleLowerCase('en'))) continue;
    if (entry.isFile() && (ignoredServiceFiles.has(entry.name.toLocaleLowerCase('en')) || ignoredGitExtensions.has(path.extname(entry.name).toLocaleLowerCase('en')) || ignoredByGit.has(rel))) continue;
    if (entry.isDirectory()) {
      if (!trackedPrefixes.has(rel)) continue;
      dirs.add(rel);
      await walk(path.join(directory, entry.name), rel);
    } else if (entry.isFile() && trackedFiles.has(rel) && entry.name !== '.archive.yml') {
      files.set(rel, { full: path.join(directory, entry.name), stat: await stat(path.join(directory, entry.name)) });
      const parentSegments = rel.split('/').slice(0, -1);
      for (let i = 1; i <= parentSegments.length; i++) dirs.add(parentSegments.slice(0, i).join('/'));
    }
  }
}

await walk(sourceDir);
const outContent = path.join(outDir, 'content');
await rm(path.join(outDir, 'data'), { recursive: true, force: true });
await rm(outContent, { recursive: true, force: true });
await mkdir(path.join(outDir, 'data'), { recursive: true });
const nodes = [];

for (const rel of [...dirs].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b, 'ru'))) {
  const parentRel = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
  const parentId = rel ? stableId(parentRel) : null;
  const metaFile = files.get(rel ? `${rel}/.archive.yml` : '.archive.yml');
  let metadata = {};
  if (metaFile) metadata = YAML.parse(await readFile(metaFile.full, 'utf8')) ?? {};
  const readme = readmeForDir(rel, files);
  let readmeMetadata = {};
  let readmeBody = '';
  let readmeTitle = null;
  if (readme) {
    const parsed = parseReadme(await readFile(readme.full, 'utf8'));
    readmeMetadata = parsed.metadata;
    readmeBody = parsed.body.trim();
    readmeTitle = parsed.title;
  }
  metadata = { ...readmeMetadata, ...metadata };
  const title = metadata.title || readmeTitle || path.basename(rel) || 'Все материалы';
  const topic = classifyTopic(rel, topicRows, metadata.topic);
  if (topic?.startsWith('custom:') && !topicRows.some((row) => row.id === topic)) {
    const title = rel.split('/')[1] || topic.slice(7).replaceAll('-', ' ');
    topicRows.push({ id: topic, title, aliases: [], tokens: [normalizeTopic(title)] });
    console.warn(`Предупреждение: неизвестный предмет «${title}» (${rel}); добавлен как отдельный предмет.`);
  }
  const commits = rel ? git.last.get(rel) : null;
  const firstCommit = rel ? git.first.get(rel) : null;
  const dateAndKind = classifyWorkPath(rel);
  nodes.push({
    id: stableId(rel), path: rel, name: path.basename(rel) || 'IT-TOP_academy', type: 'dir', ext: '', language: '', size: 0,
    lines: null,
    lastCommit: { date: commits?.date.slice(0, 10) ?? null, hash: commits?.hash ?? null, message: commits?.message ?? null },
    firstCommit: { date: firstCommit?.date ?? null, hash: firstCommit?.hash ?? null, message: firstCommit?.message ?? null },
    activityDate: dateAndKind.date && dateAndKind.kind ? latestTaskActivityDate(dateAndKind.date, commits?.date) : null,
    githubUrl: githubPathUrl(gitUrl, rel, 'tree'),
    rawUrl: null,
    editUrl: githubPathUrl(gitUrl, rel, 'edit'),
    githubDevUrl: githubPathUrl('https://github.dev/Wenwu-PA/IT-TOP_academy', rel, 'tree'),
    topic, tags: Array.isArray(metadata.tags) ? metadata.tags : [], title, status: metadata.status ?? null,
    contentFile: null, parentId, statement: metadata.statement ?? (readmeBody || null), method: metadata.method ?? null,
    date: dateAndKind.date, workType: dateAndKind.kind,
  });
}

const searchDocuments = [];
for (const rel of [...files.keys()].sort((a, b) => a.localeCompare(b, 'ru'))) {
  if (path.basename(rel) === '.archive.yml') continue;
  const file = files.get(rel);
  const parentRel = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
  const parentDir = nodes.find((node) => node.id === stableId(parentRel));
  const ext = path.extname(rel).toLocaleLowerCase('en');
  const name = path.basename(rel);
  const isText = textualExts.has(ext);
  const isMedia = mediaExts.has(ext);
  const id = stableId(rel);
  const assetKey = createHash('sha256').update(rel).digest('hex');
  const previewable = (isText || isMedia || documentExts.has(ext)) && file.stat.size <= (ext === '.ipynb' ? maxNotebookBytes : documentExts.has(ext) ? 10 * maxPreviewBytes : maxPreviewBytes);
  const commit = git.last.get(rel);
  const firstCommit = git.first.get(rel);
  let body = '';
  let lineCount = null;
  let contentFile = null;
  let previewHtml = null;
  let notebookFile = null;
  let conversionError = null;
  if (['.docx', '.pptx', '.xlsx', '.csv', '.pdf', '.ipynb'].includes(ext)) {
    try {
      if (ext === '.ipynb') {
        if (file.stat.size > maxNotebookBytes) throw new Error('Notebook exceeds the 5 MiB preview limit.');
        const result = await cachedConversion(file.full, async (bytes) => convertNotebook(bytes.toString('utf8')));
        body = result.searchText.slice(0, searchableTextBytes);
        notebookFile = `/content/previews/${assetKey}.json`;
        await mkdir(path.join(outContent, 'previews'), { recursive: true });
        await writeFile(path.join(outContent, 'previews', `${assetKey}.json`), JSON.stringify(result));
      } else if (ext === '.docx') {
        const mammoth = (await import('mammoth')).default;
        const result = await cachedConversion(file.full, async (bytes) => {
          const images = mammoth.images.imgElement(async (image) => {
            const base64 = await image.read('base64');
            return { src: base64.length <= 400_000 ? `data:${image.contentType};base64,${base64}` : '' };
          });
          const [html, raw] = await Promise.all([mammoth.convertToHtml({ buffer: bytes }, { convertImage: images }), mammoth.extractRawText({ buffer: bytes })]);
          return { html: html.value, text: raw.value };
        });
        body = result.text.slice(0, searchableTextBytes);
        previewHtml = `/content/previews/${assetKey}.html`;
        await mkdir(path.join(outContent, 'previews'), { recursive: true });
        await writeFile(path.join(outContent, 'previews', `${assetKey}.html`), result.html);
      } else if (ext === '.pptx' || ext === '.pdf') {
        const result = await cachedConversion(file.full, async () => {
          const { OfficeParser } = await import('officeparser');
          const ast = await OfficeParser.parseOffice(file.full);
          return { text: (await ast.to('text')).value };
        });
        body = result.text.slice(0, searchableTextBytes);
        if (ext === '.pptx') {
          previewHtml = `/content/previews/${assetKey}.html`;
          await mkdir(path.join(outContent, 'previews'), { recursive: true });
          await writeFile(path.join(outContent, 'previews', `${assetKey}.html`), `<ol>${result.text.split(/\r?\n/).filter(Boolean).map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ol>`);
        }
      } else {
        const XLSX = await import('xlsx');
        const result = await cachedConversion(file.full, async (bytes) => {
          const workbook = ext === '.csv' ? XLSX.read(bytes.toString('utf8'), { type: 'string' }) : XLSX.read(bytes, { type: 'buffer' });
          return { sheets: workbook.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false }).slice(0, 500) })) };
        });
        body = result.sheets.flatMap((sheet) => [sheet.name, ...sheet.rows.flat().map(String)]).join('\n').slice(0, searchableTextBytes);
        previewHtml = `/content/previews/${assetKey}.html`;
        const tables = result.sheets.map((sheet) => `<h2>${escapeHtml(sheet.name)}</h2><table><tbody>${sheet.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('');
        await mkdir(path.join(outContent, 'previews'), { recursive: true });
        await writeFile(path.join(outContent, 'previews', `${assetKey}.html`), tables);
      }
    } catch (error) {
      conversionError = error.message;
      console.warn(`Предупреждение: не удалось преобразовать ${rel}: ${error.message}`);
    }
  }
  if (previewable) {
    const dest = path.join(outContent, 'files', `${assetKey}${ext}`);
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(file.full, dest);
    contentFile = `/content/files/${assetKey}${ext}`;
    if (isText && !body) {
      const text = await readFile(file.full, 'utf8');
      lineCount = text ? text.split(/\r?\n/).length : 0;
      body = text.slice(0, searchableTextBytes);
    }
  } else if (isText && file.stat.size <= searchableTextBytes) {
    body = await readFile(file.full, 'utf8');
    lineCount = body ? body.split(/\r?\n/).length : 0;
  }
  const topic = classifyTopic(rel, topicRows) ?? parentDir?.topic ?? null;
  nodes.push({
    id, path: rel, name, type: 'file', ext, language: languageMap.get(ext) ?? '', size: file.stat.size,
    lines: lineCount,
    lastCommit: { date: commit?.date.slice(0, 10) ?? null, hash: commit?.hash ?? null, message: commit?.message ?? null },
    firstCommit: { date: firstCommit?.date ?? null, hash: firstCommit?.hash ?? null, message: firstCommit?.message ?? null },
    activityDate: null,
    githubUrl: githubPathUrl(gitUrl, rel),
    rawUrl: `https://raw.githubusercontent.com/Wenwu-PA/IT-TOP_academy/main/${rel.split('/').map(encodeURIComponent).join('/')}`,
    editUrl: githubPathUrl(gitUrl, rel, 'edit'),
    githubDevUrl: githubPathUrl('https://github.dev/Wenwu-PA/IT-TOP_academy', rel),
    topic, tags: [], title: path.basename(name, ext) || name, status: null, contentFile, previewHtml, notebookFile, conversionError, parentId: stableId(parentRel),
    statement: null, method: null,
    date: null, workType: null,
  });
  searchDocuments.push({ id, name, path: rel, topic: decodeTopicName(topic), tags: '', content: body });
}

// Propagate each subject through its files and folders so filtering works from either view.
const topicByPath = new Map(nodes.filter((node) => node.topic).map((node) => [node.path, node.topic]));
for (const node of nodes) {
  if (node.topic) continue;
  let parent = node.parentId ? nodes.find((candidate) => candidate.id === node.parentId) : null;
  while (parent && !node.topic) {
    if (parent.topic) node.topic = parent.topic;
    parent = parent.parentId ? nodes.find((candidate) => candidate.id === parent.parentId) : null;
  }
  if (!node.topic) {
    for (const [subjectPath, topic] of topicByPath) {
      if (node.path.startsWith(`${subjectPath}/`)) { node.topic = topic; break; }
    }
  }
}

const directoryPaths = [...dirs];
const filePaths = [...files.keys()];
const taskCountsByTopic = new Map();
const sourceDirectories = nodes.filter((node) => node.type === 'dir' && /^(?:classwork|homework)-\d{4}\/[^/]+$/.test(node.path));
for (const topic of topicRows) {
  const periodCounts = [];
  for (const year of [...new Set(sourceDirectories.filter((node) => node.topic === topic.id).map((node) => node.path.match(/^(?:classwork|homework)-(\d{4})/)[1]))].sort()) {
    const subjectSources = sourceDirectories.filter((node) => node.topic === topic.id && node.path.startsWith(`classwork-${year}/`) || node.topic === topic.id && node.path.startsWith(`homework-${year}/`));
    const counts = countSubjectTasks(subjectSources, directoryPaths, filePaths);
    const fileCount = nodes.filter((node) => node.type === 'file' && node.topic === topic.id && /^(?:classwork|homework)-\d{4}\//.test(node.path) && node.path.match(/^(?:classwork|homework)-(\d{4})\//)?.[1] === year).length;
    periodCounts.push({ year, cwCount: counts.cwCount, hwCount: counts.hwCount, total: counts.total, fileCount });
  }
  const counts = periodCounts.reduce((total, item) => ({ cwCount: total.cwCount + item.cwCount, hwCount: total.hwCount + item.hwCount, total: total.total + item.total, fileCount: total.fileCount + item.fileCount }), { cwCount: 0, hwCount: 0, total: 0, fileCount: 0 });
  taskCountsByTopic.set(topic.id, { ...counts, periodCounts });
}
const taskSummary = [...taskCountsByTopic.values()].reduce((total, item) => ({ cwCount: total.cwCount + item.cwCount, hwCount: total.hwCount + item.hwCount, total: total.total + item.total }), { cwCount: 0, hwCount: 0, total: 0 });
taskSummary.fileCount = nodes.filter((node) => node.type === 'file').length;
if (taskSummary.total !== [...taskCountsByTopic.values()].reduce((sum, item) => sum + item.total, 0)) throw new Error('Инвариант заданий нарушен: сумма предметов не равна общему числу.');

const manifest = {
  generatedAt: new Date().toISOString(), source: gitUrl, commit: sourceCommit,
  buildId: `${process.env.GITHUB_SHA ?? 'local'}-${sourceCommit}`,
  site: siteConfig,
  taskSummary,
  topics: topicRows.map(({ id, title }) => ({ id, title, ...taskCountsByTopic.get(id) })),
  nodes: nodes.map((node) => ({ ...node, tags: node.workType ? [...node.tags, node.workType] : node.tags })),
};
const parsed = manifestSchema.safeParse(manifest);
if (!parsed.success) {
  console.error('Ошибка схемы manifest.json:', parsed.error.issues.slice(0, 10));
  process.exit(1);
}
await writeFile(path.join(outDir, 'data', 'manifest.json'), `${JSON.stringify(parsed.data)}\n`);

const miniSearch = new MiniSearch({
  fields: ['name', 'path', 'topic', 'tags', 'content'], storeFields: ['name', 'path', 'topic'],
  searchOptions: { boost: { name: 4, path: 2, topic: 2 }, prefix: true, fuzzy: 0.15 },
});
miniSearch.addAll(searchDocuments);
await writeFile(path.join(outDir, 'data', 'search-index.json'), JSON.stringify(miniSearch.toJSON()));
await writeFile(path.join(outDir, 'data', 'content-sha.txt'), `${sourceCommit}\n`);
await writeFile(path.join(outDir, 'data', 'version.json'), JSON.stringify({ buildId: manifest.buildId, generatedAt: manifest.generatedAt }));
console.log(`Манифест: ${nodes.length} элементов; контент скопирован до ${maxPreviewBytes} байт на файл; источник ${sourceCommit.slice(0, 7)}.`);
