# stamina-api: three changes the website needs

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

Once this lands, delete `parseTimestamp` and `isDataStale`'s workaround in
app.js and use `new Date(timestampUTC)` directly.

---

## 2. `/latest` cannot be asked for a specific app

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

## After these land, in this repo

- `app.js` — drop `parseTimestamp` (491) and the local-timezone guesswork in
  `isDataStale` (520); use the UTC field.
- `professional.js` — the demo box prints the raw server time; switch to a real
  relative time ("updated 12s ago") and request `appType=recovery` so it matches
  the watch face.
- `payment/index.html` — add the trial to the copy near `.checkout-note`.
