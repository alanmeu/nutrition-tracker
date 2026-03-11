import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://cruvdmlzzsrcfofepqns.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_8y-6v6ujYqVqyvip3S6b9A_aprp-ssk";
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.REACT_APP_SUPABASE_URL ||
  DEFAULT_SUPABASE_URL;
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.REACT_APP_SUPABASE_ANON_KEY ||
  DEFAULT_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    })
  : null;

export const OWNER_COACH_EMAIL = (process.env.EXPO_PUBLIC_OWNER_COACH_EMAIL || "").trim().toLowerCase();
