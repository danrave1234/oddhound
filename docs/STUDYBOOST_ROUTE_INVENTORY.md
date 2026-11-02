# StudyBoost source route inventory — 2026-10-30

This is an independent coverage oracle for evaluation run `aeb4dd1d-c239-4e24-81cc-7712857cd38d`. It was prepared while that run was still active. These paths were **not supplied to Oddhound's worker or model**. This document establishes source route families; it does not claim that they were reached, checked, or available on the deployed preview.

The read-only inventory used `C:/Users/Danrave/Desktop/Studyboost.com/frontend`. No environment file, credential, target database, or target network endpoint was read. No target files or Oddhound worker files were changed. The checkout reports commit `08e78bd1f130ddd20bdb011419e13c00b22b9247`; deployed-source parity is not asserted. [Machine-readable evidence](evidence/studyboost-route-inventory-2026-10-30.json) records all **54 page files and 7 route handlers**, their source paths and SHA-256 hashes. Of the 54 page patterns, 33 are not intrinsically excluded by the current contract's path filter; this is not a count of authorized operations or tested pages. Dynamic resource slugs still receive their own path checks.

## Essential families and current scope

Source paths below are relative to `Studyboost.com/frontend/`. Route groups such as `(features)` are not URL segments.

| Human area | Actual routes / states | Source | Current evaluation boundary |
| --- | --- | --- | --- |
| Public document/catalog home | `/`, with `q`, `page`, `sort`, `region`, and `level` query states | `app/(features)/page.tsx`; `components/features/explore/university-browser.tsx` | Public catalog view paths are permitted. The sidebar label **Documents** points to `/`. A home visit alone does not cover the following list/detail families. |
| Courses | `/courses`; `/courses/[slug]` | `app/(features)/courses/page.tsx`; `courses/[slug]/page.tsx` | Public list and detail browsing are not path-excluded. Search, filters, pagination and document links require separate outcome evidence. |
| Institutions | `/institutions`; `/institutions/[slug]`; `/institutions/[slug]/courses` | `app/(features)/institutions/page.tsx`; `[slug]/page.tsx`; `[slug]/courses/page.tsx` | Three distinct public families. An institution hub and its dedicated course directory are separate states. |
| Document detail | `/documents`; `/documents/[slug]` | `app/(features)/documents/page.tsx`; `[slug]/page.tsx` | Public directory/detail view paths are permitted. Reader/paywall outcomes depend on the account and document. Payment, upload and paid AI operations remain excluded. |
| Subscription | `/pricing`; `/settings/billing` | `app/pricing/page.tsx`; `app/(features)/settings/billing/page.tsx` | `/pricing` can be viewed. **`/settings/billing` is excluded even as top-level view navigation** by the `billing` keyword. Payment, plan change, billing portal and subscription mutations are not authorized. There is no declared `/subscription` page. |
| Profile | `/settings/account` | `app/(features)/settings/account/page.tsx`; `settings/_components/account/profile-form.tsx` | The signed-in page can be viewed. `/users/me/profile` and `/users/me/avatar` are denied API prefixes; profile saves and avatar changes are therefore excluded. Email/password/role/security changes are also explicitly forbidden. There is no declared `/profile` page. |
| Other settings | `/settings` → `/settings/usage`; `/settings/notifications`; `/settings/security` | `app/(features)/settings/page.tsx`; `settings/_components/settings-nav.tsx`; corresponding page files | Usage and notifications page paths are not excluded. The notification-preferences API prefix is denied, so this does not authorize preference writes. Security view navigation is excluded by `security`. The settings layout uses `AuthGate`. |
| Personal workspace and shelves | `/my-room`; `/my-room/shelves/[id]` | `app/(features)/my-room/page.tsx`; `my-room/shelves/[id]/page.tsx` | Signed-in synthetic-account views and authorized create/edit checks can be exercised. Resource IDs must belong to the prepared account. Account/plan limits may block creation and must be reported. |
| Personal library drawers | `/my-room?section=documents`; `?section=courses`; `?section=notes`; `?section=ai-courses` | `app/(features)/my-room/page.tsx:56–63,105–127,202–207` | Distinct UI states share one pathname and use `router.replace`. A graph counting only pathname visits will understate these states. AI library view is not itself a path exclusion, but generation is still prohibited. |
| Study Room | `/study-room`; `/study-room/[slug]` | `app/(features)/study-room/page.tsx`; `[slug]/page.tsx` | List/detail view paths are not inherently excluded. Any game flow requiring AI generation, chat, payment or another denied operation remains limited by the contract. |

