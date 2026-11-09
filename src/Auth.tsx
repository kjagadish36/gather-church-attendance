import React, { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { logoUri } from './logoData';
import { supabase } from './supabase';
import { makeMemberRegistration, syntheticEmailFromPhone } from './domain';
import { Button, colors, Field, T } from './ui';
import { useLanguage } from './Language';
import LanguageSelector from './LanguageSelector';
import { registrationMetadata } from './translations';

export default function Auth({ onDemo }: { onDemo: () => void }) {
  const { language, errorText } = useLanguage();
  const [signup, setSignup] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit() {
    setMessage('');
    if (!supabase) { setMessage('Connect your church database before creating an account.'); return; }
    if (!password || (signup ? !name.trim() || !phone.trim() : !identifier.trim())) { setMessage('Please complete all fields.'); return; }
    if (signup && password.length < 8) { setMessage('Choose a password with at least 8 characters.'); return; }
    setBusy(true);
    try {
      if (signup) {
        const { full_name, phone: validPhone, email: validEmail } = makeMemberRegistration(name, phone, email);
        const authEmail = validEmail || syntheticEmailFromPhone(validPhone);
        const { data, error } = await supabase.auth.signUp({ email: authEmail, password, options: { data: registrationMetadata(full_name, validPhone, validEmail, language) } });
        if (error) throw error;
        if (!data.session) setMessage('Check your email to confirm your account, then sign in here.');
      } else {
        const trimmed = identifier.trim();
        const signInEmail = trimmed.includes('@') ? trimmed : syntheticEmailFromPhone(trimmed);
        const { error } = await supabase.auth.signInWithPassword({ email: signInEmail, password });
        if (error) throw error;
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to sign in. Please try again.'); }
    finally { setBusy(false); }
  }

  async function sendReset() {
    setMessage('');
    if (!supabase) { setMessage('Connect your church database before resetting a password.'); return; }
    const trimmed = resetEmail.trim();
    if (!trimmed.includes('@')) { setMessage('Enter the email address on your account.'); return; }
    setBusy(true);
    try {
      // Supabase replies the same way whether or not the email is on file, so this never confirms an account's existence.
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed);
      if (error) throw error;
      setMessage('If that email has an account, a reset link is on its way.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to send a reset link. Please try again.'); }
    finally { setBusy(false); }
  }

  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.page}>
    <View style={styles.form}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Image source={{ uri: logoUri }} style={{ width: 29, height: 29, borderRadius: 6 }} /><T raw style={{ fontFamily: 'Newsreader_600SemiBold', fontSize: 35 }}>BBS Gather</T></View>
      <T raw style={{ color: colors.muted, fontSize: 13 }}>The Bangalore Bible Students</T>
      {forgot ? <>
        <View style={{ marginVertical: 25, gap: 9 }}><T style={{ fontFamily: 'Newsreader_600SemiBold', fontSize: 34 }}>Reset password.</T><T style={{ color: colors.muted }}>We'll email you a secure link to set a new password.</T></View>
        <View style={{ gap: 18 }}>
          <Field label="Email address" value={resetEmail} onChangeText={setResetEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" onSubmitEditing={sendReset} />
          <T style={{ color: colors.muted, fontSize: 12 }}>Registered with a mobile number only? Ask a church administrator to reset your password.</T>
          {!!message && <T accessibilityRole="alert" style={{ color: colors.green }}>{errorText(message)}</T>}
          <Button label="Send reset link" icon={ArrowRight} onPress={sendReset} loading={busy} />
          <Pressable accessibilityRole="button" onPress={() => { setForgot(false); setMessage(''); }}><T style={{ textAlign: 'center', color: colors.green }}>Back to sign in</T></Pressable>
        </View>
      </> : <>
        <View style={{ marginVertical: 25, gap: 9 }}><T style={{ fontFamily: 'Newsreader_600SemiBold', fontSize: 34 }}>{signup ? 'Find your place.' : 'Welcome back.'}</T><T style={{ color: colors.muted }}>{signup ? 'Create your church member account.' : 'Sign in to your church community.'}</T></View>
        <View style={{ gap: 18 }}>
          <LanguageSelector registration={signup} disabled={busy} />
          {signup && <T style={{ color: colors.muted, fontSize: 12 }}>Registration requires church administrator approval.</T>}
          {signup && <Field label="Full name" value={name} onChangeText={setName} autoComplete="name" maxLength={120} />}
          {signup && <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />}
          {signup ? <Field label="Email address (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
            : <Field label="Email or mobile number" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" autoComplete="username" />}
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={signup ? 'new-password' : 'current-password'} onSubmitEditing={submit} />
          {!signup && <Pressable accessibilityRole="button" onPress={() => { setForgot(true); setMessage(''); setResetEmail(identifier.includes('@') ? identifier : ''); }}><T style={{ color: colors.green, fontSize: 13 }}>Forgot password?</T></Pressable>}
          {!!message && <T accessibilityRole="alert" style={{ color: colors.green }}>{errorText(message)}</T>}
          <Button label={signup ? 'Create account' : 'Sign in'} icon={ArrowRight} onPress={submit} loading={busy} />
          <Pressable accessibilityRole="button" onPress={() => { setSignup(!signup); setMessage(''); }}><T style={{ textAlign: 'center', color: colors.green }}>{signup ? 'Already a member? Sign in' : 'New here? Create an account'}</T></Pressable>
          <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 12 }} />
          <Button label="Open demo" secondary onPress={onDemo} />
        </View>
      </>}
    </View>
  </ScrollView></KeyboardAvoidingView>;
}

export function ResetPassword({ onDone }: { onDone: () => void }) {
  const { errorText } = useLanguage();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit() {
    setMessage('');
    if (!supabase) return;
    if (password.length < 8) { setMessage('Choose a password with at least 8 characters.'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      onDone();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to update your password. Please try again.'); }
    finally { setBusy(false); }
  }

  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.page}>
    <View style={styles.form}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Image source={{ uri: logoUri }} style={{ width: 29, height: 29, borderRadius: 6 }} /><T raw style={{ fontFamily: 'Newsreader_600SemiBold', fontSize: 35 }}>BBS Gather</T></View>
      <View style={{ marginVertical: 25, gap: 9 }}><T style={{ fontFamily: 'Newsreader_600SemiBold', fontSize: 34 }}>Set a new password.</T><T style={{ color: colors.muted }}>Choose a new password for your account.</T></View>
      <View style={{ gap: 18 }}>
        <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" onSubmitEditing={submit} />
        {!!message && <T accessibilityRole="alert" style={{ color: colors.green }}>{errorText(message)}</T>}
        <Button label="Update password" icon={ArrowRight} onPress={submit} loading={busy} />
      </View>
    </View>
  </ScrollView></KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: colors.bg },
  form: { width: '100%', maxWidth: 400, paddingVertical: 25 },
});