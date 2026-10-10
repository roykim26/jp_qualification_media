export type IconName =
  | 'calendar'
  | 'check'
  | 'clock'
  | 'close'
  | 'compare'
  | 'document'
  | 'external'
  | 'menu'
  | 'search'
  | 'update';

const iconPaths: Record<IconName, string> = {
  calendar:
    '<path d="M6 2v3M14 2v3M3 7h14M4 4h12a1 1 0 0 1 1 1v12H3V5a1 1 0 0 1 1-1Z"/>',
  check: '<circle cx="10" cy="10" r="8"/><path d="m6.5 10 2.2 2.2 4.8-5"/>',
  clock: '<circle cx="10" cy="10" r="8"/><path d="M10 5.5V10l3 2"/>',
  close: '<path d="m5 5 10 10M15 5 5 15"/>',
  compare:
    '<path d="M4 4v12M16 4v12M7 7h6M7 13h6"/><path d="m11 5 2 2-2 2M9 11l-2 2 2 2"/>',
  document:
    '<path d="M5 2.5h7l3 3V17.5H5Z"/><path d="M12 2.5v3h3M8 10h4M8 13h4"/>',
  external: '<path d="M11 4h5v5M16 4l-7 7"/><path d="M14 11v5H4V6h5"/>',
  menu: '<path d="M3 5h14M3 10h14M3 15h14"/>',
  search: '<circle cx="9" cy="9" r="6"/><path d="m13.5 13.5 3.5 3.5"/>',
  update: '<path d="M16 7V3l-2 2a7 7 0 1 0 2 7"/><path d="M16 3h-4"/>',
};

export function renderIcon(name: IconName, label?: string): string {
  const accessibility = label
    ? `role="img" aria-label="${escapeHtml(label)}"`
    : 'aria-hidden="true"';
  return `<svg class="icon" ${accessibility} viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">${iconPaths[name]}</svg>`;
}

export type ButtonVariant =
  'primary' | 'secondary' | 'tertiary' | 'official' | 'danger';

export function renderButtonLink(input: {
  href: string;
  label: string;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
}): string {
  const variant = input.variant ?? 'primary';
  const content = `${input.icon ? renderIcon(input.icon) : ''}<span>${escapeHtml(input.label)}</span>`;
  if (input.disabled)
    return `<span class="button button--${variant} is-disabled" aria-disabled="true">${content}</span>`;
  const external =
    variant === 'official' ? ' target="_blank" rel="noreferrer"' : '';
  return `<a class="button button--${variant}" href="${escapeHtml(input.href)}"${external}>${content}${variant === 'official' ? renderIcon('external') : ''}</a>`;
}

export type StatusTone =
  'verified' | 'warning' | 'review' | 'success' | 'danger' | 'info';

export function renderBadge(label: string, tone: StatusTone): string {
  const icon =
    tone === 'verified'
      ? 'check'
      : tone === 'warning'
        ? 'clock'
        : tone === 'review'
          ? 'update'
          : undefined;
  return `<span class="badge badge--${tone}">${icon ? renderIcon(icon) : ''}<span>${escapeHtml(label)}</span></span>`;
}

export function renderAlert(input: {
  title: string;
  body: string;
  tone?: 'info' | 'warning' | 'danger';
  actions?: string;
}): string {
  const tone = input.tone ?? 'info';
  return `<section class="alert alert--${tone}" role="${tone === 'danger' ? 'alert' : 'status'}"><div><h2 class="alert__title">${escapeHtml(input.title)}</h2><p>${escapeHtml(input.body)}</p>${input.actions ?? ''}</div></section>`;
}

