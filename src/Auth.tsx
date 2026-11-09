import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ArrowRight, Church } from 'lucide-react-native';
import { supabase } from './supabase';
import { Button, colors, Field, T } from './ui';
import { useLanguage } from './Language';
import LanguageSelector from './LanguageSelector';
import { registrationMetadata } from './translations';

export default function Auth({ onDemo }: { onDemo: () => void }) {
  const { language, errorText } = useLanguage();
  const [signup, setSignup] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit() {
    setMessage('');
    if (!supabase) { setMessage('Connect your church database before creating an account.'); return; }
    if (!email.trim() || !password || (signup && !name.trim())) { setMessage('Please complete all fields.'); return; }
    if (signup && password.length < 8) { setMessage('Choose a password with at least 8 characters.'); return; }
    setBusy(true);
    try {
      if (signup) {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: registrationMetadata(name, language) } });
        if (error) throw error;
        if (!data.session) setMessage('Check your email to confirm your account, then sign in here.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to sign in. Please try again.'); }
    finally { setBusy(false); }
  }

  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
    <View style={styles.form}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Church size={29} color={colors.green} /><T style={{ fontFamily: 'Newsreader_600SemiBold', fontSize: 35 }}>Gather</T></View>
      <View style={{ marginVertical: 25, gap: 9 }}><T style={{ fontFamily: 'Newsreader_600SemiBold', fontSize: 34 }}>{signup ? 'Find your place.' : 'Welcome back.'}</T><T style={{ color: colors.muted }}>{signup ? 'Create your church member account.' : 'Sign in to your church community.'}</T></View>
      <View style={{ gap: 18 }}>
        <LanguageSelector registration={signup} disabled={busy} />
        {signup && <T style={{ color: colors.muted, fontSize: 12 }}>Registration requires church administrator approval.</T>}
        {signup && <Field label="Full name" value={name} onChangeText={setName} autoComplete="name" maxLength={120} />}
        <Field label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={signup ? 'new-password' : 'current-password'} onSubmitEditing={submit} />
        {!!message && <T accessibilityRole="alert" style={{ color: colors.green }}>{errorText(message)}</T>}
        <Button label={signup ? 'Create account' : 'Sign in'} icon={ArrowRight} onPress={submit} loading={busy} />
        <Pressable accessibilityRole="button" onPress={() => { setSignup(!signup); setMessage(''); }}><T style={{ textAlign: 'center', color: colors.green }}>{signup ? 'Already a member? Sign in' : 'New here? Create an account'}</T></Pressable>
        <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 12 }} />
        <Button label="Open demo" secondary onPress={onDemo} />
      </View>
    </View>
  </ScrollView></KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: colors.bg },
  form: { width: '100%', maxWidth: 400, paddingVertical: 25 },
});