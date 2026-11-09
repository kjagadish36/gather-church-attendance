import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/domain.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { isOpen, hasCheckedIn, makeService, initials, collectPages, attendanceByMonth, attendanceRate, hasMemberAccess, missedStreak, distanceMeters, isWithinChurchRadius } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const service = { enabled: true, opens_at: '2026-11-08T09:00:00Z', closes_at: '2026-11-08T11:00:00Z' };

const translationSource = await readFile(new URL('../src/translations.ts', import.meta.url), 'utf8');
const translationCompiled = ts.transpileModule(translationSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { languages, messages, translate, isLanguage, formatDate, registrationMetadata } = await import(`data:text/javascript;base64,${Buffer.from(translationCompiled).toString('base64')}`);

const moduleUrl = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const storageUrl = moduleUrl('export const store = new Map(); export default { getItem: async key => store.get(key) ?? null, setItem: async (key, value) => { store.set(key, value); } };');
const { store } = await import(storageUrl);
const dataSource = await readFile(new URL('../src/data.ts', import.meta.url), 'utf8');
const importUrls = { '@react-native-async-storage/async-storage': storageUrl, './domain': moduleUrl(compiled), './supabase': moduleUrl('export const supabase = null;') };
const dataCompiled = ts.transpileModule(dataSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  transformers: { before: [context => {
    function visit(node) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && importUrls[node.moduleSpecifier.text]) {
        return context.factory.updateImportDeclaration(node, node.modifiers, node.importClause, context.factory.createStringLiteral(importUrls[node.moduleSpecifier.text]), node.attributes);
      }
      return ts.visitEachChild(node, visit, context);
    }
    return source => ts.visitNode(source, visit);
  }] },
}).outputText;
const demoApi = await import(moduleUrl(dataCompiled));

test('four supported languages have complete translations and matching placeholders', () => {
  assert.deepEqual(Object.keys(languages), ['en', 'hi', 'kn', 'ta']);
  for (const [source, translations] of Object.entries(messages)) {
    assert.equal(translations.length, 3);
    const placeholders = text => [...text.matchAll(/\{\w+\}/g)].map(match => match[0]).sort();
    for (const text of translations) {
      assert.ok(text.trim());
      assert.deepEqual(placeholders(text), placeholders(source), `Placeholder mismatch for ${source}`);
    }
  }
});

test('language selection validation and translated interpolation preserve user data', () => {
  assert.equal(isLanguage('kn'), true);
  assert.equal(isLanguage('fr'), false);
  assert.equal(isLanguage('constructor'), false);
  assert.equal(translate('History', 'hi'), 'इतिहास');
  assert.equal(translate('History', 'kn'), 'ಇತಿಹಾಸ');
  assert.equal(translate('History', 'ta'), 'வரலாறு');
  assert.equal(translate('Welcome, {name}.', 'en', { name: 'Jordan' }), 'Welcome, Jordan.');
  assert.equal(translate('Welcome, {name}.', 'hi', { name: 'Jordan {count}' }), 'स्वागत है, Jordan {count}।');
  assert.equal(translate('Church-owned title', 'ta'), 'Church-owned title');
});

test('dates use the selected language locale', () => {
  const date = '2026-11-08T12:00:00';
  for (const language of Object.keys(languages)) {
    assert.equal(formatDate(date, language), new Date(date).toLocaleDateString(languages[language].locale, { month: 'short', day: 'numeric', year: 'numeric' }));
  }
});

