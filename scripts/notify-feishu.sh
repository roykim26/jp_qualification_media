#!/bin/sh
# Send one message to a Feishu (Lark) custom-bot webhook.
#
# Sprint 3E made the readiness probe write to syslog, but syslog only helps
# somebody who reads journald. This script is the second channel: it turns the
# same line into a Feishu message so the alert lands in front of a person.
#
# Usage:
#   sh scripts/notify-feishu.sh --text "..."     # send the given text
#   sh scripts/notify-feishu.sh --stdin          # send what stdin holds
#   sh scripts/notify-feishu.sh --test           # send a fixed self-check line
#
# Exits 0 when Feishu accepted the message, 1 otherwise. The cron wrapper calls
# this with `|| true`: a notification failure must never change what the probe
# concluded or what it wrote to syslog.
#
# Credentials are read from the environment first, then from deploy/.env (which
# .gitignore already excludes). The file is parsed with grep+cut and never
# sourced: it is a compose interpolation file, so `source` would re-expand
# values that contain spaces or dollar signs.
#
# Environment:
#   FEISHU_WEBHOOK       full webhook URL            (required)
#   FEISHU_SIGN_SECRET   signing secret              (optional; enables signing)
#   FEISHU_ENV_FILE      file to fall back to        (default deploy/.env)
#   FEISHU_TIMEOUT       curl --max-time in seconds  (default 10)
#   FEISHU_RETRY_DELAY   seconds between retries     (default 1)

set -eu

TAG="notify-feishu"
MAX_ATTEMPTS=3

ENV_FILE="${FEISHU_ENV_FILE:-deploy/.env}"
TIMEOUT="${FEISHU_TIMEOUT:-10}"
RETRY_DELAY="${FEISHU_RETRY_DELAY:-1}"

usage() {
  cat <<'USAGE'
usage: sh scripts/notify-feishu.sh --text <message>
       sh scripts/notify-feishu.sh --stdin
       sh scripts/notify-feishu.sh --test

Sends one message to the Feishu custom-bot webhook named by FEISHU_WEBHOOK.
When that variable is unset the value is read from deploy/.env instead.

Environment:
  FEISHU_WEBHOOK       webhook URL                  (required)
  FEISHU_SIGN_SECRET   signing secret               (optional)
  FEISHU_ENV_FILE      fallback file                (default deploy/.env)
  FEISHU_TIMEOUT       curl --max-time in seconds   (default 10)
  FEISHU_RETRY_DELAY   seconds between retries      (default 1)

Exits 0 when Feishu accepted the message, 1 otherwise.
USAGE
}

die() {
  printf '%s: %s\n' "$TAG" "$1" >&2
  exit 1
}

# read_env_value <key>
# Echoes the value, or nothing when the file or the key is absent.
# `cut -d= -f2-` keeps the trailing dashes: webhook tokens and secrets are
# base64-ish and may end in `=` padding, which `-f2` would silently drop.
read_env_value() {
  [ -f "$ENV_FILE" ] || return 0
  grep "^$1=" "$ENV_FILE" 2>/dev/null | tail -n 1 | cut -d= -f2- || true
}

# json_escape <text>
# Escapes backslash, double quote and newline so the payload stays valid JSON.
# Alert text carries upstream error messages, which may contain any of the three.
# One awk pass rather than sed's `:a;N;$!ba` idiom: that idiom prints nothing at
# all for single-line input, which would drop most messages.
json_escape() {
  printf '%s' "$1" | awk 'BEGIN { ORS = "" } {
    gsub(/\\/, "\\\\")
    gsub(/"/, "\\\"")
    if (NR > 1) printf "\\n"
    printf "%s", $0
  }'
}

# sign_payload <timestamp> <secret>
# Feishu's documented scheme, which is not the obvious one:
#   key  = "<timestamp>\n<secret>"   (newline-separated, not concatenated)
#   data = ""                        (the empty string, not the request body)
#   sign = base64(hmac_sha256(key, data))
sign_payload() {
  printf '' |
    openssl dgst -sha256 -hmac "$(printf '%s\n%s' "$1" "$2")" -binary |
    base64 | tr -d '\n'
}

