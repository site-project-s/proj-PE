import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Cliente do Supabase, ou null se o .env.local não foi configurado (o site funciona só com os dados da coleta). */
export const supabase: SupabaseClient | null = url && chave ? createClient(url, chave) : null;
