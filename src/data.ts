import AsyncStorage from '@react-native-async-storage/async-storage';
import { collectPages, hasCheckedIn, hasMemberAccess, isOpen } from './domain';
import { supabase } from './supabase';
import type { ChurchData, ChurchLocation, NewService, Profile } from './types';

const demoKey = 'gather-demo-v1';
export const demoMemberId = 'demo-member';
export const demoAdminId = 'demo-admin';
export const demoPendingId = 'demo-pending';

function seed(): ChurchData {
  const now = Date.now();
  const iso = (offset: number) => new Date(now + offset).toISOString();
  const day = 86400000;
  const profiles: Profile[] = ['Jordan Ellis', 'Grace Thompson', 'Daniel James', 'Sarah Williams', 'Michael Chen', 'Ruth Anderson', 'David Wilson', 'Esther Paul'].map((name, index) => ({
    id: index === 0 ? demoMemberId : `demo-${index}`, full_name: name, email: `${name.toLowerCase().replace(' ', '.')}@example.com`, role: 'member', created_at: iso(-90 * day), membership_status: 'approved', approved_at: iso(-90 * day),
  }));
  profiles.push({ id: demoAdminId, full_name: 'Alex Morgan', email: 'admin@example.com', role: 'admin', created_at: iso(-90 * day) });
  const services = [
    { id: 'today', title: 'Sunday Worship', location: 'Main sanctuary', opens_at: iso(-3600000), closes_at: iso(6 * 3600000), enabled: true },
    { id: 'midweek', title: 'Midweek Prayer', location: 'Community hall', opens_at: iso(3 * day), closes_at: iso(3 * day + 7200000), enabled: true },
    ...Array.from({ length: 6 }, (_, index) => ({ id: `past-${index}`, title: index % 2 ? 'Midweek Prayer' : 'Sunday Worship', location: index % 2 ? 'Community hall' : 'Main sanctuary', opens_at: iso(-(index + 1) * 7 * day), closes_at: iso(-(index + 1) * 7 * day + 7200000), enabled: false })),
  ];
  const attendance = profiles.filter(profile => profile.role === 'member').flatMap((profile, index) => services.filter(service => service.id.startsWith('past') && (index === 0 || index % 3 !== 0)).map(service => ({ id: `${profile.id}-${service.id}`, member_id: profile.id, service_id: service.id, checked_in_at: service.opens_at })));
  profiles.slice(1, 5).forEach(profile => attendance.push({ id: `${profile.id}-today`, member_id: profile.id, service_id: 'today', checked_in_at: iso(-1800000) }));
  return { profiles, services, attendance, church_location: { latitude: 12.952476897125502, longitude: 77.62284464550632, radius_meters: 100 } };
}

async function loadDemo(): Promise<ChurchData> {
  const raw = await AsyncStorage.getItem(demoKey);
  const data = raw ? JSON.parse(raw) as ChurchData : seed();
  let changed = !raw;
  for (const profile of data.profiles) {
    if (profile.membership_status === undefined) {
      profile.membership_status = profile.id === demoMemberId || profile.id === demoAdminId || /^demo-[1-7]$/.test(profile.id) ? 'approved' : 'pending';
      profile.approved_at = profile.membership_status === 'approved' ? profile.created_at : null;
      changed = true;
    }
  }
  if (!data.profiles.some(profile => profile.id === demoPendingId)) {
    data.profiles.push({ id: demoPendingId, full_name: 'Samuel Joseph', email: 'samuel.joseph@example.com', role: 'member', created_at: new Date().toISOString(), membership_status: 'pending', approved_at: null });
    changed = true;
  }
  if (changed) await AsyncStorage.setItem(demoKey, JSON.stringify(data));
  return data;
}

