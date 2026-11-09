import React from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextProps, TextInputProps } from 'react-native';
import { Check, MapPin, X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { initials } from './domain';
import type { Service } from './types';
import { useLanguage } from './Language';

export const colors = { green: '#20634e', ink: '#202e29', muted: '#68746e', line: '#e0e6e1', bg: '#f5f7f5', pale: '#e9f2ed', gold: '#a56d24', red: '#a33333' };
export const dateLabel = (value: string) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
export const timeLabel = (value: string) => new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export function T({ style, children, raw = false, ...props }: TextProps & { raw?: boolean }) {
  const { language, t, number } = useLanguage();
  const flattened = StyleSheet.flatten(style) || {};
  const fontSize = flattened.fontSize || 14;
  const family = flattened.fontFamily || '';
  const scriptFont = Platform.OS === 'web' ? 'Nirmala UI, sans-serif' : Platform.OS === 'ios' ? { hi: 'Devanagari Sangam MN', kn: 'Kannada Sangam MN', ta: 'Tamil Sangam MN', en: '' }[language] : 'sans-serif';
  const localizedStyle = language === 'en' ? {} : {
    fontFamily: scriptFont,
    fontWeight: flattened.fontWeight || (family.includes('SemiBold') ? '600' as const : family.includes('Bold') ? '700' as const : '400' as const),
    fontSize: fontSize >= 27 && !raw ? 26 : fontSize,
    lineHeight: Math.ceil((fontSize >= 27 && !raw ? 26 : fontSize) * 1.45),
  };
  const content = raw ? children : typeof children === 'string' ? t(children) : typeof children === 'number' ? number(children) : children;
  return <Text {...props} style={[{ fontFamily: 'DMSans_400Regular', color: colors.ink, fontSize: 14, flexShrink: 1 }, style, localizedStyle]}>{content}</Text>;
}

export function Button({ label, onPress, icon: Icon, secondary, disabled, loading }: { label: string; onPress: () => void; icon?: LucideIcon; secondary?: boolean; disabled?: boolean; loading?: boolean }) {
  const { t } = useLanguage();
  return <Pressable accessibilityRole="button" accessibilityLabel={t(label)} accessibilityState={{ disabled: disabled || loading }} disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary, (disabled || loading) && { opacity: 0.55 }, pressed && { opacity: 0.8 }]}>
    {loading ? <ActivityIndicator color={secondary ? colors.green : '#fff'} /> : Icon ? <Icon size={19} color={secondary ? colors.green : '#fff'} /> : null}
    <T style={{ color: secondary ? colors.green : '#fff', fontFamily: 'DMSans_700Bold', textAlign: 'center', flexShrink: 1 }}>{label}</T>
  </Pressable>;
}

export function IconButton({ label, icon: Icon, onPress, disabled }: { label: string; icon: LucideIcon; onPress: () => void; disabled?: boolean }) {
  const { t } = useLanguage();
  return <Pressable accessibilityRole="button" accessibilityLabel={t(label)} disabled={disabled} onPress={onPress} style={styles.iconButton}><View {...{ title: t(label) }}><Icon size={21} color={disabled ? colors.line : colors.muted} /></View></Pressable>;
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const { t, language } = useLanguage();
  return <View style={{ gap: 7 }}><T style={styles.label}>{label}</T><TextInput {...props} accessibilityLabel={t(label)} placeholder={props.placeholder ? t(props.placeholder) : undefined} placeholderTextColor="#8c9790" style={[styles.input, language !== 'en' && { fontFamily: Platform.OS === 'web' ? 'Nirmala UI, sans-serif' : undefined }, props.style]} /></View>;
}

export function Avatar({ name, small }: { name: string; small?: boolean }) {
  return <View style={[styles.avatar, small && { width: 36, height: 36 }]}><T style={{ color: colors.green, fontFamily: 'DMSans_700Bold', fontSize: small ? 12 : 15 }}>{initials(name)}</T></View>;
}

