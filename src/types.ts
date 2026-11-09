export type MembershipStatus = 'pending' | 'approved' | 'rejected';
export type Profile = { id: string; full_name: string; email: string; role: 'member' | 'admin'; created_at: string; membership_status?: MembershipStatus; approved_at?: string | null };
export type Service = { id: string; title: string; location: string; opens_at: string; closes_at: string; enabled: boolean };
export type Attendance = { id: string; member_id: string; service_id: string; checked_in_at: string };
export type ChurchData = { profiles: Profile[]; services: Service[]; attendance: Attendance[] };
export type NewService = Omit<Service, 'id'>;