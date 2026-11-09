import React, { useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import * as Location from 'expo-location';
import { ArrowRight, CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, Download, KeyRound, LogOut, MapPin, Plus, QrCode, RefreshCw, Search, ShieldCheck, UserRound, X } from 'lucide-react-native';
import { attendanceRate, distanceMeters, hasCheckedIn, hasMemberAccess, isOpen, localDay, makeMemberRegistration, makeService, missedStreak } from './domain';
import AttendanceChart from './AttendanceChart';
import { exportAttendance } from './exportAttendance';
import type { ExportFormat } from './exportAttendance';
import { QRCodeDisplay, QRScanner } from './QRCheckIn';
import { serviceImageUri } from './serviceImageData';
import type { ChurchData, ChurchLocation, NewService, Profile, Service } from './types';
import { Avatar, Badge, Button, colors, Empty, Field, Section, ServiceRow, Sheet, T } from './ui';
import { useLanguage } from './Language';
import LanguageSelector from './LanguageSelector';

export type Tab = 'home' | 'history' | 'services' | 'members' | 'account';
type Props = {
  data: ChurchData; user: Profile; tab: Tab; demo: boolean; busy: boolean;
  navigate: (tab: Tab) => void; onCheckIn: (id: string) => void;
  onMarkPresent: (memberId: string, serviceId: string) => void;
  onCreate: (service: NewService) => Promise<boolean>;
  onToggle: (id: string, enabled: boolean) => void;
  onSetChurchLocation: (location: ChurchLocation) => Promise<boolean>;
  onRegisterMember: (fullName: string, phone: string, email: string) => Promise<boolean>;
  onResetPassword: (memberId: string) => Promise<boolean>;
  onSignOut: () => void; onSwitchDemo: () => void;
  onPendingDemo: () => void; onRefresh: () => void; refreshing: boolean;
  onReview: (id: string, decision: 'approved' | 'rejected') => Promise<boolean>;
};

const membershipLabels = { pending: 'Pending approval', approved: 'Approved', rejected: 'Rejected' };

function Stats({ items }: { items: { value: string | number; label: string }[] }) {
  return <View style={styles.stats}>{items.map(item => <View style={styles.stat} key={item.label}><T style={styles.statValue}>{item.value}</T><T style={styles.statLabel}>{item.label}</T></View>)}</View>;
}

function AttendanceSummary({ data, member }: { data: ChurchData; member: Profile }) {
  const { t, date: dateLabel, number } = useLanguage();
  const rate = attendanceRate(data.services, data.attendance, member);
  const label = rate.percentage === null ? t('N/A') : `${number(rate.percentage)}%`;
  return <View style={styles.attendanceSummary}>
    <View style={styles.between}><View style={{ flex: 1, gap: 5 }}><T style={styles.bold}>Total attendance</T><T style={styles.small}>{t('{attended} of {eligible} completed services', { attended: number(rate.attended), eligible: number(rate.eligible) })}</T></View><T accessibilityLabel={t('Total attendance: {value}', { value: label })} style={[styles.percentage, rate.percentage === null && { fontSize: 14, maxWidth: '40%' }]}>{label}</T></View>
    <View accessibilityRole="progressbar" accessibilityLabel={t('Total attendance percentage')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={rate.percentage ?? undefined} aria-valuetext={rate.percentage === null ? t('No completed services') : label} style={styles.percentageTrack}><View style={[styles.percentageFill, { width: `${rate.percentage ?? 0}%` }]} /></View>
    <T style={{ color: colors.muted, fontSize: 11 }}>{t('Since {date}', { date: dateLabel(member.approved_at || member.created_at) })}</T>
  </View>;
}

function RecordRow({ name, time }: { name: string; time: string }) {
  const { time: timeLabel } = useLanguage();
  return <View style={styles.record}><Avatar name={name} small /><View style={{ flex: 1, gap: 4 }}><T raw style={styles.bold}>{name}</T><T style={styles.small}>{timeLabel(time)}</T></View><Badge text="Present" /></View>;
}

export default function Screens({ data, user, tab, demo, busy, navigate, onCheckIn, onMarkPresent, onCreate, onToggle, onSetChurchLocation, onRegisterMember, onResetPassword, onSignOut, onSwitchDemo, onPendingDemo, onRefresh, refreshing, onReview }: Props) {
  const { t, locale, date: dateLabel, time: timeLabel, number } = useLanguage();
  const [search, setSearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState('All');
  const [historyMonth, setHistoryMonth] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState('');
  const [member, setMember] = useState<Profile | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [day, setDay] = useState(localDay());
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('12:00');
  const [formError, setFormError] = useState('');
  const [membershipFilter, setMembershipFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [verified, setVerified] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<'approved' | 'rejected' | null>(null);
  const [reviewError, setReviewError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [showingQr, setShowingQr] = useState(false);
  const [locating, setLocating] = useState(false);
  const [checkInError, setCheckInError] = useState('');
  const [locationPrompt, setLocationPrompt] = useState<{ serviceId: string; canAskAgain: boolean } | null>(null);
  const [settingLocation, setSettingLocation] = useState(false);
  const [locationSetError, setLocationSetError] = useState('');
  const [registering, setRegistering] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberFormError, setMemberFormError] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const admin = user.role === 'admin';
  const services = [...data.services].sort((first, second) => Date.parse(second.opens_at) - Date.parse(first.opens_at));
  const openServices = services.filter(service => isOpen(service));
  const upcoming = services.filter(service => service.enabled && Date.parse(service.opens_at) > Date.now()).reverse();
  const personal = data.attendance.filter(record => record.member_id === user.id).sort((first, second) => Date.parse(second.checked_in_at) - Date.parse(first.checked_in_at));
  const members = data.profiles.filter(profile => profile.role === 'member');
  const pending = members.filter(profile => (profile.membership_status ?? 'pending') === 'pending');
  const approvedMembers = members.filter(hasMemberAccess);
  const atRisk = approvedMembers.map(profile => ({ profile, streak: missedStreak(data.services, data.attendance, profile) })).filter(entry => entry.streak >= 3).sort((first, second) => second.streak - first.streak);
  const filteredMembers = members.filter(profile => (profile.membership_status ?? 'pending') === membershipFilter && `${profile.full_name} ${profile.email ?? ''} ${profile.phone ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const selected = services.find(service => service.id === selectedService) || openServices[0] || services[0];
  const records = data.attendance.filter(record => record.service_id === selected?.id).sort((first, second) => Date.parse(second.checked_in_at) - Date.parse(first.checked_in_at));
  const findService = (id: string) => services.find(service => service.id === id);

  async function create() {
    setFormError('');
    try {
      const service = makeService(title, location, day, start, end);
      if (await onCreate(service)) { setCreating(false); setTitle(''); setLocation(''); }
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Unable to create service.'); }
  }

  async function runExport(format: ExportFormat) {
    if (exporting) return;
    setExporting(true); setExportError(false);
    try { await exportAttendance(data, format); } catch { setExportError(true); }
    finally { setExporting(false); }
  }

  async function handleCheckIn(serviceId: string) {
    const church = data.church_location;
    if (!church) { onCheckIn(serviceId); return; }
    setCheckInError('');
    const current = await Location.getForegroundPermissionsAsync();
    let status = current.status;
    if (status !== 'granted') {
      if (current.canAskAgain) {
        const requested = await Location.requestForegroundPermissionsAsync();
        status = requested.status;
      }
      if (status !== 'granted') { setLocationPrompt({ serviceId, canAskAgain: current.canAskAgain }); return; }
    }
    setLocating(true);
    try {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const distance = distanceMeters(position.coords, church);
      if (distance > church.radius_meters) { setCheckInError(t('You are {distance}m from the church. Move closer to check in.', { distance: Math.round(distance) })); return; }
      onCheckIn(serviceId);
    } catch { setCheckInError('Unable to confirm your location. Please try again.'); }
    finally { setLocating(false); }
  }

  async function retryLocationPrompt() {
    if (!locationPrompt) return;
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') { const { serviceId } = locationPrompt; setLocationPrompt(null); void handleCheckIn(serviceId); }
    else setLocationPrompt(prompt => prompt && { ...prompt, canAskAgain: false });
  }

  async function useCurrentLocationForChurch() {
    setLocationSetError(''); setSettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setLocationSetError('Location access is required to set the church location.'); return; }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await onSetChurchLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, radius_meters: 100 });
    } catch { setLocationSetError('Unable to confirm your location. Please try again.'); }
    finally { setSettingLocation(false); }
  }

  async function registerMember() {
    setMemberFormError('');
    try {
      const { full_name, phone, email } = makeMemberRegistration(memberName, memberPhone, memberEmail);
      if (await onRegisterMember(full_name, phone, email)) { setRegistering(false); setMemberName(''); setMemberPhone(''); setMemberEmail(''); }
    } catch (error) { setMemberFormError(error instanceof Error ? error.message : 'Unable to register member.'); }
  }

  async function confirmReview() {
    if (!member || !reviewDecision || busy || (reviewDecision === 'approved' && !verified)) return;
    setReviewError(false);
    if (await onReview(member.id, reviewDecision)) {
      setMember(null); setReviewDecision(null); setVerified(false);
    } else setReviewError(true);
  }

  async function confirmResetPassword() {
    if (!member || busy) return;
    if (await onResetPassword(member.id)) setResettingPassword(false);
  }

  function contact(profile: Profile): string {
    return profile.phone ?? profile.email ?? '';
  }

  function attendanceList(memberId: string) {
    const attendance = data.attendance.filter(record => record.member_id === memberId && (!historyMonth || localDay(new Date(record.checked_in_at)).slice(0, 7) === historyMonth)).sort((first, second) => Date.parse(second.checked_in_at) - Date.parse(first.checked_in_at));
    return attendance.length ? attendance.map(record => { const service = findService(record.service_id); return service ? <ServiceRow key={record.id} service={service} checkedAt={record.checked_in_at} attended /> : null; }) : <Empty title="No attendance recorded yet" />;
  }

  function liveCard(service: Service) {
    const checked = hasCheckedIn(data.attendance, user.id, service.id);
    return <View style={styles.liveCard} key={service.id}>
      <Image accessibilityLabel={t('Church sanctuary')} source={{ uri: serviceImageUri }} style={styles.photo} resizeMode="cover" />
      <View style={{ padding: 21, gap: 15 }}><View style={styles.between}><Badge text={checked ? 'YOU ARE CHECKED IN' : 'CHECK-IN OPEN'} /><T style={styles.small}>{new Date(service.opens_at).toLocaleDateString(locale, { weekday: 'long' })}</T></View>
        <T raw style={{ fontFamily: 'Newsreader_600SemiBold', fontSize: 29 }}>{service.title}</T>
        <View style={styles.meta}><Clock3 size={15} color={colors.muted} /><T style={styles.small}>{timeLabel(service.opens_at)} - {timeLabel(service.closes_at)}</T></View>
        <View style={styles.meta}><MapPin size={15} color={colors.muted} /><T raw style={styles.small}>{service.location}</T></View>
        <Button label={checked ? 'Checked in. See you inside!' : 'Mark attendance'} icon={checked ? CheckCircle2 : Check} disabled={checked} loading={locating || (busy && !checked)} onPress={() => handleCheckIn(service.id)} />
        {!checked && !!checkInError && <T accessibilityRole="alert" style={{ color: colors.red }}>{checkInError}</T>}
      </View>
    </View>;
  }

  if (tab === 'account') return <View style={{ gap: 26 }}>
    <View style={styles.profile}><Avatar name={user.full_name} /><View style={{ flex: 1, gap: 6 }}><T raw style={styles.sectionHeading}>{user.full_name}</T><T raw style={styles.small}>{contact(user)}</T></View></View>
    <LanguageSelector account={!demo} disabled={busy} />
    <View style={styles.between}><T>Membership status</T><Badge text={admin ? 'Approved' : membershipLabels[user.membership_status ?? 'pending']} tone={hasMemberAccess(user) ? 'green' : 'gold'} /></View>
    <View style={{ gap: 17 }}><View style={styles.between}><T>Account type</T><Badge text={admin ? 'Administrator' : 'Church member'} /></View><View style={styles.between}><T>Connection</T><Badge text={demo ? 'Local demo' : 'Church database'} tone={demo ? 'gold' : 'green'} /></View><View style={styles.between}><T>Member since</T><T style={styles.small}>{dateLabel(user.created_at)}</T></View></View>
    {demo && <Button label={admin ? 'Switch to member demo' : 'Switch to admin demo'} icon={admin ? UserRound : ShieldCheck} secondary onPress={onSwitchDemo} />}
    {demo && <Button label="Open pending member demo" icon={UserRound} secondary onPress={onPendingDemo} disabled={busy} />}
    <Button label={demo ? 'Exit demo' : 'Sign out'} secondary icon={LogOut} onPress={onSignOut} disabled={busy} />
  </View>;

  if (!hasMemberAccess(user)) return <View style={{ gap: 22, paddingVertical: 22 }}>
    <ShieldCheck size={34} color={colors.green} />
    <Badge text={membershipLabels[user.membership_status ?? 'pending']} tone="gold" />
    <T style={styles.heading}>{user.membership_status === 'rejected' ? 'Membership request declined' : 'Awaiting church approval'}</T>
    <T style={{ color: colors.muted }}>{user.membership_status === 'rejected' ? 'Please contact your church administrator about your membership request.' : 'Your membership request is waiting for a church administrator to review it.'}</T>
    <View style={styles.profile}><Avatar name={user.full_name} /><View style={{ flex: 1, gap: 5 }}><T raw style={styles.bold}>{user.full_name}</T><T raw style={styles.small}>{contact(user)}</T></View></View>
    <Button label="Refresh approval status" icon={RefreshCw} onPress={onRefresh} loading={refreshing} />
    <Button label={demo ? 'Exit demo' : 'Sign out'} secondary icon={LogOut} onPress={onSignOut} disabled={busy} />
  </View>;

  if (!admin && tab === 'home') return <View style={{ gap: 28 }}>
    <View style={{ gap: 7 }}><T style={styles.eyebrow}>YOUR CHURCH COMMUNITY</T><T style={styles.heading}>{t('Welcome, {name}.', { name: user.full_name.split(' ')[0] })}</T><T style={{ color: colors.muted }}>It's good to be together.</T></View>
    {openServices.length > 0 && <Button label="Scan QR to check in" icon={QrCode} secondary onPress={() => setScanning(true)} />}
    {openServices.length ? openServices.map(liveCard) : <View style={styles.noService}><CalendarDays size={27} color={colors.green} /><T style={styles.sectionHeading}>No check-in open right now</T>{upcoming[0] && <T style={styles.small}>{t('Next service: {date}', { date: dateLabel(upcoming[0].opens_at) })}</T>}</View>}
    <Stats items={[{ value: personal.length, label: 'Services attended' }, { value: personal.filter(record => new Date(record.checked_in_at).getMonth() === new Date().getMonth() && new Date(record.checked_in_at).getFullYear() === new Date().getFullYear()).length, label: 'This month' }, { value: personal[0] ? new Date(personal[0].checked_in_at).toLocaleDateString(locale, { month: 'short', day: 'numeric' }) : '--', label: 'Last check-in' }]} />
    <AttendanceSummary data={data} member={user} />
    <View><Section title="Coming up" />{upcoming.length ? upcoming.slice(0, 2).map(service => <ServiceRow key={service.id} service={service} right={<ChevronRight size={16} color={colors.muted} />} />) : <Empty title="No upcoming services" />}</View>
    <View><Section title="Recent attendance" action="View all" onAction={() => navigate('history')} />{personal.length ? personal.slice(0, 3).map(record => { const service = findService(record.service_id); return service ? <ServiceRow key={record.id} service={service} checkedAt={record.checked_in_at} attended /> : null; }) : <Empty title="Your first check-in starts here" />}</View>
    {scanning && <Sheet title="Scan QR to check in" onClose={() => setScanning(false)}><QRScanner onScan={() => { setScanning(false); if (openServices[0]) void handleCheckIn(openServices[0].id); }} onClose={() => setScanning(false)} /></Sheet>}
    {locationPrompt && <Sheet title="Location access needed" onClose={() => setLocationPrompt(null)}>
      <T style={{ color: colors.muted }}>{locationPrompt.canAskAgain ? 'Allow location access so we can confirm you\u2019re at church before marking attendance.' : 'Location access is turned off for this app. Enable it in your device settings to mark attendance.'}</T>
      <Button label={locationPrompt.canAskAgain ? 'Allow location access' : 'Open settings'} icon={MapPin} onPress={() => { locationPrompt.canAskAgain ? void retryLocationPrompt() : void Linking.openSettings(); }} />
      <Button label="Cancel" secondary onPress={() => setLocationPrompt(null)} />
    </Sheet>}
  </View>;

  if (!admin && tab === 'history') {
    const titles = ['All', ...new Set(personal.map(record => findService(record.service_id)?.title).filter((value): value is string => !!value))];
    const filtered = personal.filter(record => historyFilter === 'All' || findService(record.service_id)?.title === historyFilter);
    const visible = filtered.filter(record => !historyMonth || localDay(new Date(record.checked_in_at)).slice(0, 7) === historyMonth);
    return <View style={{ gap: 25 }}>
      <View style={{ gap: 8 }}><T style={styles.heading}>Your attendance.</T><T style={styles.small}>{t('{count} services attended', { count: number(personal.length) })}</T></View>
      <AttendanceSummary data={data} member={user} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{titles.map(label => <Pressable key={label} accessibilityRole="tab" accessibilityState={{ selected: historyFilter === label }} onPress={() => { setHistoryFilter(label); setHistoryMonth(null); }} style={[styles.filter, historyFilter === label && styles.filterSelected]}><T raw={label !== 'All'} style={{ color: historyFilter === label ? colors.green : colors.muted }}>{label}</T></Pressable>)}</ScrollView>
      <AttendanceChart records={filtered} selectedMonth={historyMonth} onSelectMonth={setHistoryMonth} />
      <View><Section title={historyMonth ? new Date(`${historyMonth}-01T12:00:00`).toLocaleDateString(locale, { month: 'long', year: 'numeric' }) : 'Check-in records'} />{visible.length ? visible.map(record => { const service = findService(record.service_id); return service ? <ServiceRow key={record.id} service={service} checkedAt={record.checked_in_at} attended /> : null; }) : <Empty title={historyMonth ? 'No check-ins this month' : 'No attendance yet'} />}</View>
    </View>;
  }

  return <View style={{ gap: 25 }}>
    <View style={{ gap: 7 }}><T style={styles.eyebrow}>CHURCH ADMINISTRATION</T><T style={styles.heading}>{tab === 'members' ? 'Your community.' : tab === 'services' ? 'Gathering together.' : 'Every member matters.'}</T><T style={styles.small}>{tab === 'members' ? t('{count} registered members', { count: number(members.length) }) : tab === 'services' ? t('{count} services', { count: number(services.length) }) : new Date().toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })}</T></View>
    {tab === 'home' && <>
      {pending.length > 0 && <View><Section title="Membership requests" action="Review requests" onAction={() => navigate('members')} /><T style={styles.small}>{t('{count} awaiting approval', { count: number(pending.length) })}</T></View>}
      <Stats items={[{ value: approvedMembers.length, label: 'Church members' }, { value: records.length, label: 'Selected check-ins' }, { value: openServices.length, label: 'Open services' }]} />
      {atRisk.length > 0 && <View><Section title="Needs follow-up" /><T style={styles.small}>{t('{count} missed 3+ services in a row', { count: number(atRisk.length) })}</T>{atRisk.map(entry => <View key={entry.profile.id} style={styles.record}><Avatar name={entry.profile.full_name} small /><View style={{ flex: 1, gap: 4 }}><T raw style={styles.bold}>{entry.profile.full_name}</T><T raw style={styles.small}>{contact(entry.profile)}</T></View><Badge text={t('Missed {count}', { count: number(entry.streak) })} tone="gold" /></View>)}</View>}
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Button label="Export attendance (CSV)" icon={Download} secondary onPress={() => runExport('csv')} loading={exporting} /></View><View style={{ flex: 1 }}><Button label="Export attendance (Excel)" icon={Download} secondary onPress={() => runExport('excel')} loading={exporting} /></View></View>
        {exportError && <T accessibilityRole="alert" style={{ color: colors.red }}>Unable to export attendance. Please try again.</T>}
        <Button label="Show check-in QR code" icon={QrCode} secondary onPress={() => setShowingQr(true)} />
      </View>
      <View><Section title="Attendance register" /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 18 }}>{services.map(service => <Pressable accessibilityRole="tab" accessibilityState={{ selected: selected?.id === service.id }} key={service.id} onPress={() => setSelectedService(service.id)} style={[styles.filter, selected?.id === service.id && styles.filterSelected]}><T raw style={{ fontSize: 12 }}>{service.title}</T><T style={{ fontSize: 10, color: colors.muted }}>{dateLabel(service.opens_at)}</T></Pressable>)}</ScrollView>
        {selected && <View style={[styles.between, { marginBottom: 16 }]}><T raw style={styles.bold}>{selected.title}</T><Badge text={isOpen(selected) ? 'Check-in open' : 'Closed'} tone={isOpen(selected) ? 'green' : 'muted'} /></View>}
        <Field label="Search attendance" placeholder="Search a member's name" value={search} onChangeText={setSearch} />
        {records.filter(record => data.profiles.find(profile => profile.id === record.member_id)?.full_name.toLowerCase().includes(search.toLowerCase())).map(record => <RecordRow key={record.id} name={data.profiles.find(profile => profile.id === record.member_id)?.full_name || 'Member'} time={record.checked_in_at} />)}
        {!records.length && <Empty title="No check-ins for this service" />}
        {!!records.length && !records.some(record => data.profiles.find(profile => profile.id === record.member_id)?.full_name.toLowerCase().includes(search.toLowerCase())) && <Empty title="No matching members" />}
        {selected && <View style={{ marginTop: 14, gap: 4 }}>
          <T style={styles.bold}>Not checked in</T>
          {approvedMembers.filter(profile => !records.some(record => record.member_id === profile.id) && profile.full_name.toLowerCase().includes(search.toLowerCase())).map(profile => <View key={profile.id} style={styles.record}><Avatar name={profile.full_name} small /><View style={{ flex: 1, gap: 4 }}><T raw style={styles.bold}>{profile.full_name}</T></View><Button label="Mark present" icon={Check} secondary onPress={() => onMarkPresent(profile.id, selected.id)} disabled={busy} /></View>)}
        </View>}
      </View>
    </>}
    {tab === 'services' && <><View style={{ gap: 8 }}>
      <T style={styles.bold}>Church location</T>
      <T style={styles.small}>{data.church_location ? t('Check-in requires being within {radius}m of church.', { radius: number(data.church_location.radius_meters) }) : 'Members can check in from anywhere until you set the church location.'}</T>
      <Button label="Use my current location" icon={MapPin} secondary loading={settingLocation} onPress={useCurrentLocationForChurch} />
      {!!locationSetError && <T accessibilityRole="alert" style={{ color: colors.red }}>{locationSetError}</T>}
    </View>
    <Button label="Create service" icon={Plus} onPress={() => { setFormError(''); setCreating(true); }} /><View>{services.map(service => <ServiceRow key={service.id} service={service} right={<View style={{ alignItems: 'center', gap: 6, maxWidth: 65 }}><Switch accessibilityLabel={t('Enable check-in for {title} on {date}', { title: service.title, date: dateLabel(service.opens_at) })} value={service.enabled} disabled={busy || Date.parse(service.closes_at) <= Date.now()} onValueChange={enabled => onToggle(service.id, enabled)} trackColor={{ false: colors.line, true: colors.green }} thumbColor="#fff" /><T style={{ fontSize: 10, color: colors.muted, textAlign: 'center' }}>{Date.parse(service.closes_at) <= Date.now() ? 'Ended' : service.enabled ? 'Enabled' : 'Paused'}</T></View>} />)}{!services.length && <Empty title="No services yet" />}</View></>}
    {tab === 'members' && <>
      <Button label="Add member" icon={Plus} secondary onPress={() => { setMemberFormError(''); setRegistering(true); }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{(['pending', 'approved', 'rejected'] as const).map(status => <Pressable key={status} accessibilityRole="tab" accessibilityLabel={t(membershipLabels[status])} aria-selected={membershipFilter === status} onPress={() => { setMembershipFilter(status); setSearch(''); }} style={[styles.filter, membershipFilter === status && styles.filterSelected]}><T>{membershipLabels[status]}</T></Pressable>)}</ScrollView>
      <Field label="Search members" placeholder="Name or email address" value={search} onChangeText={setSearch} /><View>{filteredMembers.map(profile => {
      const rate = attendanceRate(data.services, data.attendance, profile);
      const label = rate.percentage === null ? t('N/A') : `${number(rate.percentage)}%`;
      return <Pressable accessibilityRole="button" accessibilityLabel={t("View {name}'s attendance", { name: profile.full_name })} onPress={() => { setMember(profile); setVerified(false); setReviewDecision(null); setReviewError(false); }} key={profile.id} style={styles.record}><Avatar name={profile.full_name} small /><View style={{ flex: 1, gap: 4 }}><T raw style={styles.bold}>{profile.full_name}</T><T raw style={styles.small}>{contact(profile)}</T></View>{hasMemberAccess(profile) && <View accessible accessibilityLabel={t('Total attendance: {value}', { value: label })}><Badge text={label} tone="muted" /></View>}<ChevronRight size={17} color={colors.muted} /></Pressable>;
    })}{!filteredMembers.length && <Empty title={search ? 'No matching members' : membershipFilter === 'pending' ? 'No membership requests' : 'No matching members'} />}</View></>}
    {member && <Sheet title={member.full_name} rawTitle onClose={() => { if (!busy) { setMember(null); setHistoryMonth(null); setReviewDecision(null); setReviewError(false); setResettingPassword(false); } }}>
      <T raw style={styles.small}>{contact(member)}</T><Badge text={membershipLabels[member.membership_status ?? 'pending']} tone={hasMemberAccess(member) ? 'green' : 'gold'} />
      {hasMemberAccess(member) ? <><AttendanceSummary data={data} member={member} /><AttendanceChart key={member.id} records={data.attendance.filter(record => record.member_id === member.id)} selectedMonth={historyMonth} onSelectMonth={setHistoryMonth} /><T style={styles.bold}>Attendance history</T>{attendanceList(member.id)}</> : <>
        <T style={styles.small}>{t('Since {date}', { date: dateLabel(member.created_at) })}</T>
        {reviewDecision ? <><T style={styles.sectionHeading}>{t(reviewDecision === 'approved' ? 'Approve {name}?' : "Reject {name}'s request?", { name: member.full_name })}</T><Button label={reviewDecision === 'approved' ? 'Confirm approval' : 'Confirm rejection'} icon={reviewDecision === 'approved' ? Check : X} onPress={confirmReview} loading={busy} /><Button label="Cancel" secondary onPress={() => setReviewDecision(null)} disabled={busy} /></> : <>
          <View style={styles.between}><T style={{ flex: 1 }}>I have verified church membership</T><Switch accessibilityLabel={t('I have verified church membership')} value={verified} disabled={busy} onValueChange={setVerified} trackColor={{ false: colors.line, true: colors.green }} thumbColor="#fff" /></View>
          <Button label="Approve member" icon={Check} onPress={() => setReviewDecision('approved')} disabled={!verified || busy} />
          {member.membership_status !== 'rejected' && <Button label="Reject request" icon={X} secondary onPress={() => setReviewDecision('rejected')} disabled={busy} />}
        </>}
        {reviewError && <T accessibilityRole="alert" style={{ color: colors.red }}>Unable to save membership decision. Please try again.</T>}
      </>}
      {!reviewDecision && (resettingPassword ? <>
        <T style={styles.sectionHeading}>{t('Give {name} a new temporary password?', { name: member.full_name })}</T>
        <T style={styles.small}>They'll need it to sign in — share it with them directly, not by email.</T>
        <Button label="Confirm reset" icon={KeyRound} onPress={confirmResetPassword} loading={busy} />
        <Button label="Cancel" secondary onPress={() => setResettingPassword(false)} disabled={busy} />
      </> : <Button label="Reset password" icon={KeyRound} secondary onPress={() => setResettingPassword(true)} disabled={busy} />)}
    </Sheet>}
    {creating && <Sheet title="Create service" onClose={() => { if (!busy) setCreating(false); }}><Field label="Service name" placeholder="Sunday Worship" value={title} onChangeText={setTitle} maxLength={120} /><Field label="Location" placeholder="Main sanctuary" value={location} onChangeText={setLocation} maxLength={160} /><Field label="Date (YYYY-MM-DD)" value={day} onChangeText={setDay} autoCapitalize="none" /><View style={{ flexDirection: 'row', gap: 14 }}><View style={{ flex: 1 }}><Field label="Opens (HH:MM)" value={start} onChangeText={setStart} /></View><View style={{ flex: 1 }}><Field label="Closes (HH:MM)" value={end} onChangeText={setEnd} /></View></View><T style={styles.small}>Times are in your device's local timezone. Sunday services always close at end of day.</T>{!!formError && <T accessibilityRole="alert" style={{ color: colors.red }}>{formError}</T>}<Button label="Save service" icon={Check} onPress={create} loading={busy} /></Sheet>}
    {showingQr && <Sheet title="Check-in QR code" onClose={() => setShowingQr(false)}><QRCodeDisplay /><T style={{ textAlign: 'center', color: colors.muted }}>Print this code once. It checks members into whichever service is open when they scan it.</T></Sheet>}
    {registering && <Sheet title="Add member" onClose={() => { if (!busy) setRegistering(false); }}>
      <T style={styles.small}>Registering a member here approves them immediately, without a self sign-up.</T>
      <Field label="Full name" value={memberName} onChangeText={setMemberName} maxLength={120} />
      <Field label="Mobile number" value={memberPhone} onChangeText={setMemberPhone} keyboardType="phone-pad" />
      <Field label="Email address (optional)" value={memberEmail} onChangeText={setMemberEmail} keyboardType="email-address" autoCapitalize="none" />
      {!!memberFormError && <T accessibilityRole="alert" style={{ color: colors.red }}>{memberFormError}</T>}
      <Button label="Register member" icon={Check} onPress={registerMember} loading={busy} />
    </Sheet>}
  </View>;
}

const styles = StyleSheet.create({
  heading: { fontSize: 34, fontFamily: 'Newsreader_600SemiBold' },
  eyebrow: { fontSize: 10, fontFamily: 'DMSans_700Bold', color: colors.green },
  sectionHeading: { fontFamily: 'DMSans_700Bold', fontSize: 19 },
  small: { color: colors.muted, fontSize: 12, flexShrink: 1 },
  bold: { fontFamily: 'DMSans_700Bold', flexShrink: 1 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveCard: { borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff', overflow: 'hidden' },
  photo: { width: '100%', height: 145, backgroundColor: colors.pale },
  stats: { flexDirection: 'row', paddingVertical: 22, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, gap: 10 },
  stat: { flex: 1, gap: 7 },
  statValue: { fontFamily: 'Newsreader_600SemiBold', fontSize: 30 },
  statLabel: { color: colors.muted, fontSize: 11 },
  attendanceSummary: { gap: 10, paddingBottom: 18, borderBottomWidth: 1, borderColor: colors.line },
  percentage: { fontFamily: 'Newsreader_600SemiBold', fontSize: 34, color: colors.green },
  percentageTrack: { height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' },
  percentageFill: { height: 6, backgroundColor: colors.green },
  record: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderColor: colors.line },
  filter: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 5, borderWidth: 1, borderColor: colors.line, gap: 4, justifyContent: 'center' },
  filterSelected: { backgroundColor: colors.pale, borderColor: '#b5d2c1' },
  noService: { alignItems: 'center', paddingVertical: 28, gap: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 15, paddingBottom: 25, borderBottomWidth: 1, borderColor: colors.line },
});