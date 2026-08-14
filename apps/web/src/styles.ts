export const webStyles = String.raw`
.home-intro__actions, .card-actions { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-6); }
.page-hero { padding: var(--space-8); margin-bottom: var(--space-8); border: 1px solid var(--color-border); border-radius: var(--radius-feature); background: var(--color-surface); }
.page-hero__meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin-top: var(--space-5); }
.detail-hero__section { color: var(--color-text-secondary); font-size: 18px; font-weight: 600; }
.detail-hero__intro { max-width: var(--reading-width); color: var(--color-muted); }
.tag-row { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-4); }
.tag { display: inline-flex; min-height: 26px; align-items: center; padding: 2px var(--space-3); border-radius: var(--radius-pill); color: var(--color-text-secondary); background: var(--color-bg-subtle); font-size: 13px; font-weight: 600; }

.home-hero { display: grid; grid-template-columns: minmax(0, 7fr) minmax(280px, 5fr); gap: var(--space-8); min-height: 520px; padding: var(--space-12); border: 1px solid var(--color-border); border-radius: var(--radius-feature); background: var(--color-surface); }
.home-hero__main { align-self: center; max-width: var(--reading-width); }
.home-hero h1 { font-size: 44px; line-height: 1.25; }
.home-hero__lead { color: var(--color-text-secondary); font-size: 18px; line-height: 1.8; }
.popular-links { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin-top: var(--space-8); color: var(--color-muted); font-size: 14px; }
.popular-links a { font-weight: 600; }
.trust-panel { align-self: center; padding: var(--space-8); border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-bg-subtle); }
.trust-panel__icon { display: inline-flex; width: 48px; height: 48px; align-items: center; justify-content: center; margin-bottom: var(--space-5); border-radius: var(--radius-pill); color: var(--color-verified); background: var(--color-verified-bg); }
.trust-panel__icon .icon { width: 24px; height: 24px; }
.trust-panel h2 { font-size: 21px; }
.trust-panel ul { padding-left: var(--space-5); color: var(--color-text-secondary); }
.home-section > .feedback { max-width: var(--reading-width); }
.home-qualifications { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-block: 1px solid var(--color-border); }
.home-qualification { min-width: 0; padding: var(--space-6); border-right: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); }
.home-qualification:nth-child(3n) { border-right: 0; }
.home-qualification:nth-last-child(-n + 3) { border-bottom: 0; }
.home-qualification h3 { font-size: 18px; }
.home-qualification p { color: var(--color-muted); font-size: 14px; }
.text-link { font-weight: 600; }
.tool-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-6); }
.tool-card { min-width: 0; padding: var(--space-6); border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-bg-subtle); }
.tool-card > .icon { width: 24px; height: 24px; margin-bottom: var(--space-4); color: var(--color-muted); }
.tool-card h3 { font-size: 18px; }
.tool-card p { color: var(--color-muted); }
.trust-summary { display: grid; grid-template-columns: minmax(0, 7fr) minmax(280px, 5fr); gap: var(--space-8); padding: var(--space-8); border-block: 1px solid var(--color-border); }
.trust-summary__points { display: grid; align-content: center; gap: var(--space-3); }
.trust-summary__points p { display: flex; align-items: center; gap: var(--space-3); margin: 0; color: var(--color-text-secondary); font-weight: 600; }
.trust-summary__points .icon { color: var(--color-primary); }

.directory-overview { display: grid; grid-template-columns: 160px 160px minmax(0, 1fr); gap: var(--space-6); align-items: center; padding: var(--space-6); border-block: 1px solid var(--color-border); }
.directory-overview p { margin: 0; color: var(--color-muted); }
.directory-overview__value { color: var(--color-ink) !important; font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; }
.directory-overview__fields .tag-row { margin: var(--space-2) 0 0; }
.directory { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-6); }
.directory-card { min-width: 0; }
.directory-card h2 { margin-bottom: var(--space-3); font-size: 18px; line-height: 1.5; }
.directory-card__aliases { min-height: 58px; color: var(--color-muted); }
.directory-card__links { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); margin-top: var(--space-5); padding-top: var(--space-4); border-top: 1px solid var(--color-border); font-size: 14px; }

.detail-layout { display: grid; grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr); gap: var(--space-8); align-items: start; }
.detail-main { min-width: 0; }
.detail-main > * + * { margin-top: var(--space-10); }
.fact-group + .fact-group { margin-top: var(--space-12); padding-top: var(--space-10); border-top: 1px solid var(--color-border); }
.fact-group .section-heading p:not(.eyebrow, .meta) { max-width: var(--reading-width); margin: var(--space-2) 0 0; color: var(--color-muted); }
.interpretation-note { margin-bottom: var(--space-8); }
.detail-sidebar { position: sticky; top: calc(var(--header-height) + var(--subnav-height) + var(--space-5)); display: grid; gap: var(--space-5); }
.sidebar-panel { padding: var(--space-5); border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface); }
.sidebar-panel h2 { font-size: 18px; }
.status-list { margin: var(--space-4) 0 0; }
.status-list div { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-3); padding-block: var(--space-3); border-top: 1px solid var(--color-border); }
.status-list dt { color: var(--color-muted); font-size: 14px; }
.status-list dd { margin: 0; color: var(--color-text-secondary); font-size: 14px; font-weight: 600; text-align: right; overflow-wrap: anywhere; }
.year-links { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.year-link { display: inline-flex; min-height: 44px; align-items: center; padding-inline: var(--space-3); border: 1px solid var(--color-border-strong); border-radius: var(--radius-control); background: var(--color-surface); font-weight: 600; text-decoration: none; }
.year-link:hover, .year-link[aria-current="page"] { border-color: var(--color-primary); background: var(--color-primary-soft); }
.sidebar-links { display: grid; }
.sidebar-links a { min-height: 44px; padding-block: var(--space-2); border-top: 1px solid var(--color-border); font-weight: 600; }
.sidebar-links a[aria-current="page"] { color: var(--color-primary); }
.facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-5); }
.fact { min-width: 0; }
.fact__heading { display: flex; flex-wrap: wrap; align-items: start; justify-content: space-between; gap: var(--space-2); }
.fact h3 { margin-bottom: var(--space-3); font-size: 18px; line-height: 1.5; }
.fact-value { margin-bottom: var(--space-3); font-size: clamp(20px, 2vw, 28px); font-weight: 700; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.dimensions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-4); }
.dimension { display: inline-flex; min-height: 26px; align-items: center; padding: 2px var(--space-2); border-radius: var(--radius-pill); color: var(--color-text-secondary); background: var(--color-bg-subtle); font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
.fact details { margin-top: var(--space-4); }
.fact details p { margin-bottom: var(--space-2); color: var(--color-muted); font-size: 14px; overflow-wrap: anywhere; }
.fact .source-url { font-size: 12px; }
.fact summary { min-height: 44px; color: var(--color-primary); font-weight: 600; cursor: pointer; }
.source-module { padding: var(--space-6); border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface); }
.source-module__intro { max-width: var(--reading-width); }
.source-list { padding: 0; list-style: none; }
.source-list li { padding-block: var(--space-4); border-top: 1px solid var(--color-border); }
.source-list li:last-child { border-bottom: 1px solid var(--color-border); }
.source-list a { font-weight: 600; overflow-wrap: anywhere; }
.source-list span { display: block; margin-top: var(--space-1); color: var(--color-muted); font-size: 14px; }
.verification-history { max-width: var(--reading-width); }
.verification-history ol { padding: 0; border-top: 1px solid var(--color-border); list-style: none; }
.verification-history li { display: grid; grid-template-columns: minmax(180px, auto) minmax(0, 1fr); gap: var(--space-5); padding-block: var(--space-4); border-bottom: 1px solid var(--color-border); }
.verification-history time { color: var(--color-text-secondary); font-weight: 600; font-variant-numeric: tabular-nums; }
.verification-history li span { color: var(--color-muted); }
.section-heading { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-6); }

@media (max-width: 1023px) {
  .home-hero { grid-template-columns: minmax(0, 1fr); min-height: auto; padding: var(--space-8); }
  .home-hero__main { max-width: none; }
  .trust-panel { width: 100%; }
  .directory, .home-qualifications { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .home-qualification:nth-child(3n) { border-right: 1px solid var(--color-border); }
  .home-qualification:nth-child(2n) { border-right: 0; }
  .home-qualification:nth-last-child(-n + 3) { border-bottom: 1px solid var(--color-border); }
  .home-qualification:nth-last-child(-n + 2) { border-bottom: 0; }
  .tool-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .detail-layout { grid-template-columns: minmax(0, 5fr) minmax(240px, 3fr); gap: var(--space-5); }
  .facts { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 767px) {
  .page-hero { padding: var(--space-5); }
  .page-hero__meta { align-items: flex-start; flex-direction: column; }
  .home-hero { gap: var(--space-6); padding: var(--space-5); }
  .home-hero h1 { font-size: 34px; }
  .home-hero__lead { font-size: 17px; }
  .trust-panel { padding: var(--space-5); }
  .home-qualifications, .directory, .tool-grid, .detail-layout, .trust-summary { grid-template-columns: minmax(0, 1fr); }
  .home-qualification { padding: var(--space-5); border-right: 0 !important; border-bottom: 1px solid var(--color-border) !important; }
  .home-qualification:last-child { border-bottom: 0 !important; }
  .trust-summary { padding: var(--space-5) 0; }
  .directory-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); padding: var(--space-5) 0; }
  .directory-overview__fields { grid-column: 1 / -1; }
  .detail-sidebar { position: static; grid-row: 1; }
  .detail-main { grid-row: 2; }
  .facts { grid-template-columns: minmax(0, 1fr); gap: var(--space-4); }
  .source-module { padding: var(--space-5); }
  .fact-group + .fact-group { margin-top: var(--space-10); padding-top: var(--space-8); }
  .verification-history li { grid-template-columns: minmax(0, 1fr); gap: var(--space-1); }
}
`;
