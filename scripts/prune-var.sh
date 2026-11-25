#!/bin/sh
# Prune the operational artefacts under var/ that grow without bound.
#
# This script is a WHITELIST, not a sweep. `find var -mtime +90 -delete` would
# take var/pg-run (the local postgres data directory), var/pglite-run,
# var/chrome-shot-profile and every evidence directory with it on the first
# run — silently. So only three things are ever touched, each with the policy
# that fits how it actually grows:
#
#   var/ops-reports/YYYY-MM-DD.{json,md}  one pair per day  -> delete by age
#   var/notifications/feishu.log          one line per post -> truncate by lines
#   var/test-*/                           test leftovers   -> delete by age
#
# The delivery log is truncated rather than deleted because its mtime is the
# time of the last delivery, not the age of the content: deleting it on mtime
# would throw away the only history of whether alerts were getting through.
# ops-reports/cron.err is never touched — it holds the stderr of the most recent
# failed run, which may be the only clue someone has.
#
# Dry-run is the default; pass --apply (or PRUNE_APPLY=1) to actually delete.
#
# Environment:
#   VAR_DIR                      root directory        (default var)
#   OPS_REPORT_RETENTION_DAYS    report retention      (default 90)
#   TEST_DIR_RETENTION_DAYS      test leftover days    (default 7)
#   NOTIFICATION_LOG_MAX_LINES   delivery lines kept   (default 500)
#   PRUNE_APPLY                  set to 1 to delete    (default 0)

set -eu

VAR_DIR="${VAR_DIR:-var}"
REPORT_DAYS="${OPS_REPORT_RETENTION_DAYS:-90}"
TEST_DAYS="${TEST_DIR_RETENTION_DAYS:-7}"
NOTIFY_LINES="${NOTIFICATION_LOG_MAX_LINES:-500}"
APPLY="${PRUNE_APPLY:-0}"

mode=dry-run
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --dry-run) APPLY=0 ;;
    -h | --help)
      cat <<'EOF'
usage: prune-var.sh [--apply|--dry-run]

Prunes var/ops-reports/YYYY-MM-DD.{json,md}, truncates
var/notifications/feishu.log, and removes stale var/test-*/ directories.

Dry-run by default. Nothing outside that whitelist is ever touched.
EOF
      exit 0
      ;;
    *)
      echo "prune-var: unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

[ "$APPLY" = "1" ] && mode=apply

# A missing var/ is normal on a fresh machine or a first deploy: nothing to do
# is not an error. Note this tests existence, not directory-ness — a var/ that
# exists but is a file is a misconfiguration worth saying out loud.
if [ ! -e "$VAR_DIR" ]; then
  echo "prune-var: $VAR_DIR does not exist, nothing to do"
  exit 0
fi

if [ ! -d "$VAR_DIR" ] || [ -L "$VAR_DIR" ]; then
  echo "prune-var: $VAR_DIR is not a plain directory, refusing to touch it" >&2
  exit 0
fi

removed=0
truncated=0

# --- 1. daily reports: date-named files older than the retention window -------
#
# The name pattern is part of the safety: anything a person dropped into the
# directory by hand (cron.err, a saved copy) does not match and is left alone.
REPORT_DIR="$VAR_DIR/ops-reports"
if [ -d "$REPORT_DIR" ]; then
  for file in "$REPORT_DIR"/????-??-??.json "$REPORT_DIR"/????-??-??.md; do
    [ -f "$file" ] || continue
    # -mtime +N means "modified more than N*24h ago", which is what we want.
    if [ -n "$(find "$file" -maxdepth 0 -mtime "+$REPORT_DAYS" 2>/dev/null)" ]; then
      if [ "$APPLY" = "1" ]; then
        rm -f "$file" && {
          echo "removed $file"
          removed=$((removed + 1))
        }
      else
        echo "would remove $file"
        removed=$((removed + 1))
      fi
    fi
  done
fi

# --- 2. delivery log: keep the last N lines -----------------------------------
NOTIFY_LOG="$VAR_DIR/notifications/feishu.log"
if [ -f "$NOTIFY_LOG" ] && [ ! -L "$NOTIFY_LOG" ]; then
  lines=$(wc -l <"$NOTIFY_LOG" | tr -d ' ')
  # wc -l undercounts a file whose last line has no newline; that off-by-one is
  # irrelevant for a retention threshold, and rounding down never keeps too much.
  if [ "$lines" -gt "$NOTIFY_LINES" ]; then
    if [ "$APPLY" = "1" ]; then
      # Write to a sibling and move it into place: a half-written log is worse
      # than a stale one, and the notifier appends concurrently.
      tmp="$NOTIFY_LOG.prune.$$"
      if tail -n "$NOTIFY_LINES" "$NOTIFY_LOG" >"$tmp" 2>/dev/null; then
        mv "$tmp" "$NOTIFY_LOG" && {
          echo "truncated $NOTIFY_LOG ($lines -> $NOTIFY_LINES lines)"
          truncated=$((truncated + 1))
        }
      else
        rm -f "$tmp"
      fi
    else
      echo "would truncate $NOTIFY_LOG ($lines -> $NOTIFY_LINES lines)"
      truncated=$((truncated + 1))
    fi
  fi
fi

# --- 3. test leftovers: var/test-* directories older than a week ---------------
#
# These only exist when a test run died before its afterEach could clean up.
# The name must start with `test-`, the entry must be a real directory (not a
# symlink), and it must live directly under var/ — three independent checks
# before any rm -rf.
for dir in "$VAR_DIR"/test-*; do
  [ -d "$dir" ] || continue
  [ -L "$dir" ] && continue
  case "$(basename "$dir")" in
    test-*) : ;;
    *) continue ;;
  esac
  if [ -n "$(find "$dir" -maxdepth 0 -mtime "+$TEST_DAYS" 2>/dev/null)" ]; then
    if [ "$APPLY" = "1" ]; then
      rm -rf "$dir" && {
        echo "removed $dir"
        removed=$((removed + 1))
      }
    else
      echo "would remove $dir"
      removed=$((removed + 1))
    fi
  fi
done

if [ "$removed" -eq 0 ] && [ "$truncated" -eq 0 ]; then
  echo "prune-var: nothing to do ($mode)"
else
  echo "prune-var: $removed to remove, $truncated to truncate ($mode)"
fi

exit 0
