# Gather

An Expo / React Native attendance app for one church, with member self-check-in and administrator reporting. Android and iPhone share the same TypeScript source. A browser preview is also available.

## Included

- Email sign-in and registration. New accounts are pending membership applications, not approved church members.
- Admin membership review with staff verification, approve/reject confirmation, and database-enforced access restrictions.
- English, Hindi, Kannada, and Tamil, with preferred-language selection during registration, immediate interface translation, and remembered preferences.
- One-tap self-check-in during an enabled service window, with saved confirmation.
- Private personal attendance history, with an interactive monthly bar chart, service filters, and recorded check-in times. Month selection shows the corresponding records; six-month navigation reaches older history.
- Administrator attendance register, service selection, member search, and individual histories with the same interactive monthly chart.
- Total attendance percentages and progress indicators on member dashboards/history and admin member views.
- Service creation and check-in pause/resume controls.
- Persistent, explicitly labeled demo data, separate from Supabase.
- Database-enforced roles, private member histories, duplicate prevention, server timestamps, and service-window checks.
- Paginated database reads for histories exceeding Supabase's default row limit.

## Run Locally

Requires Node.js 20.19+ and npm.

```sh
npm install
npm start
```

Open the web URL printed by Expo, or run `npm run web`. Without Supabase settings, the app opens the member demo. The shield/person icon in the header switches between demo member and administrator. Demo records are local to that device, not shared church records.

This project uses Expo SDK 54. Expo Go must support SDK 54; a newer Expo Go installation may not open it. Android can use a matching Expo Go version from https://expo.dev/go. On physical iPhones, use a signed EAS build when a compatible Expo Go is unavailable. The browser preview does not require Expo Go.

## Connect Your Church Database

1. Create a Supabase project under an account owned by the church.
2. Execute [supabase/schema.sql](supabase/schema.sql) in a test project's SQL editor **before** registering users. For an installation using the previous schema, follow the approval rollout notes below before deploying this client.
3. Populate a local `.env` with the two settings shown in [.env.example](.env.example). Use the project's URL and **publishable/anon key only**. Never put a service-role key in this app; `EXPO_PUBLIC_*` values are included in the client bundle.
4. Enable email/password authentication. Configure email confirmation, the authentication Site URL, and email delivery for your deployment. With confirmation enabled, members confirm the emailed link, then return to the app and sign in. This version does not consume native authentication deep links.
5. Restart Expo after changing environment settings.
6. Register the administrator normally, then promote that specific account from the Supabase SQL editor:

```sql
update public.profiles
set role = 'admin', membership_status = 'approved', approved_at = coalesce(approved_at, now())
where id = 'THE_REGISTERED_ADMIN_AUTH_USER_UUID';
```

Use the UUID from Supabase Authentication, not a member-provided role. Clients cannot edit roles. Sign out/in or refresh to retrieve the new role.

7. Run [supabase/security-test.sql](supabase/security-test.sql) in a **test project** after the schema. It tests two members and an admin under authenticated roles and rolls its fixtures back. It raises an exception on failure. This test has not been executed here because no PostgreSQL installation or Supabase project was provided.
8. Sign in as admin and create a service with a check-in window that includes the current time. On another device, register a member and verify that attendance access is blocked while pending. In admin Members, review the application, verify church membership, and confirm approval. Refresh the member's approval status, then check in. Approve a second member and verify they cannot see the first member's records.

Services are entered in the administrator device's local timezone, stored as UTC, and displayed in each device's timezone. The server determines whether the window is open. Enabling a future or ended service does not bypass its dates. Attendance is **self-reported**: no GPS, QR verification, or physical-presence guarantee is included.

## Membership Approval

Registrations default to `pending`; user-supplied role or approval metadata is ignored by the profile-creation trigger. Pending and rejected users can read their own profile, change their language, refresh their status, and sign out. They cannot read services/attendance or record check-ins. Administrator access comes from the trusted database role, not signup metadata.

Admin Members opens on pending applications, with Approved and Rejected filters. Review the person's name/email against the church register or confirm membership with church staff. The approval control requires the staff-verification switch and an explicit confirmation. Rejections also require confirmation, and rejected applications can be reconsidered. This remains manual verification; a name/email alone does not prove church membership.

The `review_membership` database function requires an authenticated administrator, accepts only approved/rejected decisions, cannot modify administrator accounts, and records the initial approval timestamp on the server. Clients have no direct profile-update permission. Approval is independent of email confirmation. Status refresh and the app's 30-second polling retrieve decisions; database restrictions apply on each request even if a screen has not refreshed yet.

