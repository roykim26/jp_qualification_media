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
.home-hero h1 { font-size: var(--font-size-display); line-height: 1.4; }
.home-hero__lead { color: var(--color-text-secondary); font-size: 18px; line-height: 1.8; }
.popular-links { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin-top: var(--space-8); color: var(--color-muted); font-size: 14px; }
.popular-links a { font-weight: 600; }
.trust-panel { align-self: center; padding: var(--space-8); border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-bg-subtle); }
.trust-panel__icon { display: inline-flex; width: 48px; height: 48px; align-items: center; justify-content: center; margin-bottom: var(--space-5); border-radius: var(--radius-pill); color: var(--color-verified); background: var(--color-verified-bg); }
.trust-panel__icon .icon { width: 24px; height: 24px; }
.trust-panel h2 { font-size: var(--font-size-lg); }
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
.directory-overview__value { color: var(--color-ink) !important; font-size: var(--font-size-2xl); font-weight: 700; font-variant-numeric: tabular-nums; }
.directory-overview__fields .tag-row { margin: var(--space-2) 0 0; }
.qualification-search { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-4); align-items: end; margin-bottom: var(--space-6); padding: var(--space-5); border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface); }
.not-found-search { margin-top: var(--space-8); margin-bottom: 0; }
.not-found-heading h1 { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
.not-found__code { display: inline-flex; min-height: 32px; align-items: center; padding: 2px var(--space-3); border-radius: var(--radius-pill); color: var(--color-muted); background: var(--color-bg-subtle); font-size: 14px; font-weight: 700; letter-spacing: .04em; }
.popular-pages { margin-top: var(--space-8); padding-top: var(--space-6); border-top: 1px solid var(--color-border); }
.popular-pages h2 { font-size: var(--font-size-lg); }
.popular-pages ul { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
.popular-pages a { display: flex; min-height: 44px; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-control); background: var(--color-surface); font-weight: 600; text-decoration: none; }
.popular-pages a:hover { border-color: var(--color-primary); background: var(--color-primary-soft); }
.search-control { position: relative; display: flex; align-items: center; }
.search-control .icon { position: absolute; left: var(--space-3); color: var(--color-muted); pointer-events: none; }
.search-control input { padding-left: 44px; }
.qualification-search__actions { display: flex; gap: var(--space-3); align-items: center; }
.qualification-search__actions .button { white-space: nowrap; }
.directory { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-6); }
.directory-card { min-width: 0; }
.directory-card h2 { margin-bottom: var(--space-3); font-size: 18px; line-height: 1.5; }
.directory-card__aliases { min-height: 58px; color: var(--color-muted); }
.filter-chips { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin-bottom: var(--space-6); font-size: 14px; }
.filter-chips__label { color: var(--color-muted); }
.filter-chip { display: inline-flex; min-height: 44px; align-items: center; gap: var(--space-2); padding: 0 var(--space-4); border: 1px solid var(--color-border-control); border-radius: var(--radius-pill); background: var(--color-surface); color: var(--color-ink); text-decoration: none; }
.filter-chip:hover { border-color: var(--color-primary); color: var(--color-primary); }
.filter-chips__clear { display: inline-flex; min-height: 44px; align-items: center; padding-inline: var(--space-2); color: var(--color-primary); }

