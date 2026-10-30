# stamina-api: six changes the website needs

For `stamina-api.onrender.com` (FastAPI) — not this repo. Everything below is
derived from the live service's own `/openapi.json` plus responses observed on
2026-10-28, so check it against the source before applying.

Ordered by how much damage each one is doing right now.

---

## 1. `/latest` timestamps have no date, and clients are guessing

**What the server returns today**

```json
{ "staminaScore": 81, "color": "green-yellow",
  "timestamp": "06:31:28 PM CST", "appType": "workout" }
```

A bare wall-clock string. No date, no offset, and `CST` hard-coded in the text.

**What it breaks**

`app.js` cannot use `Date()` on it, so it hand-parses the string
(`parseTimestamp`, app.js:491) by stamping those hours and minutes onto *the
viewer's own* timezone. For anyone outside CST the result is wrong by their UTC
offset. Reproduced in `America/Los_Angeles`:

```
server said : 06:31:28 PM CST
parsed as   : Tue Oct 27 2026 18:31:28 GMT-0700   # read as Pacific
age         : 1281 minutes
isDataStale : true  ->  the UI shows "Disconnected"
```

The parse lands in the future, so the code subtracts a day (app.js:513) and a
reading that is seconds old reports as ~21 hours stale. **Every user outside
Central time currently sees a live bar as Disconnected.** The trainer dashboard
reads the same field, so it is wrong there too.

**The change**

Return ISO-8601 UTC and let each client render local time:

```json
{ "timestamp": "2026-10-28T00:31:28Z" }
```

In FastAPI, wherever the row is written or serialised:

```python
from datetime import datetime, timezone

timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
```

**Compatibility.** The iOS apps also read this field. If they parse the current
string, ship the new value under a *new* key (`timestampUTC`) and keep
`timestamp` as-is until the apps are updated, rather than breaking them.

**Patched client-side in the meantime.** `irl-time.js` reads the string
against `America/Chicago` rather than the viewer's zone, so the Disconnected
bug is gone today — verified against a live `/health` timestamp from Chicago,
Los Angeles, New York, London, Tokyo, Sydney and UTC, all resolving to the same
instant. It already passes ISO strings straight through `Date()`, so when this
change ships nothing breaks; delete `irl-time.js`, drop the `parseTimestamp`
shim in app.js, and call `new Date()` directly.

It is still a guess about the date. A reading from more than 24 hours ago is
indistinguishable from one earlier today, so the server fix is still wanted.

---

## 2. `/latest` cannot be asked for a specific app

> Observed while testing: for share code `GI3YCL2M`, `/latest` returned a
> **23-hour-old** workout reading while the watch face showed a current
> recovery bar. So the newest row the server holds for that user is from
> yesterday's workout — worth checking whether the recovery app posts to
> `/stamina` at all, or only on some trigger. That is a device question, not
> an API one, but it surfaced here.

**Today**

```
GET /latest   params: userID (string, required)   # and nothing else
```

`POST /stamina` writes `{ staminaScore, userID, appType }` where `appType`
defaults to `"recovery"`. So two apps write to one stream, and `/latest`
answers with whichever wrote most recently.

**What it breaks**

A client mid-workout has their workout number returned while their watch face
shows the recovery bar. Observed: `/latest` gave 81 (`appType: "workout"`) while
the watch read 88. Both current, different apps. The trainer dashboard
(`professional.js`, same `/latest?userID=` call) shows whichever won the race,
and nothing tells the trainer which they are looking at.

**The change**

Add an optional filter. Absent, behave exactly as now — the iOS apps and the
home page all call it bare:

```python
@app.get("/latest")
def latest(userID: str, appType: str | None = None):
    q = {"userID": userID}
    if appType:
        q["appType"] = appType
    row = db.find(q).sort("createdAt", -1).limit(1)
    ...
```

Then `/latest?userID=…&appType=recovery` is the watch-face number, and the
dashboard can show the recovery bar with the workout one as a secondary state
rather than silently swapping between them.

