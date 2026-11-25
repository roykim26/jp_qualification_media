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

/**
 * The public entry check keeps its own vocabulary: `ok` is the only passing
 * state, everything else names what the entry did instead of serving a page.
 */
export type PublicEntryState =
  | 'ok'
  | 'not-html'
  | 'truncated'
  | 'redirect'
  | 'server-error'
  | 'client-error'
  | 'unreachable';

export type PublicEntryReport = {
  state: PublicEntryState;
  url: string;
  httpStatus: number | null;
  message: string | null;
  durationMs: number;
  reason?: 'timeout' | 'tls' | 'connect';
  code?: string | null;
  rawBody?: string;
};

/**
 * The merged report: the data-plane verdict plus what the public entry did.
 *
 * This is deliberately looser than `ReadinessReport`. When the public entry
 * overrides the verdict the pairings stop matching the data-plane shapes — a
 * healthy `database` can sit under `status: 'unreachable'` (the API is fine, the
 * site is not), and `reason` grows the two public-entry words. Keeping the
 * strict union here would force callers to cast a report that is telling the
 * truth. Every `ReadinessReport` still assigns to this type.
 */
export type CombinedReport = ProbeMeta & {
  status: ReadinessState;
  database: string | null;
  message: string | null;
  rawBody?: string;
  reason?: 'timeout' | 'connect' | 'tls' | 'public-entry';
  code?: string | null;
  public?: PublicEntryReport;
  /**
   * Present only when the public entry overrode the data-plane verdict. It
   * preserves the original verdict so "API fine, site unreachable" stays
   * readable instead of collapsing into a single word.
   */
  dataPlane?: {
    status: ReadinessState;
    database: string | null;
    message: string | null;
  };
};

export type ProbeOptions = {
  url: string | undefined;
  publicUrl: string | undefined;
  timeoutMs: number;
  json: boolean;
};

export function resolveReadyUrl(
  env?: NodeJS.ProcessEnv,
  overrideUrl?: string,
): string;

export function resolvePublicUrl(
  env?: NodeJS.ProcessEnv,
  overrideUrl?: string,
): string | undefined;

export function parseProbeArgs(argv?: string[]): ProbeOptions;

export function classifyReadiness(
  httpStatus: number,
  rawBody: string,
): ReadinessClassification;

export function classifyPublicEntry(
  httpStatus: number,
  rawBody: string,
): PublicEntryReport;

export function formatReport(report: CombinedReport): string;

export function probeReadiness(options: {
  url: string;
  timeoutMs?: number;
}): Promise<ReadinessReport>;

export function probePublicEntry(options: {
  url: string;
  timeoutMs?: number;
}): Promise<PublicEntryReport>;

export function mergePublicEntry(
  dataPlane: ReadinessReport,
  publicEntry: PublicEntryReport | undefined,
): CombinedReport;