.detail-layout { display: grid; grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr); gap: var(--space-8); align-items: start; }
.detail-main { min-width: 0; }
.detail-main > * + * { margin-top: var(--space-10); }
.fact-group + .fact-group { margin-top: var(--space-12); padding-top: var(--space-10); border-top: 1px solid var(--color-border); }
.fact-group .section-heading p:not(.eyebrow, .meta) { max-width: var(--reading-width); margin: var(--space-2) 0 0; color: var(--color-muted); }
.detail-summary { padding: var(--space-6); border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface); }
.detail-summary__heading { margin-bottom: var(--space-5); font-size: 18px; }
.detail-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3); }
.detail-kpi { display: grid; align-content: start; gap: var(--space-1); min-height: 44px; padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-control); background: var(--color-bg-subtle); }
.detail-kpi:hover, .detail-kpi:focus-within { border-color: var(--color-primary); background: var(--color-primary-soft); }
.detail-kpi__link { display: grid; gap: var(--space-1); color: inherit; text-decoration: none; }
.detail-kpi__label { color: var(--color-muted); font-size: 13px; font-weight: 600; }
.detail-kpi__value { color: var(--color-ink); font-size: 18px; font-weight: 700; line-height: 1.45; overflow-wrap: anywhere; }
.detail-kpi__note { color: var(--color-muted); font-size: 13px; }
.detail-kpi__ics { display: inline-flex; min-height: 44px; align-items: center; gap: var(--space-2); margin-top: var(--space-2); padding-top: var(--space-2); border-top: 1px solid var(--color-border); color: var(--color-primary); font-size: 13px; font-weight: 700; text-decoration: none; }
.detail-kpi__ics .icon { width: 16px; height: 16px; }
.detail-kpi__ics:hover { text-decoration: underline; }
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
.sidebar-panel--cta { border-color: var(--color-primary); background: var(--color-primary-soft); }
.sidebar-panel--cta .button { width: 100%; margin-top: var(--space-3); }
@media (min-width: 1024px) {
  .sidebar-panel--cta { position: sticky; bottom: var(--space-5); }
}
.facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-5); }
.fact { min-width: 0; }
.fact h3 { margin-bottom: var(--space-2); color: var(--color-text-secondary); font-size: 14px; font-weight: 600; line-height: 1.5; }
.fact-value,
.fact-value--numeric { margin-bottom: var(--space-2); font-size: clamp(22px, 2vw, 28px); font-weight: 700; line-height: 1.4; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.fact-value--long { color: var(--color-text-secondary); font-size: 16px; font-weight: 500; line-height: 1.75; font-variant-numeric: normal; }
.fact__meta { margin-bottom: 0; font-size: 13px; }
.dimensions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-4); }
.dimension { display: inline-flex; min-height: 26px; align-items: center; padding: 2px var(--space-2); border-radius: var(--radius-pill); color: var(--color-text-secondary); background: var(--color-bg-subtle); font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
.fact details { margin-top: var(--space-4); }
.fact details p { margin-bottom: var(--space-2); color: var(--color-muted); font-size: 14px; overflow-wrap: anywhere; }
.fact .source-url { font-size: 13px; }
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
.schedule-filter { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)) auto; gap: var(--space-4); align-items: end; margin-bottom: var(--space-8); padding: var(--space-5); border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface); }
.schedule-filter__actions { display: flex; gap: var(--space-3); }
.schedule-filter__actions .button { white-space: nowrap; }
.schedule-month { display: grid; gap: var(--space-4); margin-bottom: var(--space-8); }
.schedule-month:last-child { margin-bottom: 0; }
.schedule-month h3 { margin: 0; color: var(--color-ink); font-size: 18px; }
.schedule-month__heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); padding-bottom: var(--space-2); border-bottom: 1px solid var(--color-border); }
.schedule-list { display: grid; gap: var(--space-4); }
.schedule-event { display: grid; grid-template-columns: minmax(132px, auto) minmax(0, 1fr); gap: var(--space-3) var(--space-5); padding: var(--space-4) var(--space-5); border: 1px solid var(--color-border); border-left: 4px solid var(--color-primary); border-radius: var(--radius-card); background: var(--color-surface); }
.schedule-event time { color: var(--color-ink); font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; }
.schedule-event__heading { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; margin-bottom: var(--space-2); }
.schedule-event__heading h2 { margin: 0; font-size: var(--font-size-lg); }
.schedule-event__type { display: inline-flex; min-height: 26px; align-items: center; padding: 2px var(--space-3); border-radius: var(--radius-pill); color: var(--color-info); background: var(--color-info-bg); font-size: 13px; font-weight: 700; }
.schedule-event__value { margin-bottom: var(--space-3); color: var(--color-text-secondary); font-weight: 600; overflow-wrap: anywhere; }
.schedule-event__count { margin-left: var(--space-2); color: var(--color-muted); font-size: 14px; font-weight: 600; }
.schedule-event__dates { margin-bottom: var(--space-3); }
.schedule-event__dates > summary, .schedule-more > summary { display: flex; min-height: 44px; align-items: center; gap: var(--space-2); color: var(--color-primary); font-size: 14px; font-weight: 600; cursor: pointer; }
.schedule-event__dates ul { margin: 0 0 var(--space-2); padding-left: var(--space-5); color: var(--color-text-secondary); font-size: 14px; }
.schedule-event__actions, .schedule-download, .page-hero__actions { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-4); }
.schedule-event--application_open { border-left-color: var(--color-success); }
.schedule-event--application_open .schedule-event__type { color: var(--color-success); background: var(--color-success-bg); }
.schedule-event--application_deadline { border-left-color: var(--color-warning); }
.schedule-event--application_deadline .schedule-event__type { color: var(--color-warning); background: var(--color-warning-bg); }
.schedule-event--exam_date { border-left-color: var(--color-primary); }
.schedule-event--exam_date .schedule-event__type { color: var(--color-primary); background: var(--color-primary-soft); }
.schedule-event--result_date { border-left-color: var(--color-verified); }
.schedule-event--result_date .schedule-event__type { color: var(--color-verified); background: var(--color-verified-bg); }
.schedule-month__count { margin-left: var(--space-2); color: var(--color-muted); font-size: 14px; font-weight: 600; }
.schedule-more { margin-top: var(--space-2); }
.schedule-more__list { margin: var(--space-2) 0 0; padding: 0; border-top: 1px solid var(--color-border); list-style: none; }
.schedule-more__list li { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-3); align-items: baseline; padding-block: var(--space-3); border-bottom: 1px solid var(--color-border); font-size: 14px; }
.schedule-more__list time { color: var(--color-text-secondary); font-weight: 600; font-variant-numeric: tabular-nums; }
.schedule-more__type { color: var(--color-muted); font-size: 13px; font-weight: 700; }
.schedule-window { margin-bottom: var(--space-6); color: var(--color-muted); font-size: 14px; }
.compare-selector { display: grid; gap: var(--space-4); margin-bottom: var(--space-8); padding: var(--space-5); border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface); }
.compare-selector fieldset { min-width: 0; padding: 0; border: 0; }
.compare-selector legend { margin-bottom: var(--space-3); color: var(--color-text-secondary); font-weight: 700; }
.compare-choices { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); }
.compare-choice { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0 var(--space-2); align-items: center; min-height: 64px; padding: var(--space-3); border: 1px solid var(--color-border-control); border-radius: var(--radius-control); background: var(--color-bg-subtle); cursor: pointer; }
.compare-choice input { width: 18px; height: 18px; }
.compare-choice span { min-width: 0; font-weight: 700; overflow-wrap: anywhere; }
.compare-choice small { grid-column: 2; color: var(--color-muted); font-size: 13px; overflow-wrap: anywhere; }
.compare-table-wrap { overflow: auto; max-height: 70vh; border: 1px solid var(--color-border); border-radius: var(--radius-card); background-color: var(--color-surface); background-image: linear-gradient(to right, var(--color-surface) 30%, rgb(255 255 255 / 0)), linear-gradient(to left, var(--color-surface) 30%, rgb(255 255 255 / 0)), radial-gradient(farthest-side at 0% 50%, rgb(15 23 42 / .14), rgb(15 23 42 / 0)), radial-gradient(farthest-side at 100% 50%, rgb(15 23 42 / .14), rgb(15 23 42 / 0)); background-repeat: no-repeat; background-size: 40px 100%, 40px 100%, 18px 100%, 18px 100%; background-attachment: local, local, scroll, scroll; }
.compare-table thead th { position: sticky; top: 0; z-index: 2; background: var(--color-surface); }
.compare-table tbody th { position: sticky; left: 0; z-index: 1; background: var(--color-surface); }
.compare-table thead th:first-child { left: 0; z-index: 3; }
.scroll-hint { display: none; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); color: var(--color-muted); font-size: 13px; font-weight: 600; }
.compare-status { margin: var(--space-2) 0 0; color: var(--color-text-secondary); font-size: 14px; font-weight: 600; }
.compare-chips { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin-bottom: var(--space-4); }
.compare-chips__label { color: var(--color-muted); font-size: 13px; font-weight: 600; }
.compare-chip { display: inline-flex; min-height: 44px; align-items: center; gap: var(--space-2); padding: 2px var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-pill); background: var(--color-surface); color: var(--color-text-secondary); font-size: 13px; font-weight: 600; text-decoration: none; }
.compare-chip:hover { border-color: var(--color-primary); color: var(--color-primary); }
.compare-chip span { font-size: 16px; line-height: 1; }
.compare-table { width: 100%; min-width: 760px; border-collapse: collapse; }
.compare-table th, .compare-table td { min-width: 180px; padding: var(--space-4); border-bottom: 1px solid var(--color-border); border-right: 1px solid var(--color-border); text-align: left; vertical-align: top; }
.compare-table th:last-child, .compare-table td:last-child { border-right: 0; }
.compare-table tr:last-child th, .compare-table tr:last-child td { border-bottom: 0; }
.compare-table thead th { background: var(--color-bg-subtle); color: var(--color-text-secondary); font-size: 14px; }
.compare-table tbody th { width: 180px; color: var(--color-ink); background: var(--color-bg-subtle); }
.compare-table td p { margin-bottom: var(--space-2); font-weight: 600; overflow-wrap: anywhere; }
.compare-empty { color: var(--color-muted); font-size: 14px; }
.compare-entry + .compare-entry, .history-value + .history-value { margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--color-border); }
.compare-entry .meta { font-size: 13px; font-weight: 400; }
.history-value details { margin-top: var(--space-2); font-size: 13px; }
.history-value details > div { max-width: 280px; overflow-wrap: anywhere; }
.compare-table-wrap:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.history-table-block + .history-table-block { margin-top: var(--space-8); }
.history-table-block h3 { margin-bottom: var(--space-2); font-size: var(--font-size-lg); }
.history-table__note { margin-bottom: var(--space-3); color: var(--color-muted); font-size: 13px; overflow-wrap: anywhere; }
.history-table { min-width: 620px; font-variant-numeric: tabular-nums; }
.history-table th, .history-table td { min-width: 92px; padding: var(--space-3); }
.history-table tbody th { width: 82px; }
.history-cell--empty { color: var(--color-muted); text-align: center; }
.history-scope-note { margin-bottom: var(--space-5); color: var(--color-text-secondary); font-size: 14px; }
.updates-groups { display: grid; gap: var(--space-5); }
.updates-group { border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface); }
.updates-group > summary { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); min-height: 44px; padding: var(--space-4) var(--space-5); cursor: pointer; list-style: none; }
.updates-group > summary::-webkit-details-marker { display: none; }
.updates-group > summary::after { content: ""; width: 8px; height: 8px; flex: none; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(45deg); transition: transform var(--motion-fast); }
.updates-group[open] > summary::after { transform: rotate(-135deg); }
.updates-group > summary .meta { margin-left: auto; font-variant-numeric: tabular-nums; }
.updates-group > summary .updates-group__label { color: var(--color-primary); font-weight: 600; }
.updates-group[open] > summary { border-bottom: 1px solid var(--color-border); }
.updates-group .updates-list { padding: var(--space-5); }
.updates-list { display: grid; gap: var(--space-5); }
.pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); margin-top: var(--space-6); }
.pagination__status { color: var(--color-muted); font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
.update-card { padding: var(--space-5); border: 1px solid var(--color-border); border-left: 4px solid var(--color-review); border-radius: var(--radius-card); background: var(--color-surface); }
.update-card__header { display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: start; justify-content: space-between; margin-bottom: var(--space-4); }
.update-card__header h2 { margin: 0; font-size: var(--font-size-lg); }
.update-card__header time { color: var(--color-muted); font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
.update-changes { width: 100%; margin-bottom: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-control); border-collapse: separate; border-spacing: 0; overflow: hidden; }
.update-changes th,
.update-changes td { padding: var(--space-3); border-bottom: 1px solid var(--color-border); text-align: left; vertical-align: top; font-size: 14px; overflow-wrap: anywhere; }
.update-changes thead th { background: var(--color-bg-subtle); color: var(--color-muted); font-size: 13px; font-weight: 700; }
.update-changes tbody th { width: 34%; color: var(--color-text-secondary); font-weight: 600; }
.update-changes td:nth-child(2) { color: var(--color-muted); }
.update-changes tr:last-child th,
.update-changes tr:last-child td { border-bottom: 0; }
.update-changes__empty { color: var(--color-muted); }
.editorial-container { max-width: 960px; }
.editorial-heading { max-width: var(--reading-width); }
.editorial-actions { margin-top: var(--space-6); }
.editorial-body { max-width: var(--reading-width); }
.editorial-section + .editorial-section { margin-top: var(--space-10); padding-top: var(--space-10); border-top: 1px solid var(--color-border); }
.editorial-section h2, .editorial-related h2 { font-size: var(--font-size-xl); }
.editorial-section p, .editorial-section li { color: var(--color-text-secondary); }
.editorial-section ul { padding-left: var(--space-6); }
.editorial-section li + li { margin-top: var(--space-3); }
.editorial-related { max-width: var(--reading-width); margin-top: var(--space-12); padding-top: var(--space-8); border-top: 1px solid var(--color-border); }
.editorial-related > div { display: grid; gap: var(--space-2); }
.editorial-related a { display: inline-flex; min-height: 44px; align-items: center; font-weight: 600; }
.editorial-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-6); }
.editorial-card h2 { font-size: var(--font-size-lg); }

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
  .detail-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .facts { grid-template-columns: minmax(0, 1fr); }
  .schedule-filter { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .schedule-filter__actions { grid-column: 1 / -1; }
}

