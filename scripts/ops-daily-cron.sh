#!/bin/sh
# Run the read-only daily operations report from cron and speak only when a
# person has to act.
#
# `pnpm ops:daily` is a developer command: it needs node and it writes to a
# relative `var/` path. The VPS has neither node on the host nor a `var/`
# directory that survives a container rebuild, so this wrapper runs the report
# in a throwaway container with the host's `var/` bind-mounted over /app/var:
#
#   - the report is archived on the host in var/ops-reports/ instead of dying
#     with the container layer,
#   - var/notifications/feishu.log (written by the host-side notifier) and
#     var/patrol/registry.json become visible, which is what the report needs
#     to judge the alert channel and the patrol coverage.
#
# `run --rm -T` rather than `exec`: the report must still work when the api
# service is down, and cron has no TTY.
#
# Silence is the default, as in readiness-cron.sh. A healthy report is written
# to var/ops-reports/<date>.md and nobody is told; only a report that needs
# action reaches syslog and Feishu.
#
# Always exits 0: cron's exit status only feeds an MTA nobody reads, and the
# notification channel here is syslog plus Feishu.
#
# Environment:
#   COMPOSE_FILE      compose file        (default deploy/docker-compose.prod.yml)
#   COMPOSE_PROJECT   project name, if the file's directory does not imply it
#   OPS_VAR_DIR       host var directory  (default var)
#   OPS_REPORT_DIR    where reports land  (default $OPS_VAR_DIR/ops-reports)
#   OPS_TODAY         date stamp override (default: today in Asia/Tokyo)
#   OPS_TAG           syslog tag          (default jpqm-ops)
#   OPS_NOTIFY        set to 0 to keep syslog only (default 1)
#   NOTIFY_SCRIPT     notifier to call    (default: notify-feishu.sh next to this file)
#   OPS_MAX_ACTIONS   action lines carried into the message (default 10)

set -eu

TAG="${OPS_TAG:-jpqm-ops}"
VAR_DIR="${OPS_VAR_DIR:-var}"
REPORT_DIR="${OPS_REPORT_DIR:-$VAR_DIR/ops-reports}"
NOTIFY="${OPS_NOTIFY:-1}"
NOTIFY_SCRIPT="${NOTIFY_SCRIPT:-$(dirname "$0")/notify-feishu.sh}"
MAX_ACTIONS="${OPS_MAX_ACTIONS:-10}"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker-compose.prod.yml}"

mkdir -p "$REPORT_DIR" 2>/dev/null || true
ERR_FILE="$REPORT_DIR/cron.err"

# Today in JST, the timezone the report itself files under. Overridable so the
# tests can point at a fixture report without depending on the wall clock.
if [ -n "${OPS_TODAY:-}" ]; then
  TODAY="$OPS_TODAY"
else
  TODAY=$(TZ=Asia/Tokyo date +%F)
fi
REPORT_MD="$REPORT_DIR/$TODAY.md"

compose_args="-f $COMPOSE_FILE"
if [ -n "${COMPOSE_PROJECT:-}" ]; then
  compose_args="$compose_args -p $COMPOSE_PROJECT"
fi

# A relative OPS_VAR_DIR must be made absolute before it goes to -v: docker
# interprets a relative source as a *named volume*, not a path, and the report
# would silently land in a volume nobody looks at.
case "$VAR_DIR" in
  /*) VAR_ABS="$VAR_DIR" ;;
  *) VAR_ABS="$(pwd)/$VAR_DIR" ;;
esac

# shellcheck disable=SC2086
report_output=$(
  docker compose $compose_args run --rm -T \
    -v "$VAR_ABS:/app/var" \
    api node scripts/ops-daily-report.mjs 2>"$ERR_FILE"
) && report_ran=1 || report_ran=0

# The report exits 1 both for "critical findings" and for "the report itself
# broke", so the exit status alone says nothing. A usable run is one whose
# stdout parses as a report with status ok.
status=$(printf '%s\n' "$report_output" | sed -n 's/.*"status": *"\([a-z_]*\)".*/\1/p' | head -n 1)
has_critical=$(printf '%s\n' "$report_output" | sed -n 's/.*"hasCritical": *\(true\|false\).*/\1/p' | head -n 1)

emit() {
  # emit <priority> <text>
  logger -t "$TAG" -p "daemon.$1" -- "$2" 2>/dev/null || true
  if [ "$NOTIFY" != "0" ]; then
    sh "$NOTIFY_SCRIPT" --text "[$TAG] $2" >/dev/null 2>&1 || true
  fi
}

# The action list lives in the markdown report, not in the JSON: the markdown is
# the thing a person reads, and rendering it a second time here would drift.
# Markdown emphasis is stripped because the message goes to syslog and to a
# plain-text Feishu message, where `**` and backticks show up as literal noise.
action_lines() {
  [ -f "$REPORT_MD" ] || return 0
  # Print the bullets between "## 今日需处理" and the next "## " heading.
  sed -n '/^## 今日需处理/,/^## /p' "$REPORT_MD" |
    grep '^- ' 2>/dev/null |
    head -n "$MAX_ACTIONS" |
    sed -e 's/^- //' -e 's/\*\*//g' -e 's/`//g' || true
}

if [ "$report_ran" = "0" ] && [ -z "$status" ]; then
  detail="report did not run: $(printf '%s' "$report_output" | tr '\n' ' ' | cut -c1-200)"
  emit err "$detail"
elif [ "$status" != "ok" ]; then
  detail="report status=$status"
  if [ -s "$ERR_FILE" ]; then
    detail="$detail stderr=$(tail -n 3 "$ERR_FILE" | tr '\n' ' ' | cut -c1-300)"
  fi
  emit err "$detail"
elif [ "$has_critical" = "true" ]; then
  actions=$(action_lines)
  if [ -z "$actions" ]; then
    detail="daily report has critical findings, but $REPORT_MD lists no actions"
  else
    detail=$(printf '%s' "$actions" | tr '\n' ';' | cut -c1-1200)
  fi
  emit err "$detail"
else
  : # Healthy: the archived report is the whole point, nobody needs telling.
fi

exit 0
