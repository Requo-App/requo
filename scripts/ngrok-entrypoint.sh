#!/bin/sh
set -eu

if [ -z "${NGROK_AUTHTOKEN:-}" ]; then
  echo "ngrok: NGROK_AUTHTOKEN is not set. Add it to .env.local from https://dashboard.ngrok.com/get-started/your-authtoken." >&2
  exit 1
fi

set -- http app:3000 --log stdout

if [ -n "${NGROK_DOMAIN:-}" ]; then
  domain="${NGROK_DOMAIN#http://}"
  domain="${domain#https://}"
  domain="${domain%%/*}"
  domain="${domain%/}"
  set -- "$@" --url "https://${domain}"
fi

# Use the image's agent config so the inspector binds all interfaces for the
# Docker port mapping; the authtoken still comes from NGROK_AUTHTOKEN.
exec /bin/ngrok --config /var/lib/ngrok/ngrok.yml "$@"