test('check-in opens at the start and closes exactly at the end', () => {
  assert.equal(isOpen(service, Date.parse('2026-11-08T08:59:59Z')), false);
  assert.equal(isOpen(service, Date.parse(service.opens_at)), true);
  assert.equal(isOpen(service, Date.parse(service.closes_at)), false);
  assert.equal(isOpen({ ...service, enabled: false }, Date.parse(service.opens_at)), false);
});
test('attendance lookup isolates both member and service', () => {
  const records = [{ member_id: 'member-a', service_id: 'service-a' }];
  assert.equal(hasCheckedIn(records, 'member-a', 'service-a'), true);
  assert.equal(hasCheckedIn(records, 'member-b', 'service-a'), false);
  assert.equal(hasCheckedIn(records, 'member-a', 'service-b'), false);
});
test('service creation validates dates, times and order', () => {
  assert.throws(() => makeService('', 'Hall', '2026-11-08', '09:00', '11:00'));
  assert.throws(() => makeService('Prayer', 'Hall', '2026-02-30', '09:00', '11:00'));
  assert.throws(() => makeService('Prayer', 'Hall', '2026-11-08', '25:00', '26:00'));
  assert.throws(() => makeService('Prayer', 'Hall', '2026-11-09', '11:00', '09:00'));
  const result = makeService(' Prayer ', ' Hall ', '2026-11-08', '09:00', '11:00');
  assert.equal(result.title, 'Prayer');
  assert.equal(result.location, 'Hall');
  assert.ok(Date.parse(result.closes_at) > Date.parse(result.opens_at));
});
test('Sunday services close at end of day regardless of the typed closing time', () => {
  const result = makeService('Sunday Worship', 'Hall', '2026-11-08', '09:00', '10:00');
  assert.equal(result.closes_at, new Date('2026-11-08T23:59:59').toISOString());
});
test('initials handle extra whitespace and empty names', () => {
  assert.equal(initials('  Jordan   Ellis '), 'JE');
  assert.equal(initials(''), '');
});

test('cloud pagination retrieves histories beyond 1000 records', async () => {
  const records = Array.from({ length: 1205 }, (_, index) => index);
  const ranges = [];
  const result = await collectPages(async (from, to) => { ranges.push([from, to]); return records.slice(from, to + 1); });
  assert.deepEqual(result, records);
  assert.deepEqual(ranges, [[0, 499], [500, 999], [1000, 1499]]);
});

test('pagination finishes on empty pages and propagates failures', async () => {
  assert.deepEqual(await collectPages(async () => []), []);
  await assert.rejects(() => collectPages(async () => { throw new Error('Connection lost'); }), /Connection lost/);
});