@media (max-width: 767px) {
  .page-hero { padding: var(--space-5); }
  .detail-summary { padding: var(--space-4); }
  .detail-kpi { padding: var(--space-3); }
  .page-hero__meta { align-items: flex-start; flex-direction: column; }
  .home-hero { gap: var(--space-6); padding: var(--space-5); }
  .home-hero h1 { font-size: var(--font-size-2xl); }
  .home-hero__lead { font-size: var(--font-size-base); }
  .trust-panel { padding: var(--space-5); }
  .home-qualifications, .directory, .tool-grid, .detail-layout, .trust-summary { grid-template-columns: minmax(0, 1fr); }
  .home-qualification { padding: var(--space-5); border-right: 0 !important; border-bottom: 1px solid var(--color-border) !important; }
  .home-qualification:last-child { border-bottom: 0 !important; }
  .trust-summary { padding: var(--space-5) 0; }
  .qualification-search { grid-template-columns: minmax(0, 1fr); padding: var(--space-4); }
  .popular-pages ul { grid-template-columns: minmax(0, 1fr); }
  .qualification-search__actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .qualification-search__actions .button:only-child { grid-column: 1 / -1; }
  .schedule-filter, .schedule-event { grid-template-columns: minmax(0, 1fr); }
  .schedule-filter { padding: var(--space-4); }
  .schedule-filter__actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .schedule-filter__actions .button:only-child { grid-column: 1 / -1; }
  .compare-selector { padding: var(--space-4); }
  .compare-choices { grid-template-columns: minmax(0, 1fr); }
  .update-changes th,
  .update-changes td { padding: var(--space-2); font-size: 13px; }
  .editorial-section + .editorial-section { margin-top: var(--space-8); padding-top: var(--space-8); }
  .editorial-section h2, .editorial-related h2 { font-size: 24px; }
  .editorial-grid { grid-template-columns: minmax(0, 1fr); }
  .directory-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); padding: var(--space-5) 0; }
  .directory-overview__fields { grid-column: 1 / -1; }
  .detail-sidebar { position: static; grid-row: 1; }
  .detail-main { grid-row: 2; }
  .facts { grid-template-columns: minmax(0, 1fr); gap: var(--space-4); }
  .source-module { padding: var(--space-5); }
  .fact-group + .fact-group { margin-top: var(--space-10); padding-top: var(--space-8); }
  .verification-history li { grid-template-columns: minmax(0, 1fr); gap: var(--space-1); }
}

