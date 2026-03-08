import type { Session, User } from "@supabase/supabase-js";
import { OWNER_COACH_EMAIL, supabase } from "./supabase";
import type {
  Appointment,
  BlogPost,
  ClientPhoto,
  FoodLog,
  FoodSearchItem,
  NotificationItem,
  Profile,
  ReportEntry,
  Subscription,
  WeeklyCheckin,
  WeeklyGoals,
  WeeklyMenu,
  WeightEntry
} from "../types/models";
import { mondayOf } from "./nutrition";

const FOOD_SEARCH_TIMEOUT_MS = 1400;
const STRIPE_PRICE_ID_ESSENTIAL = (
  process.env.EXPO_PUBLIC_STRIPE_PRICE_ID_ESSENTIAL || process.env.EXPO_PUBLIC_STRIPE_PRICE_ID || ""
).trim();
const STRIPE_PRICE_ID_PREMIUM = (process.env.EXPO_PUBLIC_STRIPE_PRICE_ID_PREMIUM || "").trim();
const STRIPE_SUCCESS_URL = process.env.EXPO_PUBLIC_STRIPE_SUCCESS_URL || "https://example.com";
const STRIPE_CANCEL_URL = process.env.EXPO_PUBLIC_STRIPE_CANCEL_URL || "https://example.com";
const BLOG_COVER_BUCKET = "blog-covers";
const SUBSCRIPTION_PLANS = {
  ESSENTIAL: "essential",
  PREMIUM: "premium"
} as const;

const CORE_FOODS: FoodSearchItem[] = [
  { fdcId: null, description: "Poulet, blanc, cuit", brandName: "Base FR", caloriesPer100g: 165, proteinPer100g: 31, carbsPer100g: 0, fatPer100g: 3.6, source: "base" },
  { fdcId: null, description: "Riz blanc, cuit", brandName: "Base FR", caloriesPer100g: 130, proteinPer100g: 2.4, carbsPer100g: 28.2, fatPer100g: 0.3, source: "base" },
  { fdcId: null, description: "Patate douce, cuite", brandName: "Base FR", caloriesPer100g: 90, proteinPer100g: 2, carbsPer100g: 20.7, fatPer100g: 0.1, source: "base" },
  { fdcId: null, description: "Pomme de terre, cuite", brandName: "Base FR", caloriesPer100g: 86, proteinPer100g: 2, carbsPer100g: 18.1, fatPer100g: 0.1, source: "base" },
  { fdcId: null, description: "Tomate, crue", brandName: "Base FR", caloriesPer100g: 18, proteinPer100g: 0.9, carbsPer100g: 2.5, fatPer100g: 0.2, source: "base" },
  { fdcId: null, description: "Banane, crue", brandName: "Base FR", caloriesPer100g: 89, proteinPer100g: 1.1, carbsPer100g: 20.5, fatPer100g: 0.2, source: "base" },
  { fdcId: null, description: "Oeuf entier, cuit", brandName: "Base FR", caloriesPer100g: 155, proteinPer100g: 13, carbsPer100g: 1.1, fatPer100g: 11, source: "base" },
  { fdcId: null, description: "Thon, naturel", brandName: "Base FR", caloriesPer100g: 116, proteinPer100g: 26, carbsPer100g: 0, fatPer100g: 1, source: "base" },
  { fdcId: null, description: "Yaourt nature", brandName: "Base FR", caloriesPer100g: 62, proteinPer100g: 4.3, carbsPer100g: 4.7, fatPer100g: 3.2, source: "base" }
];