**Worth considering:** return both in one call (`{"recovery": {...},
"workout": {...}}`) under a new path like `/latest/all`, so the dashboard makes
one request per client instead of two.

---

## 3. `/create-checkout-session` drops the trial

**Today**

```
CheckoutRequest: professional_email, client_count, update_frequency,
                 update_interval_seconds, monthly_price
```

Five fields, all required, no trial. The website already sends
`trial_period_days: 49` (payment/payment.js) and FastAPI discards it as an
extra key, so **no trial is applied.** Nothing in the UI promises one, which is
why this is third rather than first.

**The change**

```python
class CheckoutRequest(BaseModel):
    professional_email: EmailStr
    client_count: int
    update_frequency: str
    update_interval_seconds: int
    monthly_price: float
    trial_period_days: int | None = None
```

and pass it to Stripe when the session is created:

```python
session = stripe.checkout.Session.create(
    mode="subscription",
    ...,
    subscription_data={
        **({"trial_period_days": req.trial_period_days} if req.trial_period_days else {}),
    },
)
```

**Clamp it server-side.** `trial_period_days` arrives from the browser and
anyone can post their own value. Stripe allows 1–730; cap it at whatever the
real offer is so a crafted request cannot mint a two-year free subscription:

```python
days = min(req.trial_period_days or 0, 49)
```

Stripe will not collect payment until the trial ends, so decide whether you want
`payment_method_collection="always"` (card up front, fewer trial abusers, lower
conversion) or `"if_required"` (no card, more signups, more churn at day 49).

Once this is live, say so on the page — `payment/index.html` has the Subscribe
button and the `.checkout-note` line ready for it. Until then the site stays
quiet about a trial it cannot deliver.

---

## 4. Three endpoints take no auth at all

Found 2026-10-30, while making the website's own auth honest. These two are the
weakest link in it, and neither can be fixed from the browser.

**`GET /professional/dashboard/{professional_id}`**

The professional's id is in the path and there is no `authorization` parameter
in the spec. Probed live:

```
GET /professional/dashboard/test              -> 200 {"clients":[],"subscription_tier":"none","client_count":0}
GET /professional/dashboard/nonexistent-uid   -> 200 {"clients":[],"subscription_tier":"none","client_count":0}
```

It answers 200 to anyone. A Firebase uid is not a secret — it travels in JWTs,
it shows up in logs and support threads — so anyone holding one can read that
trainer's whole client list: who they coach, and those clients' scores.

Compare `/professional/subscription-status`, which does it right:

```
GET /professional/subscription-status  (no header) -> 401 {"detail":"Missing or invalid Authorization header"}
```

**`DELETE /professional/remove-client-by-email`**

Same spec, same omission: no `authorization` parameter, and the subject is named
in the body. If that is as it looks, knowing a client's email is enough to
remove them from a trainer's dashboard — an unauthenticated write.

**`GET /user/monitoring-status-by-email/{apple_email}`**

Same omission, found while tracing (6). Its only parameter is the email in the
path, and it answers 200 to anyone:

```
GET /user/monitoring-status-by-email/<any address>
-> {"is_monitored":false,"subscription_tier":"free","update_interval":300,...}
```

Email addresses are guessable in a way uids are not, so this one hands out a
person's subscription tier and whether a professional is watching them to
anybody willing to type an address. It is the cheapest of the three to abuse
and should take the caller's token like the others.

**The fix, all of them**

Take the identity from the verified Firebase JWT, the way
`/professional/subscription-status` already does, and drop the caller-supplied
id. For the dashboard route that means `GET /professional/dashboard` with no
path parameter; keep the old path for a release returning 403 when the token's
uid does not match it, so nothing breaks mid-deploy.

**Why the website cannot patch around it**

The browser is the attacker's side of this boundary. Any check added in
`professional.js` is one the attacker simply does not run.