build_payload() {
  # build_payload <text> <secret>
  escaped=$(json_escape "$1")
  if [ -n "$2" ]; then
    ts=$(date +%s)
    sign=$(sign_payload "$ts" "$2")
    printf '{"timestamp":"%s","sign":"%s","msg_type":"text","content":{"text":"%s"}}' \
      "$ts" "$sign" "$escaped"
  else
    printf '{"msg_type":"text","content":{"text":"%s"}}' "$escaped"
  fi
}

# Feishu answers HTTP 200 for rate limits and bad signatures too, so the status
# line alone is not a verdict. Only `"code":0` means accepted.
body_has_code() {
  # body_has_code <file> <code>
  [ -f "$1" ] || return 1
  grep -Eq "\"code\"[[:space:]]*:[[:space:]]*$2([^0-9]|$)" "$1"
}

mode=''
message=''

while [ $# -gt 0 ]; do
  case "$1" in
    --text)
      [ $# -ge 2 ] || die "--text requires a value"
      message="$2"
      shift 2
      ;;
    --stdin)
      mode='stdin'
      shift
      ;;
    --test)
      mode='test'
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      die "unknown argument: $1"
      ;;
  esac
done

case "$mode" in
  stdin)
    message=$(cat)
    ;;
  test)
    message="jpqm readiness self-check: this is a test message from notify-feishu.sh at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    ;;
esac

[ -n "$message" ] || {
  usage >&2
  die "no message given"
}

WEBHOOK="${FEISHU_WEBHOOK:-}"
SECRET="${FEISHU_SIGN_SECRET:-}"
[ -n "$WEBHOOK" ] || WEBHOOK=$(read_env_value FEISHU_WEBHOOK)
[ -n "$SECRET" ] || SECRET=$(read_env_value FEISHU_SIGN_SECRET)

[ -n "$WEBHOOK" ] || die "FEISHU_WEBHOOK is not configured (set it in $ENV_FILE)"

if [ -n "$SECRET" ]; then
  command -v openssl >/dev/null 2>&1 || die "openssl is required for signing but was not found"
fi

tmp_dir=$(mktemp -d 2>/dev/null || mktemp -d -t notify-feishu)
trap 'rm -rf "$tmp_dir"' EXIT INT TERM

payload_file="$tmp_dir/payload.json"
body_file="$tmp_dir/body.txt"
err_file="$tmp_dir/curl.err"

build_payload "$message" "$SECRET" >"$payload_file"

attempt=1
attempts_made=0
last_note=''

while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  : >"$body_file"
  : >"$err_file"

  http_code=''
  curl_rc=0
  attempts_made=$((attempts_made + 1))
  http_code=$(
    curl -sS --max-time "$TIMEOUT" \
      -H 'Content-Type: application/json' \
      -X POST --data-binary "@$payload_file" \
      -o "$body_file" -w '%{http_code}' \
      "$WEBHOOK" 2>"$err_file"
  ) || curl_rc=$?

  transient=0
  case "$curl_rc" in
    6 | 7 | 28) transient=1 ;; # could not resolve / connect / timed out
  esac

  if [ "$curl_rc" -eq 0 ]; then
    case "$http_code" in
      2[0-9][0-9])
        if body_has_code "$body_file" 0; then
          exit 0
        fi
        if body_has_code "$body_file" 9499; then
          transient=1 # Feishu's rate-limit code, still HTTP 200
        fi
        ;;
      429)
        transient=1
        ;;
      5[0-9][0-9])
        transient=1
        ;;
    esac
  fi

  last_note="http=$http_code curl=$curl_rc"

  if [ "$transient" -eq 0 ]; then
    # A bad signature or a revoked token fails the same way every time;
    # retrying only delays the report.
    break
  fi

  if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
    sleep "$RETRY_DELAY" 2>/dev/null || true
  fi

  attempt=$((attempt + 1))
done

# Never print the webhook or the secret: this line may end up in syslog.
printf '%s: delivery failed (%s) after %s attempt(s)\n' \
  "$TAG" "$last_note" "$attempts_made" >&2
exit 1
