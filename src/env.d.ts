/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Adresse du projet Supabase dédié au blackjack (ex. https://abcd.supabase.co). */
  readonly VITE_SUPABASE_URL?: string;
  /** Clé publique (publishable / anon) du même projet : elle peut être publique. */
  readonly VITE_SUPABASE_KEY?: string;
}
