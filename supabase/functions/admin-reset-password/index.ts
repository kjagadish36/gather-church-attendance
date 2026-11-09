// Deployed separately via `supabase functions deploy admin-reset-password` — not run in this workspace (no live project).
// Lets an admin reset any member's password (including phone-only accounts with no real email to send a reset link to).
// SUPABASE_SERVICE_ROLE_KEY must be set only as a function secret, never shipped to the client.
import { createClient } from 'npm:@supabase/supabase-js@2';

function generateTempPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '').slice(0, 10);
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization') ?? '';
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Verify the caller is an authenticated admin using their own JWT (anon key + their Authorization header).
  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) return new Response(JSON.stringify({ error: 'Not authenticated.' }), { status: 401 });

  const { data: callerProfile } = await callerClient.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
  if (callerProfile?.role !== 'admin') return new Response(JSON.stringify({ error: 'Only administrators can reset passwords.' }), { status: 403 });

  const { member_id } = await req.json();
  if (!member_id) return new Response(JSON.stringify({ error: 'Member not specified.' }), { status: 400 });

  const tempPassword = generateTempPassword();
  // Service-role client bypasses RLS — required to set another user's password.
  const adminClient = createClient(url, serviceRoleKey);
  const { error: updateError } = await adminClient.auth.admin.updateUserById(member_id, { password: tempPassword });
  if (updateError) return new Response(JSON.stringify({ error: updateError.message }), { status: 400 });

  return new Response(JSON.stringify({ temp_password: tempPassword }), { status: 200 });
});
