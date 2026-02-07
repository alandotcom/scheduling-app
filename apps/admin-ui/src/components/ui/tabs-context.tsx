import * as React from "react";

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

export const TabsContext = React.createContext<TabsContextValue | null>(null);

export function useTabs() {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error("Tab must be used within Tabs");
  }
  return context;
}