export function Badge({ text, tone = 'green' }: { text: string; tone?: 'green' | 'muted' | 'gold' }) {
  return <View style={[styles.badge, { backgroundColor: tone === 'green' ? colors.pale : tone === 'gold' ? '#faf1df' : '#edf0ed' }]}><T style={{ fontSize: 11, fontFamily: 'DMSans_700Bold', color: tone === 'green' ? colors.green : tone === 'gold' ? colors.gold : colors.muted }}>{text}</T></View>;
}

export function Section({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <View style={styles.section}><T style={styles.sectionTitle}>{title}</T>{action && <Pressable accessibilityRole="button" onPress={onAction}><T style={{ color: colors.green, fontFamily: 'DMSans_700Bold', fontSize: 12 }}>{action}</T></Pressable>}</View>;
}

export function ServiceRow({ service, attended, checkedAt, right }: { service: Service; attended?: boolean; checkedAt?: string; right?: React.ReactNode }) {
  const { t, locale, date: dateLabel, time: timeLabel, number } = useLanguage();
  const date = new Date(service.opens_at);
  return <View style={styles.row}><View style={styles.dateBlock}><T style={{ fontSize: 10, color: colors.muted, fontFamily: 'DMSans_700Bold', textAlign: 'center' }}>{date.toLocaleDateString(locale, { month: 'short' })}</T><T style={{ fontSize: 23, fontFamily: 'Newsreader_600SemiBold' }}>{number(date.getDate())}</T></View>
    <View style={{ flex: 1, gap: 4 }}><T raw style={{ fontFamily: 'DMSans_700Bold' }}>{service.title}</T><T style={{ fontSize: 12, color: colors.muted }}>{`${dateLabel(checkedAt || service.opens_at)} · ${checkedAt ? t('Checked in {time}', { time: timeLabel(checkedAt) }) : timeLabel(service.opens_at)}`}</T><View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><MapPin size={12} color={colors.muted} /><T raw style={{ fontSize: 12, color: colors.muted }}>{service.location}</T></View></View>
    {attended && <Check size={19} color={colors.green} />}{right}
  </View>;
}

export function Empty({ title, detail }: { title: string; detail?: string }) {
  return <View style={{ paddingVertical: 35, alignItems: 'center', gap: 8 }}><T style={{ fontFamily: 'DMSans_700Bold' }}>{title}</T>{detail && <T style={{ color: colors.muted, textAlign: 'center' }}>{detail}</T>}</View>;
}

export function Sheet({ title, rawTitle = false, onClose, children }: { title: string; rawTitle?: boolean; onClose: () => void; children: React.ReactNode }) {
  return <Modal transparent animationType="fade" onRequestClose={onClose}><View style={styles.overlay}><View style={styles.sheet}><View style={styles.section}><T raw={rawTitle} style={styles.sectionTitle}>{title}</T><IconButton label="Close dialog" icon={X} onPress={onClose} /></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 18, paddingBottom: 24 }}>{children}</ScrollView></View></View></Modal>;
}

const styles = StyleSheet.create({
  button: { minHeight: 50, backgroundColor: colors.green, borderRadius: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 12, gap: 9 },
  secondary: { backgroundColor: colors.pale },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontFamily: 'DMSans_700Bold', color: colors.muted },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 6, padding: 13, fontSize: 15, color: colors.ink, backgroundColor: '#fff', fontFamily: 'DMSans_400Regular', minHeight: 48 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.pale, alignItems: 'center', justifyContent: 'center' },
  badge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 4, alignSelf: 'flex-start' },
  section: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 15 },
  sectionTitle: { fontSize: 19, fontFamily: 'DMSans_700Bold', flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 17, borderBottomWidth: 1, borderColor: colors.line, gap: 13 },
  dateBlock: { width: 52, minHeight: 57, paddingVertical: 5, paddingHorizontal: 2, borderRadius: 6, backgroundColor: '#edf1ed', alignItems: 'center', justifyContent: 'center', gap: 2 },
  overlay: { flex: 1, backgroundColor: '#13231c88', alignItems: 'center', justifyContent: 'center', padding: 22 },
  sheet: { width: '100%', maxWidth: 520, maxHeight: '90%', borderRadius: 8, padding: 22, backgroundColor: '#fff' },
});