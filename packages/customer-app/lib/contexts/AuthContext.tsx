import { Session, User } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { resetPassword, signIn, SignInData, signUp, SignUpData, signOut as supabaseSignOut } from '../supabase/auth';
import { supabase } from '../supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  signIn: (data: SignInData) => Promise<void>;
  signUp: (data: SignUpData) => Promise<{ user: User | null; session: Session | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function isRefreshTokenError(err: unknown): boolean {
  const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : '';
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '';
  return name === 'AuthApiError' && (msg.includes('Refresh Token') || msg.includes('refresh_token'));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const clearSessionRef = useRef(() => {
    setSession(null);
    setUser(null);
    supabase.auth.signOut().catch(() => {});
  });
  clearSessionRef.current = () => {
    setSession(null);
    setUser(null);
    supabase.auth.signOut().catch(() => {});
  };

  useEffect(() => {
    // Get initial session (handle network errors and invalid refresh token)
    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (error) {
          // Invalid refresh token or other auth error: clear local session
          supabase.auth.signOut().catch(() => {});
          setSession(null);
          setUser(null);
          return;
        }
        setSession(session);
        setUser(session?.user ?? null);
      })
      .catch(() => {
        // Network failed, invalid refresh token, or Supabase unreachable: clear session
        supabase.auth.signOut().catch(() => {});
        setSession(null);
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });

    // Listen for auth changes (e.g. SIGNED_OUT when token refresh fails)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Catch unhandled refresh token errors (e.g. from background auto-refresh) and clear session
    const onUnhandledRejection = (reason: unknown) => {
      if (isRefreshTokenError(reason)) {
        clearSessionRef.current();
      }
    };
    const processObj = typeof process !== 'undefined' ? process : undefined;
    if (processObj && typeof processObj.on === 'function') {
      processObj.on('unhandledRejection', onUnhandledRejection);
    }

    return () => {
      subscription.unsubscribe();
      if (processObj && typeof processObj.off === 'function') {
        processObj.off('unhandledRejection', onUnhandledRejection);
      }
    };
  }, []);

  const handleSignIn = async (data: SignInData) => {
    await signIn(data);
    // State will be updated via onAuthStateChange
  };

  const handleSignUp = async (data: SignUpData) => signUp(data);

  const handleSignOut = async () => {
    await supabaseSignOut();
    // State will be updated via onAuthStateChange
  };

  const handleResetPassword = async (email: string) => {
    await resetPassword(email);
  };

  const refreshUser = useCallback(async () => {
    const { data: { session: newSession }, error } = await supabase.auth.getSession();
    if (error && isRefreshTokenError(error)) {
      clearSessionRef.current();
      return;
    }
    setSession(newSession);
    setUser(newSession?.user ?? null);
  }, []);

  const value: AuthContextType = {
    user,
    session,
    loading,
    refreshUser,
    signIn: handleSignIn,
    signUp: handleSignUp,
    signOut: handleSignOut,
    resetPassword: handleResetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
