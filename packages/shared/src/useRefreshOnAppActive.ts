import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Calls the given refetch callback whenever the app returns to the foreground
 * (user switches back from another app or reopens the app).
 * Does not run on initial mount—only when AppState changes to 'active'.
 * Use alongside useFocusEffect for tab/screen focus; this handles app-level resume.
 */
export function useRefreshOnAppActive(refetch: () => void | Promise<void>): void {
  const ref = useRef(refetch);
  ref.current = refetch;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        ref.current?.();
      }
    });
    return () => subscription.remove();
  }, []);
}
