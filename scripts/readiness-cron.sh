#!/bin/sh
# Periodic readiness probe for the public API's `/ready` endpoint.
#
# Run from the VPS root crontab every five minutes. It wraps
# scripts/check-readiness.mjs (Sprint 3D) so that the probe's verdict reaches
# syslog, but only when something changed:
#
#   ready  -> ready            silent
#   *      -> different        one line immediately (err on failure, notice on recovery)
#   same   -> same, failing    one warning per HEARTBEAT_EVERY checks (default 12 = 1h)
#
# Without that filter a two-hour outage would write 24 identical lines and a
# one-day outage 288, drowning the two moments that matter: when it broke and
# when it recovered. The state file also lets the heartbeat say how long the
# failure has lasted.
#
# The probe itself is NOT modified and is NOT wired into the compose
# healthcheck: readiness there would let a brief database blip take the whole
# site offline (db -> api(/health) -> web -> caddy). See docs/runbook.md.
#
# Sprint 3L: the probe only ever asked the api container about its own `/ready`,
# so it covered db and api but not web or caddy. A web container stuck in a
# restart loop, an expired certificate or a wrong SITE_ORIGIN all left this
# script reporting "ready" and staying silent. Set PUBLIC_READY_URL to have the
# probe also fetch a page through the public entry; leave it empty and nothing
# changes. See "公网入口检查" in docs/runbook.md for what to point it at.
#
# Always exits 0. cron's exit status only feeds an MTA, and the notification
# channel here is syslog; a non-zero exit would just produce mail nobody reads.
#
# Environment:
#   READINESS_STATE_FILE   where the last status is remembered
#                          (default: var/readiness/last-status)
#   HEARTBEAT_EVERY        checks between heartbeats while failing (default 12)
#   READINESS_TIMEOUT_MS   passed through to the probe (default 5000)
#   PUBLIC_READY_URL       also require this URL to serve a complete page
#                          (default: unset = data plane only)
#   COMPOSE_FILE           compose file used for `docker compose exec`
#                          (default: deploy/docker-compose.prod.yml)
#   COMPOSE_PROJECT        project name, if the file's directory does not imply it
#   READINESS_TAG          syslog tag (default jpqm-readiness)
#   READINESS_NOTIFY       set to 0 to keep syslog only (default 1)
#   NOTIFY_SCRIPT          notifier to call (default: notify-feishu.sh next to this file)

set -eu

TAG="${READINESS_TAG:-jpqm-readiness}"
STATE_FILE="${READINESS_STATE_FILE:-var/readiness/last-status}"
HEARTBEAT_EVERY="${HEARTBEAT_EVERY:-12}"
TIMEOUT_MS="${READINESS_TIMEOUT_MS:-5000}"
PUBLIC_URL="${PUBLIC_READY_URL:-}"
NOTIFY="${READINESS_NOTIFY:-1}"
NOTIFY_SCRIPT="${NOTIFY_SCRIPT:-$(dirname "$0")/notify-feishu.sh}"
# Compose needs the file spelled out. Without it `docker compose` walks up from
# the cwd and picks whatever compose file it finds first -- on the VPS that is
# /opt/jpqm/docker-compose.yml, an unrelated stack (project "jpqm", services
# minio/...), so `exec api` answered `service "api" is not running` and the
# probe reported "unreachable" forever. The path is relative because the
# documented install line runs from the repository root, same as
# scripts/ops-daily-cron.sh.
COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker-compose.prod.yml}"

COMPOSE_ARGS=""
if [ -n "${COMPOSE_FILE:-}" ]; then
  COMPOSE_ARGS="-f $COMPOSE_FILE"
fi
if [ -n "${COMPOSE_PROJECT:-}" ]; then
  COMPOSE_ARGS="$COMPOSE_ARGS -p $COMPOSE_PROJECT"
fi

state_dir=$(dirname "$STATE_FILE")
mkdir -p "$state_dir" 2>/dev/null || true

# Remember the previous verdict. `unknown` on the first run so that a healthy
# first check stays silent instead of reporting a recovery that never happened.
prev_status="unknown"
prev_count=0
if [ -f "$STATE_FILE" ]; then
  # Two lines: status, then the number of consecutive non-ready checks.
  prev_status=$(sed -n '1p' "$STATE_FILE" 2>/dev/null || echo unknown)
  prev_count=$(sed -n '2p' "$STATE_FILE" 2>/dev/null || echo 0)
  [ -n "$prev_status" ] || prev_status="unknown"
  case "$prev_count" in
    '' | *[!0-9]*) prev_count=0 ;;
  esac
fi

