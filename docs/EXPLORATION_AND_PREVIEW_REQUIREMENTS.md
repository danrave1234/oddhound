# Broader autonomous QA and visible browser execution

Owner requirements collected in the side conversation on October 30, 2026 (PHT). This document is an implementation brief, not evidence that the changes below have shipped. The owner approved a maximum of **$10 in model spend per run**. No paid call, deployment, runtime setting or running test was changed by this brief.

## Desired experience

The owner supplies a verified website URL, authorizes accounts and test capabilities, and leaves Oddhound to work. Oddhound discovers the application, builds and continuously expands a test plan, exercises authorized workflows, checks the results, independently reproduces failures and presents enough evidence to make an informed release decision.

The visible result must demonstrate breadth and meaningful assertions. A high action count on two or three pages is insufficient. A run that discovers many pages but tests a small subset must plainly identify its remaining coverage gaps. Passing results cannot guarantee that every bug has been found or substitute for business requirements the owner has not supplied.

## Current evidence and causes

- The first StudyBoost evaluation completed 94 browser actions and 88 Meta calls over 8:48, spending $0.898574 of its $2 cap. It reached four page routes. It did not stop because it exhausted the model budget. Increasing the cap alone will not repair discovery or completion behavior.
- `packages/core/agent/execute-run.ts` reads an initial site map and presents known paths to the model. Its `pagesSincePlan` reminder concerns newly reached pages. There is no enforced, continuously maintained discovery backlog tying every newly discovered route or workflow to a coverage disposition.
- `plan_tests` updates model-authored charters. `finish_run` considers open critical/high charters, rather than all discovered but unaccounted-for functionality, and refuses an early finish only twice. A model-created small plan can therefore produce an apparently complete run with large discovery gaps.
- `packages/core/agent/coverage.ts` records controls on observed states. A successful browser action marks a control exercised; this does not prove that the control's intended effect occurred. Its denominator is explicitly observed controls, not every control on the site.
- Scenario batching exists, but the StudyBoost call/action counts warrant measuring planning, inference, observation and browser wait time separately before choosing speed changes.

## Required behavior

### 1. Discover broadly before spending most of the run on one feature

Maintain an explicit backlog of discovered routes and UI states. Seed it from the existing scoped site-map reader, visible navigation and links; expand it after sign-in and whenever menus, tabs, dialogs, pagination or newly created records expose additional functionality. Record discovery provenance and visit/test status independently of model narrative.

Separate distinct route families and workflows from repeated records using the same layout. Do not claim that sampling one record tests every record, or waste the whole budget opening equivalent document pages. Include representative data/state differences where relevant. Hidden or inaccessible features must be identified as unavailable when known, not counted as tested.

Discovery must retain the verified-origin, independently verified API, role, fixture and capability boundaries. Finding a new host or button does not grant authority to use it. Inventory potentially consequential controls without activating them unless their effects are authorized.

### 2. Expand and prioritize the plan from observed evidence

Connect every discovered route family and significant workflow to planned work or an explicit reason it will not be tested. Add tasks as discovery grows; do not depend on a one-time request to create a small number of charters.

Prioritize authentication, access boundaries, creation/edit/save persistence, destructive actions when authorized, important business flows, validation and error recovery. Then cover navigation, filters, search, pagination, dialogs, responsive behavior and lower-risk controls. Distinguish a normal successful path from boundary and failure-path checks.

Rebalance breadth and depth as new information arrives. Detect repeated visits or actions that produce no new state, coverage or evidence and change strategy rather than spending indefinitely in a loop. Preserve the discovery backlog and unfinished work when context is compacted.

### 3. Make routine execution faster without reducing verification

Measure the time spent in model requests, browser operations, observations and replay. Use existing trusted batches for predictable action sequences with assertions, stopping on an unexpected result. Reuse verified navigation/setup recipes and compact observations. Reserve model decisions for ambiguity, unexpected outcomes and replanning.

Only parallelize independent checks when isolated contexts and the existing concurrency, target-load and action policies permit it. Keep dependent writes ordered. Do not introduce arbitrary model-generated code, a second browser framework, unbounded crawling or weaker scope enforcement for speed.

### 4. Account for controls and verify their effects

Report separate counts for controls discovered, exercised and outcome-checked. Each relevant authorized control should ultimately have evidence of a successful effect, a reproduced failure, a blocker, or an explicit skip reason. A click without an exception is not a passed functional assertion.

Examples: saving must survive reload; filtering must change the displayed results appropriately; cancellation must leave the intended state; logout must protect account-only pages. Derived expectations that lack an explicit rule remain observations or review items, not invented verified requirements.

