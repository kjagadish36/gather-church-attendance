import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { CheckCircle2, Circle } from 'lucide-react-native';
import { useLanguage } from './Language';
import { languages } from './translations';
import type { Language } from './translations';
import { colors, T } from './ui';
import { supabase } from './supabase';

export default function LanguageSelector({ registration = false, account = false, disabled = false }: { registration?: boolean; account?: boolean; disabled?: boolean }) {
  const { language, setLanguage, t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function select(next: Language) {
    if (busy || disabled) return;
    setBusy(true); setError(false);
    try {
      if (account && supabase) {
        const { error: saveError } = await supabase.auth.updateUser({ data: { preferred_language: next } });
        if (saveError) throw saveError;
      }
      await setLanguage(next);
    } catch { setError(true); }
    finally { setBusy(false); }
  }
  function keyboardSelect(event: React.KeyboardEvent, next: Language) {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      void select(next);
    }
  }
  return <View style={{ gap: 9 }}>
    <T style={{ fontFamily: 'DMSans_700Bold', fontSize: 13 }}>{registration ? 'Preferred language' : 'Language'}</T>
    <View accessibilityRole="radiogroup" accessibilityLabel={t(registration ? 'Preferred language' : 'Language')} style={styles.options}>
      {(Object.keys(languages) as Language[]).map(code => <Pressable key={code} accessibilityRole="radio" accessibilityLabel={languages[code].name} aria-checked={language === code} aria-disabled={busy || disabled} accessibilityState={{ checked: language === code, disabled: busy || disabled }} disabled={busy || disabled} onPress={() => { void select(code); }} {...(Platform.OS === 'web' ? { onKeyDown: (event: React.KeyboardEvent) => keyboardSelect(event, code) } : {})} style={[styles.option, language === code && styles.active]}>
        {language === code ? <CheckCircle2 size={18} color={colors.green} /> : <Circle size={18} color={colors.muted} />}
        <T raw style={{ fontSize: 14, flexShrink: 1 }}>{languages[code].name}</T>
      </Pressable>)}
    </View>
    {error && <T accessibilityRole="alert" style={{ color: colors.red }}>Could not save your language. Please try again.</T>}
  </View>;
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { width: '47%', minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, paddingVertical: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 6 },
  active: { backgroundColor: colors.pale, borderColor: colors.green },
});