import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

// Auto-detect which env var holds the URL vs the anon key,
// since users sometimes enter them in the wrong fields.
const a = process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "";
const b = process.env["EXPO_PUBLIC_SUPABASE_ANON_KEY"] ?? "";

const supabaseUrl = a.startsWith("https://") ? a : b;
const supabaseAnonKey = a.startsWith("https://") ? b : a;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
