/**
 * Invoke a Supabase Edge Function with auth (Bearer + access_token in body).
 * Use this instead of supabase.functions.invoke() so the token is always sent (fixes RN/Expo 401s).
 */
import { supabase } from '@/lib/supabase/client';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

export type InvokeResult<T = unknown> =
  | { data: T; error: null; status: number }
  | { data: null; error: string; status: number };

export async function invokeEdgeFunction<T = unknown>(
  functionName: string,
  body: Record<string, unknown>
): Promise<InvokeResult<T>> {
  if (!supabaseUrl) {
    return { data: null, error: 'App configuration error.', status: 0 };
  }

  await supabase.auth.refreshSession();
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  const url = `${supabaseUrl}/functions/v1/${functionName}`;
  const payload = accessToken ? { ...body, access_token: accessToken } : body;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const message = (data as { error?: string })?.error ?? (res.status === 401 ? 'Session expired.' : 'Request failed.');
      return { data: null, error: message, status: res.status };
    }

    return { data: data as T, error: null, status: res.status };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Network error.';
    return { data: null, error: message, status: 0 };
  }
}
