import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

// Refetch a screen's data when it regains focus (tab switch, back navigation).
//
// The very first focus is skipped: it coincides with mount, where the data was
// either just prefetched under the splash screen or is being loaded by the
// screen itself — refetching there would be a duplicate request for nothing.
//
// The callback is expected to be a *stale-checked, silent* refresh (see the
// stores' `refreshIfStale`), which is what keeps this from flashing a spinner on
// an already-populated screen or stacking duplicate requests when focus fires
// rapidly.
export function useRefreshOnFocus(refresh: () => void): void {
  const firstFocus = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      refresh();
    }, [refresh]),
  );
}
