/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readSettings, writeSettings, type UserSettings } from '../utils/settings';

const SettingsContext = createContext<{ settings: UserSettings; systemDark: boolean; update: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void } | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(readSettings);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  const update = useCallback(<K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings((current) => {
      const next = { ...current, [key]: value };
      writeSettings(next);
      return next;
    });
  }, []);
  useEffect(() => {
    writeSettings(settings);
    const theme = settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.setProperty('--text-scale', settings.textSize === 'small' ? '.9375' : settings.textSize === 'large' ? '1.125' : '1');
    document.documentElement.style.setProperty('--code-font-size', `${settings.codeSize}px`);
    document.documentElement.dataset.lineNumbers = String(settings.lineNumbers);
    document.documentElement.dataset.wrapCode = String(settings.wrapCode);
  }, [settings, systemDark]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);
  const value = useMemo(() => ({ settings, systemDark, update }), [settings, systemDark, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('SettingsProvider is missing');
  return value;
}
