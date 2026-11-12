import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BackHandler, Platform } from 'react-native';

// Navegação em pilha mínima, sem depender de URL: funciona igual no celular e na web embutida.

export type Route =
  | { name: 'home' }
  | { name: 'new' }
  | { name: 'join'; code?: string }
  | { name: 'trip'; id: string; tab?: 'votar' | 'grupo' | 'roteiro' | 'checklist' };

type Nav = { route: Route; push: (r: Route) => void; replace: (r: Route) => void; back: () => void };

const Ctx = createContext<Nav | null>(null);

/** Link de convite (…/#ABC234) abre direto na tela de entrar, com o código preenchido. */
const initialStack = (): Route[] => {
  if (Platform.OS === 'web') {
    try {
      const loc = (globalThis as { location?: { hash?: string } }).location;
      const m = loc?.hash?.match(/^#([A-Za-z0-9]{6})$/);
      if (m) return [{ name: 'home' }, { name: 'join', code: m[1].toUpperCase() }];
    } catch {
      // sem acesso ao endereço: abre na tela inicial
    }
  }
  return [{ name: 'home' }];
};

export const NavProvider = ({ children }: { children: React.ReactNode }) => {
  const [stack, setStack] = useState<Route[]>(initialStack);
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
