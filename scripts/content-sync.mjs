import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const target = resolve('content-src');
if (!existsSync(resolve(target, '.git'))) {
  mkdirSync(target, { recursive: true });
  const clone = spawnSync('git', ['clone', 'https://github.com/Wenwu-PA/IT-TOP_academy.git', target], { stdio: 'inherit' });
  if (clone.status !== 0) process.exit(clone.status ?? 1);
} else {
  const pull = spawnSync('git', ['-C', target, 'pull', '--ff-only', 'origin', 'main'], { stdio: 'inherit' });
  if (pull.status !== 0) process.exit(pull.status ?? 1);
}
