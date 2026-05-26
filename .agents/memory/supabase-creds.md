---
name: Supabase Credential Swap
description: The two Supabase env vars are stored under swapped names; lib/supabase.ts compensates
---

## Rule
`EXPO_PUBLIC_SUPABASE_URL` actually contains the **anon key**.
`EXPO_PUBLIC_SUPABASE_ANON_KEY` actually contains the **Supabase URL**.

## Fix in place
`artifacts/mobile/lib/supabase.ts` auto-detects which variable holds which value by checking
which one starts with `https://` — that one is used as the URL, the other as the key.

**Why:** The env vars were set up with swapped names and cannot easily be renamed without breaking the running app.

**How to apply:** Never read these env vars directly; always go through `lib/supabase.ts`. If creating a new Supabase client anywhere, replicate the detection logic or import from `lib/supabase.ts`.