### Existing Installation Rollout

Back up and review your database, then apply the updated [schema](supabase/schema.sql) in a test project first. The new columns default existing member accounts to **pending**; they are not automatically grandfathered into membership. Administrators retain access so they can review those accounts. Verify the roster before approving members. Historical membership/approval dates need a deliberate, trusted migration if earlier attendance should count; do not bulk-approve unknown accounts.

Deploy the schema and functions before the updated client. Without that database deployment, the server will still have the old access rules even though the new client blocks unapproved users. Execute [security-test.sql](supabase/security-test.sql) against the test project and verify real multi-device pending/approved/rejected flows. SQL permission tests have not been executed here because no PostgreSQL installation or configured Supabase project was provided.

The local demo keeps its known sample members approved and adds a pending applicant, Samuel Joseph. Use Account > Open pending member demo to see the waiting state, then switch to admin and review the request in Members. Decisions persist locally; demo behavior is not proof of live database enforcement.

## Language Preferences

Registration presents English, Hindi, Kannada, and Tamil before submission. The interface changes immediately without clearing entered values. The selection is saved locally as `gather-language-v1` and included as `preferred_language` in Supabase signup metadata alongside the member's name. Valid saved account preferences are restored on sign-in. Account settings can change the preference later; connected accounts update Supabase metadata as well as local storage.

The demo supports local selection and persistence without Supabase. Live signup, cross-device preference restoration, and account-metadata updates still require a configured Supabase project and have not been exercised against a live backend here. Dates, times, chart month labels, and numbers use the selected locale. Member names and church-entered service names/locations are retained as entered. Translations and native script rendering should be reviewed by native speakers and checked on Android/iPhone hardware before release.

## Attendance Percentage

Total attendance is distinct attended eligible services divided by all eligible services, multiplied by 100 and rounded to a whole percent. Eligible services started on or after the later of account creation and membership approval, and have finished. Legacy records without an approval timestamp fall back to account creation. Pending time does not lower a newly approved member's percentage. Future/ongoing services are excluded. With no eligible services, the display is `N/A`; with eligible services but no attendance, it is `0%`. Chart filters do not change this all-time percentage. Pausing check-in does not cancel a service; the model currently has no cancellation status.

## Native Builds

Build profiles are in [eas.json](eas.json). Change the bundle/package identifiers in [app.json](app.json) to identifiers owned by your church. Configure the two public Supabase variables in the EAS build environment, too; a build without them remains a demo.

```sh
npx eas-cli login
npx eas-cli build --profile preview --platform android
npx eas-cli build --profile preview --platform ios
```

Android preview produces an APK. Physical iPhone builds require Apple signing credentials and device registration. The `simulator` profile targets the iOS simulator, which requires macOS to run. Store distribution uses the `production` profile and requires developer accounts, privacy disclosures, store assets, and submission setup. Native signing/builds were not run in this environment.

## Verification

```sh
npm run typecheck
npm test
npm run build
npx expo export --platform all
```

Twenty focused tests cover attendance rules, approval-based eligibility, pending/rejected access, persisted demo decisions, self-approval rejection, protected admin accounts, percentages, charts, pagination, and localization. Browser checks verified pending-user restrictions, the verification/confirmation controls, approval unlocking attendance, rejection blocking attendance, and status refresh, alongside the existing member/admin and language flows. These are demo checks, not proof that live Supabase access is configured correctly. The separate SQL test includes forged signup metadata, self-approval attempts, pending/rejected access, and approved-user isolation.

## Before Release

- Run the database permission test and real multi-device authentication/check-in flows against a dedicated Supabase test project.
- Test signed builds on Android and iPhone hardware. Browser/native bundle checks are not device testing.
- Resolve the remaining dependency advisories described in [security/README.md](security/README.md). Do not release this prototype as production without review.
- Add the church's privacy policy and consent process. Attendance can reveal religious affiliation; restrict administrator access, define retention/deletion rules, and configure backups. Auth sessions currently use AsyncStorage; review secure native token storage for production.
- Open registration creates pending applications. Apply and verify the approval schema before release; configure signup rate limits/CAPTCHA if needed to protect the review queue from spam.
- Password recovery, profile editing, attendance corrections, exports, notifications, multi-church tenancy, and offline check-in are not included. Failed cloud writes are not shown as successful or queued offline.
- Reads currently load all authorized records. For very large churches, introduce server-side report aggregation and date-range pagination.

The sanctuary image is served by Unsplash. Fonts are packaged through Expo Google Fonts. Replace the image with an approved church-owned asset before release if preferred.