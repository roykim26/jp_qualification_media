# Custom Caddy build: the official caddy:2-alpine image does not register a
# brotli encoder (module `http.encoders.br`), so `encode br` fails validation.
# xcaddy rebuilds the same version with the pure-Go ueffel/caddy-brotli plugin.
FROM caddy:2.11.9-builder AS builder

RUN xcaddy build v2.11.9 --with github.com/ueffel/caddy-brotli

FROM caddy:2.11.9-alpine

COPY --from=builder /usr/bin/caddy /usr/bin/caddy
