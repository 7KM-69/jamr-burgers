'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type LoaderValue = {
  /**
   * True the moment the loader curtain starts lifting — not when it finishes.
   *
   * The hero's entrance is supposed to be *already running* behind the curtain
   * as it rises. Waiting for the curtain to finish is what produces the flash of
   * a bare hero followed by a late animation, which is the exact seam this
   * hand-off exists to hide.
   */
  ready: boolean;
  markReady: () => void;
};

const LoaderContext = createContext<LoaderValue | null>(null);

export function LoaderProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  const value = useMemo<LoaderValue>(
    () => ({ ready, markReady: () => setReady(true) }),
    [ready],
  );

  return <LoaderContext.Provider value={value}>{children}</LoaderContext.Provider>;
}

export function useLoader(): LoaderValue {
  const value = useContext(LoaderContext);
  if (!value) throw new Error('useLoader must be used inside <LoaderProvider>.');
  return value;
}
