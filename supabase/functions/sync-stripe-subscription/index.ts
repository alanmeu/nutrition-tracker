import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const STRIPE_API_BASE = "https://api.stripe.com/v1";
const STRIPE_API_VERSION = "2025-02-24.acacia";
const PLAN_CODES = {
  ESSENTIAL: "essential",
  PREMIUM: "premium"
} as const;

type StripeSubscription = {
  id: string;
  status?: string;
  customer?: string;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  metadata?: Record<string, string>;
  items?: {
    data?: Array<{
      price?: {
        id?: string;
      };
    }>;
  };
};

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

function normalizePlanCode(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === PLAN_CODES.PREMIUM) return PLAN_CODES.PREMIUM;
  return PLAN_CODES.ESSENTIAL;
}

function resolvePlanFromPriceId(stripePriceId?: string) {
  const premiumPriceId = (Deno.env.get("STRIPE_PRICE_ID_PREMIUM") || "").trim();
  if (stripePriceId && premiumPriceId && stripePriceId === premiumPriceId) {
    return PLAN_CODES.PREMIUM;
  }
  return PLAN_CODES.ESSENTIAL;
}

function toIsoFromStripeTimestamp(value?: number) {
  if (!value) return null;
  return new Date(value * 1000).toISOString();
}

async function stripeGet(path: string) {
  const stripeSecret = getRequiredEnv("STRIPE_SECRET_KEY");
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${stripeSecret}`,
      "Stripe-Version": STRIPE_API_VERSION
    }
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message || `Stripe request failed: ${response.status}`);
  }
  return json;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const supabaseAnonKey = getRequiredEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } }
    });
    const {
      data: { user },
      error: authError
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: existingSub, error: readError } = await admin
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (readError) throw readError;

    const customerId = String(existingSub?.stripe_customer_id || "").trim();
    if (!customerId) {
      return new Response(JSON.stringify({ synced: false, reason: "no_customer" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const list = await stripeGet(`/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=10`);
    const allSubs = Array.isArray(list?.data) ? (list.data as StripeSubscription[]) : [];
    const selected =
      allSubs.find((s) => ["active", "trialing", "past_due"].includes(String(s.status || "").toLowerCase())) ||
      allSubs[0] ||
      null;

    if (!selected) {
      await admin
        .from("subscriptions")
        .upsert(
          {
            user_id: user.id,
            status: "inactive",
            stripe_customer_id: customerId,
            updated_at: new Date().toISOString()
          },
          { onConflict: "user_id" }
        );
      return new Response(JSON.stringify({ synced: true, status: "inactive" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const stripePriceId = String(selected.items?.data?.[0]?.price?.id || selected.metadata?.stripe_price_id || "").trim();
    const planCode = selected.metadata?.plan_code
      ? normalizePlanCode(selected.metadata.plan_code)
      : resolvePlanFromPriceId(stripePriceId);

    const payload = {
      user_id: user.id,
      status: selected.status || "inactive",
      plan_code: planCode,
      stripe_price_id: stripePriceId || null,
      stripe_customer_id: String(selected.customer || customerId),
      stripe_subscription_id: selected.id || null,
      current_period_end: toIsoFromStripeTimestamp(selected.current_period_end),
      cancel_at_period_end: Boolean(selected.cancel_at_period_end),
      updated_at: new Date().toISOString()
    };

    const { error: upsertError } = await admin
      .from("subscriptions")
      .upsert(payload, { onConflict: "user_id" });
    if (upsertError) throw upsertError;

    return new Response(JSON.stringify({ synced: true, status: payload.status, planCode: payload.plan_code }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});

