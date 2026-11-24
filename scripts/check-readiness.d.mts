export type ReadinessState =
  'ready' | 'error' | 'unconfigured' | 'unreachable' | 'unexpected';

export type ReadinessClassification =
  | { status: 'ready'; database: 'ok'; message: null }
  | { status: 'error'; database: 'error'; message: string }
  | { status: 'unconfigured'; database: 'unconfigured'; message: null }
  | {
      status: 'unexpected';
      database: string | null;
      message: string;
      rawBody: string;
    };

type ProbeMeta = {
  url: string;
  httpStatus: number | null;
  durationMs: number;
  checkedAt: string;
};

export type ReadinessReport =
  | (ProbeMeta & { status: 'ready'; database: 'ok'; message: null })
  | (ProbeMeta & { status: 'error'; database: 'error'; message: string })
  | (ProbeMeta & {
      status: 'unconfigured';
      database: 'unconfigured';
      message: null;
    })
  | (ProbeMeta & {
      status: 'unexpected';
      database: string | null;
      message: string;
      rawBody: string;
    })
  | (ProbeMeta & {
      status: 'unreachable';
      reason: 'timeout' | 'connect';
      database: null;
      message: string;
      code: string | null;
    });

export type ProbeOptions = {
  url: string | undefined;
  timeoutMs: number;
  json: boolean;
};

export function resolveReadyUrl(
  env?: NodeJS.ProcessEnv,
  overrideUrl?: string,
): string;

export function parseProbeArgs(argv?: string[]): ProbeOptions;

export function classifyReadiness(
  httpStatus: number,
  rawBody: string,
): ReadinessClassification;

export function formatReport(report: ReadinessReport): string;

export function probeReadiness(options: {
  url: string;
  timeoutMs?: number;
}): Promise<ReadinessReport>;
