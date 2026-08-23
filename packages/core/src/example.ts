export const EXAMPLE_PLAN = `---
title: Billing migration to Stripe
kind: plan
emoji: 🧾
---

<TLDR id="summary">
Move subscription billing from the homegrown ledger to Stripe, keeping the ledger as read-only history.
</TLDR>

## Why now

The current ledger has costly proration errors and no clear owner.

<Decision owner="@srujan" id="historical-invoices">
Do we backfill historical invoices into Stripe, or leave them in the read-only ledger?
</Decision>

<Tradeoff id="billing-options">
<Option name="Backfill everything">
One source of truth. Two weeks of work and risky legacy-plan mapping.
</Option>
<Option name="Ledger stays read-only" recommended>
Ship in days. Support checks two places for pre-2026 invoices.
</Option>
</Tradeoff>

<Rejected id="rejected-chargebee" what="Chargebee">
Pricing punishes usage-based billing, which is where the product is heading.
</Rejected>

<Diagram id="billing-flow" lang="mermaid">
\`\`\`mermaid
graph LR
  A[checkout] --> B[Stripe]
  B --> C[webhook worker]
  C --> D[ledger read-only]
\`\`\`
</Diagram>

<Phase id="phase-dual-write" n="1" title="Dual-write">
- [ ] Create the Stripe customer beside the ledger account
- [ ] Reconcile webhook results nightly

**Gate:** The named billing contract tests pass for success, retry, and failure.

**Rollback:** Route checkout to the ledger before accepting new subscriptions.
</Phase>

<Diagram id="webhook-sequence" lang="mermaid">
\`\`\`mermaid
sequenceDiagram
  Checkout->>Stripe: create subscription
  Stripe-->>Worker: invoice.paid webhook
  Worker->>Ledger: append read-only record
\`\`\`
</Diagram>

<Risk id="risk-webhook-replay" severity="high">
Webhook replay could double-charge. Use one idempotency key per event.
</Risk>
`;

export const EXAMPLE_LESSON = `---
title: Understand webhook idempotency
kind: lesson
emoji: 🔁
audience: Engineers who know request handlers but have not designed replay-safe writes
outcomes:
  - Explain why duplicate delivery is normal
  - Apply one transaction boundary to a new handler
---

<TLDR id="summary">
Learn why webhook providers retry and how one database transaction prevents duplicate or missing effects.
</TLDR>

## Replay model

A provider may send the same event again when it cannot prove the first attempt finished.

<Check id="predict-replay" kind="predict" prompt="What can happen if the key commits before the business effect?">
**Answer:** A crash can leave a committed key without the effect.

**Why:** The retry sees the key and skips work that never finished.

**Next:** Put both writes in one transaction.
</Check>

<CodeSketch id="transaction-shape" lang="ts" file="src/webhooks.ts">
\`\`\`ts
export async function applyEvent(eventId: string): Promise<"applied" | "duplicate">;
\`\`\`
</CodeSketch>

<Check id="apply-transaction" kind="apply" for="transaction-shape" prompt="Where should a new handler write its key and effect?">
**Answer:** Inside one database transaction.

**Why:** Both writes then commit or roll back together.
</Check>

## Recap

The transaction makes a committed key mean that the matching effect also committed.

- **Outcomes revisited:** explain retries and place the transaction boundary.
- **Unresolved uncertainty:** confirm which handlers still use separate stores.
- **Next real action:** trace one production handler from key write to effect.
`;

export const EXAMPLE_GUIDED_PLAN = `---
title: Make webhook replay safe
kind: guided-plan
emoji: 🔁
audience: Engineers reviewing and implementing the webhook cutover
outcomes:
  - Predict the failure caused by separate commits
  - Apply the transactional interface to every handler
---

<TLDR id="summary">
Teach the replay failure, move every handler behind one transaction, and prove duplicate delivery creates one effect.
</TLDR>

## Evidence

The current handler writes its replay key and business effect separately.

<Check id="predict-crash" kind="predict" prompt="What remains after a crash between the two writes?">
**Answer:** Either a key without an effect or an effect without a key.

**Why:** Separate commits cannot represent one atomic state change.
</Check>

<Diagram id="current-replay" lang="mermaid">
\`\`\`mermaid
sequenceDiagram
  Provider->>Worker: event
  Worker->>Cache: write key
  Worker->>Database: write effect
\`\`\`
</Diagram>

## Design

One database transaction owns duplicate rejection and the business effect.

<Decision id="key-scope" owner="@payments">
Is the idempotency key scoped by event, or by event and handler?
</Decision>

<Tradeoff id="storage-options">
<Option name="Database unique key" recommended>
The key and effect share one transaction.
</Option>
<Option name="Separate cache key">
Fast lookup, but the crash window remains.
</Option>
</Tradeoff>

<Rejected id="rejected-dashboard" what="Provider dashboard deduplication">
It cannot protect internal retries or share our database transaction.
</Rejected>

<Phase id="phase-cutover" n="1" title="Move every handler">
- [ ] Add the transactional interface
- [ ] Move each production handler
- [ ] Exercise duplicate and crash cases

**Gate:** Delivering one event twice creates exactly one business effect.

**Rollback:** Route handlers to the last internal implementation before accepting new events.
</Phase>

<Check id="apply-new-handler" kind="apply" for="phase-cutover" prompt="Why does a Redis key plus SQL effect fail the gate?">
**Answer:** The two stores cannot commit or roll back together.

**Why:** A crash between them can still lose or duplicate work.
</Check>

<Diagram id="cutover-state" lang="mermaid">
\`\`\`mermaid
stateDiagram-v2
  [*] --> SeparateWrites
  SeparateWrites --> Transactional: contract tests pass
  Transactional --> SeparateWrites: gate fails
  Transactional --> [*]: every handler moved
\`\`\`
</Diagram>

<Risk id="risk-bypass" severity="high">
A handler that bypasses the interface restores duplicate effects. Search every production caller before cutover.
</Risk>

## Recap

One database transaction makes the replay key and business effect one state change.

- **Outcomes revisited:** predict the crash state and apply the interface.
- **Unresolved uncertainty:** resolve the key scope before cutover.
- **Next real action:** implement and exercise \`phase-cutover\`.
`;
