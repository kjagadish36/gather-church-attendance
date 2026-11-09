// Deployed separately via `supabase functions deploy admin-create-member` — not run in this workspace (no live project).
// Creates a church member on an admin's behalf, auto-approved, without the member self-registering.
// SUPABASE_SERVICE_ROLE_KEY must be set only as a function secret, never shipped to the client.
import { createClient } from 'npm:@supabase/supabase-js@2';

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
  if (callerProfile?.role !== 'admin') return new Response(JSON.stringify({ error: 'Only administrators can register members.' }), { status: 403 });

  const { full_name, phone, email } = await req.json();
  if (!full_name || !phone) return new Response(JSON.stringify({ error: 'Enter a full name and mobile number.' }), { status: 400 });

  // Auth requires an email identifier; members who skip email sign in with a synthetic one derived from their phone.
  const authEmail = email && email.trim() ? email.trim() : `${phone.replace(/\D/g, '')}@phone.gather.invalid`;

  // Service-role client bypasses RLS — required to create auth users and pre-approve the profile.
  const adminClient = createClient(url, serviceRoleKey);
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: authEmail, email_confirm: true, user_metadata: { full_name, phone, email: email ?? '' },
  });
  if (createError || !created.user) return new Response(JSON.stringify({ error: createError?.message ?? 'Unable to create member.' }), { status: 400 });

  // handle_new_member() trigger inserts the profile as pending; approve it immediately since an admin vouched for them.
  const { error: approveError } = await adminClient.from('profiles').update({ membership_status: 'approved', approved_at: new Date().toISOString() }).eq('id', created.user.id);
  if (approveError) return new Response(JSON.stringify({ error: approveError.message }), { status: 400 });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
