import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { DMSans_400Regular, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { Newsreader_600SemiBold } from '@expo-google-fonts/newsreader';
import { CalendarDays, ClipboardCheck, History, RefreshCw, ShieldCheck, UserRound, Users, X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { logoUri } from './logoData';
import Auth from './Auth';
import Screens from './Screens';
import type { Tab } from './Screens';
import { checkIn, demoAdminId, demoMemberId, demoPendingId, loadData, reviewMembership, saveService, setChurchLocation, setServiceEnabled } from './data';
import { hasMemberAccess } from './domain';
import { supabase } from './supabase';
import type { ChurchData, NewService } from './types';
import { Avatar, Badge, Button, colors, IconButton, T } from './ui';
import { LanguageProvider, useLanguage } from './Language';
import { isLanguage } from './translations';

type Identity = { id: string; demo: boolean };

export default function App() {
  return <LanguageProvider><GatherApp /></LanguageProvider>;
}

function GatherApp() {
  const { ready: languageReady, t, errorText, setLanguage } = useLanguage();
  const [fonts, fontError] = useFonts({ DMSans_400Regular, DMSans_700Bold, Newsreader_600SemiBold });
  const [identity, setIdentity] = useState<Identity | null>(supabase ? null : { id: demoMemberId, demo: true });
  const [authReady, setAuthReady] = useState(!supabase);
  const [data, setData] = useState<ChurchData | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const user = data?.profiles.find(profile => profile.id === identity?.id);
  const admin = user?.role === 'admin';

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    let authEvent = false;
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      authEvent = true;
      if (!alive || identityRef.current?.demo) return;
      setIdentity(session ? { id: session.user.id, demo: false } : null);
      const preferred = session?.user.user_metadata.preferred_language;
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && isLanguage(preferred)) void setLanguage(preferred).catch(() => {});
      setAuthReady(true);
    });
    supabase.auth.getSession().then(({ data: result, error: sessionError }) => {
      if (!alive || authEvent) return;
      if (sessionError) setError(sessionError.message);
      setIdentity(result.session ? { id: result.session.user.id, demo: false } : null);
      const preferred = result.session?.user.user_metadata.preferred_language;
      if (isLanguage(preferred)) void setLanguage(preferred).catch(() => {});
      setAuthReady(true);
    }).catch(() => { if (alive) { setAuthReady(true); setError('Unable to restore your session. Please sign in.'); } });
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') supabase?.auth.startAutoRefresh();
      else supabase?.auth.stopAutoRefresh();
    });
    return () => { alive = false; listener.subscription.unsubscribe(); appState.remove(); };
  }, []);

  useEffect(() => {
    setData(null); setError(''); setNotice(''); setTab('home');
    if (!identity) return;
    let cancelled = false;
    loadData(identity.demo).then(result => { if (!cancelled) setData(result); }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load attendance.'); });
    return () => { cancelled = true; };
  }, [identity?.id, identity?.demo]);

  useEffect(() => {
    if (!identity) return;
    const timer = setInterval(() => {
      if (!busy && !refreshing) void refresh(true);
    }, 30000);
    return () => clearInterval(timer);
  }, [identity?.id, identity?.demo, busy, refreshing]);

  async function refresh(quiet = false) {
    const current = identityRef.current;
    if (!current) return;
    if (!quiet) { setRefreshing(true); setError(''); }
    try {
      const result = await loadData(current.demo);
      if (identityRef.current?.id === current.id && identityRef.current?.demo === current.demo) setData(result);
    } catch (reason) {
      if (!quiet) throw reason;
    } finally { if (!quiet) setRefreshing(false); }
  }

  async function retry() {
    try { await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to refresh. Check your connection.'); }
  }

  async function mutate(operation: () => Promise<void>, message: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true); setError(''); setNotice('');
    try {
      await operation();
      setNotice(message);
      try { await refresh(); } catch { setError('Changes saved, but the list could not refresh. Tap refresh to retry.'); }
      return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save. Please try again.'); return false; }
    finally { setBusy(false); }
  }

  function switchDemo() {
    if (identity?.demo && !busy) setIdentity({ id: identity.id === demoAdminId ? demoMemberId : demoAdminId, demo: true });
  }

  async function signOut() {
    if (busy) return;
    if (!identity?.demo && supabase) {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) { setError(signOutError.message); return; }
    }
    setIdentity(null); setData(null); setNotice(''); setError('');
  }

  const nav: { id: Tab; label: string; icon: LucideIcon }[] = admin ? [
    { id: 'home', label: 'Overview', icon: ClipboardCheck }, { id: 'services', label: 'Services', icon: CalendarDays },
    { id: 'members', label: 'Members', icon: Users }, { id: 'account', label: 'Account', icon: UserRound },
  ] : user && !hasMemberAccess(user) ? [{ id: 'home', label: 'Membership', icon: ShieldCheck }, { id: 'account', label: 'Account', icon: UserRound }] : [{ id: 'home', label: 'Check-in', icon: ClipboardCheck }, { id: 'history', label: 'History', icon: History }, { id: 'account', label: 'Account', icon: UserRound }];

  function navigation() {
    return <View style={wide ? styles.sidebarNav : styles.bottomNav}>{nav.map(({ id, label, icon: Icon }) => <Pressable key={id} accessibilityRole="tab" accessibilityLabel={t(label)} accessibilityState={{ selected: tab === id }} onPress={() => { setTab(id); setNotice(''); }} style={[wide ? styles.sideLink : styles.bottomLink, tab === id && (wide ? styles.activeSide : {})]}><Icon size={21} color={tab === id ? colors.green : colors.muted} /><T style={{ fontSize: wide ? 14 : 10, textAlign: 'center', color: tab === id ? colors.green : colors.muted, fontFamily: tab === id ? 'DMSans_700Bold' : 'DMSans_400Regular' }}>{label}</T>{wide && tab === id && <View style={styles.activeDot} />}</Pressable>)}</View>;
  }

  if ((!fonts && !fontError) || !authReady || !languageReady) return <SafeAreaProvider><SafeAreaView style={styles.loading}><ActivityIndicator color={colors.green} /></SafeAreaView></SafeAreaProvider>;

  return <SafeAreaProvider><StatusBar style="dark" /><SafeAreaView style={styles.page}>
    {!identity ? <Auth onDemo={() => { setIdentity({ id: demoMemberId, demo: true }); setAuthReady(true); }} /> : <View style={styles.layout}>
      {wide && <View style={styles.sidebar}><View style={styles.brand}><Image source={{ uri: logoUri }} style={styles.brandLogo} /><T raw style={styles.brandText}>BBS Gather</T></View><T raw style={styles.brandCaption}>The Bangalore Bible Students</T><T style={[styles.sidebarLabel, { marginBottom: 25 }]}>{admin ? 'CHURCH ADMINISTRATION' : 'CHURCH COMMUNITY'}</T>{navigation()}<View style={{ flex: 1 }} />{user && <View style={styles.sidebarProfile}><Avatar name={user.full_name} small /><View style={{ flex: 1 }}><T raw style={{ fontFamily: 'DMSans_700Bold', fontSize: 12 }}>{user.full_name}</T><T style={{ color: colors.muted, fontSize: 10 }}>{admin ? 'Administrator' : 'Member'}</T></View></View>}</View>}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={[styles.header, width < 360 && { paddingHorizontal: 8 }]}><View style={styles.brand}>{!wide && <Image source={{ uri: logoUri }} style={styles.brandLogoSmall} />}<T raw={!wide} style={wide ? styles.headerTitle : styles.brandText}>{wide ? nav.find(item => item.id === tab)?.label : 'BBS Gather'}</T></View><View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>{identity.demo && width >= 360 && <Badge text="DEMO" tone="gold" />}{identity.demo && <IconButton label={admin ? 'Switch to member demo' : 'Switch to admin demo'} icon={admin ? UserRound : ShieldCheck} onPress={switchDemo} disabled={busy} />}<IconButton label="Refresh attendance" icon={RefreshCw} onPress={retry} disabled={busy || refreshing} />{user && <Pressable accessibilityRole="button" accessibilityLabel={t('Open account')} onPress={() => setTab('account')}><Avatar name={user.full_name} small /></Pressable>}</View></View>
        <ScrollView keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={retry} tintColor={colors.green} />} contentContainerStyle={[styles.content, wide && { paddingHorizontal: 45, paddingTop: 36 }]}>
          <View style={styles.inner}>
            {identity.demo && <View style={styles.demoStrip}><T style={{ fontSize: 11, color: colors.gold }}>{t('Sample data · {role} demo · Not connected', { role: t(admin ? 'Admin' : 'Member') })}</T></View>}
            {!!error && <View style={styles.error}><T accessibilityRole="alert" style={{ color: colors.red, flex: 1 }}>{errorText(error)}</T><IconButton label="Retry loading" icon={RefreshCw} onPress={retry} /></View>}
            {!!notice && <View style={styles.notice}><T accessibilityRole="alert" style={{ color: colors.green, flex: 1 }}>{notice}</T><IconButton label="Dismiss notification" icon={X} onPress={() => setNotice('')} /></View>}
            {!data ? !error && <ActivityIndicator color={colors.green} style={{ marginTop: 50 }} /> : !user ? <View style={{ gap: 15 }}><T>Your member profile could not be found. Contact your church administrator.</T><Button label="Sign out" secondary onPress={signOut} /></View> : <Screens key={`${identity.id}-${tab}`} data={data} user={user} demo={identity.demo} busy={busy} tab={tab} refreshing={refreshing} navigate={setTab} onCheckIn={id => { void mutate(() => checkIn(identity.demo, identity.id, id), 'Your attendance has been saved.'); }} onMarkPresent={(memberId, serviceId) => mutate(() => checkIn(identity.demo, memberId, serviceId), 'Attendance recorded.')} onCreate={(service: NewService) => mutate(() => saveService(identity.demo, service), 'Service created.')} onToggle={(id, enabled) => { void mutate(() => setServiceEnabled(identity.demo, id, enabled), enabled ? 'Check-in enabled for the service window.' : 'Check-in paused.'); }} onSetChurchLocation={location => mutate(() => setChurchLocation(identity.demo, location), 'Church location saved.')} onReview={(id, decision) => mutate(() => reviewMembership(identity.demo, identity.id, id, decision), decision === 'approved' ? 'Membership approved.' : 'Membership request rejected.')} onRefresh={retry} onPendingDemo={() => { if (identity.demo && !busy) setIdentity({ id: demoPendingId, demo: true }); }} onSignOut={signOut} onSwitchDemo={switchDemo} />}
          </View>
        </ScrollView>
        {!wide && user && navigation()}
      </View>
    </View>}
  </SafeAreaView></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  layout: { flex: 1, flexDirection: 'row' },
  sidebar: { width: 228, backgroundColor: '#fff', borderRightWidth: 1, borderColor: colors.line, padding: 25, paddingTop: 31 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandText: { fontSize: 27, fontFamily: 'Newsreader_600SemiBold' },
  brandCaption: { color: colors.muted, fontSize: 11 },
  brandLogo: { width: 28, height: 28, borderRadius: 6 },
  brandLogoSmall: { width: 24, height: 24, borderRadius: 5 },
  sidebarLabel: { color: colors.muted, fontSize: 9, fontFamily: 'DMSans_700Bold', marginTop: 16 },
  sidebarNav: { gap: 7 },
  sideLink: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, minHeight: 48, borderRadius: 6 },
  activeSide: { backgroundColor: colors.pale },
  activeDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.green, marginLeft: 'auto' },
  sidebarProfile: { flexDirection: 'row', gap: 10, alignItems: 'center', borderTopWidth: 1, borderColor: colors.line, paddingTop: 23 },
  header: { minHeight: 76, paddingHorizontal: 22, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: colors.line, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 16, fontFamily: 'DMSans_700Bold' },
  content: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 20, paddingBottom: 32, alignItems: 'center' },
  inner: { width: '100%', maxWidth: 850, gap: 20 },
  demoStrip: { paddingBottom: 2 },
  error: { backgroundColor: '#fbeeee', paddingLeft: 14, paddingRight: 5, flexDirection: 'row', alignItems: 'center', borderRadius: 6 },
  notice: { backgroundColor: colors.pale, paddingLeft: 14, paddingRight: 5, flexDirection: 'row', alignItems: 'center', borderRadius: 6 },
  bottomNav: { backgroundColor: '#fff', flexDirection: 'row', borderTopWidth: 1, borderColor: colors.line, minHeight: 70 },
  bottomLink: { flex: 1, gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
});