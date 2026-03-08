import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature"
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
  if (!value) {
    throw new Error(`Missing required secret: ${name}`);
  }
  return value;
}

function parseStripeSignature(signatureHeader: string) {
  const parts = signatureHeader.split(",").map((item) => item.trim());
  const timestampPart = parts.find((part) => part.startsWith("t="));
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  const timestamp = timestampPart ? Number(timestampPart.slice(2)) : NaN;
  return { timestamp, signatures };
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyStripeSignature(rawBody: string, signatureHeader: string, secret: string) {
  const { timestamp, signatures } = parseStripeSignature(signatureHeader);
  if (!Number.isFinite(timestamp) || signatures.length === 0) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) {
    return false;
  }

  const payload = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const computedHex = toHex(signature);

  return signatures.some((value) => value === computedHex);
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

function toIsoFromStripeTimestamp(value: number | undefined) {
  if (!value) return null;
  return new Date(value * 1000).toISOString();
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

async function findUserIdFromCustomer(admin: ReturnType<typeof createClient>, customerId: string) {
  if (!customerId) return null;

  const { data: existing } = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (existing?.user_id) {
    return existing.user_id as string;
  }

  const customer = await stripeGet(`/customers/${encodeURIComponent(customerId)}`);
  const metadataUserId = String(customer?.metadata?.supabase_user_id || "").trim();
  return metadataUserId || null;
}

async function upsertSubscription(
  admin: ReturnType<typeof createClient>,
  args: {
    userId: string;
    status?: string;
    planCode?: string;
    stripePriceId?: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    currentPeriodEnd?: number;
    cancelAtPeriodEnd?: boolean;
  }
) {
  if (!args.userId) return;

  const payload = {
    user_id: args.userId,
    status: args.status || "inactive",
    plan_code: normalizePlanCode(args.planCode),
    stripe_price_id: args.stripePriceId || null,
    stripe_customer_id: args.stripeCustomerId || null,
    stripe_subscription_id: args.stripeSubscriptionId || null,
    current_period_end: toIsoFromStripeTimestamp(args.currentPeriodEnd),
    cancel_at_period_end: Boolean(args.cancelAtPeriodEnd),
    updated_at: new Date().toISOString()
  };

  const { error } = await admin
    .from("subscriptions")
    .upsert(payload, { onConflict: "user_id" });

  if (error) {
    throw error;
  }
}

async function handleSubscriptionEvent(
  admin: ReturnType<typeof createClient>,
  stripeSub: StripeSubscription
) {
  const customerId = String(stripeSub.customer || "");
  let userId = String(stripeSub.metadata?.supabase_user_id || "").trim();

  if (!userId) {
    userId = (await findUserIdFromCustomer(admin, customerId)) || "";
  }

  if (!userId) {
    return;
  }

  const stripePriceId = String(
    stripeSub.items?.data?.[0]?.price?.id ||
    stripeSub.metadata?.stripe_price_id ||
    ""
  ).trim();
  const planCode = stripeSub.metadata?.plan_code
    ? normalizePlanCode(stripeSub.metadata.plan_code)
    : resolvePlanFromPriceId(stripePriceId);

  await upsertSubscription(admin, {
    userId,
    status: stripeSub.status || "inactive",
    planCode,
    stripePriceId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: stripeSub.id,
    currentPeriodEnd: stripeSub.current_period_end,
    cancelAtPeriodEnd: stripeSub.cancel_at_period_end
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  try {
    const signatureHeader = req.headers.get("stripe-signature") || "";
    const webhookSecret = getRequiredEnv("STRIPE_WEBHOOK_SECRET");
    const rawBody = await req.text();

    const isValidSignature = await verifyStripeSignature(rawBody, signatureHeader, webhookSecret);
    if (!isValidSignature) {
      return new Response(JSON.stringify({ error: "Invalid Stripe signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const event = JSON.parse(rawBody) as {
      type?: string;
      data?: { object?: Record<string, unknown> };
    };

    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const eventType = String(event.type || "");
    const object = (event.data?.object || {}) as Record<string, unknown>;

    if (eventType === "checkout.session.completed") {
      const metadata = (object.metadata as Record<string, unknown> | undefined) || {};
      const userId =
        String(object.client_reference_id || "").trim() ||
        String(metadata.supabase_user_id || "").trim();
      const customerId = String(object.customer || "").trim();
      const subscriptionId = String(object.subscription || "").trim();
      const planCodeFromSession = normalizePlanCode(metadata.plan_code);
      const stripePriceIdFromSession = String(metadata.stripe_price_id || "").trim();

      if (userId) {
        if (subscriptionId) {
          const stripeSub = (await stripeGet(
            `/subscriptions/${encodeURIComponent(subscriptionId)}`
          )) as StripeSubscription;

          await upsertSubscription(admin, {
            userId,
            status: stripeSub.status || "active",
            planCode: stripeSub.metadata?.plan_code || planCodeFromSession,
            stripePriceId:
              String(stripeSub.items?.data?.[0]?.price?.id || stripeSub.metadata?.stripe_price_id || stripePriceIdFromSession),
            stripeCustomerId: String(stripeSub.customer || customerId),
            stripeSubscriptionId: stripeSub.id,
            currentPeriodEnd: stripeSub.current_period_end,
            cancelAtPeriodEnd: stripeSub.cancel_at_period_end
          });
        } else {
          await upsertSubscription(admin, {
            userId,
            status: "active",
            planCode: planCodeFromSession,
            stripePriceId: stripePriceIdFromSession,
            stripeCustomerId: customerId,
            stripeSubscriptionId: "",
            cancelAtPeriodEnd: false
          });
        }
      }
    }

    if (
      eventType === "customer.subscription.created" ||
      eventType === "customer.subscription.updated" ||
      eventType === "customer.subscription.deleted"
    ) {
      await handleSubscriptionEvent(admin, object as unknown as StripeSubscription);
    }

    return new Response(JSON.stringify({ received: true }), {
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
