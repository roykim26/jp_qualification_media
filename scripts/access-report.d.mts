export type AccessEntry = {
  time: Date;
  date: string;
  method: string;
  host: string;
  pathname: string;
  query: string;
  status: number;
  clientIp: string;
  referer: string;
  userAgent: string;
};

export type AccessReport = {
  status: 'ok';
  window: { since: string | null; until: string | null };
  totals: { requests: number; human: number; bot: number; uniqueIps: number };
  byStatus: Record<number, number>;
  referrers: {
    direct: number;
    search: number;
    sns: number;
    internal: number;
    other: number;
  };
  featureUsage: Record<
    'ics' | 'search' | 'compare',
    { requests: number; uniqueIps: number }
  >;
  topPages: { path: string; count: number }[];
  days: { date: string; requests: number; uniqueIps: number }[];
  skippedLines?: number;
};

export function parseAccessLine(line: string): AccessEntry | null;
export function isBot(userAgent: string): boolean;
export function classifyReferer(
  referer: string,
  siteHost?: string,
): 'direct' | 'search' | 'sns' | 'internal' | 'other';
export function summarize(
  entries: AccessEntry[],
  options?: {
    since?: string;
    until?: string;
    top?: number;
    siteHost?: string;
  },
): AccessReport;
export function renderTextReport(report: AccessReport, files: string[]): string;