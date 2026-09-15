import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js"

import { sanitizeNextPath } from "~/lib/auth-path"

let supabaseBrowserClient: SupabaseClient | null = null

function getSupabaseBrowserClient() {
  if (typeof window === "undefined") {
    throw new Error("Supabase browser auth is only available in the browser.")
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase browser auth is not configured.")
  }

  if (!supabaseBrowserClient) {
    supabaseBrowserClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        flowType: "pkce",
        // PKCE needs the code verifier to survive the OAuth redirect round-trip.
        // auth-js only uses real (localStorage) storage when persistSession is
        // true; with it false the verifier lives in memory and is wiped by the
        // full-page redirect. We persist, then clear the local session right
        // after the code exchange so the browser stays effectively stateless.
        persistSession: true,
      },
    })
  }

  return supabaseBrowserClient
}

export async function startGoogleSignIn(nextPath?: string) {
  const callbackURL = new URL("/auth/callback", window.location.origin)
  const safeNextPath = sanitizeNextPath(nextPath)

  if (safeNextPath !== "/app") {
    callbackURL.searchParams.set("next", safeNextPath)
  }

  const { error } = await getSupabaseBrowserClient().auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackURL.toString(),
    },
  })

  if (error) {
    throw error
  }
}

export async function resolveOAuthSessionFromCallback(): Promise<Session> {
  const supabaseClient = getSupabaseBrowserClient()
  const callbackURL = new URL(window.location.href)
  const authCode = callbackURL.searchParams.get("code")?.trim()

  if (authCode) {
    const { data, error } =
      await supabaseClient.auth.exchangeCodeForSession(authCode)

    if (error) {
      throw error
    }

    if (!data.session) {
      throw new Error("Supabase OAuth did not return a session.")
    }

    const oauthSession = data.session
    // Do not auth.signOut(). scope=local still POSTs /logout and revokes the
    // GoTrue session we are about to copy onto the Revserp cookie.
    clearSupabaseBrowserStorage()
    return oauthSession
  }

  const { data, error } = await supabaseClient.auth.getSession()

  if (error) {
    throw error
  }

  if (!data.session) {
    throw new Error("No Supabase session is available.")
  }

  return data.session
}

export async function clearSupabaseBrowserSession() {
  clearSupabaseBrowserStorage()
}

function clearSupabaseBrowserStorage() {
  if (typeof window === "undefined") {
    return
  }

  const storage = window.localStorage
  for (let index = storage.length - 1; index >= 0; index--) {
    const key = storage.key(index)
    if (key?.startsWith("sb-")) {
      storage.removeItem(key)
    }
  }
}