# Ask the container. `-T` is required: cron has no TTY.
#
# The public URL goes in as an environment variable rather than a flag because
# the value comes from the deployment's own env file; passing it as an argument
# would put the hostname in `ps` output on a shared box for no benefit.
probe_args="--timeout=$TIMEOUT_MS --json"
if [ -n "$PUBLIC_URL" ]; then
  probe_env="PUBLIC_READY_URL=$PUBLIC_URL"
else
  probe_env=""
fi

# shellcheck disable=SC2086
probe_output=$(
  if [ -n "$probe_env" ]; then
    docker compose $COMPOSE_ARGS exec -T -e "$probe_env" api \
      node scripts/check-readiness.mjs $probe_args 2>&1
  else
    docker compose $COMPOSE_ARGS exec -T api \
      node scripts/check-readiness.mjs $probe_args 2>&1
  fi
) && probe_ran=1 || probe_ran=0

# The probe exits 1 for every non-ready state, so a non-zero status alone does
# not mean it failed to run. Distinguish "probe ran and reported a problem"
# from "we could not even start it" by whether we got parseable JSON back.
#
# Read the FIRST occurrence of each key, not "whatever a greedy pattern lands
# on". Since Sprint 3L the report carries a nested `dataPlane.status` that can
# say `ready` while the top-level verdict says `unexpected` — a greedy match
# takes the last one on the line, which would report the public entry as
# healthy precisely when it is not. `grep -o` yields occurrences in document
# order, so the top-level key wins whether the probe pretty-prints (it does)
# or ever emits compact JSON.
status=$(
  printf '%s\n' "$probe_output" |
    grep -o '"status": *"[a-z_]*"' |
    head -n 1 |
    sed 's/.*"\([a-z_]*\)"$/\1/'
)
# `[^"]*` rather than `.*`: POSIX sed has no lazy quantifier, and a greedy
# capture would swallow the rest of the JSON into the syslog line.
message=$(
  printf '%s\n' "$probe_output" |
    grep -o '"message": *"[^"]*"' |
    head -n 1 |
    sed 's/^"message": *"//; s/"$//'
)
# `reason` and `code` are what make a public-entry failure actionable. A failed
# fetch reports `message=fetch failed` no matter why it failed; the difference
# between an expired certificate, a DNS mistake and a hung web container lives
# only in these two fields. They are absent on data-plane reports, so the extra
# detail disappears on its own when the public check is off.
reason=$(
  printf '%s\n' "$probe_output" |
    grep -o '"reason": *"[a-z_]*"' |
    head -n 1 |
    sed 's/.*"\([a-z_]*\)"$/\1/'
)
code=$(
  printf '%s\n' "$probe_output" |
    grep -o '"code": *"[^"]*"' |
    head -n 1 |
    sed 's/^"code": *"//; s/"$//'
)

if [ -z "$status" ]; then
  # No verdict at all: the container is down, compose failed, or node is
  # missing. That is itself a finding, and a different one from "the data
  # plane is unreachable".
  status="unreachable"
  message="probe did not run: $(printf '%s' "$probe_output" | tr '\n' ' ' | cut -c1-200)"
fi

if [ "$status" = "ready" ]; then
  count=0
else
  count=$((prev_count + 1))
fi

emit() {
  # emit <priority> <text>
  logger -t "$TAG" -p "daemon.$1" -- "$2" 2>/dev/null || true
  # Second channel: syslog only reaches somebody who reads journald. The call is
  # wrapped so a notification failure cannot change this run's verdict, its exit
  # status, or the state file written below.
  if [ "$NOTIFY" != "0" ]; then
    sh "$NOTIFY_SCRIPT" --text "[$TAG] $2" >/dev/null 2>&1 || true
  fi
}

detail="status=$status"
if [ -n "$message" ]; then
  detail="$detail message=$message"
fi
if [ -n "$reason" ]; then
  detail="$detail reason=$reason"
fi
if [ -n "$code" ]; then
  detail="$detail code=$code"
fi

if [ "$status" = "$prev_status" ]; then
  if [ "$status" != "ready" ]; then
    if [ "$HEARTBEAT_EVERY" -gt 0 ] 2>/dev/null &&
      [ $((count % HEARTBEAT_EVERY)) -eq 0 ]; then
      emit warning "still $detail for $count checks"
    fi
  fi
  # Steady state, healthy or still failing between heartbeats: stay quiet.
elif [ "$status" = "ready" ]; then
  if [ "$prev_status" = "unknown" ]; then
    : # First observation is healthy; nothing to announce.
  else
    emit notice "recovered: status=ready after $prev_count checks"
  fi
else
  emit err "$detail"
fi

printf '%s\n%s\n' "$status" "$count" >"$STATE_FILE" 2>/dev/null || true

exit 0
