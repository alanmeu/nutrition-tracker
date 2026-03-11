import { supabase } from "./utils/supabase";
import { normalizeWeeklyPlan } from "./utils/mealPlanner";

const OWNER_COACH_EMAIL = (process.env.REACT_APP_OWNER_COACH_EMAIL || "").trim().toLowerCase();
const SITE_URL = process.env.REACT_APP_SITE_URL || window.location.origin;
const PHOTO_BUCKET = "client-photos";
const BLOG_COVER_BUCKET = "blog-covers";
const STRIPE_PRICE_ID_ESSENTIAL = (
  process.env.REACT_APP_STRIPE_PRICE_ID_ESSENTIAL || process.env.REACT_APP_STRIPE_PRICE_ID || ""
).trim();
const STRIPE_PRICE_ID_PREMIUM = (process.env.REACT_APP_STRIPE_PRICE_ID_PREMIUM || "").trim();
const STRIPE_SUCCESS_URL = process.env.REACT_APP_STRIPE_SUCCESS_URL || `${SITE_URL}/`;
const STRIPE_CANCEL_URL = process.env.REACT_APP_STRIPE_CANCEL_URL || `${SITE_URL}/`;
const OFF_USER_ID = (process.env.REACT_APP_OFF_USER_ID || "").trim();
const OFF_PASSWORD = (process.env.REACT_APP_OFF_PASSWORD || "").trim();
const FOOD_SEARCH_TIMEOUT_MS = 1200;
const FOOD_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const FOOD_SEARCH_FAST_RETURN_MS = 250;
const foodSearchCache = new Map();
const SUBSCRIPTION_PLANS = {
  ESSENTIAL: "essential",
  PREMIUM: "premium"
};

function withQueryParams(url, params) {
  const target = new URL(url, SITE_URL);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    target.searchParams.set(key, String(value));
  });
  return target.toString();
}

function normalizePlanCode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === SUBSCRIPTION_PLANS.PREMIUM) return SUBSCRIPTION_PLANS.PREMIUM;
  return SUBSCRIPTION_PLANS.ESSENTIAL;
}

function getPriceIdForPlan(planCode) {
  const normalized = normalizePlanCode(planCode);
  if (normalized === SUBSCRIPTION_PLANS.PREMIUM) {
    return STRIPE_PRICE_ID_PREMIUM || STRIPE_PRICE_ID_ESSENTIAL;
  }
  if (!STRIPE_PRICE_ID_ESSENTIAL) {
    throw new Error("REACT_APP_STRIPE_PRICE_ID_ESSENTIAL manquant.");
  }
  return STRIPE_PRICE_ID_ESSENTIAL;
}

function getMonthlyAppointmentLimit(planCode) {
  return normalizePlanCode(planCode) === SUBSCRIPTION_PLANS.PREMIUM ? 4 : 1;
}

function getMonthBoundsISO(startsAt) {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Date de rendez-vous invalide.");
  }
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0));
  return {
    start: start.toISOString(),
    end: end.toISOString()
  };
}

function resolveSubscriptionPlan(subscriptionRow) {
  const explicitPlan = normalizePlanCode(subscriptionRow?.plan_code);
  if (subscriptionRow?.plan_code) return explicitPlan;
  const priceId = String(subscriptionRow?.stripe_price_id || "").trim();
  if (priceId && STRIPE_PRICE_ID_PREMIUM && priceId === STRIPE_PRICE_ID_PREMIUM) {
    return SUBSCRIPTION_PLANS.PREMIUM;
  }
  return SUBSCRIPTION_PLANS.ESSENTIAL;
}

const CIQUAL_FALLBACK_FOODS = [
  { description: "Pomme, crue", caloriesPer100g: 52, proteinPer100g: 0.3, carbsPer100g: 11.6, fatPer100g: 0.2 },
  { description: "Banane, crue", caloriesPer100g: 89, proteinPer100g: 1.1, carbsPer100g: 20.5, fatPer100g: 0.2 },
  { description: "Riz blanc, cuit", caloriesPer100g: 130, proteinPer100g: 2.4, carbsPer100g: 28.2, fatPer100g: 0.3 },
  { description: "Pates, cuites", caloriesPer100g: 131, proteinPer100g: 5, carbsPer100g: 25, fatPer100g: 1.1 },
  { description: "Poulet, blanc, cuit", caloriesPer100g: 165, proteinPer100g: 31, carbsPer100g: 0, fatPer100g: 3.6 },
  { description: "Saumon, cuit", caloriesPer100g: 208, proteinPer100g: 20.4, carbsPer100g: 0, fatPer100g: 13.4 },
  { description: "Oeuf entier, cuit", caloriesPer100g: 155, proteinPer100g: 13, carbsPer100g: 1.1, fatPer100g: 11 },
  { description: "Pain complet", caloriesPer100g: 247, proteinPer100g: 9.5, carbsPer100g: 41.2, fatPer100g: 3.3 },
  { description: "Fromage blanc 3%", caloriesPer100g: 76, proteinPer100g: 8, carbsPer100g: 4.2, fatPer100g: 3 },
  { description: "Yaourt nature", caloriesPer100g: 62, proteinPer100g: 4.3, carbsPer100g: 4.7, fatPer100g: 3.2 },
  { description: "Lait demi-ecreme", caloriesPer100g: 46, proteinPer100g: 3.2, carbsPer100g: 4.8, fatPer100g: 1.6 },
  { description: "Lentilles, cuites", caloriesPer100g: 116, proteinPer100g: 9, carbsPer100g: 14.2, fatPer100g: 0.4 },
  { description: "Pois chiches, cuits", caloriesPer100g: 164, proteinPer100g: 8.9, carbsPer100g: 20.8, fatPer100g: 2.6 },
  { description: "Pomme de terre, cuite", caloriesPer100g: 86, proteinPer100g: 2, carbsPer100g: 18.1, fatPer100g: 0.1 },
  { description: "Patate douce, cuite", caloriesPer100g: 90, proteinPer100g: 2, carbsPer100g: 20.7, fatPer100g: 0.1 },
  { description: "Avocat", caloriesPer100g: 160, proteinPer100g: 2, carbsPer100g: 1.8, fatPer100g: 14.7 },
  { description: "Huile d'olive", caloriesPer100g: 884, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 100 }
];

const CORE_INGREDIENT_FOODS = [
  { description: "Tomate, crue", caloriesPer100g: 18, proteinPer100g: 0.9, carbsPer100g: 2.5, fatPer100g: 0.2 },
  { description: "Concombre, cru", caloriesPer100g: 15, proteinPer100g: 0.7, carbsPer100g: 2.2, fatPer100g: 0.1 },
  { description: "Carotte, crue", caloriesPer100g: 41, proteinPer100g: 0.9, carbsPer100g: 6.7, fatPer100g: 0.2 },
  { description: "Courgette, crue", caloriesPer100g: 17, proteinPer100g: 1.2, carbsPer100g: 2.5, fatPer100g: 0.3 },
  { description: "Brocoli, cuit", caloriesPer100g: 35, proteinPer100g: 2.8, carbsPer100g: 2.1, fatPer100g: 0.4 },
  { description: "Haricots verts, cuits", caloriesPer100g: 31, proteinPer100g: 1.8, carbsPer100g: 3.5, fatPer100g: 0.2 },
  { description: "Oignon, cru", caloriesPer100g: 40, proteinPer100g: 1.1, carbsPer100g: 7.6, fatPer100g: 0.1 },
  { description: "Ail, cru", caloriesPer100g: 149, proteinPer100g: 6.4, carbsPer100g: 24, fatPer100g: 0.5 },
  { description: "Poivron rouge, cru", caloriesPer100g: 31, proteinPer100g: 1, carbsPer100g: 4.6, fatPer100g: 0.3 },
  { description: "Riz complet, cuit", caloriesPer100g: 123, proteinPer100g: 2.7, carbsPer100g: 25.6, fatPer100g: 1 },
  { description: "Quinoa, cuit", caloriesPer100g: 120, proteinPer100g: 4.4, carbsPer100g: 18.8, fatPer100g: 1.9 },
  { description: "Flocons d'avoine", caloriesPer100g: 372, proteinPer100g: 13.5, carbsPer100g: 58.7, fatPer100g: 7 },
  { description: "Semoule, cuite", caloriesPer100g: 112, proteinPer100g: 3.8, carbsPer100g: 21.8, fatPer100g: 0.2 },
  { description: "Dinde, filet, cuit", caloriesPer100g: 135, proteinPer100g: 29, carbsPer100g: 0, fatPer100g: 1.5 },
  { description: "Boeuf 5% MG, cuit", caloriesPer100g: 173, proteinPer100g: 26, carbsPer100g: 0, fatPer100g: 7 },
  { description: "Thon, naturel", caloriesPer100g: 116, proteinPer100g: 26, carbsPer100g: 0, fatPer100g: 1 },
  { description: "Cabillaud, cuit", caloriesPer100g: 105, proteinPer100g: 23, carbsPer100g: 0, fatPer100g: 0.8 },
  { description: "Crevettes, cuites", caloriesPer100g: 99, proteinPer100g: 24, carbsPer100g: 0.2, fatPer100g: 0.3 },
  { description: "Tofu nature", caloriesPer100g: 121, proteinPer100g: 12.1, carbsPer100g: 1.9, fatPer100g: 7.2 },
  { description: "Skyr nature", caloriesPer100g: 63, proteinPer100g: 11, carbsPer100g: 3.5, fatPer100g: 0.2 },
  { description: "Emmental", caloriesPer100g: 380, proteinPer100g: 28, carbsPer100g: 0.5, fatPer100g: 29 },
  { description: "Amandes", caloriesPer100g: 579, proteinPer100g: 21.1, carbsPer100g: 9.1, fatPer100g: 49.9 },
  { description: "Noix", caloriesPer100g: 654, proteinPer100g: 15.2, carbsPer100g: 7, fatPer100g: 65.2 },
  { description: "Orange, crue", caloriesPer100g: 47, proteinPer100g: 0.9, carbsPer100g: 9.1, fatPer100g: 0.1 },
  { description: "Fraise, crue", caloriesPer100g: 32, proteinPer100g: 0.7, carbsPer100g: 5.6, fatPer100g: 0.3 },
  { description: "Myrtille, crue", caloriesPer100g: 57, proteinPer100g: 0.7, carbsPer100g: 12.1, fatPer100g: 0.3 },
  { description: "Mangue, crue", caloriesPer100g: 60, proteinPer100g: 0.8, carbsPer100g: 13.4, fatPer100g: 0.4 }
];

