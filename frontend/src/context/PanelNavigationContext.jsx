import { createContext, useCallback, useContext, useState } from 'react';

const PanelNavigationContext = createContext({
  expandedKey: null,
  openPanel: () => {},
  closePanel: () => {},
});

// Delt tilstand for hvilken sekundærside (i ikonraden) som er åpen, slik at
// f.eks. AI-taleassistenten (i Header) kan be Dashboard om å åpne en side.
export function PanelNavigationProvider({ children }) {
  const [expandedKey, setExpandedKey] = useState(null);
  const openPanel = useCallback((key) => setExpandedKey(key), []);
  const closePanel = useCallback(() => setExpandedKey(null), []);

  return (
    <PanelNavigationContext.Provider value={{ expandedKey, openPanel, closePanel }}>
      {children}
    </PanelNavigationContext.Provider>
  );
}

export function usePanelNavigation() {
  return useContext(PanelNavigationContext);
}
