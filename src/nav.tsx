import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BackHandler } from 'react-native';

// Navegação em pilha mínima, sem depender de URL: funciona igual no celular e na web embutida.

export type Route =
  | { name: 'home' }
  | { name: 'new' }
  | { name: 'join' }
  | { name: 'trip'; id: string; tab?: 'votar' | 'grupo' | 'roteiro' | 'checklist' };

type Nav = { route: Route; push: (r: Route) => void; replace: (r: Route) => void; back: () => void };

const Ctx = createContext<Nav | null>(null);

export const NavProvider = ({ children }: { children: React.ReactNode }) => {
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }]);
  const push = useCallback((r: Route) => setStack((s) => [...s, r]), []);
  const replace = useCallback((r: Route) => setStack((s) => [...s.slice(0, -1), r]), []);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) {
        back();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, back]);

  const value = useMemo(() => ({ route: stack[stack.length - 1], push, replace, back }), [stack, push, replace, back]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useNav = (): Nav => {
  const n = useContext(Ctx);
  if (!n) throw new Error('NavProvider ausente');
  return n;
};
