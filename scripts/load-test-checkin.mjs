#!/usr/bin/env node
// Concurrency load test for the real check-in path: N authenticated members, each
// inserting one attendance row for the same open service at the same time, through
// the actual RLS policy (attendance_check_in), not the service-role key.
//
// shortcut: needs N pre-existing APPROVED member accounts that share one password,
// and email confirmation OFF for those test accounts (or already confirmed) —
// this script does not create/approve accounts, point it at a disposable test project.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SERVICE_ID=<open-service-uuid> \
//   TEST_EMAIL_PREFIX=loadtest TEST_EMAIL_DOMAIN=example.com TEST_PASSWORD=... \
//   CONCURRENCY=500 node scripts/load-test-checkin.mjs
//
// Expects member accounts loadtest0@example.com .. loadtest{N-1}@example.com,
// all membership_status='approved', all sharing TEST_PASSWORD.

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceId = process.env.SERVICE_ID;
const emailPrefix = process.env.TEST_EMAIL_PREFIX ?? 'loadtest';
const emailDomain = process.env.TEST_EMAIL_DOMAIN ?? 'example.com';
const password = process.env.TEST_PASSWORD;
const concurrency = Number(process.env.CONCURRENCY ?? 500);

if (!url || !anonKey || !serviceId || !password) {
  console.error('Missing required env: SUPABASE_URL, SUPABASE_ANON_KEY, SERVICE_ID, TEST_PASSWORD');
  process.exit(1);
}

async function checkInOnce(index) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const email = `${emailPrefix}${index}@${emailDomain}`;
  const start = performance.now();
  const { data: session, error: authError } = await client.auth.signInWithPassword({ email, password });
  if (authError || !session.user) return { index, ok: false, stage: 'auth', ms: performance.now() - start, error: authError?.message };
  const { error: insertError } = await client.from('attendance').insert({ member_id: session.user.id, service_id: serviceId });
  const ms = performance.now() - start;
  if (insertError && insertError.code !== '23505') return { index, ok: false, stage: 'insert', ms, error: insertError.message };
  return { index, ok: true, ms };
}

const started = performance.now();
const results = await Promise.all(Array.from({ length: concurrency }, (_, i) => checkInOnce(i)));
const totalMs = performance.now() - started;

const ok = results.filter(r => r.ok);
const failed = results.filter(r => !r.ok);
const timings = ok.map(r => r.ms).sort((a, b) => a - b);
const percentile = p => timings.length ? timings[Math.floor((timings.length - 1) * p)].toFixed(0) : 'n/a';

console.log(`Concurrency: ${concurrency}`);
console.log(`Total wall time: ${totalMs.toFixed(0)}ms`);
console.log(`Succeeded: ${ok.length}, Failed: ${failed.length}`);
console.log(`Per-request latency: p50=${percentile(0.5)}ms p90=${percentile(0.9)}ms p99=${percentile(0.99)}ms max=${timings.at(-1)?.toFixed(0) ?? 'n/a'}ms`);
if (failed.length) {
  console.log('Sample failures:', failed.slice(0, 5).map(f => `#${f.index} ${f.stage}: ${f.error}`).join(' | '));
}
