import type { Attendance, ChurchLocation, NewService, Profile, Service } from './types';

export function isOpen(service: Service, now = Date.now()): boolean {
  return service.enabled && Date.parse(service.opens_at) <= now && now < Date.parse(service.closes_at);
}

// Great-circle distance in meters (haversine formula).
export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const earthRadius = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

export function isWithinChurchRadius(point: { latitude: number; longitude: number }, church: ChurchLocation): boolean {
  return distanceMeters(point, church) <= church.radius_meters;
}

export function hasCheckedIn(records: Attendance[], memberId: string, serviceId: string): boolean {
  return records.some(record => record.member_id === memberId && record.service_id === serviceId);
}

export function makeMemberRegistration(fullName: string, phone: string, email: string): { full_name: string; phone: string; email: string } {
  const name = fullName.trim();
  const trimmedPhone = phone.trim();
  const trimmedEmail = email.trim().toLowerCase();
  if (!name) throw new Error('Enter a full name.');
  if (name.length > 120) throw new Error('Full name is too long.');
  if (!trimmedPhone) throw new Error('Enter a mobile number.');
  const digits = trimmedPhone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) throw new Error('Enter a valid mobile number.');
  if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) throw new Error('Enter a valid email address.');
  return { full_name: name, phone: trimmedPhone, email: trimmedEmail };
}

// Supabase Auth needs an email identifier; members who skip email still get one to sign in with.
export function syntheticEmailFromPhone(phone: string): string {
  return `${phone.replace(/\D/g, '')}@phone.gather.invalid`;
}

export function hasMemberAccess(member: Pick<Profile, 'role' | 'membership_status'>): boolean {
  return member.role === 'admin' || member.membership_status === 'approved';
}

export function attendanceRate(services: Service[], records: Attendance[], member: Pick<Profile, 'id' | 'created_at' | 'approved_at'>, now = Date.now()) {
  const joinedAt = Math.max(Date.parse(member.created_at), member.approved_at ? Date.parse(member.approved_at) : Date.parse(member.created_at));
  const eligibleIds = new Set(services.filter(service => {
    const opensAt = Date.parse(service.opens_at);
    const closesAt = Date.parse(service.closes_at);
    return opensAt >= joinedAt && closesAt > opensAt && closesAt <= now;
  }).map(service => service.id));
  const attendedIds = new Set(records.filter(record => record.member_id === member.id && eligibleIds.has(record.service_id)).map(record => record.service_id));
  return {
    attended: attendedIds.size,
    eligible: eligibleIds.size,
    percentage: eligibleIds.size ? Math.round(attendedIds.size / eligibleIds.size * 100) : null,
  };
}

// Consecutive misses counting back from the most recent eligible completed service.
export function missedStreak(services: Service[], records: Attendance[], member: Pick<Profile, 'id' | 'created_at' | 'approved_at'>, now = Date.now()): number {
  const joinedAt = Math.max(Date.parse(member.created_at), member.approved_at ? Date.parse(member.approved_at) : Date.parse(member.created_at));
  const eligible = services
    .filter(service => {
      const opensAt = Date.parse(service.opens_at);
      const closesAt = Date.parse(service.closes_at);
      return opensAt >= joinedAt && closesAt > opensAt && closesAt <= now;
    })
    .sort((first, second) => Date.parse(second.opens_at) - Date.parse(first.opens_at));
  let streak = 0;
  for (const service of eligible) {
    if (hasCheckedIn(records, member.id, service.id)) break;
    streak++;
  }
  return streak;
}

export function makeService(title: string, location: string, day: string, start: string, end: string): NewService {
  if (!title.trim() || !location.trim()) throw new Error('Enter a service name and location.');
  if (title.trim().length > 120 || location.trim().length > 160) throw new Error('Service name or location is too long.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end)) {
    throw new Error('Use YYYY-MM-DD for the date and HH:MM (24-hour) for the times.');
  }
  const opens = new Date(`${day}T${start}:00`);
  const closes = opens.getDay() === 0 ? new Date(`${day}T23:59:59`) : new Date(`${day}T${end}:00`);
  if (!Number.isFinite(opens.getTime()) || opens.getFullYear() !== Number(day.slice(0, 4)) || opens.getMonth() + 1 !== Number(day.slice(5, 7)) || opens.getDate() !== Number(day.slice(8, 10))) throw new Error('Enter a valid calendar date.');
  if (closes <= opens) throw new Error('Closing time must be after opening time on the same day.');
  return { title: title.trim(), location: location.trim(), opens_at: opens.toISOString(), closes_at: closes.toISOString(), enabled: true };
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function attendanceByMonth(records: Attendance[], endMonth = new Date(), locale = 'en-US') {
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(endMonth.getFullYear(), endMonth.getMonth() - 5 + index, 1);
    return {
      key: localDay(date).slice(0, 7),
      label: date.toLocaleDateString(locale, { month: 'short' }),
      title: date.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
      count: 0,
    };
  });
  for (const record of records) {
    const date = new Date(record.checked_in_at);
    if (!Number.isFinite(date.getTime())) continue;
    const month = months.find(item => item.key === localDay(date).slice(0, 7));
    if (month) month.count++;
  }
  return months;
}

export async function collectPages<Item>(readPage: (from: number, to: number) => Promise<Item[]>, pageSize = 500): Promise<Item[]> {
  const result: Item[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await readPage(offset, offset + pageSize - 1);
    result.push(...page);
    if (page.length < pageSize) return result;
  }
}