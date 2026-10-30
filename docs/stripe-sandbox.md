# Testing checkout without real money

The paid flow has never run end to end. On 2026-10-30 the live Stripe account
held **zero subscriptions** — active, and worth confirming under **All** — so
nothing has ever completed the chain from the pricing page to a working
dashboard. That is the path the consumer update is meant to fill.

This is how to prove it with test cards instead of a card that charges.

---

## Why the Stripe dashboard's test toggle is not enough

The API reports its own mode, which makes this easy to check:

```
GET https://stamina-api.onrender.com/
-> { "stripe_configured": true, "stripe_mode": "LIVE", ... }
```

`stamina-api` holds **one** Stripe secret key, and right now it is a live one.
Flipping the dashboard to test mode changes what you are looking at, not what
the server signs its requests with — a test card against a live key is simply
declined. Test mode is a property of the key, so the server has to be moved.

Everything is per-mode and separate: keys, customers, subscriptions, **and
webhook endpoints**. A test endpoint that works perfectly will not fire for a
single live payment, and the reverse is just as true.

---

## The run

**1. Register a test-mode webhook endpoint.**
Stripe dashboard → test mode (or a Sandbox) → Developers → Webhooks → add
`https://stamina-api.onrender.com/webhook/stripe`. Subscribe at minimum to
`checkout.session.completed`, which is the event the handler's own notes
describe. Copy the signing secret (`whsec_…`) it gives you.

**2. Point the service at the test key.**
Render → `stamina-api` → Environment. Swap the Stripe secret to `sk_test_…`
and the webhook secret to the `whsec_…` from step 1. (Confirm the variable
names against the service — they are not visible from this repo.) Redeploy.

**3. Confirm the swap took.**

```
GET https://stamina-api.onrender.com/
-> "stripe_mode": "TEST"
```

Do not continue until it says TEST. This is the cheapest check in the whole
runbook and it is the one that catches a redeploy that did not pick up the
new environment.

**4. Buy a plan.**
`/payment/index.html`, slider to 1 client, Standard — $1.00/month, though the
amount is irrelevant with a test card. Card `4242 4242 4242 4242`, any future
expiry, any CVC, any postcode.

Note that no trial is applied: `trial_period_days` is sent but
`CheckoutRequest` does not accept it, so it is dropped on arrival (see (3) in
api-changes.md). That is what you want here — an immediate charge means the
webhook fires for real rather than on a schedule.

**5. Watch each hop, in order.** The point of the exercise is knowing *which*
one breaks, so check them one at a time:

| hop | where to look | what good looks like |
| --- | --- | --- |
| checkout session created | browser console on the pricing page | logs a `cs_test_…` session id and a redirect |
| payment taken | Stripe → Payments (test mode) | a succeeded payment |
| subscription exists | Stripe → Subscriptions (test mode) | one active row |
| **webhook delivered** | Stripe → Developers → Webhooks → the endpoint | a `200`, not a `4xx`/`5xx` |
| written to Firebase | Firebase console | a subscription record under that email |
| read back | the dashboard | unlocks within ~45s; banner names the tier |
| client attaches | dashboard → Add client | a real 8-character code is accepted |

**6. Put it back.** Restore the live keys, redeploy, and confirm
`"stripe_mode": "LIVE"` before walking away. While the service is on test keys
**no real customer can pay**, so keep the window deliberate and short.

---

## If the webhook never delivers

Then nothing downstream can work, and it is the first thing to fix. The
receiving end is healthy — an unsigned POST to `/webhook/stripe` returns
`400 {"detail":"Invalid signature"}`, so it is alive and verifying — which
means silence is Stripe not calling it, not the server refusing. Check that
the endpoint is registered **in the mode you are testing in**, and that it is
subscribed to the right events.

---

## Giving the owner a free account

Signing in as the owner does not make the dashboard work: the refusal comes
from the server (`add-client-by-code` → "Subscription not active"), so
unlocking the form in `professional.js` would only restore the old behaviour
of a form that fails on submit. The grant has to happen server-side. Three
ways, cheapest first:

1. **An allowlist in `stamina-api`.** An `ADMIN_EMAILS` environment variable
   that `/professional/subscription-status` and `add-client-by-code` both
   consult, returning a real tier for those accounts. No Stripe involvement,
   nothing to cancel, and it survives key swaps.
2. **Write the Firebase record by hand.** Whatever document
   `subscription-status` reads, set it directly in the Firebase console. Crude,
   but it works today and it isolates a useful question: if the dashboard then
   unlocks, the read path is fine and any bug is in the webhook's write.
3. **A comped subscription in Stripe** — 100% off, created from the dashboard.
   Whether it reaches Firebase depends on which events the webhook handles: if
   it only listens for `checkout.session.completed`, a subscription created by
   hand will not fire it.