This is also what blocks the client list moving off the device. Right now
`professional.js` keeps clients in `localStorage` under `prof_<uid>`, so a
trainer who signs in on their iPad sees an empty dashboard even though the
server knows every client they added. `/professional/dashboard` is the endpoint
that fixes that — but reading it today would mean building the dashboard on an
unauthenticated route, so it waits for this change. Worth returning each entry
with the `userID` and the `share_code` it was redeemed from, so the site can
merge a server list with whatever is already on the device.

---

## 5. `/professional/subscription-status` describes a plan the account does not have

Small, and cheap to fix. For an account with no subscription the endpoint
answers with a tier, a client limit and a refresh interval:

```json
{ "tier": "free", "max_clients": 10, "update_interval": 300, ... }
```

But `POST /professional/add-client-by-code` refuses that same account outright:

```json
{ "detail": "Subscription not active" }
```

So the one endpoint says ten clients and the other says none. The website now
infers the truth — it treats `free` and `none` as unsubscribed and locks the
add-client form — but it is inferring something the server already knows.

Either report `max_clients: 0` for an account with no plan, or add an explicit
flag (`can_add_clients`) and let the page read it instead of guessing from the
tier name. The guess breaks the day a free tier is allowed one client.

---

## 6. The checkout → webhook → subscription-status chain joins on an email string

Traced 2026-10-30, after an account that had paid read as `free`.

**The chain, and what identifies the trainer at each hop**

| hop | endpoint | identity |
| --- | --- | --- |
| 1 | `POST /create-checkout-session` | `professional_email` — a typed string |
| 2 | Stripe → `POST /webhook/stripe` | Stripe metadata → written to Firebase |
| 3 | trainer creates their Firebase account | uid + email |
| 4 | `GET /professional/subscription-status` | the verified Firebase JWT |

`CheckoutRequest` carries no uid, and it cannot: **the Firebase account does not
exist at hop 1.** The trainer pays first and signs up on the way back. So the
only thing joining a Stripe subscription to a Firebase account is that email
string, matched at hop 4 against the one in the token.

**What was broken on this side**

`payment.js` stored the address exactly as typed while `professional.js`
lowercases on sign-up, so `Coach@Gym.com` bought a subscription under one string
and created an account under another. Fixed here — both ends lowercase now.

**What is still needed on the server**

1. **Lowercase `professional_email` on write, and match case-insensitively on
   read.** The page can only normalise what it sends; a row already written
   under a mixed-case address stays orphaned.
2. **Backfill.** Any subscription written before this fix may be keyed to a
   mixed-case address, and its owner is seeing `free` right now with no way to
   tell. A one-time pass that lowercases those keys is the only thing that
   reaches them.
3. **Consider not joining on an email at all.** An address is a thing people
   mistype, change and share. Once the account exists, writing its uid onto the
   subscription record gives a stable key, and the email becomes a convenience
   rather than the only link.

**The race, for the record**

The notes on `/webhook/stripe` put "user is already redirected" at step 6 and
the `subscription-status` call at step 7, with nothing in between that makes the
webhook arrive first. A trainer who signs up quickly can ask for their plan
before Stripe has told the server about it. The page now keeps asking for 45
seconds and says "Confirming your payment" instead of "Subscription not active",
which covers an ordinary delay but not an outage. A `session_id` on the success
URL, resolvable server-side, would let the page confirm a payment directly
rather than wait and hope.

---

## After these land, in this repo

- `app.js` — drop `parseTimestamp` (491) and the local-timezone guesswork in
  `isDataStale` (520); use the UTC field.
- `professional.js` — the demo box and the client cards now go through
  `irl-time.js`; once timestamps carry a date, that file can go and `Date()`
  can do the work. Also request `appType=recovery` so the demo matches the
  watch face.
- `payment/index.html` — add the trial to the copy near `.checkout-note`.
- `professional.js` — move the client list off `localStorage` and onto
  `GET /professional/dashboard`, once that route checks the token (4).