test('monthly chart counts check-ins and preserves zero-attendance months', () => {
  const records = [
    { checked_in_at: '2026-10-04T12:00:00' },
    { checked_in_at: '2026-10-11T12:00:00' },
    { checked_in_at: '2026-11-01T12:00:00' },
    { checked_in_at: '2026-05-01T12:00:00' },
    { checked_in_at: '2026-12-01T12:00:00' },
    { checked_in_at: 'invalid' },
  ];
  const result = attendanceByMonth(records, new Date(2026, 10, 15));
  assert.deepEqual(result.map(month => month.key), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
  assert.deepEqual(result.map(month => month.count), [0, 0, 0, 0, 2, 1]);
  assert.equal(result[5].title, 'November 2026');
});

test('monthly chart handles year boundaries and empty histories', () => {
  const records = [{ checked_in_at: '2025-12-31T12:00:00' }, { checked_in_at: '2026-01-01T12:00:00' }];
  const result = attendanceByMonth(records, new Date(2026, 0, 1));
  assert.equal(result[0].key, '2025-08');
  assert.equal(result[4].count, 1);
  assert.equal(result[5].count, 1);
  assert.deepEqual(attendanceByMonth([], new Date(2026, 0, 1)).map(month => month.count), [0, 0, 0, 0, 0, 0]);
});

test('attendance percentage counts distinct completed services for the correct member', () => {
  const member = { id: 'member-a', created_at: '2026-10-01T00:00:00Z' };
  const services = ['first', 'second', 'third'].map(id => ({ id, opens_at: '2026-11-01T09:00:00Z', closes_at: '2026-11-01T11:00:00Z', enabled: false }));
  const records = [
    { member_id: 'member-a', service_id: 'first' },
    { member_id: 'member-a', service_id: 'first' },
    { member_id: 'member-b', service_id: 'second' },
    { member_id: 'member-a', service_id: 'unknown' },
  ];
  assert.deepEqual(attendanceRate(services, records, member, Date.parse('2026-11-08T12:00:00Z')), { attended: 1, eligible: 3, percentage: 33 });
});

test('attendance percentage excludes pre-membership, ongoing and future services', () => {
  const member = { id: 'member-a', created_at: '2026-11-01T08:00:00Z' };
  const services = [
    { id: 'before-joining', opens_at: '2026-10-31T09:00:00Z', closes_at: '2026-10-31T11:00:00Z' },
    { id: 'joined-during', opens_at: '2026-11-01T07:00:00Z', closes_at: '2026-11-01T09:00:00Z' },
    { id: 'completed', opens_at: member.created_at, closes_at: '2026-11-01T10:00:00Z', enabled: false },
    { id: 'ongoing', opens_at: '2026-11-08T11:00:00Z', closes_at: '2026-11-08T13:00:00Z' },
    { id: 'future', opens_at: '2026-11-09T11:00:00Z', closes_at: '2026-11-09T13:00:00Z' },
    { id: 'invalid', opens_at: 'invalid', closes_at: 'invalid' },
  ];
  const records = services.map(service => ({ member_id: member.id, service_id: service.id }));
  assert.deepEqual(attendanceRate(services, records, member, Date.parse('2026-11-08T12:00:00Z')), { attended: 1, eligible: 1, percentage: 100 });
});

test('attendance percentage distinguishes no eligible services from missed services', () => {
  const member = { id: 'member-a', created_at: '2026-10-01T00:00:00Z' };
  assert.deepEqual(attendanceRate([], [], member), { attended: 0, eligible: 0, percentage: null });
  const service = { id: 'completed', opens_at: '2026-11-08T09:00:00Z', closes_at: '2026-11-08T11:00:00Z' };
  assert.deepEqual(attendanceRate([service], [], member, Date.parse(service.closes_at)), { attended: 0, eligible: 1, percentage: 0 });
  assert.equal(attendanceRate([service], [], member, Date.parse(service.closes_at) - 1).percentage, null);
});

test('missedStreak counts consecutive misses back from the latest eligible service, reset by attendance', () => {
  const member = { id: 'member-a', created_at: '2026-09-01T00:00:00Z' };
  const weekly = (id, weeksAgo) => {
    const opens = new Date(Date.parse('2026-11-08T09:00:00Z') - weeksAgo * 7 * 86400000);
    const closes = new Date(opens.getTime() + 2 * 3600000);
    return { id, opens_at: opens.toISOString(), closes_at: closes.toISOString() };
  };
  const services = [weekly('w0', 0), weekly('w1', 1), weekly('w2', 2), weekly('w3', 3)];
  const now = Date.parse('2026-11-08T12:00:00Z');
  assert.equal(missedStreak(services, [], member, now), 4);
  assert.equal(missedStreak(services, [{ member_id: 'member-a', service_id: 'w2' }], member, now), 2);
  assert.equal(missedStreak([], [], member, now), 0);
});

test('distanceMeters measures great-circle distance and isWithinChurchRadius gates on it', () => {
  const church = { latitude: 12.9716, longitude: 77.5946, radius_meters: 150 };
  assert.equal(distanceMeters(church, church), 0);
  // 1 degree of latitude is ~111.32km; a point 1 degree north must be far outside any sane radius.
  const oneDegreeNorth = { latitude: church.latitude + 1, longitude: church.longitude };
  const distance = distanceMeters(church, oneDegreeNorth);
  assert.ok(distance > 110000 && distance < 112000, `expected ~111.3km, got ${distance}`);
  assert.equal(isWithinChurchRadius(church, church), true);
  assert.equal(isWithinChurchRadius(oneDegreeNorth, church), false);
  const justInside = { latitude: church.latitude + 0.001, longitude: church.longitude };
  assert.equal(isWithinChurchRadius(justInside, church), distanceMeters(justInside, church) <= church.radius_meters);
});

test('registration stores each preferred language without granting account roles', () => {
  for (const language of Object.keys(languages)) {
    assert.deepEqual(registrationMetadata(' Jordan Ellis ', language), { full_name: 'Jordan Ellis', preferred_language: language });
  }
  assert.equal(registrationMetadata('Jordan', 'unsupported').preferred_language, 'en');
});

test('app-owned visible text and translated templates have catalog entries', async () => {
  const files = ['App.tsx', 'Auth.tsx', 'Screens.tsx', 'AttendanceChart.tsx', 'ui.tsx', 'LanguageSelector.tsx', 'QRCheckIn.tsx'];
  const attributeNames = new Set(['label', 'title', 'action', 'placeholder', 'accessibilityLabel']);
  const labels = new Set();
  function literalValues(node) {
    if (!node) return [];
    if (ts.isStringLiteral(node)) return [node.text];
    if (ts.isJsxExpression(node)) return literalValues(node.expression);
    if (ts.isConditionalExpression(node)) return [...literalValues(node.whenTrue), ...literalValues(node.whenFalse)];
    return [];
  }
  for (const file of files) {
    const text = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isJsxText(node) && node.text.trim()) labels.add(node.text.trim());
      if (ts.isJsxAttribute(node) && attributeNames.has(node.name.getText(source))) literalValues(node.initializer).forEach(value => labels.add(value));
      if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'label') literalValues(node.initializer).forEach(value => labels.add(value));
      if (ts.isCallExpression(node) && node.expression.getText(source) === 't') literalValues(node.arguments[0]).forEach(value => labels.add(value));
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  labels.delete('BBS Gather');
  labels.delete('The Bangalore Bible Students');
  for (const label of labels) {
    if (/[A-Za-z]/.test(label)) assert.ok(Object.hasOwn(messages, label), `Missing translation: ${label}`);
  }
});

