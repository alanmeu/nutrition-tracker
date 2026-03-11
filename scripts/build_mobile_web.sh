#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_DIR="$ROOT_DIR/mobile-native"

# Load root .env so REACT_APP_* variables are available for Expo web export.
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT_DIR/.env"
  set +a
fi

cat > "$MOBILE_DIR/.env" <<EOF
EXPO_PUBLIC_SUPABASE_URL=${REACT_APP_SUPABASE_URL:-}
EXPO_PUBLIC_SUPABASE_ANON_KEY=${REACT_APP_SUPABASE_ANON_KEY:-}
EXPO_PUBLIC_OWNER_COACH_EMAIL=${REACT_APP_OWNER_COACH_EMAIL:-}
EXPO_PUBLIC_STRIPE_PRICE_ID=${REACT_APP_STRIPE_PRICE_ID:-}
EXPO_PUBLIC_STRIPE_PRICE_ID_ESSENTIAL=${REACT_APP_STRIPE_PRICE_ID_ESSENTIAL:-}
EXPO_PUBLIC_STRIPE_PRICE_ID_PREMIUM=${REACT_APP_STRIPE_PRICE_ID_PREMIUM:-}
EXPO_PUBLIC_STRIPE_SUCCESS_URL=${REACT_APP_STRIPE_SUCCESS_URL:-}
EXPO_PUBLIC_STRIPE_CANCEL_URL=${REACT_APP_STRIPE_CANCEL_URL:-}
EXPO_PUBLIC_WEB_APP_URL=${REACT_APP_SITE_URL:-}
EXPO_PUBLIC_FORCE_WEB_PARITY=false
EOF

npm --prefix "$MOBILE_DIR" ci
(cd "$MOBILE_DIR" && npx expo export --platform web)

rm -rf "$ROOT_DIR/build"
mkdir -p "$ROOT_DIR/build"
cp -R "$MOBILE_DIR/dist/." "$ROOT_DIR/build/"

echo "Expo web build copied to /build"