export async function loadData(demo: boolean): Promise<ChurchData> {
  if (demo) return loadDemo();
  if (!supabase) throw new Error('The church database is not configured yet.');
  const client = supabase;
  async function readTable<Item>(table: string, order: string): Promise<Item[]> {
    return collectPages(async (from, to) => {
      const { data, error } = await client.from(table).select('*').order(order).order('id').range(from, to);
      if (error) throw new Error(error.message);
      return data as Item[];
    });
  }
  const [profiles, services, attendance] = await Promise.all([
    readTable<Profile>('profiles', 'full_name'),
    readTable<ChurchData['services'][number]>('services', 'opens_at'),
    readTable<ChurchData['attendance'][number]>('attendance', 'checked_in_at'),
  ]);
  const { data: locationRow } = await client.from('church_settings').select('*').eq('id', 'singleton').maybeSingle();
  const church_location: ChurchLocation | null = locationRow ? { latitude: locationRow.latitude, longitude: locationRow.longitude, radius_meters: locationRow.radius_meters } : null;
  return { profiles, services, attendance, church_location };
}

export async function checkIn(demo: boolean, memberId: string, serviceId: string): Promise<void> {
  if (demo) {
    const data = await loadDemo();
    const member = data.profiles.find(profile => profile.id === memberId);
    if (!member || !hasMemberAccess(member)) throw new Error('Your membership must be approved before checking in.');
    const service = data.services.find(item => item.id === serviceId);
    if (!service || !isOpen(service)) throw new Error('Check-in has closed for this service.');
    if (hasCheckedIn(data.attendance, memberId, serviceId)) return;
    data.attendance.push({ id: `attendance-${Date.now()}`, member_id: memberId, service_id: serviceId, checked_in_at: new Date().toISOString() });
    await AsyncStorage.setItem(demoKey, JSON.stringify(data));
    return;
  }
  if (!supabase) throw new Error('Database not configured.');
  const { error } = await supabase.from('attendance').insert({ member_id: memberId, service_id: serviceId });
  if (error && error.code !== '23505') throw new Error('Check-in was not saved. The service may have closed. Refresh and try again.');
}

export async function saveService(demo: boolean, service: NewService): Promise<void> {
  if (demo) {
    const data = await loadDemo();
    data.services.push({ ...service, id: `service-${Date.now()}` });
    await AsyncStorage.setItem(demoKey, JSON.stringify(data));
    return;
  }
  if (!supabase) throw new Error('Database not configured.');
  const { error } = await supabase.from('services').insert(service);
  if (error) throw new Error(error.message);
}

export async function setServiceEnabled(demo: boolean, serviceId: string, enabled: boolean): Promise<void> {
  if (demo) {
    const data = await loadDemo();
    data.services = data.services.map(service => service.id === serviceId ? { ...service, enabled } : service);
    await AsyncStorage.setItem(demoKey, JSON.stringify(data));
    return;
  }
  if (!supabase) throw new Error('Database not configured.');
  const { error } = await supabase.from('services').update({ enabled }).eq('id', serviceId);
  if (error) throw new Error(error.message);
}

export async function setChurchLocation(demo: boolean, location: ChurchLocation): Promise<void> {
  if (demo) {
    const data = await loadDemo();
    data.church_location = location;
    await AsyncStorage.setItem(demoKey, JSON.stringify(data));
    return;
  }
  if (!supabase) throw new Error('Database not configured.');
  const { error } = await supabase.from('church_settings').upsert({ id: 'singleton', ...location });
  if (error) throw new Error(error.message);
}

export async function reviewMembership(demo: boolean, actorId: string, memberId: string, decision: 'approved' | 'rejected'): Promise<void> {
  if (decision !== 'approved' && decision !== 'rejected') throw new Error('Invalid membership decision.');
  if (demo) {
    const data = await loadDemo();
    const actor = data.profiles.find(profile => profile.id === actorId);
    if (actor?.role !== 'admin') throw new Error('Only administrators can review membership.');
    const member = data.profiles.find(profile => profile.id === memberId && profile.role === 'member');
    if (!member) throw new Error('Member profile not found.');
    member.membership_status = decision;
    if (decision === 'approved' && !member.approved_at) member.approved_at = new Date().toISOString();
    await AsyncStorage.setItem(demoKey, JSON.stringify(data));
    return;
  }
  if (!supabase) throw new Error('Database not configured.');
  const { error } = await supabase.rpc('review_membership', { target_member: memberId, decision });
  if (error) throw new Error('Unable to save membership decision. Please try again.');
}