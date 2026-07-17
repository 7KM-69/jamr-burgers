/**
 * The two PUBLIC Supabase env vars.
 *
 * These are safe in the browser. The anon key is public *by design* — Row Level
 * Security is what protects the data, not the secrecy of this key.
 *
 * The service-role key is NOT here, and must never be. It bypasses every RLS
 * policy. No module in this codebase reads it.
 *
 * Note the literal `process.env.NEXT_PUBLIC_*` member access below: Next inlines
 * these at build time only when written literally. `process.env[name]` with a
 * computed key silently yields `undefined` in the browser bundle.
 */

function required(value: string | undefined, name: string): string {
  if (!value) {
    // Fail loudly at module load rather than producing a Supabase client pointed
    // at `undefined`, which surfaces later as an inscrutable fetch error.
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const SUPABASE_URL = required(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  'NEXT_PUBLIC_SUPABASE_URL',
);

export const SUPABASE_ANON_KEY = required(
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
);
