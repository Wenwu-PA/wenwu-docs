import path from 'node:path';

const ignoredDirs = new Set([
  '.vscode', '.vs', '.idea', '.cache', '.pytest_cache', '.mypy_cache', '__pycache__',
  '.venv', 'venv', 'node_modules', 'packages', 'build', 'bin', 'obj', 'debug',
  'release', 'x64', 'win32', 'ipch', 'out', 'dist', 'site-packages',
]);
const taskExtensions = new Set([
  '.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.hh', '.cs', '.py', '.js', '.jsx',
  '.ts', '.tsx', '.html', '.htm', '.css', '.scss', '.sql', '.md', '.markdown',
  '.txt', '.json', '.xml', '.yml', '.yaml', '.sh', '.ps1', '.bat', '.java', '.kt',
  '.ipynb', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.pdf',
]);

export function isTaskFile(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  const name = path.posix.basename(normalized);
  if (!name || name.startsWith('.') || /^readme(?:\.[^.]+)?$/i.test(name)) return false;
  if (normalized.split('/').some((segment) => ignoredDirs.has(segment.toLocaleLowerCase('en')))) return false;
  return taskExtensions.has(path.posix.extname(name).toLocaleLowerCase('en'));
}

function isDatedFolder(name) {
  return /(?:^|[^\d])\d{1,2}[.-]\d{1,2}(?:[.-]\d{2,4})?(?:$|[^\d])/.test(name);
}

/**
 * A task is a dated folder, a leaf project folder containing assignment files,
 * or a standalone assignment file directly under a subject source folder.
 * Source folders themselves, service files, documentation indexes, and media
 * resources do not count as tasks.
 */
export function detectTaskUnits(subjectPath, directoryPaths, filePaths) {
  const root = subjectPath.replaceAll('\\', '/').replace(/^\/|\/$/g, '');
  const directories = new Set(directoryPaths.map((value) => value.replaceAll('\\', '/').replace(/^\/|\/$/g, '')));
  const files = filePaths.map((value) => value.replaceAll('\\', '/').replace(/^\/|\/$/g, '')).filter(isTaskFile);
  const directFiles = files.filter((value) => path.posix.dirname(value) === root);
  const units = [...directFiles];

  const walk = (directory) => {
    const children = [...directories].filter((candidate) => path.posix.dirname(candidate) === directory
      && !ignoredDirs.has(path.posix.basename(candidate).toLocaleLowerCase('en')));
    for (const child of children) {
      if (isDatedFolder(path.posix.basename(child))) {
        units.push(child);
        continue;
      }
      const subtreeFiles = files.filter((file) => file.startsWith(`${child}/`));
      if (!subtreeFiles.length) continue;
      const descendantUnitsBefore = units.length;
      walk(child);
      if (units.length === descendantUnitsBefore && subtreeFiles.some((file) => path.posix.dirname(file) === child)) units.push(child);
    }
  };
  walk(root);
  return [...new Set(units)].sort((a, b) => a.localeCompare(b, 'ru', { sensitivity: 'base' }));
}

export function countSubjectTasks(subjectSources, directoryPaths, filePaths) {
  let cwCount = 0;
  let hwCount = 0;
  const units = [];
  for (const source of subjectSources) {
    const found = detectTaskUnits(source.path, directoryPaths, filePaths);
    if (source.workType === 'CW') cwCount += found.length;
    if (source.workType === 'HW') hwCount += found.length;
    units.push(...found.map((path) => ({ path, workType: source.workType })));
  }
  return { cwCount, hwCount, total: cwCount + hwCount, units };
}