/* Public site visual hierarchy: one system for discovery, facts, and tools. */
.site-header { box-shadow: 0 1px 0 var(--color-border); }
.brand { display: inline-flex; align-items: center; gap: var(--space-3); font-size: 15px; line-height: 1.3; }
.brand__mark { width: 40px; height: 40px; flex: none; }
.brand__text { display: grid; gap: 2px; }
.brand__text small { color: var(--color-muted); font-size: var(--font-size-caption); line-height: 1.5; font-weight: 400; }
.mobile-search { display: none; }
.page-main { background: var(--color-bg); }
.eyebrow { font-weight: 700; }
.page-heading { margin-bottom: var(--space-8); }
.page-heading > p:last-child { max-width: var(--reading-width); color: var(--color-text-secondary); }
.section-heading h2 { margin-bottom: 0; }
.section-heading > a { display: inline-flex; min-height: 44px; align-items: center; gap: var(--space-2); font-size: 14px; font-weight: 700; text-decoration: none; }

.home-hero { position: relative; isolation: isolate; grid-template-columns: minmax(0, 7fr) minmax(300px, 5fr); gap: var(--space-10); min-height: 520px; overflow: hidden; padding: var(--space-12); border-color: var(--color-border); background: var(--color-surface); }
.home-hero__visual { position: absolute; z-index: -1; inset: 0; background: var(--color-surface); opacity: 1; }
.home-hero__image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center right; }
.home-hero__visual::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, var(--color-surface) 0%, rgb(255 255 255 / .94) 46%, rgb(255 255 255 / .62) 74%, rgb(255 255 255 / .34) 100%); }
.home-hero__main { position: relative; max-width: none; }
.home-hero__eyebrow { display: inline-flex; align-items: center; gap: var(--space-2); min-height: 28px; padding: 2px var(--space-3); border-radius: var(--radius-pill); background: var(--color-primary-soft); color: var(--color-primary); font-size: 13px; }
.home-hero__eyebrow .icon { width: 16px; height: 16px; }
.home-hero h1 { max-width: 650px; margin-top: var(--space-5); }
.home-hero__lead { max-width: 590px; margin-bottom: var(--space-6); }
.home-search { max-width: 630px; }
.home-search label { display: block; margin-bottom: var(--space-2); color: var(--color-text-secondary); font-size: 14px; font-weight: 700; }
.home-search__row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-2); }
.home-search .search-control input { width: 100%; height: 52px; border: 1px solid var(--color-border-control); border-radius: var(--radius-control); background: var(--color-surface); }
.home-search .button { min-height: 52px; padding-inline: var(--space-6); }
.home-intro__actions { align-items: center; margin-top: var(--space-4); }
.home-all-link { display: inline-flex; min-height: 44px; align-items: center; padding-inline: var(--space-2); font-size: 14px; font-weight: 700; text-decoration: none; }
.popular-links { margin-top: var(--space-8); padding-top: var(--space-5); border-top: 1px solid var(--color-border); }
.popular-links a { display: inline-flex; min-height: 44px; align-items: center; padding: 2px var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-pill); background: var(--color-bg-subtle); color: var(--color-text-secondary); font-size: 13px; text-decoration: none; }
.popular-links a:hover { border-color: var(--color-primary); color: var(--color-primary); }
.trust-panel { align-self: stretch; display: flex; flex-direction: column; justify-content: center; border-color: var(--color-border); background: var(--color-bg-subtle); }
.trust-panel h2 { margin-bottom: var(--space-6); font-size: 24px; line-height: 1.45; }
.trust-steps { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
.trust-steps li { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: var(--space-3); padding-block: var(--space-4); border-top: 1px solid var(--color-border); }
.trust-steps li > span { color: var(--color-primary); font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
.trust-steps strong { color: var(--color-ink); font-size: 15px; }
.trust-steps p { margin: var(--space-1) 0 0; color: var(--color-muted); font-size: 13px; line-height: 1.6; }
.home-section > .feedback { max-width: none; background: var(--color-surface); }
.home-schedule-entry { display: grid; grid-template-columns: 52px minmax(0, 1fr) auto; gap: var(--space-5); align-items: center; padding: var(--space-6); border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface); }
.home-schedule-entry__icon { display: grid; width: 52px; height: 52px; place-items: center; border-radius: var(--radius-card); background: var(--color-primary-soft); color: var(--color-primary); }
.home-schedule-entry__icon .icon { width: 24px; height: 24px; }
.home-schedule-entry h3 { margin-bottom: var(--space-1); font-size: 18px; }
.home-schedule-entry p { margin: 0; color: var(--color-muted); font-size: 14px; }
.home-timeline { margin: 0; padding: 0; list-style: none; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface); }
.home-timeline__item { position: relative; display: grid; grid-template-columns: 118px auto minmax(0, 1fr) auto; gap: var(--space-4); align-items: center; padding: var(--space-4) var(--space-6); border-bottom: 1px solid var(--color-border); }
.home-timeline__item:hover { background: var(--color-bg-subtle); }
.home-timeline__item:has(.home-timeline__link:focus-visible) { outline: 2px solid var(--color-focus); outline-offset: -2px; }
.home-timeline__link::after { content: ""; position: absolute; inset: 0; }
.home-timeline__item:last-child { border-bottom: 0; }
.home-timeline__date { color: var(--color-muted); font-size: 13px; font-variant-numeric: tabular-nums; }
.home-timeline__badge { display: inline-flex; padding: 2px var(--space-2); border-radius: 999px; background: var(--color-primary-soft); color: var(--color-primary); font-size: 13px; font-weight: 700; white-space: nowrap; }
.home-timeline__link { color: var(--color-ink); font-weight: 700; }
.home-timeline__count { color: var(--color-primary); font-size: 13px; font-weight: 700; white-space: nowrap; }
.home-section__footer { margin-top: var(--space-4); }
.home-updates { display: grid; gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
.home-updates li { position: relative; display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: var(--space-4); padding: var(--space-4) var(--space-5); border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface); }
.home-updates li:hover { border-color: var(--color-border-strong); }
.home-updates li:has(a:focus-visible) { outline: 2px solid var(--color-focus); outline-offset: 2px; }
.home-updates li a::after { content: ""; position: absolute; inset: 0; }
.home-updates__date { color: var(--color-muted); font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.home-updates a { font-weight: 700; }
.home-updates__meta { display: block; margin-top: var(--space-1); color: var(--color-muted); font-size: 13px; }
.home-qualifications { gap: var(--space-4); border: 0; }
.home-qualification { display: flex; min-height: 210px; flex-direction: column; padding: var(--space-6); border: 1px solid var(--color-border) !important; border-radius: var(--radius-card); background: var(--color-surface); }
.home-qualification__top { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-5); }
.home-qualification__field { gap: var(--space-1); }
.home-qualification__field .icon { width: 14px; height: 14px; }
.home-qualification__arrow { color: var(--color-primary); }
.home-qualification__arrow .icon { width: 20px; height: 20px; }
.home-qualification h3 { margin-bottom: var(--space-2); }
.home-qualification h3 a { color: var(--color-ink); text-decoration: none; }
.home-qualification h3 a:hover { color: var(--color-primary); }
.home-qualification p { margin-bottom: var(--space-4); }
.home-qualification__facts { display: grid; gap: var(--space-1); margin: 0 0 var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--color-border); }
.home-qualification__facts > div { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
.home-qualification__facts dt { color: var(--color-muted); font-size: 13px; }
.home-qualification__facts dd { margin: 0; color: var(--color-ink); font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; text-align: right; }
.home-qualification .text-link { margin-top: auto; font-size: 14px; text-decoration: none; }
.tool-card { display: flex; flex-direction: column; min-height: 210px; background: var(--color-surface); }
.tool-card > .icon { color: var(--color-primary); }
.tool-card h3 a { color: var(--color-ink); text-decoration: none; }
.tool-card h3 a:hover { color: var(--color-primary); }
.tool-card__link { margin-top: auto; color: var(--color-primary); font-size: 14px; font-weight: 700; text-decoration: none; }
.tool-card__link:hover { text-decoration: underline; }
.directory-overview { margin-bottom: var(--space-8); border-radius: var(--radius-card); background: var(--color-surface); padding-inline: var(--space-6); }
.directory-card { position: relative; display: flex; flex-direction: column; cursor: pointer; transition: border-color 150ms ease; }
.directory-card:hover { border-color: var(--color-primary); }
.directory-card:focus-within { border-color: var(--color-primary); }
.directory-card .card__body { display: flex; height: 100%; flex-direction: column; }
.directory-card h2 a { color: var(--color-ink); text-decoration: none; }
.directory-card h2 a:hover { color: var(--color-primary); }
.directory-card h2 a::after { content: ''; position: absolute; inset: 0; border-radius: var(--radius-card); }
.directory-card h2 a:focus-visible::after { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.directory-card__aliases { min-height: 0; }
.directory-card__facts { display: grid; gap: var(--space-1); margin: var(--space-4) 0 0; padding-top: var(--space-3); border-top: 1px solid var(--color-border); }
.directory-card__facts > div { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
.directory-card__facts dt { color: var(--color-muted); font-size: 13px; }
.directory-card__facts dd { margin: 0; color: var(--color-ink); font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; text-align: right; }
.directory-card__footer { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-top: auto; padding-top: var(--space-4); }
.directory-card .badge { align-self: flex-start; }
.directory-card__cta { color: var(--color-primary); font-size: 14px; font-weight: 700; }
.page-hero { background: var(--color-surface); }
.page-hero > p { max-width: var(--reading-width); }
.detail-hero h1 { margin-bottom: var(--space-3); }
.detail-hero__section { color: var(--color-primary); }
.detail-hero__years { display: none; }
.fact { border-color: var(--color-border); }
.schedule-event { border-left: 4px solid var(--color-primary); }
.schedule-event time { font-size: 20px; }
.schedule-event--ended { opacity: .8; border-left-color: var(--color-border); }
.compare-choice:has(input:checked) { border-color: var(--color-primary); background: var(--color-primary-soft); }
.compare-table thead th { color: var(--color-ink); }
.history-table tbody tr:nth-child(even) th, .history-table tbody tr:nth-child(even) td { background: var(--color-bg-subtle); }
.history-table tbody tr.history-row--current th, .history-table tbody tr.history-row--current td { background: var(--color-info-bg); }
.history-table tbody tr.history-row--current th { box-shadow: inset 3px 0 0 var(--color-primary); }
.update-card { border-left-color: var(--color-primary); }
.pass-rate-table-wrap { overflow-x: auto; }
.pass-rate-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.pass-rate-table th, .pass-rate-table td { padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--color-border); text-align: left; }
.pass-rate-table thead th { color: var(--color-text-secondary); font-size: 14px; font-weight: 700; white-space: nowrap; }
.pass-rate-table th:not(:first-child), .pass-rate-table td { text-align: right; }
.pass-rate-table tbody th { font-size: 15px; font-weight: 700; }
.pass-rate-table tbody tr:hover { background: var(--color-bg-subtle); }
.pass-rate-table__sort { display: inline-flex; align-items: center; gap: 4px; color: inherit; text-decoration: none; }
.pass-rate-table__sort:hover { color: var(--color-primary); text-decoration: underline; }
.pass-rate-table__dimension { display: block; margin-top: 2px; color: var(--color-muted); font-size: 13px; font-weight: 500; }
.pass-rate-table__note { margin-top: var(--space-4); color: var(--color-muted); font-size: 13px; }
.guide-card__meta { display: grid; gap: var(--space-1); margin: var(--space-4) 0; padding: 0; list-style: none; color: var(--color-text-secondary); font-size: 13px; }
.guide-card__meta li { display: flex; align-items: center; gap: var(--space-2); }
.guide-card__meta .icon { width: 16px; height: 16px; color: var(--color-muted); }
.guide-related__heading { margin-top: var(--space-6); }

@media (max-width: 1023px) {
  .home-hero { grid-template-columns: minmax(0, 1fr); min-height: 0; }
  .home-hero__visual::after { background: linear-gradient(180deg, var(--color-surface) 0%, rgb(255 255 255 / .96) 58%, rgb(255 255 255 / .88) 100%); }
  .home-hero__image { object-position: center; }
  .trust-panel { width: 100%; }
}
@media (max-width: 767px) {
  .site-header__inner { gap: 0; }
  .brand { font-size: 13px; }
  .brand__mark { width: 34px; height: 34px; }
  .brand__text small { display: none; }
  .mobile-search { display: inline-grid; width: 44px; height: 44px; align-items: center; justify-items: center; margin-left: auto; border-radius: var(--radius-control); color: var(--color-text-secondary); }
  .home-hero { gap: var(--space-5); padding: var(--space-5); }
  .home-hero__visual { display: none; }
  .home-hero h1 { font-size: 28px; }
  .home-search__row { grid-template-columns: minmax(0, 1fr); }
  .home-search .button { width: 100%; }
  .popular-links { gap: var(--space-2); }
  .popular-links > span { width: 100%; }
  .trust-panel { padding: var(--space-5); }
  .trust-panel h2 { font-size: var(--font-size-lg); }
  .home-qualification { min-height: 0; padding: var(--space-5); }
  .home-schedule-entry { grid-template-columns: 44px minmax(0, 1fr); gap: var(--space-3); padding: var(--space-5); }
  .home-schedule-entry__icon { width: 44px; height: 44px; }
  .home-schedule-entry .button { grid-column: 1 / -1; }
  .home-timeline__item { grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-2) var(--space-3); padding: var(--space-4) var(--space-5); }
  .home-timeline__link { grid-column: 1 / -1; }
  .home-updates li { grid-template-columns: minmax(0, 1fr); gap: var(--space-2); }
  .directory-overview { padding-inline: var(--space-5); }
  .detail-sidebar { grid-row: auto; }
  .detail-main { grid-row: auto; }
  .detail-hero__years { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-5); }
  .history-table { min-width: 520px; }
  .scroll-hint { display: flex; }
  .history-table th, .history-table td { min-width: 74px; padding: var(--space-2); font-size: 13px; }
  .history-table tbody th { width: 68px; }
  .detail-sidebar .sidebar-panel:first-child, .detail-sidebar .sidebar-panel:nth-child(2) { display: none; }
  .pass-rate-table-wrap { overflow: visible; }
  .pass-rate-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .pass-rate-table, .pass-rate-table tbody, .pass-rate-table tr, .pass-rate-table th, .pass-rate-table td { display: block; width: 100%; }
  .pass-rate-table tr { margin-bottom: var(--space-3); padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface); }
  .pass-rate-table tbody th { padding: 0 0 var(--space-2); border: 0; font-size: 16px; text-align: left; }
  .pass-rate-table td { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-4); padding: 3px 0; border: 0; font-size: 14px; }
  .pass-rate-table td::before { content: attr(data-label); color: var(--color-muted); font-size: 13px; font-weight: 500; }
}
.unofficial-notice { margin-top: var(--space-6); padding-top: var(--space-4); border-top: 1px solid var(--color-border); color: var(--color-text-secondary); font-size: var(--font-size-sm); line-height: 1.7; }
.footer-note--unofficial { margin-top: var(--space-3); padding-top: 0; border-top: 0; }