Other declared page families include public informational pages (`/about`, `/contact`, `/docs`, `/privacy`, `/terms`, `/cookies`, `/dmca`, `/credits/music`), authentication/onboarding pages, `/dashboard/earnings`, `/warning`, and `/unauthorized`. The `/ai/*` tool pages and `/ai-courses/[id]` exist in source but are excluded by the `ai` path keyword. Registration is disabled; email verification was owner-prepared for the synthetic account, so a page visit cannot establish delivery or registration coverage. Contact forms do not authorize sending messages to real people.

## Navigation and redirect distinctions

- `components/app-sidebar.tsx:26–58` exposes My Room, Documents (`/`) and Study Room. Courses and institutions are reached through catalog links rather than separate top-level sidebar entries.
- `components/features/explore/catalog-sections.tsx:31,54,118` links from home to the course directory, course details and document details. `university-browser.tsx:138` links to the institutions directory. Detail pages also cross-link institutions, courses and documents through breadcrumbs.
- `components/sidebar/user-drop-up.tsx:58–62` reveals the five settings destinations. These are also present in `settings/_components/settings-nav.tsx:8–14` after entering settings. A repeated shell menu is not a new feature family on every page.
- `components/layout/feature-header.tsx:105–110` and the sidebar expose `/pricing`. `app/pricing/_components/pricing-account-notices.tsx:35` links to the separately excluded `/settings/billing` page.
- `components/layout/features-layout-client.tsx:18` omits the marketing footer on `/my-room`. Remaining indefinitely in that workspace misses the footer's other public destinations.
- `next.config.ts:49–129` retains legacy redirects: `/dashboard` → `/my-room`; `/my-documents` → `/my-room?section=documents`; `/my-courses` → `?section=courses`; `/notes` → `?section=notes`; `/ai-courses` → `?section=ai-courses`; `/games` and `/games/:slug` → their Study Room equivalents. Old `/institution/:school[/<course>[/<document>]]` paths redirect to current plural institution/course/document paths. These aliases are not additional independent feature coverage.
- `/purchases` is a redirect to `/my-room?section=documents`, as declared in `app/(features)/purchases/page.tsx`. It is not a separate active purchases dashboard.
- `components/features/my-room/my-room-v2.tsx:123–126` replaces the legacy `?shelf=<id>` state with `/my-room/shelves/<id>`.
- `app/sitemap.xml/route.ts:27–34` and `app/sitemaps/static/route.ts:23–26` deliberately return 404 for non-production deployments. This source behavior means a preview evaluation should not depend on a sitemap to find its catalog. This audit did not make a fresh request to confirm the currently deployed response.

These are structural reasons the independent audit must compare both UI states and route families. They do not, by themselves, establish why any individual agent action was missed.

## Contract and final-run comparison

The authority used here is `claude/tests/e2e/studyboost-evaluation.ts:55–80`, with defaults from `packages/core/contracts/contract.ts:102–118`. It allows login and synthetic create/edit/boundary/unusual-order checks, while disabling registration, cancellation, repeated submissions and cross-account reads. Payments, plan/account/security changes, uploads, messages/invitations and paid AI generation remain outside this run. A path not being excluded does not override these operation limits. Background API reads can have different keyword handling from top-level navigation; a readable subscription summary does not authorize visiting billing or changing a plan.

After the run ends, compare each family against authoritative graph states, exploration events and saved assertions. Keep these evidence distinctions:

1. **Discovered**: a link, control or redirect was observed, with its source.
2. **Reached**: a rendered destination/state was recorded; this alone is not a functional pass.
3. **Outcome checked**: an explicit relevant assertion held. Link visibility or a generic page-loaded check does not prove profile persistence, reader behavior, search filtering or another workflow.
4. **Blocked/excluded**: retain the specific contract, account entitlement, missing fixture or runtime reason.
5. **Not discovered/pending/sampled**: preserve the remaining gap. A completed worker loop cannot establish exhaustive source-family coverage.

The static oracle intentionally contains no selected real document/course/institution IDs and no click script. It must remain an audit input outside the autonomous worker. No provider calls, Chromium session, live target checks or new tests were run for this inventory. The inventory generator used Node `26.12.1`; no new sandbox verdict or blocker closure is claimed.