function requireDb() {
  if (!supabase) {
    throw new Error("Supabase non configure. Ajoute EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return supabase;
}

function normalizeText(value: string) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function mapProfile(row: any): Profile {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    name: row.name || "",
    age: row.age || 30,
    sex: row.sex || "male",
    height: row.height || 170,
    weight: row.weight || 70,
    goal: row.goal || "",
    nap: Number(row.nap || 1.4),
    bmrMethod: row.bmr_method || "mifflin",
    deficit: Number(row.deficit || 20),
    coachMessage: row.coach_message || ""
  };
}

function mapAppointment(row: any): Appointment {
  const rawMeetUrl = (row.meet_url || "").trim();
  const meetUrl = rawMeetUrl
    ? /^https?:\/\//i.test(rawMeetUrl)
      ? rawMeetUrl
      : `https://${rawMeetUrl}`
    : "";
  return {
    id: row.id,
    clientId: row.client_id,
    coachId: row.coach_id,
    weekStart: row.week_start,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status === "accepted" ? "confirmed" : row.status || "requested",
    meetUrl,
    notes: row.notes || ""
  };
}

function normalizeMeetUrl(value?: string) {
  const raw = (value || "").trim();
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function normalizePlanCode(value?: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === SUBSCRIPTION_PLANS.PREMIUM) return SUBSCRIPTION_PLANS.PREMIUM;
  return SUBSCRIPTION_PLANS.ESSENTIAL;
}

function resolveSubscriptionPlan(row: any) {
  const explicitPlan = normalizePlanCode(row?.plan_code);
  if (row?.plan_code) return explicitPlan;
  const priceId = String(row?.stripe_price_id || "").trim();
  if (priceId && STRIPE_PRICE_ID_PREMIUM && priceId === STRIPE_PRICE_ID_PREMIUM) {
    return SUBSCRIPTION_PLANS.PREMIUM;
  }
  return SUBSCRIPTION_PLANS.ESSENTIAL;
}

function getPriceIdForPlan(planCode?: string) {
  const normalized = normalizePlanCode(planCode);
  if (normalized === SUBSCRIPTION_PLANS.PREMIUM) {
    return STRIPE_PRICE_ID_PREMIUM || STRIPE_PRICE_ID_ESSENTIAL;
  }
  if (!STRIPE_PRICE_ID_ESSENTIAL) throw new Error("EXPO_PUBLIC_STRIPE_PRICE_ID_ESSENTIAL manquant.");
  return STRIPE_PRICE_ID_ESSENTIAL;
}

function getMonthlyAppointmentLimit(planCode?: string) {
  return normalizePlanCode(planCode) === SUBSCRIPTION_PLANS.PREMIUM ? 4 : 1;
}

function getMonthBoundsISO(startsAtIso: string) {
  const date = new Date(startsAtIso);
  if (Number.isNaN(date.getTime())) throw new Error("Date de rendez-vous invalide.");
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0));
  return { start: start.toISOString(), end: end.toISOString() };
}

function isSubscriptionActiveStatus(status?: string) {
  return ["active", "trialing", "past_due"].includes(String(status || "").toLowerCase());
}

function mapFoodLog(row: any): FoodLog {
  return {
    id: row.id,
    clientId: row.client_id,
    consumedOn: row.consumed_on,
    foodName: row.food_name,
    brandName: row.brand_name || "",
    quantityG: Number(row.quantity_g || 0),
    calories: Number(row.calories || 0),
    protein: Number(row.protein || 0),
    carbs: Number(row.carbs || 0),
    fat: Number(row.fat || 0),
    caloriesPer100g: Number(row.calories_per_100g || 0),
    proteinPer100g: Number(row.protein_per_100g || 0),
    carbsPer100g: Number(row.carbs_per_100g || 0),
    fatPer100g: Number(row.fat_per_100g || 0),
    createdAt: row.created_at
  };
}

function mapWeeklyMenu(row: any): WeeklyMenu {
  return {
    id: row.id,
    clientId: row.client_id,
    coachId: row.coach_id,
    weekStart: row.week_start,
    notes: row.notes || "",
    plan: row.plan || {}
  };
}

function mapBlogPost(row: any): BlogPost {
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
    publishedAt: row.published_at || null
  };
}

function mapWeight(row: any): WeightEntry {
  return {
    id: row.id,
    date: row.date,
    weight: Number(row.weight || 0),
    createdAt: row.created_at || null
  };
}

function mapReport(row: any): ReportEntry {
  return {
    id: row.id,
    date: row.date,
    message: row.message || "",
    bilan: row.bilan || {}
  };
}

function mapCheckin(row: any): WeeklyCheckin {
  return {
    id: row.id,
    weekStart: row.week_start,
    energy: Number(row.energy || 0),
    hunger: Number(row.hunger || 0),
    sleep: Number(row.sleep || 0),
    stress: Number(row.stress || 0),
    adherence: Number(row.adherence || 0),
    score: Number(row.score || 0),
    notes: row.notes || "",
    updatedAt: row.updated_at || null
  };
}

function mapGoals(row: any): WeeklyGoals {
  return {
    id: row.id,
    weekStart: row.week_start,
    goals: Array.isArray(row.goals) ? row.goals : []
  };
}

function mapNotification(row: any): NotificationItem {
  return {
    id: row.id,
    title: row.title || "",
    body: row.body || "",
    type: row.type || "info",
    readAt: row.read_at || null,
    createdAt: row.created_at
  };
}

function mapSubscription(row: any): Subscription | null {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status || "inactive",
    planCode: resolveSubscriptionPlan(row),
    stripePriceId: row.stripe_price_id || "",
    stripeCustomerId: row.stripe_customer_id || "",
    stripeSubscriptionId: row.stripe_subscription_id || "",
    currentPeriodEnd: row.current_period_end || null,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end)
  };
}

