import * as Linking from 'expo-linking';
import type { SupabaseClient } from '@supabase/supabase-js';

export const AUTH_CALLBACK_PATH = 'auth/callback';

export function getEmailConfirmationRedirectTo(): string {
  return Linking.createURL(AUTH_CALLBACK_PATH);
}

export function isAuthCallbackDeepLink(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes(AUTH_CALLBACK_PATH);
}

export async function handleAuthCallbackDeepLink(
  client: SupabaseClient,
  url: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isAuthCallbackDeepLink(url)) {
    return { ok: false };
  }

  try {
    const qStart = url.indexOf('?');
    const hStart = url.indexOf('#');
    const querySlice =
      qStart >= 0
        ? url.slice(
            qStart + 1,
            hStart >= 0 && hStart > qStart ? hStart : undefined
          )
        : '';
    const queryParams = new URLSearchParams(querySlice);
    const err = queryParams.get('error');
    const errDesc = queryParams.get('error_description');
    if (err) {
      return { ok: false, error: errDesc || err };
    }

    const code = queryParams.get('code');
    if (code) {
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }

    if (hStart >= 0) {
      const hash = url.slice(hStart + 1);
      const frag = new URLSearchParams(hash);
      const access_token = frag.get('access_token');
      const refresh_token = frag.get('refresh_token');
      const ferr = frag.get('error');
      const ferrDesc = frag.get('error_description');
      if (ferr) {
        return { ok: false, error: ferrDesc || ferr };
      }
      if (access_token && refresh_token) {
        const { error } = await client.auth.setSession({ access_token, refresh_token });
        if (error) return { ok: false, error: error.message };
        return { ok: true };
      }
    }

    return { ok: false, error: 'Could not complete sign-in from this link.' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, error: msg };
  }
}
