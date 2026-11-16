import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// One fixed-position tooltip shared by all charts (hidden on scroll).
const TooltipContext = createContext({ show: () => {}, hide: () => {} });

export function TooltipProvider({ children }) {
  const [tip, setTip] = useState(null);
  const show = useCallback((content, x, y) => setTip({ content, x, y }), []);
  const hide = useCallback(() => setTip(null), []);
  useEffect(() => {
    window.addEventListener('scroll', hide, { passive: true });
    return () => window.removeEventListener('scroll', hide);
  }, [hide]);
  const value = useMemo(() => ({ show, hide }), [show, hide]);
  return (
    <TooltipContext.Provider value={value}>
      {children}
      {tip && <div className="tooltip" style={{ left: tip.x, top: tip.y }}>{tip.content}</div>}
    </TooltipContext.Provider>
  );
}

export const useTooltip = () => useContext(TooltipContext);
