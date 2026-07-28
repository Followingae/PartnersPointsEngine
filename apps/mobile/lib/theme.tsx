import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { PALETTE, type ThemeName, type Tokens } from './tokens';

type Pref = ThemeName | 'system';

interface ThemeCtx {
  /** The resolved theme actually in effect. */
  theme: ThemeName;
  /** The user's stored preference (may be 'system'). */
  pref: Pref;
  tokens: Tokens;
  setPref: (p: Pref) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);
const KEY = 'pp_theme_pref';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<Pref>('system');

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setPrefState(v);
    });
  }, []);

  const setPref = (p: Pref) => {
    setPrefState(p);
    AsyncStorage.setItem(KEY, p).catch(() => {});
  };

  const theme: ThemeName = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  const value = useMemo<ThemeCtx>(() => ({ theme, pref, tokens: PALETTE[theme], setPref }), [theme, pref]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTheme must be used within ThemeProvider');
  return c;
}

/** Shortcut for the resolved palette. */
export const useTokens = (): Tokens => useTheme().tokens;
