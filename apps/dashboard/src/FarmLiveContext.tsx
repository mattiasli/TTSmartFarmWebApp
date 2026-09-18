import { createContext, useContext, type ReactNode } from 'react';
import { useFarmLive } from './useFarmLive';

type FarmLive = ReturnType<typeof useFarmLive>;

const FarmLiveContext = createContext<FarmLive | null>(null);

export function FarmLiveProvider({ children }: { children: ReactNode }) {
  const live = useFarmLive();
  return <FarmLiveContext.Provider value={live}>{children}</FarmLiveContext.Provider>;
}

export function useFarmLiveContext() {
  const value = useContext(FarmLiveContext);
  if (!value) throw new Error('Farm live context is missing.');
  return value;
}