test('membership access fails closed until approval and preserves admin access', () => {
  assert.equal(hasMemberAccess({ role: 'member', membership_status: 'pending' }), false);
  assert.equal(hasMemberAccess({ role: 'member', membership_status: 'rejected' }), false);
  assert.equal(hasMemberAccess({ role: 'member' }), false);
  assert.equal(hasMemberAccess({ role: 'member', membership_status: 'approved' }), true);
  assert.equal(hasMemberAccess({ role: 'admin', membership_status: 'pending' }), true);
});

test('attendance percentage starts at approval rather than the pending application date', () => {
  const member = { id: 'member-a', created_at: '2026-10-01T00:00:00Z', approved_at: '2026-11-01T00:00:00Z' };
  const services = [
    { id: 'before-approval', opens_at: '2026-10-25T09:00:00Z', closes_at: '2026-10-25T11:00:00Z' },
    { id: 'after-approval', opens_at: '2026-11-01T09:00:00Z', closes_at: '2026-11-01T11:00:00Z' },
  ];
  assert.deepEqual(attendanceRate(services, [], member, Date.parse('2026-11-08T12:00:00Z')), { attended: 0, eligible: 1, percentage: 0 });
});

test('demo pending members cannot self-approve or check in; admin decisions persist', async () => {
  store.clear();
  const { demoPendingId, demoAdminId } = demoApi;
  await assert.rejects(() => demoApi.checkIn(true, demoPendingId, 'today'), /must be approved/);
  await assert.rejects(() => demoApi.reviewMembership(true, demoPendingId, demoPendingId, 'approved'), /Only administrators/);
  await demoApi.reviewMembership(true, demoAdminId, demoPendingId, 'approved');
  let data = await demoApi.loadData(true);
  const member = data.profiles.find(profile => profile.id === demoPendingId);
  assert.equal(member.membership_status, 'approved');
  assert.ok(Number.isFinite(Date.parse(member.approved_at)));
  await demoApi.checkIn(true, demoPendingId, 'today');
  await demoApi.checkIn(true, demoPendingId, 'today');
  data = await demoApi.loadData(true);
  assert.equal(data.attendance.filter(record => record.member_id === demoPendingId && record.service_id === 'today').length, 1);
  await demoApi.reviewMembership(true, demoAdminId, demoPendingId, 'rejected');
  await assert.rejects(() => demoApi.checkIn(true, demoPendingId, 'today'), /must be approved/);
  assert.equal((await demoApi.loadData(true)).profiles.find(profile => profile.id === demoPendingId).membership_status, 'rejected');
});

test('membership decisions cannot modify admin accounts or accept invalid statuses', async () => {
  store.clear();
  await assert.rejects(() => demoApi.reviewMembership(true, demoApi.demoAdminId, demoApi.demoAdminId, 'approved'), /Member profile not found/);
  await assert.rejects(() => demoApi.reviewMembership(true, demoApi.demoAdminId, demoApi.demoPendingId, 'invalid'), /Invalid membership decision/);
});