/* Print: keep the facts, sources, and confirmation dates; drop the chrome. */
@media print {
  @page { margin: 16mm 14mm; }
  html { scroll-behavior: auto; }
  body { padding-bottom: 0; background: #fff; color: #000; font-size: 11pt; line-height: 1.6; }
  .site-header, .subnav, .site-footer, .mobile-bottom-nav, .mobile-menu-panel, .mobile-menu-backdrop,
  .skip-link, .breadcrumbs, .detail-sidebar, .page-hero__actions, .schedule-event__actions,
  .schedule-download, .schedule-filter, .filter-chips, .qualification-search, .home-search,
  .home-intro__actions, .popular-links, .popular-pages, .pagination, .page-hero__years,
  .detail-kpi__ics, .scroll-hint, .button { display: none !important; }
  .page-main { min-height: 0; padding-block: 0; }
  .container { width: auto; max-width: none; }
  a { color: #000; text-decoration: underline; }
  .detail-layout { display: block; }
  .detail-summary, .page-hero, .card, .fact, .schedule-event, .update-card, .history-table-block,
  .source-module { break-inside: avoid; page-break-inside: avoid; }
  .compare-table-wrap { max-height: none; overflow: visible; border: 0; background: none; }
  .compare-table { width: 100%; min-width: 0; font-size: 9pt; }
  .compare-table thead th, .compare-table tbody th { position: static; }
  .compare-table th, .compare-table td { min-width: 0; padding: 4px 6px; }
  .history-table { min-width: 0; font-size: 9pt; }
  .history-table th, .history-table td { min-width: 0; padding: 4px 6px; }
  .pass-rate-table-wrap { overflow: visible !important; }
  .pass-rate-table { width: 100%; font-size: 9pt; }
  .pass-rate-table, .pass-rate-table thead, .pass-rate-table tbody, .pass-rate-table tr,
  .pass-rate-table th, .pass-rate-table td { display: revert; }
  .pass-rate-table thead { position: static; width: auto; height: auto; overflow: visible; clip-path: none; }
  .pass-rate-table th, .pass-rate-table td { padding: 4px 6px; }
  .pass-rate-table td::before { content: none; }
  table thead { display: table-header-group; }
  table tr { break-inside: avoid; page-break-inside: avoid; }
  details > summary { list-style: none; }
  details[open] > summary { margin-bottom: var(--space-2); }
}
`;
