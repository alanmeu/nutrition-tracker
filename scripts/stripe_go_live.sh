#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_REF="cruvdmlzzsrcfofepqns"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Commande manquante: $1"
    exit 1
  fi
}

set_or_append_env() {
  local file="$1"
  local key="$2"
  local value="$3"

  if [[ ! -f "$file" ]]; then
    touch "$file"
  fi

  if rg -q "^${key}=" "$file"; then
    sed -i '' "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$file"
  fi
}

require_cmd rg
require_cmd sed
require_cmd npx

WEB_ENV="$ROOT_DIR/.env"
MOBILE_ENV="$ROOT_DIR/mobile-native/.env"

read -r -p "Ton domaine web live (ex: https://nutricloud.fr): " SITE_URL
SITE_URL="${SITE_URL%/}"

if [[ -z "$SITE_URL" ]]; then
  echo "SITE_URL est requis."
  exit 1
fi

read -r -p "Stripe Price ID Essential live (price_...): " PRICE_ESSENTIAL
read -r -p "Stripe Price ID Premium live (price_...): " PRICE_PREMIUM

if [[ -z "$PRICE_ESSENTIAL" || -z "$PRICE_PREMIUM" ]]; then
  echo "Les deux Price IDs sont requis."
  exit 1
fi

read -r -s -p "Stripe Secret Key LIVE (sk_live_...): " STRIPE_SECRET_KEY
echo
read -r -s -p "Stripe Webhook Secret LIVE (whsec_...): " STRIPE_WEBHOOK_SECRET
echo

if [[ -z "$STRIPE_SECRET_KEY" || -z "$STRIPE_WEBHOOK_SECRET" ]]; then
  echo "Les secrets Stripe live sont requis."
  exit 1
fi

if [[ "$STRIPE_SECRET_KEY" != sk_live_* ]]; then
  echo "Attention: la clé Stripe ne commence pas par sk_live_."
fi

SUCCESS_URL="$SITE_URL/stripe-success.html"
CANCEL_URL="$SITE_URL/stripe-cancel.html"

# Update web env
set_or_append_env "$WEB_ENV" "REACT_APP_SITE_URL" "$SITE_URL"
set_or_append_env "$WEB_ENV" "REACT_APP_STRIPE_PRICE_ID_ESSENTIAL" "$PRICE_ESSENTIAL"
set_or_append_env "$WEB_ENV" "REACT_APP_STRIPE_PRICE_ID_PREMIUM" "$PRICE_PREMIUM"
set_or_append_env "$WEB_ENV" "REACT_APP_STRIPE_SUCCESS_URL" "$SUCCESS_URL"
set_or_append_env "$WEB_ENV" "REACT_APP_STRIPE_CANCEL_URL" "$CANCEL_URL"

# Update mobile env
set_or_append_env "$MOBILE_ENV" "EXPO_PUBLIC_WEB_APP_URL" "$SITE_URL"
set_or_append_env "$MOBILE_ENV" "EXPO_PUBLIC_STRIPE_PRICE_ID_ESSENTIAL" "$PRICE_ESSENTIAL"
set_or_append_env "$MOBILE_ENV" "EXPO_PUBLIC_STRIPE_PRICE_ID_PREMIUM" "$PRICE_PREMIUM"
set_or_append_env "$MOBILE_ENV" "EXPO_PUBLIC_STRIPE_SUCCESS_URL" "$SUCCESS_URL"
set_or_append_env "$MOBILE_ENV" "EXPO_PUBLIC_STRIPE_CANCEL_URL" "$CANCEL_URL"

# Push secrets to Supabase
cd "$ROOT_DIR"
npx -y supabase@1.153.4 secrets set \
  --project-ref "$PROJECT_REF" \
  STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" \
  STRIPE_WEBHOOK_SECRET="$STRIPE_WEBHOOK_SECRET" \
  STRIPE_PRICE_ID_ESSENTIAL="$PRICE_ESSENTIAL" \
  STRIPE_PRICE_ID_PREMIUM="$PRICE_PREMIUM"

# Deploy Stripe functions
npx -y supabase@1.153.4 functions deploy create-stripe-checkout --project-ref "$PROJECT_REF"
npx -y supabase@1.153.4 functions deploy create-stripe-portal --project-ref "$PROJECT_REF"
npx -y supabase@1.153.4 functions deploy stripe-webhook --project-ref "$PROJECT_REF"
npx -y supabase@1.153.4 functions deploy sync-stripe-subscription --project-ref "$PROJECT_REF"

echo
echo "Bascule Stripe PROD terminee (code+secrets+functions)."
echo "Pense a verifier le webhook live dans Stripe Dashboard vers:"
echo "https://$PROJECT_REF.functions.supabase.co/stripe-webhook"
echo
echo "Variables web/mobile mises a jour:"
echo "- $WEB_ENV"
echo "- $MOBILE_ENV"
