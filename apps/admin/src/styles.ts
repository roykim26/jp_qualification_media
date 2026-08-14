export const adminStyles = String.raw`
.admin-shell { width: min(100% - 64px, var(--container)); margin-inline: auto; padding-block: var(--space-8) var(--space-16); }
.admin-header { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-8); }
.admin-header p { max-width: var(--reading-width); color: var(--color-muted); }
.admin-list { display: grid; gap: var(--space-5); }
.review-card { padding: var(--space-6); }
.review-card h2 { font-size: 21px; }
.review-meta { display: flex; flex-wrap: wrap; gap: var(--space-3) var(--space-6); color: var(--color-text-secondary); }
.review-evidence { margin: var(--space-5) 0; padding: var(--space-4); border-left: 4px solid var(--color-info); background: var(--color-info-bg); }
.review-source { overflow-wrap: anywhere; }
.review-actions { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-4); }
.review-actions button { min-height: 44px; padding: var(--space-2) var(--space-5); border: 1px solid transparent; border-radius: var(--radius-control); font-weight: 600; cursor: pointer; }
.review-actions [data-decision="approve"] { color: var(--color-surface); background: var(--color-success); }
.review-actions [data-decision="reject"] { color: var(--color-surface); background: var(--color-danger); }
.review-actions [data-decision="defer"] { color: var(--color-text-secondary); border-color: var(--color-border-strong); background: var(--color-surface); }
.review-actions button:hover { filter: brightness(.92); }
.review-actions button:active { transform: translateY(1px); }
.review-actions button:disabled { cursor: wait; opacity: .68; transform: none; }
.review-card output { display: block; min-height: 28px; margin-top: var(--space-3); color: var(--color-text-secondary); }
.review-card[data-completed="true"] { border-color: var(--color-success); background: var(--color-success-bg); }
.field__error:empty { display: none; }

@media (max-width: 767px) {
  .admin-shell { width: calc(100% - 32px); padding-block: var(--space-6) var(--space-10); }
  .review-card { padding: var(--space-5); }
}
`;
