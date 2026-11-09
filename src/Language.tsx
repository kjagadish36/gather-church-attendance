import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatDate, formatTime, isLanguage, languages, messages, translate } from './translations';
import type { Language } from './translations';

type LanguageState = {
  language: Language; ready: boolean; locale: string;
  setLanguage: (language: Language) => Promise<void>;
  t: (message: string, values?: Record<string, string | number>) => string;
  date: (value: string, options?: Intl.DateTimeFormatOptions) => string;
  time: (value: string) => string;
  number: (value: number) => string;
  errorText: (message: string) => string;
};

const Context = createContext<LanguageState | null>(null);
const preferenceKey = 'gather-language-v1';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, updateLanguage] = useState<Language>('en');
  const [ready, setReady] = useState(false);
  const revision = useRef(0);
  useEffect(() => {
    let active = true;
    const initialRevision = revision.current;
    AsyncStorage.getItem(preferenceKey).then(value => {
      if (active && revision.current === initialRevision && isLanguage(value)) updateLanguage(value);
    }).catch(() => {}).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  async function setLanguage(next: Language) {
    revision.current++;
    await AsyncStorage.setItem(preferenceKey, next);
    updateLanguage(next);
  }

  const locale = languages[language].locale;
  return <Context.Provider value={{ language, ready, locale, setLanguage,
    t: (message, values) => translate(message, language, values),
    date: (value, options) => formatDate(value, language, options),
    time: value => formatTime(value, language),
    number: value => new Intl.NumberFormat(locale).format(value),
    errorText: message => translate(language === 'en' || Object.prototype.hasOwnProperty.call(messages, message) ? message : 'Something went wrong. Please try again.', language),
  }}>{children}</Context.Provider>;
}

export function useLanguage() {
  const value = useContext(Context);
  if (!value) throw new Error('LanguageProvider is required.');
  return value;
}