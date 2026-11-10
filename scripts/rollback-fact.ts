import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';
import {
  normalizeRollbackAudit,
  rollbackApprovedFact,
} from '../services/api/src/release.js';

export type RollbackArgs = {
  factId: string;
  operatorId: string;
  reason: string;
  toRevisionId?: string;
  confirm?: string;
  dryRun: boolean;
};

const usage =
  'Usage: npm run rollback:fact -- --fact-id=<id> --operator=<name> --reason="..." [--to-revision=<id>] [--dry-run] --confirm=<fact-id>';

/**
 * 参数校验保持纯函数，便于在没有数据库的环境里跑用例。
 * 真跑必须带 `--confirm=<fact-id>`，防止手滑回车把生产事实退掉。
 */
export function parseRollbackArgs(argv: readonly string[]): RollbackArgs {
  const flags = new Map<string, string | true>();
  for (const arg of argv) {
    if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}`);
    const [name, ...rest] = arg.slice(2).split('=');
    if (!name) throw new Error(`unexpected argument: ${arg}`);
    if (flags.has(name)) throw new Error(`duplicate flag: --${name}`);
    flags.set(name, rest.length ? rest.join('=') : true);
  }
  const allowed = new Set([
    'fact-id',
    'operator',
    'reason',
    'to-revision',
    'confirm',
    'dry-run',
    'help',
  ]);
  for (const name of flags.keys())
    if (!allowed.has(name)) throw new Error(`unknown flag: --${name}`);
  if (flags.has('help')) throw new Error(usage);

  const text = (name: string): string | undefined => {
    const value = flags.get(name);
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !value.trim())
      throw new Error(`--${name} needs a value`);
    return value.trim();
  };
  const factId = text('fact-id');
  if (!factId) throw new Error('--fact-id is required');
  const audit = normalizeRollbackAudit({
    operatorId: text('operator'),
    reason: text('reason'),
  });
  const dryRun = flags.get('dry-run') === true;
  const confirm = text('confirm');
  if (!dryRun && confirm !== factId)
    throw new Error('--confirm must repeat the exact --fact-id');
  return {
    factId,
    operatorId: audit.operatorId,
    reason: audit.reason,
    toRevisionId: text('to-revision'),
    confirm,
    dryRun,
  };
}

async function currentFactState(databaseUrl: string, factId: string) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT f.id, f.fact_key, f.status, f.current_revision_id, r.display_value, r.verified_at, q.slug
       FROM facts f
       JOIN qualifications q ON q.id=f.qualification_id
       LEFT JOIN fact_revisions r ON r.id=f.current_revision_id
       WHERE f.id=$1`,
      [factId],
    );
    return result.rows[0] ?? null;
  } finally {
    await client.end();
  }
}

async function revisionState(databaseUrl: string, revisionId: string) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT display_value, verified_at FROM fact_revisions WHERE id=$1`,
      [revisionId],
    );
    return result.rows[0] ?? null;
  } finally {
    await client.end();
  }
}

async function main() {
  let args: RollbackArgs;
  try {
    args = parseRollbackArgs(process.argv.slice(2));
  } catch (error) {
    console.error((error as Error).message);
    process.exit(2);
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(2);
  }
  const before = await currentFactState(databaseUrl, args.factId);
  if (!before) {
    console.error(`fact not found: ${args.factId}`);
    process.exit(1);
  }
  try {
    const result = await rollbackApprovedFact(databaseUrl, args.factId, {
      operatorId: args.operatorId,
      reason: args.reason,
      ...(args.toRevisionId ? { toRevisionId: args.toRevisionId } : {}),
      ...(args.dryRun ? { dryRun: true } : {}),
    });
    const after = await currentFactState(databaseUrl, args.factId);
    // A dry run rolls the transaction back, so the fact row still points at the
    // old revision. Read the target revision directly instead of pretending the
    // unchanged row is the rollback result.
    const target = result.dryRun
      ? await revisionState(databaseUrl, result.toRevisionId)
      : after;
    console.log(
      JSON.stringify(
        {
          status: result.dryRun ? 'dry_run' : 'rolled_back',
          factId: result.factId,
          qualification: after?.slug ?? before.slug,
          factKey: before.fact_key,
          page: `/shikaku/${after?.slug ?? before.slug}/`,
          from: {
            revisionId: result.fromRevisionId,
            displayValue: before.display_value,
            verifiedAt: before.verified_at,
          },
          to: {
            revisionId: result.toRevisionId,
            displayValue: target?.display_value ?? null,
            verifiedAt: target?.verified_at ?? null,
          },
          // null on a dry run: nothing was committed, so no page check applies.
          pageShowsRolledBackValue: result.dryRun
            ? null
            : after?.current_revision_id === result.toRevisionId &&
              Boolean(after?.display_value),
          changeEvent: {
            id: result.eventId,
            created: result.eventCreated,
            wouldCreate: result.wouldCreateEvent,
          },
          operatorId: result.operatorId,
          reason: result.reason,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      JSON.stringify({ status: 'failed', reason: (error as Error).message }),
    );
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
