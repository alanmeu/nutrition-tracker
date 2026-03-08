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

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required secret: ${name}`);
  }
  return value;
}

function formEncode(data: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    params.append(key, value);
  }
  return params;
}

function normalizePlanCode(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === PLAN_CODES.PREMIUM) return PLAN_CODES.PREMIUM;
  return PLAN_CODES.ESSENTIAL;
}

function resolvePriceId(planCode: string, fallbackPriceId?: string) {
  const essentialPriceId = (Deno.env.get("STRIPE_PRICE_ID_ESSENTIAL") || Deno.env.get("STRIPE_PRICE_ID") || "").trim();
  const premiumPriceId = (Deno.env.get("STRIPE_PRICE_ID_PREMIUM") || "").trim();
  if (planCode === PLAN_CODES.PREMIUM) {
    if (premiumPriceId) return premiumPriceId;
    if (essentialPriceId) return essentialPriceId;
    if (fallbackPriceId) return fallbackPriceId;
    throw new Error("Missing required secret: STRIPE_PRICE_ID_PREMIUM (or STRIPE_PRICE_ID_ESSENTIAL as fallback)");
  }
  if (essentialPriceId) return essentialPriceId;
  if (fallbackPriceId) return fallbackPriceId;
  throw new Error("Missing required secret: STRIPE_PRICE_ID_ESSENTIAL");
}

async function stripeRequest(path: string, body: URLSearchParams) {
  const stripeSecret = getRequiredEnv("STRIPE_SECRET_KEY");
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecret}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": STRIPE_API_VERSION
    },
    body
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

    const body = await req.json().catch(() => ({}));
    const planCode = normalizePlanCode(body?.planCode);
    const fallbackPriceId = String(body?.priceId || "").trim();
    const priceId = resolvePriceId(planCode, fallbackPriceId);
    const successUrl = String(body?.successUrl || "").trim();
    const cancelUrl = String(body?.cancelUrl || "").trim();

    if (!successUrl || !cancelUrl) {
      return new Response(JSON.stringify({ error: "Missing successUrl or cancelUrl" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: existingSub } = await admin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = existingSub?.stripe_customer_id || "";

    if (!customerId) {
      const customer = await stripeRequest(
        "/customers",
        formEncode({
          email: user.email || "",
          name: String(user.user_metadata?.name || ""),
          "metadata[supabase_user_id]": user.id
        })
      );

      customerId = String(customer.id || "");
      if (!customerId) {
        throw new Error("Stripe customer creation failed.");
      }
    }

    const checkout = await stripeRequest(
      "/checkout/sessions",
      formEncode({
        mode: "subscription",
        customer: customerId,
        success_url: successUrl,
        cancel_url: cancelUrl,
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": "1",
        allow_promotion_codes: "true",
        client_reference_id: user.id,
        "metadata[supabase_user_id]": user.id,
        "metadata[plan_code]": planCode,
        "metadata[stripe_price_id]": priceId,
        "subscription_data[metadata][supabase_user_id]": user.id,
        "subscription_data[metadata][plan_code]": planCode,
        "subscription_data[metadata][stripe_price_id]": priceId
      })
    );

    await admin
      .from("subscriptions")
      .upsert(
        {
          user_id: user.id,
          plan_code: planCode,
          stripe_price_id: priceId,
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      );

    return new Response(
      JSON.stringify({
        id: checkout.id,
        url: checkout.url
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
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
