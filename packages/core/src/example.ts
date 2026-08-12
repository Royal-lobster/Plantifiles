export const EXAMPLE_PLAN = `---
title: Billing migration to Stripe
emoji: 🧾
---

<TLDR>
Move subscription billing from the homegrown ledger to Stripe over three phases, keeping the ledger as read-only history.
</TLDR>

## Why now

The current ledger has costly proration errors and no clear owner.

<Decision owner="@srujan" id="historical-invoices">
Do we backfill historical invoices into Stripe, or leave them in the read-only ledger?
</Decision>

<Tradeoff>
  <Option name="Backfill everything">
    One source of truth. Two weeks of work, risky mapping of legacy plans.
  </Option>
  <Option name="Ledger stays read-only" recommended>
    Ship in days. Support has to check two places for pre-2026 invoices.
  </Option>
</Tradeoff>

<Rejected what="Chargebee">
Pricing punishes usage-based billing, which is where the product is heading.
</Rejected>

<Diagram lang="mermaid">
\`\`\`mermaid
graph LR
  A[checkout] --> B[Stripe]
  B --> C[webhook worker]
  C --> D[ledger read-only]
\`\`\`
</Diagram>

<Phase n="1" title="Dual-write">
- [ ] Stripe customer created alongside ledger account
- [ ] Webhook worker reconciles nightly
</Phase>

<Diagram lang="mermaid">
\`\`\`mermaid
sequenceDiagram
  Checkout->>Stripe: create subscription
  Stripe-->>Worker: invoice.paid webhook
  Worker->>Ledger: append read-only record
\`\`\`
</Diagram>

<Risk severity="high">
Webhook replay could double-charge. Idempotency keys are mandatory.
</Risk>
`;
