import { createContext, useContext, useMemo, useState } from "react";

export type AppView = "plan" | "observe" | "results" | "history" | "sky" | "snapshots" | "guide";

export interface NavigationState {
  view: AppView;
  setView: (view: AppView) => void;
}

const NavigationContext = createContext<NavigationState | null>(null);

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<AppView>("sky");
  const value = useMemo(() => ({ view, setView }), [view]);
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationState {
  const context = useContext(NavigationContext);
  if (context === null) throw new Error("useNavigation must be used inside <NavigationProvider>");
  return context;
}
