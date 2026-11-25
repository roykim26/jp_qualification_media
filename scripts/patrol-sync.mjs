#!/usr/bin/env node
/**
 * 把本机跑出来的 patrol 抓取产物同步到生产。
 *
 * 背景（2026-11-25）：生产的云出口访问 jafp / kinzai / gyoseishoshi 会被重置或超时，
 * 抓取改在本机执行，生产只接收 registry / report / cache 供 ops-daily 读取；
 * 见 docs/runbook.md「来源巡检与落库（patrol）」。
 *
 * 用法：
 *   pnpm patrol:sync                 # 只同步巡逻产物（默认）
 *   pnpm patrol:sync -- --snapshots  # 连快照一起同步（准备在生产执行 patrol:record 时）
 *
 * 环境变量：
 *   PATROL_SYNC_HOST         默认 root@47.79.87.163
 *   PATROL_SSH_KEY           默认 ~/.ssh/jpqm_deploy
 *   PATROL_REMOTE_DIR        默认 /opt/jpqm/var/patrol
 *   PATROL_REMOTE_SNAPSHOTS  默认 /opt/jpqm/var/official-snapshots
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const patrolDir = path.join(repoRoot, 'var', 'patrol');
const snapshotsDir = path.join(repoRoot, 'var', 'official-snapshots');

const remoteHost = process.env.PATROL_SYNC_HOST ?? 'root@47.79.87.163';
const sshKey =
  process.env.PATROL_SSH_KEY ?? path.join(homedir(), '.ssh', 'jpqm_deploy');
const remoteDir = process.env.PATROL_REMOTE_DIR ?? '/opt/jpqm/var/patrol';
const remoteSnapshots =
  process.env.PATROL_REMOTE_SNAPSHOTS ?? '/opt/jpqm/var/official-snapshots';
const withSnapshots = process.argv.includes('--snapshots');

const FILES = ['patrol-report.json', 'registry.json', 'cache.json'];

function fail(message) {
  console.error(message);
  process.exit(2);
}

function toRepoRelative(value) {
  const absolute = path.isAbsolute(value)
    ? value
    : path.resolve(repoRoot, value);
  const relative = path.relative(repoRoot, absolute);
  if (relative.startsWith('..')) return value;
  return relative.split(path.sep).join('/');
}

if (!existsSync(sshKey)) {
  fail(
    `SSH 私钥不存在：${sshKey}\n` +
      '用 PATROL_SSH_KEY 指定，或先确认本机部署私钥仍在原位置。',
  );
}
for (const name of FILES) {
  if (!existsSync(path.join(patrolDir, name))) {
    fail(`缺少 ${name}。先在本机跑一次抓取（见 docs/runbook.md）。`);
  }
}

const sshOptions = [
  '-i',
  sshKey,
  '-o',
  'BatchMode=yes',
  '-o',
  'StrictHostKeyChecking=accept-new',
];
const transferOptions = ['-q', ...sshOptions];

const report = JSON.parse(
  readFileSync(path.join(patrolDir, 'patrol-report.json'), 'utf8'),
);
const registry = JSON.parse(
  readFileSync(path.join(patrolDir, 'registry.json'), 'utf8'),
);
const current = report.results.filter((item) => item.run_id === report.run_id);
const failed = current.filter((item) => item.status === 'failed');

console.log(
  `本地 run ${report.run_id}：${current.length} 条结果（failed ${failed.length}），` +
    `registry ${Object.keys(registry).length} 条`,
);

execFileSync(
  'ssh',
  [...sshOptions, remoteHost, `mkdir -p ${remoteDir} ${remoteSnapshots}`],
  { stdio: 'inherit' },
);

const sources = [
  path.join(patrolDir, 'registry.json'),
  path.join(patrolDir, 'cache.json'),
];
// 巡检报告里的 snapshot_path 是抓取机器的绝对路径（Windows 上是盘符路径），
// 直接 scp 到生产会把本机路径写进运维证据。这里只在传输副本里改写成仓库相对
// POSIX 路径，本地原始报告保持不动（patrol:record 用本地路径校验快照哈希）。
const portable = {
  ...report,
  results: report.results.map((item) =>
    item.snapshot_path
      ? { ...item, snapshot_path: toRepoRelative(item.snapshot_path) }
      : item,
  ),
};
const stagedDir = mkdtempSync(path.join(tmpdir(), 'patrol-sync-'));
writeFileSync(
  path.join(stagedDir, 'patrol-report.json'),
  JSON.stringify(portable, null, 2) + '\n',
  'utf8',
);
sources.unshift(path.join(stagedDir, 'patrol-report.json'));
process.on('exit', () => rmSync(stagedDir, { recursive: true, force: true }));

console.log(
  `同步 patrol-report.json, ${FILES.slice(1).join(', ')} → ${remoteHost}:${remoteDir}/`,
);
execFileSync(
  'scp',
  [...transferOptions, ...sources, `${remoteHost}:${remoteDir}/`],
  {
    stdio: 'inherit',
  },
);

if (withSnapshots) {
  const dirs = readdirSync(snapshotsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(snapshotsDir, entry.name));
  if (dirs.length > 0) {
    console.log(
      `同步 ${dirs.length} 个快照目录 → ${remoteHost}:${remoteSnapshots}/`,
    );
    execFileSync(
      'scp',
      [...transferOptions, '-r', ...dirs, `${remoteHost}:${remoteSnapshots}/`],
      { stdio: 'inherit' },
    );
  }
}

execFileSync(
  'ssh',
  [
    ...sshOptions,
    remoteHost,
    `ls -l ${FILES.map((name) => `${remoteDir}/${name}`).join(' ')}`,
  ],
  { stdio: 'inherit' },
);

console.log('patrol 产物已同步；生产 ops-daily 会读到新的 registry.json。');
if (failed.length > 0) {
  console.log(
    '注意：本次抓取仍有失败来源，同步后 coverageGap 仍按已登记来源计算。',
  );
}