export function renderFeedbackState(input: {
  kind: 'loading' | 'empty' | 'error';
  title: string;
  body: string;
  actions?: string;
}): string {
  const live =
    input.kind === 'loading' ? ' aria-live="polite" aria-busy="true"' : '';
  return `<section class="feedback feedback--${input.kind}"${live}><div class="feedback__icon">${renderIcon(input.kind === 'loading' ? 'update' : input.kind === 'error' ? 'close' : 'document')}</div><div><h2>${escapeHtml(input.title)}</h2><p>${escapeHtml(input.body)}</p>${input.actions ? `<div class="feedback__actions">${input.actions}</div>` : ''}</div></section>`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export const uiStyles = String.raw`
:root {
  color-scheme: light;
  --color-ink: #172033;
  --color-text-secondary: #334155;
  --color-muted: #475569;
  --color-primary: #1D4ED8;
  --color-primary-hover: #1E40AF;
  --color-primary-soft: #EFF6FF;
  --color-bg: #F6F8FB;
  --color-bg-subtle: #F8FAFC;
  --color-surface: #FFFFFF;
  --color-border: #DCE3ED;
  --color-border-strong: #CBD5E1;
  --color-focus: #2563EB;
  --color-info: #1E40AF;
  --color-info-bg: #EFF6FF;
  --color-verified: #0F766E;
  --color-verified-bg: #F0FDFA;
  --color-warning: #92400E;
  --color-warning-bg: #FFFBEB;
  --color-review: #9A3412;
  --color-review-bg: #FFF7ED;
  --color-success: #166534;
  --color-success-bg: #F0FDF4;
  --color-danger: #B91C1C;
  --color-danger-bg: #FEF2F2;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;
  --radius-control: 8px;
  --radius-card: 12px;
  --radius-feature: 16px;
  --radius-pill: 999px;
  --container: 1200px;
  --reading-width: 720px;
  --header-height: 72px;
  --subnav-height: 52px;
  --mobile-nav-height: 64px;
  --motion-fast: 120ms;
  --motion-default: 180ms;
  --motion-overlay: 240ms;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI",
    "Yu Gothic", Meiryo, sans-serif;
  color: var(--color-ink);
  background: var(--color-bg);
  font-synthesis: none;
}

*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--color-bg); color: var(--color-ink); font-size: 16px; line-height: 1.8; }
body, button, input, select, textarea { font: inherit; }
img, svg { display: block; max-width: 100%; }
button, input, select, textarea { color: inherit; }
a { color: var(--color-primary); text-decoration-thickness: .08em; text-underline-offset: .18em; }
a:hover { color: var(--color-primary-hover); }
:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
::selection { background: var(--color-primary-soft); }
h1, h2, h3 { margin-block: 0 var(--space-4); color: var(--color-ink); font-weight: 700; overflow-wrap: anywhere; }
h1 { font-size: 36px; line-height: 1.3; }
h2 { font-size: 28px; line-height: 1.4; }
h3 { font-size: 21px; line-height: 1.45; }
p { margin-block: 0 var(--space-4); }
ul, ol { margin-block: 0 var(--space-4); }
.icon { width: 20px; height: 20px; flex: 0 0 auto; }
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.skip-link { position: fixed; z-index: 70; inset: var(--space-2) auto auto var(--space-2); padding: var(--space-2) var(--space-4); border-radius: var(--radius-control); background: var(--color-surface); transform: translateY(-160%); }
.skip-link:focus { transform: translateY(0); }

.container { width: min(100% - 64px, var(--container)); margin-inline: auto; }
.reading-width { max-width: var(--reading-width); }
.grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: var(--space-6); }
.grid__full { grid-column: 1 / -1; }
.page-main { min-height: 60vh; padding-block: var(--space-8) var(--space-16); }
.page-section { margin-top: var(--space-16); }
.page-heading { max-width: var(--reading-width); margin-bottom: var(--space-8); }
.eyebrow { margin-bottom: var(--space-2); color: var(--color-muted); font-size: 14px; line-height: 1.65; }
.meta { color: var(--color-muted); font-size: 14px; line-height: 1.65; }

.site-header { position: sticky; z-index: 30; top: 0; height: var(--header-height); border-bottom: 1px solid var(--color-border); background: var(--color-surface); }
.site-header__inner { display: flex; height: 100%; align-items: center; gap: var(--space-6); }
.brand { flex: 0 0 auto; color: var(--color-ink); font-weight: 700; text-decoration: none; }
.desktop-nav { display: flex; min-width: 0; align-items: center; gap: var(--space-1); margin-left: auto; }
.nav-link { display: inline-flex; min-height: 44px; align-items: center; gap: var(--space-2); padding-inline: var(--space-3); border-radius: var(--radius-control); color: var(--color-text-secondary); font-size: 14px; font-weight: 600; text-decoration: none; white-space: nowrap; }
.nav-link:hover, .nav-link[aria-current="page"] { color: var(--color-primary); background: var(--color-primary-soft); }
.nav-link.is-disabled { color: var(--color-muted); cursor: not-allowed; opacity: .72; }
.mobile-menu { display: none; margin-left: auto; }
.mobile-menu > summary { display: inline-flex; width: 44px; height: 44px; align-items: center; justify-content: center; border-radius: var(--radius-control); cursor: pointer; list-style: none; }
.mobile-menu > summary::-webkit-details-marker { display: none; }
.mobile-menu[open] > summary { color: var(--color-primary); background: var(--color-primary-soft); }
.mobile-menu__panel { position: fixed; z-index: 50; top: var(--header-height); right: 0; left: 0; max-height: calc(100vh - var(--header-height)); overflow-y: auto; padding: var(--space-4); border-bottom: 1px solid var(--color-border); background: var(--color-surface); box-shadow: 0 12px 32px rgb(23 32 51 / 16%); }
.mobile-menu__panel .nav-link { width: 100%; }

.breadcrumbs { margin-bottom: var(--space-6); color: var(--color-muted); font-size: 14px; }
.breadcrumbs ol { display: flex; flex-wrap: wrap; gap: var(--space-2); padding: 0; list-style: none; }
.breadcrumbs li:not(:last-child)::after { content: "/"; margin-left: var(--space-2); color: var(--color-border-strong); }
.subnav { position: sticky; z-index: 20; top: var(--header-height); height: var(--subnav-height); overflow-x: auto; border-block: 1px solid var(--color-border); background: var(--color-surface); scrollbar-width: thin; }
.subnav__inner { display: flex; height: 100%; align-items: center; gap: var(--space-1); }
.subnav a, .subnav span { display: inline-flex; height: 40px; align-items: center; padding-inline: var(--space-3); border-radius: var(--radius-control); color: var(--color-text-secondary); font-size: 14px; font-weight: 600; text-decoration: none; white-space: nowrap; }
.subnav a:hover, .subnav a[aria-current="page"] { color: var(--color-primary); background: var(--color-primary-soft); }
.subnav .is-disabled { color: var(--color-muted); opacity: .65; }

.site-footer { padding-block: var(--space-12) calc(var(--space-12) + var(--mobile-nav-height)); border-top: 1px solid var(--color-border); background: var(--color-surface); }
.footer-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-8); }
.footer-group h2 { margin-bottom: var(--space-3); font-size: 16px; }
.footer-group ul { padding: 0; list-style: none; }
.footer-group li { margin-block: var(--space-2); }
.footer-group a, .footer-group span { color: var(--color-muted); font-size: 14px; }
.footer-group .is-disabled { opacity: .68; }
.footer-note { margin-top: var(--space-8); padding-top: var(--space-6); border-top: 1px solid var(--color-border); color: var(--color-muted); font-size: 12px; }
.mobile-bottom-nav { display: none; }

.button { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; gap: var(--space-2); padding: var(--space-2) var(--space-5); border: 1px solid transparent; border-radius: var(--radius-control); font-weight: 600; line-height: 1.4; text-align: center; text-decoration: none; transition: background-color var(--motion-fast), border-color var(--motion-fast), color var(--motion-fast); }
.button:active { transform: translateY(1px); }
.button--primary { color: var(--color-surface); background: var(--color-primary); }
.button--primary:hover { color: var(--color-surface); background: var(--color-primary-hover); }
.button--secondary { color: var(--color-primary); border-color: var(--color-border-strong); background: var(--color-surface); }
.button--secondary:hover { border-color: var(--color-primary); background: var(--color-primary-soft); }
.button--tertiary { color: var(--color-primary); background: transparent; }
.button--tertiary:hover { background: var(--color-primary-soft); }
.button--official { color: var(--color-ink); border-color: var(--color-border-strong); background: var(--color-surface); }
.button--official:hover { color: var(--color-primary); border-color: var(--color-primary); }
.button--danger { color: var(--color-surface); background: var(--color-danger); }
.button.is-disabled, .button:disabled { color: var(--color-muted); border-color: var(--color-border); background: var(--color-bg-subtle); cursor: not-allowed; opacity: .8; transform: none; }
.button.is-loading { position: relative; cursor: wait; }
.button.is-loading .icon { animation: ui-spin 900ms linear infinite; }

.field { display: grid; gap: var(--space-2); }
.field label { color: var(--color-text-secondary); font-weight: 600; }
.field input, .field select, .field textarea { width: 100%; min-height: 44px; padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border-strong); border-radius: var(--radius-control); background: var(--color-surface); }
.field textarea { min-height: 112px; resize: vertical; }
.field__help, .field__error { margin: 0; font-size: 14px; }
.field__help { color: var(--color-muted); }
.field__error { color: var(--color-danger); }
.field.has-error input, .field.has-error select, .field.has-error textarea { border-color: var(--color-danger); }

.card { border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface); }
.card__body { padding: var(--space-6); }
.badge { display: inline-flex; min-height: 26px; align-items: center; gap: var(--space-1); padding: 2px var(--space-3); border: 1px solid currentColor; border-radius: var(--radius-pill); font-size: 13px; font-weight: 600; line-height: 1.5; }
.badge .icon { width: 16px; height: 16px; }
.badge--verified { color: var(--color-verified); background: var(--color-verified-bg); }
.badge--warning { color: var(--color-warning); background: var(--color-warning-bg); }
.badge--review { color: var(--color-review); background: var(--color-review-bg); }
.badge--success { color: var(--color-success); background: var(--color-success-bg); }
.badge--danger { color: var(--color-danger); background: var(--color-danger-bg); }
.badge--info { color: var(--color-info); background: var(--color-info-bg); }

.alert, .feedback { display: flex; gap: var(--space-4); padding: var(--space-5); border: 1px solid var(--color-border); border-left-width: 4px; border-radius: var(--radius-card); background: var(--color-surface); }
.alert__title, .feedback h2 { margin-bottom: var(--space-2); font-size: 18px; }
.alert p, .feedback p { margin-bottom: 0; }
.alert--info { border-left-color: var(--color-info); background: var(--color-info-bg); }
.alert--warning { border-left-color: var(--color-warning); background: var(--color-warning-bg); }
.alert--danger, .feedback--error { border-left-color: var(--color-danger); background: var(--color-danger-bg); }
.feedback--empty { border-left-color: var(--color-warning); background: var(--color-warning-bg); }
.feedback--loading { border-left-color: var(--color-info); background: var(--color-info-bg); }
.feedback__icon { margin-top: var(--space-1); }
.feedback--loading .feedback__icon { animation: ui-spin 900ms linear infinite; }
.feedback__actions { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-4); }

.modal { width: min(100% - 32px, 640px); padding: 0; border: 1px solid var(--color-border); border-radius: var(--radius-feature); background: var(--color-surface); box-shadow: 0 20px 48px rgb(23 32 51 / 20%); }
.modal::backdrop { background: rgb(23 32 51 / 48%); }
.modal__header, .modal__body, .modal__actions { padding: var(--space-5) var(--space-6); }
.modal__header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--color-border); }
.modal__actions { display: flex; justify-content: flex-end; gap: var(--space-3); border-top: 1px solid var(--color-border); }

details.disclosure { border-top: 1px solid var(--color-border); }
details.disclosure:last-child { border-bottom: 1px solid var(--color-border); }
details.disclosure > summary { min-height: 44px; padding-block: var(--space-3); color: var(--color-text-secondary); font-weight: 600; cursor: pointer; }
details.disclosure > div { padding-bottom: var(--space-4); color: var(--color-muted); overflow-wrap: anywhere; }

@keyframes ui-spin { to { transform: rotate(360deg); } }

@media (max-width: 1023px) {
  .container { width: min(100% - 48px, var(--container)); }
  .grid { grid-template-columns: repeat(8, minmax(0, 1fr)); gap: var(--space-5); }
  .desktop-nav { gap: 0; }
  .nav-link { padding-inline: var(--space-2); }
  .footer-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 767px) {
  :root { --header-height: 56px; }
  html { scroll-behavior: auto; }
  body { padding-bottom: calc(var(--mobile-nav-height) + env(safe-area-inset-bottom)); }
  h1 { font-size: 30px; }
  h2 { font-size: 24px; }
  h3 { font-size: 19px; }
  .container { width: calc(100% - 32px); }
  .grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-4); }
  .page-main { padding-block: var(--space-6) var(--space-10); }
  .page-section { margin-top: var(--space-10); }
  .desktop-nav { display: none; }
  .mobile-menu { display: block; }
  .footer-grid { grid-template-columns: 1fr; gap: var(--space-6); }
  .site-footer { padding-bottom: var(--space-10); }
  .mobile-bottom-nav { position: fixed; z-index: 30; right: 0; bottom: 0; left: 0; display: grid; grid-template-columns: repeat(4, 1fr); min-height: calc(var(--mobile-nav-height) + env(safe-area-inset-bottom)); padding-bottom: env(safe-area-inset-bottom); border-top: 1px solid var(--color-border); background: var(--color-surface); }
  .mobile-bottom-nav a, .mobile-bottom-nav span { display: flex; min-width: 0; align-items: center; justify-content: center; flex-direction: column; gap: 2px; padding: var(--space-1); color: var(--color-muted); font-size: 12px; font-weight: 600; text-decoration: none; }
  .mobile-bottom-nav a[aria-current="page"] { color: var(--color-primary); background: var(--color-primary-soft); }
  .mobile-bottom-nav .is-disabled { opacity: .62; }
  .card__body { padding: var(--space-5); }
  .modal__header, .modal__body, .modal__actions { padding: var(--space-4); }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
}
`;