function appointmentWeekStart(startsAt) {
  const date = new Date(startsAt);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

function currentWeekStartISO() {
  return appointmentWeekStart(new Date().toISOString());
}

function isWithinCoachAvailability(startsAt, endsAt) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return false;
  const day = start.getDay();
  const allowedDays = new Set([1, 2, 4, 5, 6]); // lun, mar, jeu, ven, sam
  if (!allowedDays.has(day)) return false;
  if (start.getDay() !== end.getDay()) return false;
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  return startMinutes >= 9 * 60 + 30 && endMinutes <= 20 * 60;
}

function normalizeAppointmentBookingError(error) {
  const message = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  if (error?.code === "23505" && (message.includes("appointments_slot_unique") || message.includes("starts_at"))) {
    return new Error("Ce creneau est deja reserve par un autre client. Choisis un autre horaire.");
  }
  if (
    error?.code === "23505" &&
    (message.includes("appointments_client_id_week_start_key") || message.includes("client_id, week_start"))
  ) {
    return new Error("Reservation refusee: limite de rendez-vous atteinte pour cette periode.");
  }
  return error;
}

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase non configure. Ajoute REACT_APP_SUPABASE_URL et REACT_APP_SUPABASE_ANON_KEY.");
  }

  return supabase;
}

function isOwnerCoachEmail(email) {
  return Boolean(OWNER_COACH_EMAIL) && (email || "").trim().toLowerCase() === OWNER_COACH_EMAIL;
}

function sanitizeRequestedRole(requestedRole, email) {
  if (requestedRole === "coach" && isOwnerCoachEmail(email)) {
    return "coach";
  }

  return "client";
}

export function isOwnerCoachProfile(profile) {
  return profile?.role === "coach" && isOwnerCoachEmail(profile.email);
}

function mapProfile(profile) {
  return {
    id: profile.id,
    email: profile.email,
    role: profile.role,
    name: profile.name || "",
    age: profile.age || 30,
    sex: profile.sex || "male",
    height: profile.height || 170,
    weight: profile.weight || 70,
    waistCm: profile.waist_cm ?? null,
    hipCm: profile.hip_cm ?? null,
    chestCm: profile.chest_cm ?? null,
    armCm: profile.arm_cm ?? null,
    thighCm: profile.thigh_cm ?? null,
    goal: profile.goal || "",
    nap: profile.nap || 1.4,
    bmrMethod: profile.bmr_method || "mifflin",
    deficit: profile.deficit || 20,
    coachMessage: profile.coach_message || ""
  };
}

function mapWeeklyMenu(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    coachId: row.coach_id,
    weekStart: row.week_start,
    notes: row.notes || "",
    plan: normalizeWeeklyPlan(row.plan)
  };
}

function mapClientPhoto(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    uploaderId: row.uploader_id,
    imageUrl: row.image_url,
    caption: row.caption || "",
    createdAt: row.created_at
  };
}

function mapWeeklyCheckin(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    weekStart: row.week_start,
    energy: Number(row.energy),
    hunger: Number(row.hunger),
    sleep: Number(row.sleep),
    stress: Number(row.stress),
    adherence: Number(row.adherence),
    score: Number(row.score),
    notes: row.notes || "",
    createdAt: row.created_at
  };
}

function mapWeeklyGoals(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    coachId: row.coach_id,
    weekStart: row.week_start,
    goals: Array.isArray(row.goals) ? row.goals : []
  };
}

function mapAppointment(row) {
  return {
    id: row.id,
    coachId: row.coach_id,
    clientId: row.client_id,
    weekStart: row.week_start,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status || "requested",
    meetUrl: row.meet_url || "",
    googleEventId: row.google_event_id || "",
    notes: row.notes || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapNotification(row) {
  return {
    id: row.id,
    recipientId: row.recipient_id,
    actorId: row.actor_id,
    clientId: row.client_id,
    type: row.type || "info",
    title: row.title || "",
    body: row.body || "",
    readAt: row.read_at,
    createdAt: row.created_at
  };
}

function mapChatMessage(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    coachId: row.coach_id,
    senderId: row.sender_id,
    message: row.message || "",
    readAt: row.read_at || null,
    createdAt: row.created_at
  };
}

function mapSubscription(row) {
  if (!row) return null;
  const planCode = resolveSubscriptionPlan(row);
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status || "inactive",
    planCode,
    stripePriceId: row.stripe_price_id || "",
    stripeCustomerId: row.stripe_customer_id || "",
    stripeSubscriptionId: row.stripe_subscription_id || "",
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    updatedAt: row.updated_at
  };
}

function isSubscriptionActiveStatus(status) {
  return ["active", "trialing", "past_due"].includes(String(status || "").toLowerCase());
}

function mapBlogPost(row) {
  return {
    id: row.id,
    title: row.title || "",
    slug: row.slug || "",
    excerpt: row.excerpt || "",
    content: row.content || "",
    coverImageUrl: row.cover_image_url || "",
    category: row.category || "Astuces",
    readMinutes: Number(row.read_minutes || 4),
    isPublished: Boolean(row.is_published),
    publishedAt: row.published_at || row.created_at
  };
}