Do not blindly click every control. Payment, messaging, account-security changes, deletion and external destinations remain subject to the run contract. Clearly separate these exclusions from missing exploration.

### 5. Adapt allocation within an approved budget

The owner approved **up to $10 in model spend per run**. A run may automatically allocate more of this approved budget to newly discovered, valuable work. It must not raise its own maximum or widen authorization. Show actual consumption, remaining allowance, expansion decisions and estimated remaining work.

Replace conflicting hard-coded cap assumptions consistently across admission, reservations, execution, prompts, UI and reports. Preserve atomic reservation before every model call, including retries and outstanding or unknown charges. Keep compute and target-traffic limits explicit and separate from model spending.

The current **$7 public daily ceiling conflicts with fully funding a $10 public run**. Implementation must explicitly reconcile the account-level policy or constrain the displayed available allowance; it must not silently bypass that ceiling, use judging funds, or advertise unavailable spend. The $10 approval does not authorize unlimited spending or removal of other global protections.

Do not extend the 60-minute backstop invisibly. If approved time or budget is insufficient, preserve unfinished work for a subsequent authorized run and report the limitation. Reserve enough resources for verification and confirmed browser cleanup.

### 6. Restore the owner-visible browser preview

The current supplied-account safeguard disables screenshots after credentials are used. The owner preview depends on the same screenshot artifacts, so it receives no frames and misleadingly continues to display **“Waiting for the first frame…”**. The test agent continues through page text and controls, but visual monitoring is incomplete.

Implement a protected, owner-visible capture path independent of screenshots sent to the model. Update sampled frames during navigation and interactions so the owner can actually watch progress; label sampled frames accurately rather than presenting them as continuous video. Protect sensitive fields and content before transmission or storage, retain owner access checks and bounded artifacts, and fail closed when privacy cannot be established.

Expose truthful states for startup, available frames, privacy-paused capture, capture failure and stopped capture. Include the last frame timestamp and current action. A permanently blank panel with a better label is not completion of this requirement. Do not fabricate cursor movement, screenshots, agent reasoning or a live badge.

### 7. Produce a useful release report

Show distinct discovered routes and workflows, those actually tested, controls exercised, effects checked, device/role coverage, reproducible findings, passing controls and remaining gaps. Link assertions and findings to real action traces and protected visual evidence where available.

The report must distinguish tested scope from the whole site. It must not infer “safe to ship” merely from zero findings. Major untested or blocked workflows must be visible immediately, with the reason and a concrete next step. Use the existing canonical run/finding status vocabulary; coverage qualifications are additional report information.

## Acceptance tests

1. A fixture with multiple navigation branches, nested menus, dialogs and a signed-in area proves that discovery expands after authentication and new UI states. An issue outside the initial landing-page branch is reached and detected.
2. A fixture with many equivalent records proves route-family deduplication without discarding distinct features or falsely claiming every record was checked.
3. Repeated premature `finish_run` calls cannot silently discard discovered, unaccounted-for work while resources remain. Exhaustion and blocked work produce explicit gaps, not a broad all-clear.
4. A control whose click succeeds but whose data never persists is not marked functionally passed. Passing neighboring controls still pass, and failures use unchanged assertions during replay.
5. The same representative tasks compare distinct workflow coverage, verified assertions and known defects found per minute and per dollar. Action count alone is not an improvement metric.
6. Growing discovery expands the plan and allocation within the configured allowance. Calls cannot exceed the approved cap or bypass daily/lifetime ledgers, retry reservations, scope limits or the backstop.
7. A supplied-account run shows real owner-visible frames before and after login. Credential reflection, revealed password fields and other sensitive-content fixtures prove privacy handling. The model and unauthorized viewers receive no secret-bearing pixels or artifacts. Unsafe capture produces an explicit paused state rather than an indefinite waiting message.
8. A real verified-site evaluation records the exact provider/model, runtime, sandbox verdict, actual spend, coverage, observed failures and confirmed cleanup. Local synthetic fixtures and recorded model replies remain clearly labeled.

## Delivery order

1. Persistent discovery inventory, coverage-based planning/completion and tests for premature finish.
2. Outcome-backed control/workflow coverage and efficient batches, measured against the existing behavior.
3. Protected preview capture with privacy and access-control tests.
4. Consistent $10 run-budget configuration and reconciliation with account-level limits.
5. Coverage/gap reporting and a real-site comparison demonstrating improvement.

Keep the existing macOS-inspired interface and the current Meta provider architecture. These requirements extend the product; they do not clear existing security, deployment or submission proof gates by themselves.