function mapClientPhoto(row: any): ClientPhoto {
  return {
    id: row.id,
    clientId: row.client_id,
    imageUrl: row.image_url,
    caption: row.caption || "",
    createdAt: row.created_at
  };
}

export async function getSession() {
  const db = requireDb();
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthStateChange(listener: (session: Session | null) => void) {
  const db = requireDb();
  return db.auth.onAuthStateChange((_event, session) => listener(session));
}

export async function signIn(email: string, password: string) {
  const db = requireDb();
  const { error } = await db.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

export async function signUp(name: string, email: string, password: string, requestedRole: "client" | "coach") {
  const db = requireDb();
  const normalizedEmail = email.trim().toLowerCase();
  const role = requestedRole === "coach" && normalizedEmail === OWNER_COACH_EMAIL ? "coach" : "client";

  const { data, error } = await db.auth.signUp({
    email: normalizedEmail,
    password,
    options: { data: { name, role } }
  });
  if (error) throw error;
  if (data.user && data.session) await ensureProfile(data.user);
}

export async function signOut() {
  const db = requireDb();
  const { error } = await db.auth.signOut();
  if (error) throw error;
}

export async function ensureProfile(user: User): Promise<Profile> {
  const db = requireDb();
  const { data: existing, error: readError } = await db.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (readError) throw readError;
  if (existing) return mapProfile(existing);

  const role = user.user_metadata?.role === "coach" && user.email?.toLowerCase() === OWNER_COACH_EMAIL ? "coach" : "client";
  const payload = {
    id: user.id,
    email: user.email || "",
    role,
    name: user.user_metadata?.name || "",
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
  const { data, error } = await db.from("profiles").upsert(payload, { onConflict: "id" }).select("*").single();
  if (error) throw error;
  return mapProfile(data);
}

export async function getMyProfile(user: User) {
  const db = requireDb();
  const { data, error } = await db.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw error;
  if (!data) return ensureProfile(user);
  return mapProfile(data);
}

export async function updateMyProfile(userId: string, updates: Partial<Profile>) {
  const db = requireDb();
  const payload: any = {
    name: updates.name,
    age: updates.age,
    sex: updates.sex,
    height: updates.height,
    weight: updates.weight,
    goal: updates.goal,
    nap: updates.nap,
    bmr_method: updates.bmrMethod,
    deficit: updates.deficit,
    coach_message: updates.coachMessage
  };
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
  const { error } = await db.from("profiles").update(payload).eq("id", userId);
  if (error) throw error;
}

export async function listMyFoodLogs(clientId: string) {
  const db = requireDb();
  const { data, error } = await db
    .from("food_logs")
    .select("*")
    .eq("client_id", clientId)
    .order("consumed_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data || []).map(mapFoodLog);
}

export async function addFoodLogEntry(clientId: string, consumedOn: string, item: FoodSearchItem, quantityG: number, notes = "") {
  const db = requireDb();
  const ratio = quantityG / 100;
  const payload = {
    client_id: clientId,
    consumed_on: consumedOn,
    fdc_id: item.fdcId,
    food_name: item.description,
    brand_name: item.brandName,
    quantity_g: quantityG,
    calories_per_100g: item.caloriesPer100g,
    protein_per_100g: item.proteinPer100g,
    carbs_per_100g: item.carbsPer100g,
    fat_per_100g: item.fatPer100g,
    calories: Number((item.caloriesPer100g * ratio).toFixed(1)),
    protein: Number((item.proteinPer100g * ratio).toFixed(1)),
    carbs: Number((item.carbsPer100g * ratio).toFixed(1)),
    fat: Number((item.fatPer100g * ratio).toFixed(1)),
    notes
  };
  const { error } = await db.from("food_logs").insert(payload);
  if (error) throw error;
}

export async function deleteFoodLogEntry(entryId: string) {
  const db = requireDb();
  const { error } = await db.from("food_logs").delete().eq("id", entryId);
  if (error) throw error;
}

function mapOffProduct(product: any): FoodSearchItem {
  const nutriments = product?.nutriments || {};
  const kcal = Number(nutriments["energy-kcal_100g"] || nutriments["energy-kcal"] || 0);
  const protein = Number(nutriments["proteins_100g"] || nutriments["proteins"] || 0);
  const carbs = Number(nutriments["carbohydrates_100g"] || nutriments["carbohydrates"] || 0);
  const fat = Number(nutriments["fat_100g"] || nutriments["fat"] || 0);
  return {
    fdcId: Number(product.code) || null,
    description: product.product_name || product.generic_name_fr || product.generic_name || "Aliment",
    brandName: product.brands || "",
    caloriesPer100g: Number(kcal.toFixed(2)),
    proteinPer100g: Number(protein.toFixed(2)),
    carbsPer100g: Number(carbs.toFixed(2)),
    fatPer100g: Number(fat.toFixed(2)),
    source: "open_food_facts"
  };
}

async function fetchOpenFoodFactsProducts(baseUrl: string, query: string): Promise<FoodSearchItem[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FOOD_SEARCH_TIMEOUT_MS);
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("search_terms", query);
    url.searchParams.set("search_simple", "1");
    url.searchParams.set("action", "process");
    url.searchParams.set("json", "1");
    url.searchParams.set("page_size", "12");
    url.searchParams.set("fields", "code,product_name,generic_name,generic_name_fr,brands,nutriments");

    const response = await fetch(url.toString(), { signal: controller.signal });
    if (!response.ok) return [];
    const payload = await response.json();
    const products = Array.isArray(payload?.products) ? payload.products : [];
    return products.map(mapOffProduct);
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function searchFoods(query: string): Promise<FoodSearchItem[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const needle = normalizeText(trimmed);
  const local = CORE_FOODS.filter((item) => normalizeText(item.description).includes(needle));
  const [fr, world] = await Promise.all([
    fetchOpenFoodFactsProducts("https://fr.openfoodfacts.org/cgi/search.pl", trimmed),
    fetchOpenFoodFactsProducts("https://world.openfoodfacts.org/cgi/search.pl", trimmed)
  ]);

  const seen = new Set<string>();
  const all = [...local, ...fr, ...world].filter((item) => {
    const key = normalizeText(item.description);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return all.slice(0, 20);
}

export async function getFoodByBarcode(barcode: string): Promise<FoodSearchItem | null> {
  const code = barcode.replace(/[^\d]/g, "").trim();
  if (!code) return null;
  const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);
  if (!response.ok) return null;
  const payload = await response.json();
  if (payload?.status !== 1 || !payload?.product) return null;
  return mapOffProduct({ ...payload.product, code });
}

function weekStartISO(dateIso: string) {
  const date = new Date(dateIso);
  const monday = mondayOf(date);
  return monday.toISOString().slice(0, 10);
}

function currentWeekStartISO() {
  return weekStartISO(new Date().toISOString());
}

function isWithinCoachAvailability(startsAtIso: string, endsAtIso: string) {
  const start = new Date(startsAtIso);
  const end = new Date(endsAtIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return false;
  const day = start.getDay();
  const allowedDays = new Set([1, 2, 4, 5, 6]); // lun, mar, jeu, ven, sam
  if (!allowedDays.has(day)) return false;
  if (start.getDay() !== end.getDay()) return false;
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  return startMinutes >= 9 * 60 + 30 && endMinutes <= 20 * 60;
}

function normalizeBookingError(error: any) {
  const message = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  if (error?.code === "23505" && (message.includes("appointments_slot_unique") || message.includes("starts_at"))) {
    return new Error("Ce creneau est deja reserve. Choisis un autre horaire.");
  }
  if (error?.code === "23505" && message.includes("client_id") && message.includes("week_start")) {
    return new Error("Reservation refusee: limite de rendez-vous atteinte pour cette periode.");
  }
  return error;
}

export async function listMyAppointments(clientId: string) {
  const db = requireDb();
  const { data, error } = await db.from("appointments").select("*").eq("client_id", clientId).order("starts_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(mapAppointment);
}

export async function listBusyAppointmentSlots() {
  const db = requireDb();
  const from = new Date().toISOString();
  const { data, error } = await db.rpc("list_busy_appointment_slots", { p_from: from });
  if (!error && Array.isArray(data)) {
    return data.map((row: any) => ({
      starts_at: row.starts_at,
      ends_at: row.ends_at
    }));
  }

  const { data: fallback, error: fallbackError } = await db
    .from("appointments")
    .select("starts_at, ends_at, status")
    .in("status", ["requested", "confirmed"])
    .order("starts_at", { ascending: true });
  if (fallbackError) throw fallbackError;
  return fallback || [];
}

export async function bookAppointment(clientId: string, startsAtIso: string, endsAtIso: string, notes = "") {
  const db = requireDb();
  if (!isWithinCoachAvailability(startsAtIso, endsAtIso)) {
    throw new Error("Creneau hors disponibilites coach (lun, mar, jeu, ven, sam de 09:30 a 20:00).");
  }
  const weekStart = weekStartISO(startsAtIso);
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
  const monthBounds = getMonthBoundsISO(startsAtIso);
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

  const payload = {
    client_id: clientId,
    starts_at: startsAtIso,
    ends_at: endsAtIso,
    week_start: weekStart,
    status: "requested",
    notes,
    updated_at: new Date().toISOString()
  };
  const { data, error } = await db.from("appointments").insert(payload).select("*").single();
  if (error) throw normalizeBookingError(error);

  let meetUrl = "https://meet.google.com/new";
  let googleEventId: string | null = null;
  try {
    const { data: meetData, error: meetError } = await db.functions.invoke("create-google-meet", {
      body: {
        start: startsAtIso,
        end: endsAtIso,
        summary: "Rendez-vous visio Nutri Cloud",
        description: notes || "",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris"
      }
    });
    if (!meetError && meetData?.meetUrl) {
      meetUrl = normalizeMeetUrl(meetData.meetUrl) || meetUrl;
      googleEventId = meetData.eventId || null;
    }
  } catch {
    // Fallback keeps an immediately usable Meet entry point.
  }

  const { data: updated, error: updateError } = await db
    .from("appointments")
    .update({
      meet_url: meetUrl,
      google_event_id: googleEventId,
      status: "confirmed",
      updated_at: new Date().toISOString()
    })
    .eq("id", data.id)
    .select("*")
    .single();
  if (updateError) throw updateError;
  return mapAppointment(updated);
}

export async function cancelAppointment(appointmentId: string) {
  const db = requireDb();
  const { error } = await db.from("appointments").delete().eq("id", appointmentId);
  if (error) throw error;
}

export async function deleteAppointment(appointmentId: string) {
  const db = requireDb();
  const { error } = await db.from("appointments").delete().eq("id", appointmentId);
  if (error) throw error;
}

export async function updateAppointmentByCoach(payload: {
  appointmentId: string;
  startsAt?: string;
  endsAt?: string;
  status?: string;
  meetUrl?: string;
  notes?: string;
}) {
  const db = requireDb();
  if (payload.startsAt && payload.endsAt && !isWithinCoachAvailability(payload.startsAt, payload.endsAt)) {
    throw new Error("Creneau hors disponibilites coach (lun, mar, jeu, ven, sam de 09:30 a 20:00).");
  }
  const patch: any = {
    updated_at: new Date().toISOString()
  };
  if (payload.startsAt) patch.starts_at = payload.startsAt;
  if (payload.endsAt) patch.ends_at = payload.endsAt;
  if (payload.status) patch.status = payload.status;
  if (typeof payload.meetUrl !== "undefined") patch.meet_url = normalizeMeetUrl(payload.meetUrl);
  if (typeof payload.notes !== "undefined") patch.notes = payload.notes;

  const { data, error } = await db
    .from("appointments")
    .update(patch)
    .eq("id", payload.appointmentId)
    .select("*")
    .single();
  if (error) throw error;
  return mapAppointment(data);
}

export async function listCoachClients() {
  const db = requireDb();
  const { data, error } = await db.from("profiles").select("*").eq("role", "client").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapProfile);
}

export async function loadCoachClientsWithData(coachId: string) {
  const db = requireDb();
  const { data: profileRows, error: profileErr } = await db
    .from("profiles")
    .select("*")
    .eq("role", "client")
    .order("name", { ascending: true });
  if (profileErr) throw profileErr;

  const clientIds = (profileRows || []).map((row: any) => row.id);
  let weightRows: any[] = [];
  let reportRows: any[] = [];
  let menuRows: any[] = [];
  let photoRows: any[] = [];
  let checkinRows: any[] = [];
  let goalRows: any[] = [];
  let appointmentRows: any[] = [];
  let notificationRows: any[] = [];
  let archivedRows: any[] = [];

  const queries: any[] = [
    db
      .from("notifications")
      .select("*")
      .eq("recipient_id", coachId)
      .order("created_at", { ascending: false })
      .limit(60),
    db
      .from("archived_clients")
      .select("id,original_client_id,archived_at,profile")
      .order("archived_at", { ascending: false })
  ];

  if (clientIds.length > 0) {
    queries.push(
      db.from("weights").select("*").in("user_id", clientIds).order("date", { ascending: false }).order("created_at", { ascending: false }),
      db.from("reports").select("*").in("client_id", clientIds).order("created_at", { ascending: false }),
      db.from("weekly_menus").select("*").in("client_id", clientIds).order("week_start", { ascending: false }),
      db.from("client_photos").select("*").in("client_id", clientIds).order("created_at", { ascending: false }),
      db.from("weekly_checkins").select("*").in("client_id", clientIds).order("updated_at", { ascending: false }).order("week_start", { ascending: false }),
      db.from("weekly_goals").select("*").in("client_id", clientIds).order("week_start", { ascending: false }),
      db.from("appointments").select("*").in("client_id", clientIds).order("starts_at", { ascending: true })
    );
  }

  const results = await Promise.all(queries);
  const notifRes = results[0];
  const archivedRes = results[1];
  if (notifRes.error) throw notifRes.error;
  if (archivedRes.error) throw archivedRes.error;
  notificationRows = notifRes.data || [];
  archivedRows = archivedRes.data || [];

  if (clientIds.length > 0) {
    const [w, r, m, p, c, g, a] = results.slice(2);
    if (w.error) throw w.error;
    if (r.error) throw r.error;
    if (m.error) throw m.error;
    if (p.error) throw p.error;
    if (c.error) throw c.error;
    if (g.error) throw g.error;
    if (a.error) throw a.error;
    weightRows = w.data || [];
    reportRows = r.data || [];
    menuRows = m.data || [];
    photoRows = p.data || [];
    checkinRows = c.data || [];
    goalRows = g.data || [];
    appointmentRows = a.data || [];
  }

  const clients = (profileRows || []).map((row: any) => ({
    ...mapProfile(row),
    history: weightRows.filter((x) => x.user_id === row.id).map(mapWeight),
    reports: reportRows.filter((x) => x.client_id === row.id).map(mapReport),
    weeklyMenus: menuRows.filter((x) => x.client_id === row.id).map(mapWeeklyMenu),
    photos: photoRows.filter((x) => x.client_id === row.id).map(mapClientPhoto),
    checkins: checkinRows.filter((x) => x.client_id === row.id).map(mapCheckin),
    goals: goalRows.filter((x) => x.client_id === row.id).map(mapGoals),
    appointments: appointmentRows.filter((x) => x.client_id === row.id).map(mapAppointment)
  }));

  return {
    clients,
    archivedClients: archivedRows || [],
    notifications: notificationRows.map(mapNotification)
  };
}

export async function listClientFoodLogsForCoach(clientId: string) {
  return listMyFoodLogs(clientId);
}

export async function listClientAppointmentsForCoach(clientId: string) {
  const db = requireDb();
  const { data, error } = await db.from("appointments").select("*").eq("client_id", clientId).order("starts_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(mapAppointment);
}

export async function listClientWeeklyCheckinsForCoach(clientId: string) {
  return listMyWeeklyCheckins(clientId);
}

export async function listMyWeeklyMenus(clientId: string) {
  const db = requireDb();
  const { data, error } = await db
    .from("weekly_menus")
    .select("*")
    .eq("client_id", clientId)
    .gte("week_start", currentWeekStartISO())
    .order("week_start", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapWeeklyMenu);
}

export async function saveWeeklyMenuByCoach(coachId: string, clientId: string, weekStart: string, notes: string, plan: any) {
  const db = requireDb();
  const { error } = await db.from("weekly_menus").upsert(
    {
      coach_id: coachId,
      client_id: clientId,
      week_start: weekStart,
      notes,
      plan
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
}

export async function listPublishedBlogPosts() {
  const db = requireDb();
  const { data, error } = await db.from("blog_posts").select("*").eq("is_published", true).order("published_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapBlogPost);
}

export async function listAllBlogPostsForCoach() {
  const db = requireDb();
  const { data, error } = await db.from("blog_posts").select("*").order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapBlogPost);
}

export async function saveBlogPostByCoach(payload: Partial<BlogPost> & { title: string; content: string }) {
  const db = requireDb();
  const row = {
    id: payload.id,
    title: payload.title,
    slug: payload.slug || payload.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    excerpt: payload.excerpt || "",
    content: payload.content,
    cover_image_url: payload.coverImageUrl || "",
    category: payload.category || "Astuces",
    read_minutes: payload.readMinutes || 4,
    is_published: Boolean(payload.isPublished),
    published_at: payload.isPublished ? new Date().toISOString() : null
  };

  const { data, error } = await db.from("blog_posts").upsert(row).select("*").single();
  if (error) throw error;
  return mapBlogPost(data);
}

export async function deleteBlogPostByCoach(postId: string) {
  const db = requireDb();
  const { error } = await db.from("blog_posts").delete().eq("id", postId);
  if (error) throw error;
}

export async function uploadBlogCoverByCoach(imageUri: string) {
  const db = requireDb();
  if (!imageUri) throw new Error("Aucune image selectionnee.");

  const response = await fetch(imageUri);
  const blob = await response.blob();
  const filePath = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

  const { error: uploadError } = await db.storage.from(BLOG_COVER_BUCKET).upload(filePath, blob, {
    cacheControl: "3600",
    upsert: false,
    contentType: "image/jpeg"
  });
  if (uploadError) {
    throw new Error(uploadError.message || "Impossible d'uploader l'image de couverture.");
  }

  const { data: urlData } = db.storage.from(BLOG_COVER_BUCKET).getPublicUrl(filePath);
  return urlData.publicUrl;
}

export async function listMyWeights(userId: string) {
  const db = requireDb();
  const { data, error } = await db.from("weights").select("*").eq("user_id", userId).order("date", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapWeight);
}

export async function addWeightEntry(userId: string, date: string, weight: number) {
  const db = requireDb();
  const w = Number(weight);
  const [{ error: insertErr }, { error: updateErr }] = await Promise.all([
    db.from("weights").insert({ user_id: userId, date, weight: w }),
    db.from("profiles").update({ weight: w, updated_at: new Date().toISOString() }).eq("id", userId)
  ]);
  if (insertErr) throw insertErr;
  if (updateErr) throw updateErr;
}

export async function deleteWeightEntry(userId: string, weightEntryId: string) {
  const db = requireDb();
  const { data: deletedRows, error: deleteErr } = await db
    .from("weights")
    .delete()
    .eq("id", weightEntryId)
    .eq("user_id", userId)
    .select("id");
  if (deleteErr) throw deleteErr;
  if (!deletedRows || deletedRows.length === 0) {
    throw new Error("Suppression non autorisee ou entree introuvable.");
  }

  const { data: latestRows, error: latestErr } = await db
    .from("weights")
    .select("weight,date")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(1);
  if (latestErr) throw latestErr;

  const latest = latestRows?.[0];
  if (latest?.weight) {
    const { error: profileErr } = await db
      .from("profiles")
      .update({ weight: Number(latest.weight), updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (profileErr) throw profileErr;
  }
}

export async function listMyReports(clientId: string) {
  const db = requireDb();
  const { data, error } = await db.from("reports").select("*").eq("client_id", clientId).order("date", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapReport);
}

export async function deleteClientReport(reportId: string) {
  const db = requireDb();
  const { error } = await db.from("reports").delete().eq("id", reportId);
  if (error) throw error;
}

export async function listMyWeeklyCheckins(clientId: string) {
  const db = requireDb();
  const { data, error } = await db
    .from("weekly_checkins")
    .select("*")
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false })
    .order("week_start", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapCheckin);
}

export async function saveWeeklyCheckin(clientId: string, payload: { weekStart: string; energy: number; hunger: number; sleep: number; stress: number; adherence: number; notes: string }) {
  const db = requireDb();
  const values = [payload.energy, payload.hunger, payload.sleep, payload.stress, payload.adherence].map((x) => Number(x));
  const score = Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2));
  const { error } = await db.from("weekly_checkins").upsert(
    {
      client_id: clientId,
      week_start: payload.weekStart,
      energy: values[0],
      hunger: values[1],
      sleep: values[2],
      stress: values[3],
      adherence: values[4],
      score,
      notes: payload.notes || "",
      updated_at: new Date().toISOString()
    },
    { onConflict: "client_id,week_start" }
  );
  if (error) throw error;
}

export async function deleteWeeklyCheckin(clientId: string, checkinId: string) {
  const db = requireDb();
  const { error } = await db
    .from("weekly_checkins")
    .delete()
    .eq("id", checkinId)
    .eq("client_id", clientId);
  if (error) throw error;
}

export async function listMyWeeklyGoals(clientId: string) {
  const db = requireDb();
  const { data, error } = await db.from("weekly_goals").select("*").eq("client_id", clientId).order("week_start", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapGoals);
}

export async function updateWeeklyGoalsProgress(clientId: string, weekStart: string, goals: any[]) {
  const db = requireDb();
  const { error } = await db
    .from("weekly_goals")
    .update({ goals: Array.isArray(goals) ? goals : [], updated_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .eq("week_start", weekStart);
  if (error) throw error;
}

export async function saveWeeklyGoalsByCoach(coachId: string, clientId: string, weekStart: string, goals: any[]) {
  const db = requireDb();
  const { error } = await db
    .from("weekly_goals")
    .upsert(
      {
        coach_id: coachId,
        client_id: clientId,
        week_start: weekStart,
        goals: Array.isArray(goals) ? goals : [],
        updated_at: new Date().toISOString()
      },
      { onConflict: "client_id,week_start" }
    );
  if (error) throw error;
}

export async function listMyNotifications(userId: string) {
  const db = requireDb();
  const { data, error } = await db.from("notifications").select("*").eq("recipient_id", userId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapNotification);
}

export async function markNotificationRead(notificationId: string) {
  const db = requireDb();
  const { error } = await db.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", notificationId);
  if (error) throw error;
}

export async function deleteNotification(notificationId: string) {
  const db = requireDb();
  const { error } = await db.from("notifications").delete().eq("id", notificationId);
  if (error) throw error;
}

export async function listMySubscription(userId: string) {
  const db = requireDb();
  let { data, error } = await db.from("subscriptions").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (data && !isSubscriptionActiveStatus(data.status)) {
    try {
      await db.functions.invoke("sync-stripe-subscription", { body: {} });
      const refreshed = await db.from("subscriptions").select("*").eq("user_id", userId).maybeSingle();
      if (!refreshed.error && refreshed.data) {
        data = refreshed.data;
      }
    } catch {
      // Keep fallback data if sync endpoint is unavailable.
    }
  }
  return mapSubscription(data);
}

export async function syncStripeSubscription() {
  const db = requireDb();
  const { error } = await db.functions.invoke("sync-stripe-subscription", { body: {} });
  if (error) throw error;
}

export async function createStripeCheckout(
  planCode: "essential" | "premium" = SUBSCRIPTION_PLANS.ESSENTIAL,
  options?: { successUrl?: string; cancelUrl?: string }
) {
  const db = requireDb();
  const normalizedPlan = normalizePlanCode(planCode);
  const priceId = getPriceIdForPlan(normalizedPlan);
  const successUrl = options?.successUrl || STRIPE_SUCCESS_URL;
  const cancelUrl = options?.cancelUrl || STRIPE_CANCEL_URL;
  const { data, error } = await db.functions.invoke("create-stripe-checkout", {
    body: {
      planCode: normalizedPlan,
      priceId,
      successUrl,
      cancelUrl
    }
  });
  if (error) throw error;
  if (!data?.url) throw new Error("Impossible de creer la session Stripe.");
  return data.url as string;
}

export async function createStripePortal(returnUrl?: string) {
  const db = requireDb();
  const { data, error } = await db.functions.invoke("create-stripe-portal", {
    body: {
      returnUrl: returnUrl || STRIPE_SUCCESS_URL
    }
  });
  if (error) throw error;
  if (!data?.url) throw new Error("Impossible d'ouvrir le portail Stripe.");
  return data.url as string;
}

export async function listMyPhotos(clientId: string) {
  const db = requireDb();
  const { data, error } = await db.from("client_photos").select("*").eq("client_id", clientId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapClientPhoto);
}

export async function uploadClientPhoto(clientId: string, imageUri: string, caption: string) {
  const db = requireDb();
  const response = await fetch(imageUri);
  const blob = await response.blob();
  const ext = "jpg";
  const filePath = `${clientId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: uploadError } = await db.storage.from("client-photos").upload(filePath, blob, {
    cacheControl: "3600",
    upsert: false,
    contentType: "image/jpeg"
  });
  if (uploadError) throw uploadError;

  const { data: urlData } = db.storage.from("client-photos").getPublicUrl(filePath);
  const { error: insertError } = await db.from("client_photos").insert({
    client_id: clientId,
    uploader_id: clientId,
    image_path: filePath,
    image_url: urlData.publicUrl,
    caption: caption || ""
  });
  if (insertError) throw insertError;
}

export async function deleteClientPhoto(photoId: string) {
  const db = requireDb();
  const { data: photo, error: readError } = await db.from("client_photos").select("id,image_path").eq("id", photoId).maybeSingle();
  if (readError) throw readError;
  if (!photo) return;
  if (photo.image_path) await db.storage.from("client-photos").remove([photo.image_path]);
  const { error } = await db.from("client_photos").delete().eq("id", photoId);
  if (error) throw error;
}

export async function updateClientPlan(clientId: string, updates: { deficit?: number; coachMessage?: string; nap?: number; bmrMethod?: string }) {
  const db = requireDb();
  const payload: any = { updated_at: new Date().toISOString() };
  if (typeof updates.deficit !== "undefined") payload.deficit = Number(updates.deficit);
  if (typeof updates.coachMessage !== "undefined") payload.coach_message = updates.coachMessage;
  if (typeof updates.nap !== "undefined") payload.nap = Number(updates.nap);
  if (typeof updates.bmrMethod !== "undefined") payload.bmr_method = updates.bmrMethod;
  const { error } = await db.from("profiles").update(payload).eq("id", clientId);
  if (error) throw error;
}

export async function createClientReport(coachId: string, clientId: string, date: string, message: string, bilan: any) {
  const db = requireDb();
  const { error } = await db.from("reports").insert({
    coach_id: coachId,
    client_id: clientId,
    date,
    message,
    bilan
  });
  if (error) throw error;
}

export async function archiveAndDeleteClient(clientId: string) {
  const db = requireDb();
  const { error } = await db.rpc("archive_and_delete_client", { p_client_id: clientId });
  if (error) throw error;
}

export async function restoreArchivedClient(archiveId: string) {
  const db = requireDb();
  const { error } = await db.rpc("restore_archived_client", { p_archive_id: archiveId });
  if (error) throw error;
}

export async function listArchivedClients() {
  const db = requireDb();
  const { data, error } = await db.from("archived_clients").select("id,original_client_id,archived_at,profile").order("archived_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