function mapFoodLog(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    consumedOn: row.consumed_on,
    fdcId: row.fdc_id,
    foodName: row.food_name || "",
    brandName: row.brand_name || "",
    quantityG: Number(row.quantity_g || 0),
    caloriesPer100g: Number(row.calories_per_100g || 0),
    proteinPer100g: Number(row.protein_per_100g || 0),
    carbsPer100g: Number(row.carbs_per_100g || 0),
    fatPer100g: Number(row.fat_per_100g || 0),
    calories: Number(row.calories || 0),
    protein: Number(row.protein || 0),
    carbs: Number(row.carbs || 0),
    fat: Number(row.fat || 0),
    notes: row.notes || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function getOpenFoodFactsNutrient(product, keys) {
  const nutriments = product?.nutriments || {};
  for (const key of keys) {
    const raw = nutriments[key];
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function normalizeFoodSearchText(value) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function expandFoodQueryTokens(query) {
  const normalized = normalizeFoodSearchText(query);
  if (!normalized) return [];
  const base = normalized.split(/\s+/).filter(Boolean);
  const aliasMap = new Map([
    ["patate", ["pomme", "terre"]],
    ["douce", ["patate", "douce"]],
    ["blanc", ["filet"]],
    ["escalope", ["filet"]],
    ["steak", ["boeuf"]],
    ["boeuf", ["steak"]],
    ["yaourt", ["yogourt", "skyr"]],
    ["fromage", ["emmental"]],
    ["thon", ["poisson"]],
    ["poulet", ["volaille"]],
    ["dinde", ["volaille"]]
  ]);
  const expanded = new Set(base);
  for (const token of base) {
    const aliases = aliasMap.get(token) || [];
    for (const alias of aliases) expanded.add(alias);
  }
  return Array.from(expanded);
}

function editDistanceWithin(a, b, maxDistance) {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > maxDistance) return maxDistance + 1;

  let prev = new Array(lb + 1);
  let curr = new Array(lb + 1);
  for (let j = 0; j <= lb; j += 1) prev[j] = j;

  for (let i = 1; i <= la; i += 1) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= lb; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
      rowMin = Math.min(rowMin, curr[j]);
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[lb];
}

function fuzzyIncludes(label, token) {
  if (!label || !token) return false;
  if (label.includes(token)) return true;
  if (token.length <= 3) return false;

  const words = label.split(/\s+/).filter(Boolean);
  for (const word of words) {
    const dist = editDistanceWithin(word, token, token.length <= 5 ? 1 : 2);
    if (dist <= (token.length <= 5 ? 1 : 2)) return true;
  }
  return false;
}

function searchCiqualFallbackFoods(query) {
  const normalizedQuery = normalizeFoodSearchText(query);
  if (!normalizedQuery) return [];
  const tokens = expandFoodQueryTokens(normalizedQuery);
  return CIQUAL_FALLBACK_FOODS
    .filter((food) => {
      const label = normalizeFoodSearchText(food.description);
      if (label.includes(normalizedQuery)) return true;
      return tokens.every((token) => fuzzyIncludes(label, token));
    })
    .slice(0, 8)
    .map((food, index) => ({
      fdcId: null,
      description: food.description,
      brandName: "CIQUAL (fallback FR)",
      caloriesPer100g: food.caloriesPer100g,
      proteinPer100g: food.proteinPer100g,
      carbsPer100g: food.carbsPer100g,
      fatPer100g: food.fatPer100g,
      source: `ciqual_fallback_${index}`
    }));
}

function mapCoreIngredient(food, index) {
  return {
    fdcId: null,
    description: food.description,
    brandName: "Base ingredients FR",
    caloriesPer100g: food.caloriesPer100g,
    proteinPer100g: food.proteinPer100g,
    carbsPer100g: food.carbsPer100g,
    fatPer100g: food.fatPer100g,
    source: `core_ingredient_${index}`
  };
}

function searchCoreIngredientFoods(query) {
  const normalizedQuery = normalizeFoodSearchText(query);
  if (!normalizedQuery) return [];
  const tokens = expandFoodQueryTokens(normalizedQuery);
  return CORE_INGREDIENT_FOODS
    .map((food) => {
      const label = normalizeFoodSearchText(food.description);
      const exact = label.includes(normalizedQuery);
      const tokenHits = tokens.reduce((acc, token) => acc + (fuzzyIncludes(label, token) ? 1 : 0), 0);
      const score = (exact ? 100 : 0) + tokenHits * 12 - label.length * 0.001;
      return { food, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((entry, index) => mapCoreIngredient(entry.food, index));
}

function findNearestCachedFoods(cacheKey) {
  let best = [];
  let bestLen = 0;
  for (const [key, value] of foodSearchCache.entries()) {
    if (!cacheKey.startsWith(key)) continue;
    if (Date.now() - value.at > FOOD_SEARCH_CACHE_TTL_MS) continue;
    if (key.length > bestLen) {
      bestLen = key.length;
      best = value.items || [];
    }
  }
  return best.slice(0, 12);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function mapOpenFoodFactsProduct(product) {
  if (!product) return null;
  const calories = getOpenFoodFactsNutrient(product, ["energy-kcal_100g", "energy-kcal"]);
  const protein = getOpenFoodFactsNutrient(product, ["proteins_100g", "proteins"]);
  const fat = getOpenFoodFactsNutrient(product, ["fat_100g", "fat"]);
  const carbs = getOpenFoodFactsNutrient(product, ["carbohydrates_100g", "carbohydrates"]);
  return {
    fdcId: Number(product.code) || null,
    description: product.product_name || product.generic_name_fr || product.generic_name || "Aliment",
    brandName: product.brands || "",
    caloriesPer100g: Number(calories.toFixed(2)),
    proteinPer100g: Number(protein.toFixed(2)),
    carbsPer100g: Number(carbs.toFixed(2)),
    fatPer100g: Number(fat.toFixed(2)),
    source: "open_food_facts"
  };
}

async function fetchOpenFoodFactsProducts(baseUrl, query) {
  const url = new URL(baseUrl);
  url.searchParams.set("search_terms", query);
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", "10");
  url.searchParams.set("fields", "code,product_name,generic_name,generic_name_fr,brands,nutriments");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FOOD_SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });
    if (!response.ok) return [];
    const payload = await response.json();
    const foods = Array.isArray(payload?.products) ? payload.products : [];
    return foods.map((food) => {
      const calories = getOpenFoodFactsNutrient(food, ["energy-kcal_100g", "energy-kcal"]);
      const protein = getOpenFoodFactsNutrient(food, ["proteins_100g", "proteins"]);
      const fat = getOpenFoodFactsNutrient(food, ["fat_100g", "fat"]);
      const carbs = getOpenFoodFactsNutrient(food, ["carbohydrates_100g", "carbohydrates"]);
      return {
        fdcId: Number(food.code) || null,
        description: food.product_name || food.generic_name_fr || food.generic_name || "Aliment",
        brandName: food.brands || "",
        caloriesPer100g: Number(calories.toFixed(2)),
        proteinPer100g: Number(protein.toFixed(2)),
        carbsPer100g: Number(carbs.toFixed(2)),
        fatPer100g: Number(fat.toFixed(2)),
        source: "open_food_facts"
      };
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

async function safeNotify(task) {
  try {
    await task();
  } catch {
    // Notification failure should not block business actions.
  }
}

export async function getSession() {
  const db = requireSupabase();
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthStateChange(listener) {
  const db = requireSupabase();
  return db.auth.onAuthStateChange((event, session) => listener(event, session));
}

export function subscribeRealtimeForProfile(profile, onChange) {
  const db = requireSupabase();
  const channel = db.channel(`realtime:${profile.id}:${Date.now()}`);

  const addListener = (table, filter) => {
    const config = {
      event: "*",
      schema: "public",
      table
    };
    if (filter) {
      config.filter = filter;
    }

    channel.on("postgres_changes", config, onChange);
  };

  if (isOwnerCoachProfile(profile)) {
    addListener("profiles", "role=eq.client");
    addListener("weights");
    addListener("reports");
    addListener("weekly_menus");
    addListener("client_photos");
    addListener("weekly_checkins");
    addListener("weekly_goals");
    addListener("appointments");
    addListener("food_logs");
    addListener("subscriptions");
    addListener("notifications", `recipient_id=eq.${profile.id}`);
    addListener("archived_clients");
    addListener("chat_messages");
  } else {
    addListener("profiles", `id=eq.${profile.id}`);
    addListener("weights", `user_id=eq.${profile.id}`);
    addListener("reports", `client_id=eq.${profile.id}`);
    addListener("weekly_menus", `client_id=eq.${profile.id}`);
    addListener("client_photos", `client_id=eq.${profile.id}`);
    addListener("weekly_checkins", `client_id=eq.${profile.id}`);
    addListener("weekly_goals", `client_id=eq.${profile.id}`);
    addListener("appointments", `client_id=eq.${profile.id}`);
    addListener("food_logs", `client_id=eq.${profile.id}`);
    addListener("subscriptions", `user_id=eq.${profile.id}`);
    addListener("notifications", `recipient_id=eq.${profile.id}`);
    addListener("chat_messages", `client_id=eq.${profile.id}`);
  }

  channel.subscribe();

  return () => {
    db.removeChannel(channel);
  };
}

export async function signIn({ email, password }) {
  const db = requireSupabase();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp({ email, password, name, role }) {
  const db = requireSupabase();
  const normalizedEmail = email.trim().toLowerCase();
  if (role === "coach" && !isOwnerCoachEmail(normalizedEmail)) {
    throw new Error("Seul le coach proprietaire peut avoir le role coach.");
  }

  const safeRole = sanitizeRequestedRole(role, normalizedEmail);

  const { data, error } = await db.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      emailRedirectTo: SITE_URL,
      data: {
        name,
        role: safeRole
      }
    }
  });

  if (error) throw error;

  // If email confirmation is required, there is no authenticated session yet.
  // In that case, profile creation will happen after first successful sign-in.
  if (data.user && data.session) {
    await ensureProfile(data.user);
  }

  return data;
}

export async function signOut() {
  const db = requireSupabase();
  const { error } = await db.auth.signOut();
  if (error) throw error;
}

export async function ensureProfile(authUser) {
  const db = requireSupabase();
  const { data: existing, error: readError } = await db
    .from("profiles")
    .select("*")
    .eq("id", authUser.id)
    .maybeSingle();

  if (readError) throw readError;
  if (existing) {
    const forcedRole = sanitizeRequestedRole(existing.role, existing.email);
    if (forcedRole !== existing.role) {
      const { data: updated, error: updateError } = await db
        .from("profiles")
        .update({ role: forcedRole, updated_at: new Date().toISOString() })
        .eq("id", authUser.id)
        .select("*")
        .single();

      if (updateError) throw updateError;
      return mapProfile(updated);
    }

    return mapProfile(existing);
  }

  const email = (authUser.email || "").trim().toLowerCase();
  const role = sanitizeRequestedRole(authUser.user_metadata?.role || "client", email);

  const defaults = {
    id: authUser.id,
    email,
    role,
    name: authUser.user_metadata?.name || email.split("@")[0] || "",
    age: 30,
    sex: "male",
    height: 170,
    weight: 70,
    goal: "",
    nap: 1.4,
    bmr_method: "mifflin",
    deficit: 20,
    coach_message: ""
  };

  const { data: inserted, error: insertError } = await db
    .from("profiles")
    .upsert(defaults, { onConflict: "id" })
    .select("*")
    .single();

  if (insertError) throw insertError;
  return mapProfile(inserted);
}

export async function loadCurrentUserData(sessionUser) {
  const db = requireSupabase();
  const profile = await ensureProfile(sessionUser);

  if (isOwnerCoachProfile(profile)) {
    const { data: profileRows, error: profileErr } = await db
      .from("profiles")
      .select("*")
      .eq("role", "client")
      .order("name", { ascending: true });

    if (profileErr) throw profileErr;

    const clientIds = profileRows.map((row) => row.id);
    let weights = [];
    let reports = [];
    let archivedRows = [];
    let menuRows = [];
    let photoRows = [];
    let checkinRows = [];
    let goalRows = [];
    let appointmentRows = [];
    let foodLogRows = [];
    let notificationRows = [];
    let blogRows = [];
    let chatRows = [];

    if (clientIds.length > 0) {
      const [
        { data: weightRows, error: weightErr },
        { data: reportRows, error: reportErr },
        { data: archivedData, error: archivedErr },
        { data: menusData, error: menusErr },
        { data: photosData, error: photosErr },
        { data: checkinsData, error: checkinsErr },
        { data: goalsData, error: goalsErr },
        { data: appointmentsData, error: appointmentsErr },
        { data: foodLogsData, error: foodLogsErr },
        { data: notificationsData, error: notificationsErr },
        { data: blogData, error: blogErr },
        { data: chatData, error: chatErr }
      ] = await Promise.all([
        db
          .from("weights")
          .select("id,user_id,date,weight")
          .in("user_id", clientIds)
          .order("date", { ascending: true }),
        db
          .from("reports")
          .select("*")
          .in("client_id", clientIds)
          .order("created_at", { ascending: false }),
        db
          .from("archived_clients")
          .select("id,original_client_id,archived_at,profile")
          .order("archived_at", { ascending: false }),
        db
          .from("weekly_menus")
          .select("*")
          .in("client_id", clientIds)
          .order("week_start", { ascending: false }),
        db
          .from("client_photos")
          .select("*")
          .in("client_id", clientIds)
          .order("created_at", { ascending: false }),
        db
          .from("weekly_checkins")
          .select("*")
          .in("client_id", clientIds)
          .order("week_start", { ascending: false }),
        db
          .from("weekly_goals")
          .select("*")
          .in("client_id", clientIds)
          .order("week_start", { ascending: false }),
        db
          .from("appointments")
          .select("*")
          .in("client_id", clientIds)
          .order("starts_at", { ascending: true }),
        db
          .from("food_logs")
          .select("*")
          .in("client_id", clientIds)
          .order("consumed_on", { ascending: false })
          .order("created_at", { ascending: false }),
        db
          .from("notifications")
          .select("*")
          .eq("recipient_id", profile.id)
          .order("created_at", { ascending: false })
          .limit(60),
        db
          .from("blog_posts")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(80),
        db
          .from("chat_messages")
          .select("*")
          .in("client_id", clientIds)
          .order("created_at", { ascending: true })
      ]);

      if (weightErr) throw weightErr;
      if (reportErr) throw reportErr;
      if (archivedErr) throw archivedErr;
      if (menusErr) throw menusErr;
      if (photosErr) throw photosErr;
      if (checkinsErr) throw checkinsErr;
      if (goalsErr) throw goalsErr;
      if (appointmentsErr) throw appointmentsErr;
      if (foodLogsErr) throw foodLogsErr;
      if (notificationsErr) throw notificationsErr;
      if (blogErr) throw blogErr;
      if (chatErr) throw chatErr;
      weights = weightRows || [];
      reports = reportRows || [];
      archivedRows = archivedData || [];
      menuRows = menusData || [];
      photoRows = photosData || [];
      checkinRows = checkinsData || [];
      goalRows = goalsData || [];
      appointmentRows = appointmentsData || [];
      foodLogRows = foodLogsData || [];
      notificationRows = notificationsData || [];
      blogRows = blogData || [];
      chatRows = chatData || [];
    } else {
      const [
        { data: archivedData, error: archivedErr },
        { data: menusData, error: menusErr },
        { data: photosData, error: photosErr },
        { data: checkinsData, error: checkinsErr },
        { data: goalsData, error: goalsErr },
        { data: appointmentsData, error: appointmentsErr },
        { data: foodLogsData, error: foodLogsErr },
        { data: notificationsData, error: notificationsErr },
        { data: blogData, error: blogErr },
        { data: chatData, error: chatErr }
      ] = await Promise.all([
        db
          .from("archived_clients")
          .select("id,original_client_id,archived_at,profile")
          .order("archived_at", { ascending: false }),
        db
          .from("weekly_menus")
          .select("*")
          .order("week_start", { ascending: false }),
        db
          .from("client_photos")
          .select("*")
          .order("created_at", { ascending: false }),
        db
          .from("weekly_checkins")
          .select("*")
          .order("week_start", { ascending: false }),
        db
          .from("weekly_goals")
          .select("*")
          .order("week_start", { ascending: false }),
        db
          .from("appointments")
          .select("*")
          .order("starts_at", { ascending: true }),
        db
          .from("food_logs")
          .select("*")
          .order("consumed_on", { ascending: false })
          .order("created_at", { ascending: false }),
        db
          .from("notifications")
          .select("*")
          .eq("recipient_id", profile.id)
          .order("created_at", { ascending: false })
          .limit(60),
        db
          .from("blog_posts")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(80),
        db
          .from("chat_messages")
          .select("*")
          .order("created_at", { ascending: true })
      ]);
      if (archivedErr) throw archivedErr;
      if (menusErr) throw menusErr;
      if (photosErr) throw photosErr;
      if (checkinsErr) throw checkinsErr;
      if (goalsErr) throw goalsErr;
      if (appointmentsErr) throw appointmentsErr;
      if (foodLogsErr) throw foodLogsErr;
      if (notificationsErr) throw notificationsErr;
      if (blogErr) throw blogErr;
      if (chatErr) throw chatErr;
      archivedRows = archivedData || [];
      menuRows = menusData || [];
      photoRows = photosData || [];
      checkinRows = checkinsData || [];
      goalRows = goalsData || [];
      appointmentRows = appointmentsData || [];
      foodLogRows = foodLogsData || [];
      notificationRows = notificationsData || [];
      blogRows = blogData || [];
      chatRows = chatData || [];
    }

    const clients = profileRows.map((row) => {
      const clientWeights = weights
        .filter((entry) => entry.user_id === row.id)
        .map((entry) => ({ id: entry.id, date: entry.date, weight: Number(entry.weight) }));

      const clientReports = reports
        .filter((entry) => entry.client_id === row.id)
        .map((entry) => ({
          id: entry.id,
          date: entry.date,
          message: entry.message,
          bilan: entry.bilan
        }));

      const clientMenus = menuRows
        .filter((entry) => entry.client_id === row.id)
        .map(mapWeeklyMenu);
      const clientPhotos = photoRows
        .filter((entry) => entry.client_id === row.id)
        .map(mapClientPhoto);
      const clientCheckins = checkinRows
        .filter((entry) => entry.client_id === row.id)
        .map(mapWeeklyCheckin);
      const clientGoals = goalRows
        .filter((entry) => entry.client_id === row.id)
        .map(mapWeeklyGoals);
      const clientAppointments = appointmentRows
        .filter((entry) => entry.client_id === row.id)
        .map(mapAppointment);
      const clientFoodLogs = foodLogRows
        .filter((entry) => entry.client_id === row.id)
        .map(mapFoodLog);
      const clientChatMessages = chatRows
        .filter((entry) => entry.client_id === row.id)
        .map(mapChatMessage);

      return {
        ...mapProfile(row),
        history: clientWeights,
        reports: clientReports,
        weeklyMenus: clientMenus,
        photos: clientPhotos,
        checkins: clientCheckins,
        goals: clientGoals,
        appointments: clientAppointments,
        foodLogs: clientFoodLogs,
        chatMessages: clientChatMessages
      };
    });

    return {
      profile,
      clients,
      archivedClients: archivedRows.map((row) => ({
        id: row.id,
        originalClientId: row.original_client_id,
        archivedAt: row.archived_at,
        name: row.profile?.name || "Client archive",
        email: row.profile?.email || ""
      })),
      history: [],
      reports: [],
      weeklyMenus: [],
      clientPhotos: [],
      weeklyCheckins: [],
      weeklyGoals: [],
      appointments: appointmentRows.map(mapAppointment),
      foodLogs: [],
      notifications: notificationRows.map(mapNotification),
      subscription: null,
      blogPosts: blogRows.map(mapBlogPost),
      chatMessages: chatRows.map(mapChatMessage)
    };
  }

  const [
    { data: weightRows, error: weightErr },
    { data: reportRows, error: reportErr },
    { data: menuRows, error: menuErr },
    { data: photoRows, error: photoErr },
    { data: checkinRows, error: checkinErr },
    { data: goalRows, error: goalErr },
    { data: appointmentRows, error: appointmentErr },
    { data: foodLogRows, error: foodLogErr },
    { data: subscriptionRow, error: subscriptionErr },
    { data: notificationRows, error: notificationErr },
    { data: blogRows, error: blogErr },
    { data: chatRows, error: chatErr }
  ] = await Promise.all([
    db
      .from("weights")
      .select("id,user_id,date,weight")
      .eq("user_id", profile.id)
      .order("date", { ascending: true }),
    db
      .from("reports")
      .select("*")
      .eq("client_id", profile.id)
      .order("created_at", { ascending: false }),
    db
      .from("weekly_menus")
      .select("*")
      .eq("client_id", profile.id)
      .order("week_start", { ascending: false }),
    db
      .from("client_photos")
      .select("*")
      .eq("client_id", profile.id)
      .order("created_at", { ascending: false }),
    db
      .from("weekly_checkins")
      .select("*")
      .eq("client_id", profile.id)
      .order("week_start", { ascending: false }),
    db
      .from("weekly_goals")
      .select("*")
      .eq("client_id", profile.id)
      .order("week_start", { ascending: false }),
    db
      .from("appointments")
      .select("*")
      .eq("client_id", profile.id)
      .order("starts_at", { ascending: true }),
    db
      .from("food_logs")
      .select("*")
      .eq("client_id", profile.id)
      .order("consumed_on", { ascending: false })
      .order("created_at", { ascending: false }),
    db
      .from("subscriptions")
      .select("*")
      .eq("user_id", profile.id)
      .maybeSingle(),
    db
      .from("notifications")
      .select("*")
      .eq("recipient_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(60),
    db
      .from("blog_posts")
      .select("*")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(40),
    db
      .from("chat_messages")
      .select("*")
      .eq("client_id", profile.id)
      .order("created_at", { ascending: true })
  ]);

  if (weightErr) throw weightErr;
  if (reportErr) throw reportErr;
  if (menuErr) throw menuErr;
  if (photoErr) throw photoErr;
  if (checkinErr) throw checkinErr;
  if (goalErr) throw goalErr;
  if (appointmentErr) throw appointmentErr;
  if (foodLogErr) throw foodLogErr;
  if (subscriptionErr) throw subscriptionErr;
  if (notificationErr) throw notificationErr;
  if (blogErr) throw blogErr;
  if (chatErr) throw chatErr;

  let effectiveSubscriptionRow = subscriptionRow;
  if (effectiveSubscriptionRow && !isSubscriptionActiveStatus(effectiveSubscriptionRow.status)) {
    try {
      await db.functions.invoke("sync-stripe-subscription", { body: {} });
      const { data: refreshed } = await db
        .from("subscriptions")
        .select("*")
        .eq("user_id", profile.id)
        .maybeSingle();
      if (refreshed) effectiveSubscriptionRow = refreshed;
    } catch {
      // Fallback: keep existing local value if sync function is unavailable.
    }
  }

  return {
    profile,
    clients: [],
    archivedClients: [],
    history: (weightRows || []).map((entry) => ({ id: entry.id, date: entry.date, weight: Number(entry.weight) })),
    reports: (reportRows || []).map((entry) => ({
      id: entry.id,
      date: entry.date,
      message: entry.message,
      bilan: entry.bilan
    })),
    weeklyMenus:
      resolveSubscriptionPlan(effectiveSubscriptionRow) === SUBSCRIPTION_PLANS.ESSENTIAL
        ? (menuRows || []).slice(0, 1).map(mapWeeklyMenu)
        : (menuRows || []).map(mapWeeklyMenu),
    clientPhotos: (photoRows || []).map(mapClientPhoto),
    weeklyCheckins: (checkinRows || []).map(mapWeeklyCheckin),
    weeklyGoals: (goalRows || []).map(mapWeeklyGoals),
    appointments: (appointmentRows || []).map(mapAppointment),
    foodLogs: (foodLogRows || []).map(mapFoodLog),
    notifications: (notificationRows || []).map(mapNotification),
    subscription: mapSubscription(effectiveSubscriptionRow),
    blogPosts: (blogRows || []).map(mapBlogPost),
    chatMessages: (chatRows || []).map(mapChatMessage)
  };
}

export async function sendChatMessage({ clientId, message }) {
  const db = requireSupabase();
  const text = String(message || "").trim();
  if (!text) {
    throw new Error("Message vide.");
  }

  const {
    data: { user },
    error: userError
  } = await db.auth.getUser();
  if (userError || !user?.id) {
    throw new Error("Utilisateur non authentifie.");
  }

  const senderId = user.id;
  const { data: senderProfile } = await db
    .from("profiles")
    .select("id,email,role")
    .eq("id", senderId)
    .maybeSingle();
  let ownerCoachId = "";

  // 1) Preferred source: app_config.owner_coach_id
  const { data: ownerConfig, error: ownerError } = await db
    .from("app_config")
    .select("owner_coach_id")
    .eq("id", 1)
    .maybeSingle();
  if (!ownerError) {
    ownerCoachId = String(ownerConfig?.owner_coach_id || "").trim();
  }

  // 2) If sender is coach, use sender as coach_id
  if (!ownerCoachId) {
    if (String(senderProfile?.role || "") === "coach") {
      ownerCoachId = senderId;
    }
  }

  // 3) Fallback by configured owner coach email
  if (!ownerCoachId && OWNER_COACH_EMAIL) {
    const { data: ownerProfile, error: ownerProfileError } = await db
      .from("profiles")
      .select("id")
      .eq("email", OWNER_COACH_EMAIL)
      .eq("role", "coach")
      .maybeSingle();
    if (!ownerProfileError && ownerProfile?.id) {
      ownerCoachId = String(ownerProfile.id);
    }
  }

  // 4) Last fallback: first available coach profile
  if (!ownerCoachId) {
    const { data: anyCoach, error: anyCoachError } = await db
      .from("profiles")
      .select("id")
      .eq("role", "coach")
      .limit(1)
      .maybeSingle();
    if (!anyCoachError && anyCoach?.id) {
      ownerCoachId = String(anyCoach.id);
    }
  }

  // Auto-initialize app_config when a coach is resolved.
  if (ownerCoachId) {
    await db.from("app_config").upsert(
      {
        id: 1,
        owner_coach_id: ownerCoachId,
        updated_at: new Date().toISOString()
      },
      { onConflict: "id" }
    );
  }

  // Final fallback: never block message send because of missing owner config.
  if (!ownerCoachId) {
    ownerCoachId = senderId;
  }

  const payload = {
    client_id: clientId,
    coach_id: ownerCoachId,
    sender_id: senderId,
    message: text
  };

  const { data, error } = await db
    .from("chat_messages")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return mapChatMessage(data);
}

export async function markChatMessagesRead({ clientId }) {
  const db = requireSupabase();
  const {
    data: { user },
    error: userError
  } = await db.auth.getUser();
  if (userError || !user?.id) {
    throw new Error("Utilisateur non authentifie.");
  }

  const { error } = await db
    .from("chat_messages")
    .update({
      read_at: new Date().toISOString()
    })
    .eq("client_id", clientId)
    .is("read_at", null)
    .neq("sender_id", user.id);
  if (error) throw error;
}

export async function deleteChatHistory({ clientId }) {
  const db = requireSupabase();
  const id = String(clientId || "").trim();
  if (!id) {
    throw new Error("Client introuvable.");
  }

  const { error } = await db
    .from("chat_messages")
    .delete()
    .eq("client_id", id);

  if (error) throw error;
}

export async function searchOpenFoodFactsFoods(query) {
  const trimmed = (query || "").trim();
  if (!trimmed) return [];
  const cacheKey = normalizeFoodSearchText(trimmed);
  const cached = foodSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < FOOD_SEARCH_CACHE_TTL_MS) {
    return cached.items;
  }

  const ciqualFallback = searchCiqualFallbackFoods(trimmed);
  const coreIngredients = searchCoreIngredientFoods(trimmed);
  const nearestCache = findNearestCachedFoods(cacheKey);

  const networkPromise = (async () => {
    const tokens = expandFoodQueryTokens(trimmed);
    const [frResults, worldResults] = await Promise.all([
      fetchOpenFoodFactsProducts("https://fr.openfoodfacts.org/cgi/search.pl", trimmed),
      fetchOpenFoodFactsProducts("https://world.openfoodfacts.org/cgi/search.pl", trimmed)
    ]);
    let combinedRaw = [...frResults, ...worldResults];

    // If a multi-word query returns little/no data, retry with the first token then filter fuzzily.
    if (combinedRaw.length < 3 && tokens.length > 1) {
      const tokenSeed = tokens[0];
      const [frTokenResults, worldTokenResults] = await Promise.all([
        fetchOpenFoodFactsProducts("https://fr.openfoodfacts.org/cgi/search.pl", tokenSeed),
        fetchOpenFoodFactsProducts("https://world.openfoodfacts.org/cgi/search.pl", tokenSeed)
      ]);
      combinedRaw = [...combinedRaw, ...frTokenResults, ...worldTokenResults];
    }

    const openFoodResults = [];
    const byName = new Set();
    for (const item of combinedRaw) {
      const key = normalizeFoodSearchText(item.description);
      if (!key || byName.has(key)) continue;
      openFoodResults.push(item);
      byName.add(key);
    }

    const rankedOpenFoodResults = openFoodResults
      .map((item) => {
        const label = normalizeFoodSearchText(item.description);
        const exact = label.includes(normalizeFoodSearchText(trimmed));
        const tokenHits = tokens.reduce((acc, token) => acc + (fuzzyIncludes(label, token) ? 1 : 0), 0);
        const score = (exact ? 100 : 0) + tokenHits * 10 - label.length * 0.001;
        return { item, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item);

    const merged = [...coreIngredients, ...rankedOpenFoodResults];
    const existing = new Set(merged.map((item) => normalizeFoodSearchText(item.description)));
    for (const item of ciqualFallback) {
      const key = normalizeFoodSearchText(item.description);
      if (existing.has(key)) continue;
      merged.push(item);
      existing.add(key);
    }
    const finalItems = merged.slice(0, 16);
    foodSearchCache.set(cacheKey, {
      at: Date.now(),
      items: finalItems
    });
    return finalItems;
  })();

  const quickFallback = (nearestCache.length ? nearestCache : [...coreIngredients, ...ciqualFallback]).slice(0, 16);
  const raced = await Promise.race([networkPromise, sleep(FOOD_SEARCH_FAST_RETURN_MS).then(() => null)]);
  if (Array.isArray(raced) && raced.length > 0) {
    return raced;
  }

  // Keep immediate UX for very short queries only; for specific queries wait for network.
  if (quickFallback.length > 0 && cacheKey.length <= 5) {
    networkPromise.then(() => {}).catch(() => {});
    return quickFallback;
  }

  const networkResults = await networkPromise;
  if (networkResults.length > 0) return networkResults;
  return quickFallback;
}

export const searchUsdaFoods = searchOpenFoodFactsFoods;

export async function getOpenFoodFactsFoodByBarcode(barcode) {
  const value = (barcode || "").trim();
  if (!value) return null;
  const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(value)}.json`, {
    headers: {
      Accept: "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`Open Food Facts: erreur ${response.status} lors de la lecture du code-barres.`);
  }
  const payload = await response.json();
  if (payload?.status !== 1 || !payload?.product) {
    return null;
  }
  return mapOpenFoodFactsProduct({
    ...payload.product,
    code: payload.product.code || value
  });
}

export async function submitOpenFoodFactsImages({ barcode, frontImage, nutritionImage, ingredientsImage }) {
  const code = (barcode || "").trim();
  if (!code) {
    throw new Error("Code-barres requis pour envoyer les photos a Open Food Facts.");
  }
  if (!OFF_USER_ID || !OFF_PASSWORD) {
    return {
      skipped: true,
      reason: "REACT_APP_OFF_USER_ID/REACT_APP_OFF_PASSWORD manquants"
    };
  }

  const uploads = [
    { field: "front", file: frontImage },
    { field: "nutrition", file: nutritionImage },
    { field: "ingredients", file: ingredientsImage }
  ].filter((entry) => entry.file);

  const uploaded = [];
  for (const upload of uploads) {
    const formData = new FormData();
    formData.append("code", code);
    formData.append("user_id", OFF_USER_ID);
    formData.append("password", OFF_PASSWORD);
    formData.append("imagefield", upload.field);
    formData.append(`imgupload_${upload.field}`, upload.file, upload.file.name || `${upload.field}.jpg`);

    const response = await fetch("https://world.openfoodfacts.org/cgi/product_image_upload.pl", {
      method: "POST",
      body: formData
    });
    if (!response.ok) {
      throw new Error(`Open Food Facts: echec upload photo (${upload.field})`);
    }
    uploaded.push(upload.field);
  }

  return {
    skipped: false,
    uploaded
  };
}

export async function addFoodLogEntry({
  clientId,
  consumedOn,
  fdcId,
  foodName,
  brandName,
  quantityG,
  caloriesPer100g,
  proteinPer100g,
  carbsPer100g,
  fatPer100g,
  notes
}) {
  const db = requireSupabase();
  const grams = Number(quantityG || 0);
  if (!grams || grams <= 0) {
    throw new Error("La quantite doit etre superieure a 0g.");
  }

  const cals100 = Number(caloriesPer100g || 0);
  const prot100 = Number(proteinPer100g || 0);
  const carbs100 = Number(carbsPer100g || 0);
  const fat100 = Number(fatPer100g || 0);
  const factor = grams / 100;

  const calories = Number((cals100 * factor).toFixed(2));
  const protein = Number((prot100 * factor).toFixed(2));
  const carbs = Number((carbs100 * factor).toFixed(2));
  const fat = Number((fat100 * factor).toFixed(2));

  const { data, error } = await db
    .from("food_logs")
    .insert({
      client_id: clientId,
      consumed_on: consumedOn,
      fdc_id: fdcId || null,
      food_name: foodName || "",
      brand_name: brandName || "",
      quantity_g: grams,
      calories_per_100g: cals100,
      protein_per_100g: prot100,
      carbs_per_100g: carbs100,
      fat_per_100g: fat100,
      calories,
      protein,
      carbs,
      fat,
      notes: notes || "",
      updated_at: new Date().toISOString()
    })
    .select("*")
    .single();

  if (error) throw error;

  await safeNotify(async () => {
    await db.rpc("notify_owner_coach", {
      p_type: "food_log",
      p_title: "Nouveau journal alimentaire",
      p_body: `${foodName || "Un aliment"} ajoute pour ${consumedOn}.`,
      p_client_id: clientId
    });
  });

  return mapFoodLog(data);
}

export async function deleteFoodLogEntry(entryId) {
  const db = requireSupabase();
  const { error } = await db
    .from("food_logs")
    .delete()
    .eq("id", entryId);
  if (error) throw error;
}

export async function updateMyProfile(userId, updates) {
  const db = requireSupabase();
  const parseOptionalNumber = (value) => {
    if (value === "" || value === null || typeof value === "undefined") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const payload = {
    name: updates.name,
    age: Number(updates.age),
    sex: updates.sex,
    height: Number(updates.height),
    weight: Number(updates.weight),
    waist_cm: parseOptionalNumber(updates.waistCm),
    hip_cm: parseOptionalNumber(updates.hipCm),
    chest_cm: parseOptionalNumber(updates.chestCm),
    arm_cm: parseOptionalNumber(updates.armCm),
    thigh_cm: parseOptionalNumber(updates.thighCm),
    goal: updates.goal,
    updated_at: new Date().toISOString()
  };

  if (typeof updates.nap !== "undefined") {
    payload.nap = Number(updates.nap);
  }
  if (typeof updates.bmrMethod !== "undefined") {
    payload.bmr_method = updates.bmrMethod;
  }

  const { error } = await db.from("profiles").update(payload).eq("id", userId);
  if (error) throw error;
}

export async function archiveAndDeleteClient(clientId) {
  const db = requireSupabase();
  const { error } = await db.rpc("archive_and_delete_client", {
    p_client_id: clientId
  });
  if (error) throw error;
}

export async function saveWeeklyMenu({ coachId, clientId, weekStart, notes, plan }) {
  const db = requireSupabase();
  const { error } = await db.from("weekly_menus").upsert(
    {
      coach_id: coachId,
      client_id: clientId,
      week_start: weekStart,
      notes: notes || "",
      plan,
      updated_at: new Date().toISOString()
    },
    { onConflict: "client_id,week_start" }
  );
  if (error) throw error;

  const { error: cleanupError } = await db
    .from("weekly_menus")
    .delete()
    .eq("client_id", clientId)
    .lt("week_start", currentWeekStartISO());
  if (cleanupError) throw cleanupError;

  await safeNotify(async () => {
    await db.rpc("notify_client", {
      p_client_id: clientId,
      p_type: "menu",
      p_title: "Nouveau menu hebdomadaire",
      p_body: `Ton menu de la semaine du ${weekStart} est disponible.`
    });
  });
}

export async function uploadClientPhoto({ clientId, file, caption }) {
  const db = requireSupabase();

  if (!file) {
    throw new Error("Aucun fichier selectionne.");
  }

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const safeExt = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
  const filePath = `${clientId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`;

  const { error: uploadError } = await db.storage.from(PHOTO_BUCKET).upload(filePath, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "image/jpeg"
  });

  if (uploadError) throw uploadError;

  const {
    data: { publicUrl }
  } = db.storage.from(PHOTO_BUCKET).getPublicUrl(filePath);

  const { error: insertError } = await db.from("client_photos").insert({
    client_id: clientId,
    uploader_id: clientId,
    image_path: filePath,
    image_url: publicUrl,
    caption: caption || ""
  });

  if (insertError) throw insertError;

  await safeNotify(async () => {
    await db.rpc("notify_owner_coach", {
      p_type: "photo",
      p_title: "Nouvelle photo client",
      p_body: caption || "Le client a envoye une nouvelle photo.",
      p_client_id: clientId
    });
  });
}

export async function saveWeeklyCheckin({
  clientId,
  weekStart,
  energy,
  hunger,
  sleep,
  stress,
  adherence,
  notes
}) {
  const db = requireSupabase();
  const values = [energy, hunger, sleep, stress, adherence].map((value) => Number(value));
  const score = Number((values.reduce((acc, current) => acc + current, 0) / values.length).toFixed(2));

  const { error } = await db.from("weekly_checkins").upsert(
    {
      client_id: clientId,
      week_start: weekStart,
      energy: values[0],
      hunger: values[1],
      sleep: values[2],
      stress: values[3],
      adherence: values[4],
      score,
      notes: notes || "",
      updated_at: new Date().toISOString()
    },
    { onConflict: "client_id,week_start" }
  );

  if (error) throw error;

  await safeNotify(async () => {
    await db.rpc("notify_owner_coach", {
      p_type: "checkin",
      p_title: "Nouveau check-in hebdomadaire",
      p_body: `Semaine du ${weekStart} - score ${score}/10`,
      p_client_id: clientId
    });
  });
}

export async function saveWeeklyGoals({ coachId, clientId, weekStart, goals }) {
  const db = requireSupabase();
  const safeGoals = Array.isArray(goals) ? goals.slice(0, 6) : [];

  const { error } = await db.from("weekly_goals").upsert(
    {
      coach_id: coachId,
      client_id: clientId,
      week_start: weekStart,
      goals: safeGoals,
      updated_at: new Date().toISOString()
    },
    { onConflict: "client_id,week_start" }
  );

  if (error) throw error;

  await safeNotify(async () => {
    await db.rpc("notify_client", {
      p_client_id: clientId,
      p_type: "goals",
      p_title: "Objectifs hebdo mis a jour",
      p_body: `Tes objectifs de la semaine du ${weekStart} sont disponibles.`
    });
  });
}

export async function updateWeeklyGoalsProgress({ clientId, weekStart, goals }) {
  const db = requireSupabase();
  const { error } = await db
    .from("weekly_goals")
    .update({
      goals: Array.isArray(goals) ? goals : [],
      updated_at: new Date().toISOString()
    })
    .eq("client_id", clientId)
    .eq("week_start", weekStart);

  if (error) throw error;

  await safeNotify(async () => {
    await db.rpc("notify_owner_coach", {
      p_type: "goals_progress",
      p_title: "Progression des objectifs",
      p_body: `Le client a mis a jour ses objectifs (${weekStart}).`,
      p_client_id: clientId
    });
  });
}

export async function createDailySnapshots() {
  const db = requireSupabase();
  const { error } = await db.rpc("create_daily_snapshots");
  if (error) throw error;
}

export async function listBusyAppointmentSlots(fromIso) {
  const db = requireSupabase();
  const from = fromIso || new Date().toISOString();
  const { data, error } = await db.rpc("list_busy_appointment_slots", {
    p_from: from
  });
  if (error) throw error;
  return (data || []).map((row) => ({
    startsAt: row.starts_at,
    endsAt: row.ends_at
  }));
}

async function createGoogleMeetLink(db, { startsAt, endsAt, notes }) {
  const response = await db.functions.invoke("create-google-meet", {
    body: {
      start: startsAt,
      end: endsAt,
      summary: "Rendez-vous visio Nutri Cloud",
      description: notes || "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris"
    }
  });

  if (response.error) throw response.error;
  const meetData = response.data || null;
  if (!meetData?.meetUrl) {
    throw new Error("Lien Google Meet non genere.");
  }
  return meetData;
}

export async function bookMyAppointment({ clientId, startsAt, endsAt, notes }) {
  const db = requireSupabase();
  if (!isWithinCoachAvailability(startsAt, endsAt)) {
    throw new Error("Creneau hors disponibilites coach (lun, mar, jeu, ven, sam de 09:30 a 20:00).");
  }
  const weekStart = appointmentWeekStart(startsAt);
  const activeStatuses = ["requested", "confirmed"];

  const { data: subscriptionRow, error: subscriptionError } = await db
    .from("subscriptions")
    .select("status,plan_code,stripe_price_id")
    .eq("user_id", clientId)
    .maybeSingle();
  if (subscriptionError) throw subscriptionError;

  const subscriptionStatus = String(subscriptionRow?.status || "inactive").toLowerCase();
  if (!["active", "trialing", "past_due"].includes(subscriptionStatus)) {
    throw new Error("Un abonnement actif est requis pour reserver un rendez-vous.");
  }

  const planCode = resolveSubscriptionPlan(subscriptionRow);
  const maxMonthlyAppointments = getMonthlyAppointmentLimit(planCode);
  const monthBounds = getMonthBoundsISO(startsAt);
  const { count: usedMonthlyAppointments, error: usageError } = await db
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .in("status", activeStatuses)
    .gte("starts_at", monthBounds.start)
    .lt("starts_at", monthBounds.end);

  if (usageError) throw usageError;
  if (Number(usedMonthlyAppointments || 0) >= maxMonthlyAppointments) {
    throw new Error(
      planCode === SUBSCRIPTION_PLANS.PREMIUM
        ? "Limite atteinte: 4 rendez-vous ce mois-ci pour l'abonnement Premium."
        : "Limite atteinte: 1 rendez-vous ce mois-ci pour l'abonnement Essentiel."
    );
  }

  const { data, error } = await db
    .from("appointments")
    .insert({
      client_id: clientId,
      week_start: weekStart,
      starts_at: startsAt,
      ends_at: endsAt,
      status: "requested",
      notes: notes || "",
      updated_at: new Date().toISOString()
    })
    .select("*")
    .single();

  if (error) throw normalizeAppointmentBookingError(error);
  const rollbackAppointment = async () => {
    await db.from("appointments").delete().eq("id", data.id);
  };

  let meetData = null;
  try {
    meetData = await createGoogleMeetLink(db, { startsAt, endsAt, notes });
  } catch (errorMeet) {
    await rollbackAppointment();
    throw new Error(
      `Reservation impossible: creation du lien Google Meet echouee (${errorMeet?.message || "erreur inconnue"}).`
    );
  }

  const { data: updatedRow, error: updateError } = await db
    .from("appointments")
    .update({
      meet_url: meetData.meetUrl,
      google_event_id: meetData.eventId || null,
      status: "confirmed",
      updated_at: new Date().toISOString()
    })
    .eq("id", data.id)
    .select("*")
    .single();

  if (updateError || !updatedRow) {
    await rollbackAppointment();
    throw new Error("Reservation impossible: validation du rendez-vous echouee.");
  }

  await safeNotify(async () => {
    await db.rpc("notify_owner_coach", {
      p_type: "appointment",
      p_title: "Nouveau rendez-vous visio",
      p_body: `Rendez-vous confirme le ${new Date(startsAt).toLocaleString("fr-FR")}.\nLien Meet: ${meetData.meetUrl}`,
      p_client_id: clientId
    });
  });

  await safeNotify(async () => {
    await db.rpc("notify_client", {
      p_client_id: clientId,
      p_type: "appointment",
      p_title: "Rendez-vous confirme",
      p_body: `Ton rendez-vous est confirme.\nLien Meet: ${meetData.meetUrl}`
    });
  });

  return mapAppointment(updatedRow);
}

export async function rescheduleMyAppointment({ appointmentId, clientId, startsAt, endsAt, notes }) {
  const db = requireSupabase();
  if (!appointmentId) throw new Error("Rendez-vous introuvable.");
  if (!isWithinCoachAvailability(startsAt, endsAt)) {
    throw new Error("Creneau hors disponibilites coach (lun, mar, jeu, ven, sam de 09:30 a 20:00).");
  }

  const { data: current, error: currentError } = await db
    .from("appointments")
    .select("id,client_id,status")
    .eq("id", appointmentId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current || current.client_id !== clientId) {
    throw new Error("Rendez-vous introuvable.");
  }
  if (String(current.status || "").toLowerCase() === "cancelled") {
    throw new Error("Ce rendez-vous est annule.");
  }

  const activeStatuses = ["requested", "confirmed"];
  const { data: subscriptionRow, error: subscriptionError } = await db
    .from("subscriptions")
    .select("status,plan_code,stripe_price_id")
    .eq("user_id", clientId)
    .maybeSingle();
  if (subscriptionError) throw subscriptionError;

  const subscriptionStatus = String(subscriptionRow?.status || "inactive").toLowerCase();
  if (!["active", "trialing", "past_due"].includes(subscriptionStatus)) {
    throw new Error("Un abonnement actif est requis pour replanifier un rendez-vous.");
  }

  const planCode = resolveSubscriptionPlan(subscriptionRow);
  const maxMonthlyAppointments = getMonthlyAppointmentLimit(planCode);
  const monthBounds = getMonthBoundsISO(startsAt);
  const { count: usedMonthlyAppointments, error: usageError } = await db
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .in("status", activeStatuses)
    .neq("id", appointmentId)
    .gte("starts_at", monthBounds.start)
    .lt("starts_at", monthBounds.end);
  if (usageError) throw usageError;
  if (Number(usedMonthlyAppointments || 0) >= maxMonthlyAppointments) {
    throw new Error(
      planCode === SUBSCRIPTION_PLANS.PREMIUM
        ? "Limite atteinte: 4 rendez-vous ce mois-ci pour l'abonnement Premium."
        : "Limite atteinte: 1 rendez-vous ce mois-ci pour l'abonnement Essentiel."
    );
  }

  const meetData = await createGoogleMeetLink(db, { startsAt, endsAt, notes });
  const weekStart = appointmentWeekStart(startsAt);
  const { data, error } = await db
    .from("appointments")
    .update({
      week_start: weekStart,
      starts_at: startsAt,
      ends_at: endsAt,
      status: "confirmed",
      notes: notes || "",
      meet_url: meetData.meetUrl,
      google_event_id: meetData.eventId || null,
      updated_at: new Date().toISOString()
    })
    .eq("id", appointmentId)
    .eq("client_id", clientId)
    .select("*")
    .single();

  if (error) throw normalizeAppointmentBookingError(error);

  await safeNotify(async () => {
    await db.rpc("notify_owner_coach", {
      p_type: "appointment",
      p_title: "Rendez-vous replanifie",
      p_body: `Nouveau creneau: ${new Date(startsAt).toLocaleString("fr-FR")}.\nLien Meet: ${meetData.meetUrl}`,
      p_client_id: clientId
    });
  });

  await safeNotify(async () => {
    await db.rpc("notify_client", {
      p_client_id: clientId,
      p_type: "appointment",
      p_title: "Rendez-vous replanifie",
      p_body: `Ton rendez-vous est confirme.\nLien Meet: ${meetData.meetUrl}`
    });
  });

  return mapAppointment(data);
}

export async function updateAppointmentByCoach({
  appointmentId,
  startsAt,
  endsAt,
  status,
  meetUrl,
  notes
}) {
  const db = requireSupabase();
  if (startsAt && endsAt && !isWithinCoachAvailability(startsAt, endsAt)) {
    throw new Error("Creneau hors disponibilites coach (lun, mar, jeu, ven, sam de 09:30 a 20:00).");
  }

  const { data: current, error: currentError } = await db
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) throw new Error("Rendez-vous introuvable.");

  const payload = {
    updated_at: new Date().toISOString()
  };
  if (startsAt) payload.starts_at = startsAt;
  if (endsAt) payload.ends_at = endsAt;
  if (status) payload.status = status;
  if (typeof meetUrl !== "undefined") payload.meet_url = meetUrl || null;
  if (typeof notes !== "undefined") payload.notes = notes;

  const startsToUse = startsAt || current.starts_at;
  const endsToUse = endsAt || current.ends_at;
  const statusToUse = status || current.status;
  const notesToUse = typeof notes !== "undefined" ? notes : current.notes || "";
  const timeChanged = Boolean(startsAt || endsAt);
  const shouldGenerateMeet =
    statusToUse === "confirmed" &&
    (timeChanged || (!meetUrl && !current.meet_url));
  if (shouldGenerateMeet) {
    const meetData = await createGoogleMeetLink(db, {
      startsAt: startsToUse,
      endsAt: endsToUse,
      notes: notesToUse
    });
    payload.meet_url = meetData.meetUrl;
    payload.google_event_id = meetData.eventId || null;
  }

  const { data, error } = await db
    .from("appointments")
    .update(payload)
    .eq("id", appointmentId)
    .select("*")
    .single();

  if (error) throw normalizeAppointmentBookingError(error);

  await safeNotify(async () => {
    await db.rpc("notify_client", {
      p_client_id: data.client_id,
      p_type: "appointment",
      p_title: "Mise a jour de ton rendez-vous visio",
      p_body:
        data.status === "confirmed"
          ? `Ton rendez-vous est confirme.${data.meet_url ? `\nLien Meet: ${data.meet_url}` : ""}`
          : "Ton rendez-vous a ete modifie."
    });
  });

  return mapAppointment(data);
}

export async function cancelAppointment({ appointmentId }) {
  const db = requireSupabase();
  const { data, error } = await db
    .from("appointments")
    .delete()
    .eq("id", appointmentId)
    .select("*")
    .single();

  if (error) throw error;

  await safeNotify(async () => {
    await db.rpc("notify_owner_coach", {
      p_type: "appointment",
      p_title: "Rendez-vous supprime",
      p_body: `Rendez-vous semaine ${data.week_start} supprime.`,
      p_client_id: data.client_id
    });
  });

  await safeNotify(async () => {
    await db.rpc("notify_client", {
      p_client_id: data.client_id,
      p_type: "appointment",
      p_title: "Rendez-vous supprime",
      p_body: `Rendez-vous semaine ${data.week_start} supprime.`
    });
  });

  return mapAppointment(data);
}

export async function restoreArchivedClient(archiveId) {
  const db = requireSupabase();
  const { error } = await db.rpc("restore_archived_client", { p_archive_id: archiveId });
  if (error) throw error;
}

export async function addWeightEntry(userId, { date, weight }) {
  const db = requireSupabase();
  const parsedWeight = Number(weight);

  const [{ error: insertErr }, { error: updateErr }] = await Promise.all([
    db.from("weights").insert({ user_id: userId, date, weight: parsedWeight }),
    db
      .from("profiles")
      .update({ weight: parsedWeight, updated_at: new Date().toISOString() })
      .eq("id", userId)
  ]);

  if (insertErr) throw insertErr;
  if (updateErr) throw updateErr;
}

export async function updateClientPlan(clientId, updates) {
  const db = requireSupabase();
  const payload = {
    updated_at: new Date().toISOString()
  };

  if (typeof updates.deficit !== "undefined") payload.deficit = Number(updates.deficit);
  if (typeof updates.coachMessage !== "undefined") payload.coach_message = updates.coachMessage;
  if (typeof updates.nap !== "undefined") payload.nap = Number(updates.nap);
  if (typeof updates.bmrMethod !== "undefined") payload.bmr_method = updates.bmrMethod;

  const { error } = await db.from("profiles").update(payload).eq("id", clientId);
  if (error) throw error;
}

export async function createClientReport({ coachId, clientId, date, message, bilan }) {
  const db = requireSupabase();
  const { error } = await db.from("reports").insert({
    coach_id: coachId,
    client_id: clientId,
    date,
    message,
    bilan
  });

  if (error) throw error;

  await safeNotify(async () => {
    await db.rpc("notify_client", {
      p_client_id: clientId,
      p_type: "report",
      p_title: "Nouveau bilan disponible",
      p_body: `Un bilan du ${date} vient d'etre publie.`
    });
  });
}

export async function markNotificationRead(notificationId) {
  const db = requireSupabase();
  const { error } = await db
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId);

  if (error) throw error;
}

export async function deleteNotification(notificationId) {
  const db = requireSupabase();
  const { error } = await db
    .from("notifications")
    .delete()
    .eq("id", notificationId);

  if (error) throw error;
}

export async function deleteClientPhoto(photoId) {
  const db = requireSupabase();
  const { data: photo, error: readError } = await db
    .from("client_photos")
    .select("id,image_path")
    .eq("id", photoId)
    .maybeSingle();

  if (readError) throw readError;
  if (!photo) return;

  if (photo.image_path) {
    const { error: storageError } = await db.storage
      .from(PHOTO_BUCKET)
      .remove([photo.image_path]);
    if (storageError) {
      // Continue deleting DB row even if storage object is already missing.
    }
  }

  const { error: deleteError } = await db
    .from("client_photos")
    .delete()
    .eq("id", photoId);

  if (deleteError) throw deleteError;
}

export async function createStripeCheckout(planCode = SUBSCRIPTION_PLANS.ESSENTIAL) {
  const db = requireSupabase();
  const normalizedPlan = normalizePlanCode(planCode);
  const priceId = getPriceIdForPlan(normalizedPlan);
  const successUrl = withQueryParams(STRIPE_SUCCESS_URL, {
    checkout: "success",
    source: "subscription",
    target: "suivi"
  });
  const cancelUrl = withQueryParams(STRIPE_CANCEL_URL, {
    checkout: "cancel",
    source: "subscription"
  });

  const { data, error } = await db.functions.invoke("create-stripe-checkout", {
    body: {
      planCode: normalizedPlan,
      priceId,
      successUrl,
      cancelUrl
    }
  });

  if (error) throw error;
  if (!data?.url) {
    throw new Error("Impossible de creer la session Stripe.");
  }

  return data.url;
}

export async function createStripePortal() {
  const db = requireSupabase();

  const { data, error } = await db.functions.invoke("create-stripe-portal", {
    body: {
      returnUrl: SITE_URL
    }
  });

  if (error) throw error;
  if (!data?.url) {
    throw new Error("Impossible d'ouvrir le portail Stripe.");
  }

  return data.url;
}

export async function syncStripeSubscription() {
  const db = requireSupabase();
  const { error } = await db.functions.invoke("sync-stripe-subscription", { body: {} });
  if (error) throw error;
}

export async function saveBlogPost({
  id,
  title,
  slug,
  excerpt,
  content,
  category,
  readMinutes,
  isPublished,
  coverImageUrl
}) {
  const db = requireSupabase();
  const payload = {
    title: (title || "").trim(),
    slug: (slug || "").trim(),
    excerpt: excerpt || "",
    content: content || "",
    category: category || "Astuces",
    read_minutes: Number(readMinutes || 4),
    is_published: Boolean(isPublished),
    cover_image_url: coverImageUrl || "",
    published_at: Boolean(isPublished) ? new Date().toISOString() : null,
    updated_at: new Date().toISOString()
  };

  if (!payload.title || !payload.slug) {
    throw new Error("Titre et slug requis.");
  }

  if (id) {
    const { data, error } = await db
      .from("blog_posts")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return mapBlogPost(data);
  }

  const { data, error } = await db
    .from("blog_posts")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return mapBlogPost(data);
}

export async function deleteBlogPost(postId) {
  const db = requireSupabase();
  const { error } = await db
    .from("blog_posts")
    .delete()
    .eq("id", postId);
  if (error) throw error;
}

export async function uploadBlogCover(file) {
  const db = requireSupabase();
  if (!file) {
    throw new Error("Aucune image selectionnee.");
  }

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const safeExt = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
  const filePath = `${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`;

  const { error: uploadError } = await db.storage
    .from(BLOG_COVER_BUCKET)
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "image/jpeg"
    });

  if (uploadError) {
    throw new Error(
      uploadError.message || "Impossible d'uploader l'image. Verifie le bucket blog-covers et ses policies."
    );
  }

  const { data } = db.storage.from(BLOG_COVER_BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}
