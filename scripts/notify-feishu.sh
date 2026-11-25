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
#   FEISHU_DELIVERY_LOG  append-only JSON record of every attempt
#                        (default var/notifications/feishu.log)

set -eu

TAG="notify-feishu"
MAX_ATTEMPTS=3

ENV_FILE="${FEISHU_ENV_FILE:-deploy/.env}"
TIMEOUT="${FEISHU_TIMEOUT:-10}"
RETRY_DELAY="${FEISHU_RETRY_DELAY:-1}"
DELIVERY_LOG="${FEISHU_DELIVERY_LOG:-var/notifications/feishu.log}"

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
  FEISHU_DELIVERY_LOG  attempt log                  (default var/notifications/feishu.log)

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

# absolute_path <path>
# Resolves a relative path against the current directory without requiring the
# file to exist. Sprint 3F spent one of four debugging rounds establishing that
# `deploy/.env` was not being read from where the caller assumed, so the error
# text now shows the path that was actually used.
absolute_path() {
  case "$1" in
    /*) printf '%s' "$1" ;;
    *) printf '%s/%s' "$(pwd)" "$1" ;;
  esac
}

# file_facts <path>
# "816 bytes, mtime 2026-11-15T12:38:00" or "absent". A file that exists but was
# never written after an edit is the exact failure mode of Sprint 3F: the editor
# showed the new line, the disk still had the old file.
file_facts() {
  if [ ! -e "$1" ]; then
    printf 'absent'
    return 0
  fi
  bytes=$(wc -c <"$1" 2>/dev/null | tr -d ' \n' || true)
  mtime=$(stat -c '%y' "$1" 2>/dev/null | cut -d. -f1 | tr ' ' 'T' || true)
  printf '%s bytes, mtime %s' "${bytes:-?}" "${mtime:-unknown}"
}

# describe_value <value>
# The shape of a credential, never the credential: `len=81 scheme=https
# host=open.feishu.cn quoted=no`. Every character past the host is a token, so
# nothing past the host is printed. These lines end up in syslog and cron mail.
describe_value() {
  len=$(printf '%s' "$1" | wc -c | tr -d ' \n')
  quoted=no
  case "$1" in
    \"*\" | \'*\') quoted=yes ;;
  esac
  case "$1" in
    https://*) scheme=https ;;
    http://*) scheme=http ;;
    *) scheme=none ;;
  esac
  host=''
  if [ "$scheme" != 'none' ]; then
    host=$(printf '%s' "$1" | sed -n 's|^[a-z]*://\([^/:]*\).*|\1|p')
  fi
  printf 'len=%s scheme=%s host=%s quoted=%s' \
    "$len" "$scheme" "${host:-none}" "$quoted"
}

# die_credential <key> <reason> <hint> [shape]
# One sentence was not enough to tell four different faults apart, so each one
# now carries a stable reason token plus the file it looked at.
die_credential() {
  abs=$(absolute_path "$ENV_FILE")
  {
    printf '%s: %s is not usable (reason=%s)\n' "$TAG" "$1" "$2"
    printf '  file: %s (%s)\n' "$abs" "$(file_facts "$abs")"
    if [ -n "${4:-}" ]; then
      printf '  value: %s\n' "$4"
    fi
    printf '  hint: %s\n' "$3"
  } >&2
  exit 1
}

# quote_hint <value>
# `.env` is not a shell script: quotes around a value are kept as part of it, so
# `FEISHU_WEBHOOK="https://..."` produces a value that is not a URL. This is the
# single most common paste mistake, so it gets its own sentence.
quote_hint() {
  case "$1" in
    \"*\" | \'*\')
      printf 'the value is wrapped in quotes; remove them — .env is not a shell script and keeps the quotes as part of the value'
      ;;
    *)
      printf '%s' "$2"
      ;;
  esac
}

# resolve_webhook
# Echoes the validated webhook URL, or exits with a reason token.
#
# A CR is stripped rather than rejected: a webhook token cannot contain one, so
# there is exactly one correct interpretation, and failing would just make the
# caller edit the file again. Stripping is announced because a silent repair of
# a file the caller believes is fine is its own kind of trap.
resolve_webhook() {
  raw="${FEISHU_WEBHOOK:-}"
  if [ -z "$raw" ]; then
    abs=$(absolute_path "$ENV_FILE")
    if [ ! -f "$abs" ]; then
      die_credential FEISHU_WEBHOOK env-file-missing \
        "create it, or point FEISHU_ENV_FILE at the file that has the key"
    fi
    if ! grep -q '^FEISHU_WEBHOOK=' "$abs" 2>/dev/null; then
      die_credential FEISHU_WEBHOOK key-absent \
        "the file exists but has no FEISHU_WEBHOOK= line; append it: printf 'FEISHU_WEBHOOK=%s\\n' '<webhook url>' >> $abs"
    fi
    raw=$(read_env_value FEISHU_WEBHOOK)
  fi

  value=$(printf '%s' "$raw" | tr -d '\r')
  if [ "$value" != "$raw" ]; then
    printf '%s: stripped a trailing CR from FEISHU_WEBHOOK (Windows line ending)\n' "$TAG" >&2
  fi

  if [ -z "$value" ]; then
    die_credential FEISHU_WEBHOOK value-empty \
      "the key is present but its value is empty; put the full webhook URL after the ="
  fi
  case "$value" in
    *[[:space:]]*)
      die_credential FEISHU_WEBHOOK value-has-space \
        "$(quote_hint "$value" 'the value contains a space or tab; paste only the URL')" \
        "$(describe_value "$value")"
      ;;
  esac
  case "$value" in
    http://* | https://*) : ;;
    *)
      die_credential FEISHU_WEBHOOK value-not-url \
        "$(quote_hint "$value" 'the value does not start with http:// or https://; it may still be the placeholder text')" \
        "$(describe_value "$value")"
      ;;
  esac

  printf '%s' "$value"
}

# record_delivery <ok:true|false> <http|-> <curl> <attempts> <reason|->
# Append-only evidence for ops:daily, which must not make network requests of
# its own: the channel's health has to be readable from a local file.
# Failure to record is ignored — not being able to log must never be the reason
# an alert does not go out.
record_delivery() {
  # `000` is what curl reports when no response was read at all; it is not a
  # status code and `000` is not even valid JSON, so it becomes null.
  http_json='null'
  case "$2" in
    '' | 000 | -* | *[!0-9]*) : ;;
    *) http_json="$2" ;;
  esac
  if [ "$5" = '-' ]; then
    reason_json='null'
  else
    reason_json="\"$5\""
  fi
  dir=$(dirname "$DELIVERY_LOG")
  mkdir -p "$dir" 2>/dev/null || true
  printf '{"at":"%s","ok":%s,"http":%s,"curl":%s,"attempts":%s,"reason":%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$http_json" "$3" "$4" "$reason_json" \
    >>"$DELIVERY_LOG" 2>/dev/null || true
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

WEBHOOK=$(resolve_webhook) || exit 1
SECRET="${FEISHU_SIGN_SECRET:-}"
[ -n "$SECRET" ] || SECRET=$(read_env_value FEISHU_SIGN_SECRET)
SECRET=$(printf '%s' "$SECRET" | tr -d '\r')

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
          record_delivery true "$http_code" "$curl_rc" "$attempts_made" '-'
          printf '%s: delivered (http=%s) after %s attempt(s)\n' \
            "$TAG" "$http_code" "$attempts_made"
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

# Classify for the delivery log, which ops:daily reads instead of probing the
# webhook itself. The categories are the ones with different fixes:
#   bad-signature   the secret is wrong or the bot has signing enabled without it
#   bad-token       the webhook was reset or the bot was removed from the group
#   rate-limited    back off; it will recover on its own
#   http-error      Feishu is unhappy; look at the response code
#   unreachable     DNS/connect/timeout: the host cannot reach Feishu at all
failure_reason='delivery-failed'
if [ "$curl_rc" -ne 0 ]; then
  case "$curl_rc" in
    6 | 7) failure_reason='unreachable' ;;
    28) failure_reason='timeout' ;;
    *) failure_reason='curl-error' ;;
  esac
elif body_has_code "$body_file" 19021; then
  failure_reason='bad-signature'
elif body_has_code "$body_file" 19001 || body_has_code "$body_file" 19024; then
  failure_reason='bad-token'
elif body_has_code "$body_file" 9499; then
  failure_reason='rate-limited'
elif [ "$http_code" -ge 500 ] 2>/dev/null; then
  failure_reason='http-error'
elif [ "$http_code" -eq 429 ] 2>/dev/null; then
  failure_reason='rate-limited'
fi

record_delivery false "$http_code" "$curl_rc" "$attempts_made" "$failure_reason"

# Never print the webhook or the secret: this line may end up in syslog.
printf '%s: delivery failed (%s reason=%s) after %s attempt(s)\n' \
  "$TAG" "$last_note" "$failure_reason" "$attempts_made" >&2
exit 1
