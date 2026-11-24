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
# Always exits 0. cron's exit status only feeds an MTA, and the notification
# channel here is syslog; a non-zero exit would just produce mail nobody reads.
#
# Environment:
#   READINESS_STATE_FILE   where the last status is remembered
#                          (default: var/readiness/last-status)
#   HEARTBEAT_EVERY        checks between heartbeats while failing (default 12)
#   READINESS_TIMEOUT_MS   passed through to the probe (default 5000)
#   COMPOSE_FILE           compose file used for `docker compose exec`
#   COMPOSE_PROJECT        project name, if the file's directory does not imply it
#   READINESS_TAG          syslog tag (default jpqm-readiness)

set -eu

TAG="${READINESS_TAG:-jpqm-readiness}"
STATE_FILE="${READINESS_STATE_FILE:-var/readiness/last-status}"
HEARTBEAT_EVERY="${HEARTBEAT_EVERY:-12}"
TIMEOUT_MS="${READINESS_TIMEOUT_MS:-5000}"

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
# shellcheck disable=SC2086
probe_output=$(
  docker compose $COMPOSE_ARGS exec -T api \
    node scripts/check-readiness.mjs --timeout="$TIMEOUT_MS" --json 2>&1
) && probe_ran=1 || probe_ran=0

# The probe exits 1 for every non-ready state, so a non-zero status alone does
# not mean it failed to run. Distinguish "probe ran and reported a problem"
# from "we could not even start it" by whether we got parseable JSON back.
status=$(printf '%s\n' "$probe_output" | sed -n 's/.*"status": *"\([a-z]*\)".*/\1/p' | head -n 1)
# `[^"]*` rather than `.*`: POSIX sed has no lazy quantifier, and a greedy
# capture would swallow the rest of the JSON into the syslog line.
message=$(printf '%s\n' "$probe_output" | sed -n 's/.*"message": *"\([^"]*\)".*/\1/p' | head -n 1)

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
}

detail="status=$status"
if [ -n "$message" ]; then
  detail="$detail message=$message"
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
