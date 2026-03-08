export type Role = "client" | "coach";

export interface Profile {
  id: string;
  email: string;
  role: Role;
  name: string;
  age: number;
  sex: "male" | "female";
  height: number;
  weight: number;
  goal: string;
  nap: number;
  bmrMethod: "mifflin" | "harris";
  deficit: number;
  coachMessage: string;
}

export interface Appointment {
  id: string;
  clientId: string;
  coachId: string | null;
  weekStart: string;
  startsAt: string;
  endsAt: string;
  status: string;
  meetUrl: string;
  notes: string;
}

export interface FoodLog {
  id: string;
  clientId: string;
  consumedOn: string;
  foodName: string;
  brandName: string;
  quantityG: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  createdAt: string;
}

export interface FoodSearchItem {
  fdcId: number | null;
  description: string;
  brandName: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  source: string;
}

export interface WeeklyMenu {
  id: string;
  clientId: string;
  coachId: string;
  weekStart: string;
  notes: string;
  plan: any;
}

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImageUrl: string;
  category: string;
  readMinutes: number;
  isPublished: boolean;
  publishedAt: string | null;
}

export interface WeightEntry {
  id: string;
  date: string;
  weight: number;
  createdAt?: string;
}

export interface ReportEntry {
  id: string;
  date: string;
  message: string;
  bilan: any;
}

export interface WeeklyCheckin {
  id: string;
  weekStart: string;
  energy: number;
  hunger: number;
  sleep: number;
  stress: number;
  adherence: number;
  score: number;
  notes: string;
  updatedAt?: string;
}

export interface WeeklyGoals {
  id: string;
  weekStart: string;
  goals: Array<{ title?: string; done?: boolean; [key: string]: any }>;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: string;
  readAt: string | null;
  createdAt: string;
}

export interface Subscription {
  id: string;
  userId: string;
  status: string;
  planCode?: "essential" | "premium";
  stripePriceId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface ClientPhoto {
  id: string;
  clientId: string;
  imageUrl: string;
  caption: string;
  createdAt: string;
}
