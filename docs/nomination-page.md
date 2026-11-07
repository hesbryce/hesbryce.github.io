# Nomination one-pager — what's done and what's left

The page is [nomination.html](../nomination.html). It will serve at
`https://irlhealthbar.com/nomination` once pushed. Add `?draft` to the URL to see
the outstanding list as a panel on the page itself.

## Checklist status

| Item | State |
| --- | --- |
| Hero with the bar clip and App Store badge | **Done** — the silent watch Header video, 26s, looping, 397 KB |
| The glance | **Done** — plus a draggable health bar built from the app's real zones |
| Three stories | **Done** — the nomination text verbatim, no kids |
| Design: Liquid Glass, charts, tags | **Done** |
| Everywhere: watch face, Smart Stack, Siri, share codes | **Done** — with the real Siri phrases from the code |
| Made for everyone | **Done** — VoiceOver, Dynamic Type, 9 languages, EN/AR side by side |
| Reviews and press | **Empty and hidden** — nothing invented; see below |
| Updates timeline | **Done** — 2023, the Workout app, and the 3.0 notes from whatsNew.txt |
| About you | **Done** — no photo yet |
| Footer | **Done** |
| Works on a phone | **Checked** at 375 px, no horizontal scroll |
| Light and Dark Mode | **Light only, by decision.** One theme, chosen 6 Nov 2026: the page is a light document and the product shots carry the app's darkness. The checklist asked for both; this deliberately does not. |
| Large type | **Checked** at 162%, nothing clips or overflows |
| Video captions, no autoplay sound | Hero is silent and muted. Walkthrough captions written, waiting on the clip |
| One page, clear anchors | **Done** — `#glance #stories #design #everywhere #everyone #updates #about #copy` |
| Permanent URL in the nomination's additional info | **Yours to do** after pushing |

## Still needs you

1. **Screen recording, 30–45s.** Drop it at `assets/nomination/walkthrough.mp4`
   with a poster at `walkthrough-poster.webp`, then delete `hidden` from the
   `<section id="walkthrough">` tag. The sources are parked on `data-` attributes
   so the hidden section never requests a file that isn't there; the script wires
   them up the moment you unhide it.
2. **Caption timings.** The text is written at
   `assets/nomination/walkthrough.en.vtt`. The timings are guesses made before
   the recording existed — open it next to the clip and nudge the cues.
3. **Reviewer quotes and press links**, each with permission. Fill the
   `<section id="press">` block and delete its `hidden`. There is a commented-out
   `<blockquote>` in there showing the shape.
4. **Permissions** from your parents and the mom, and whether names are used.
   Their stories are on the page right now in your words, unnamed.
5. **Your running photo**, if you want one in `#about`.
6. **Press-kit zip** — not built; say the word and I will assemble it from the
   assets already converted.

## Two claims I left off on purpose

- **"Encrypted and never shared."** It is in your system-prompt notes but I could
  not find it in the code I read, so the page says only what the App Store listing
  says: stats come from Apple Health, and a share code carries the percentage and
  nothing underneath it. Confirm it and I will add the stronger line.
- **Differentiate Without Color.** No such accessibility check exists anywhere in
  either project. The page instead claims the thing that is true: every zone
  states its percentage inside the bar, so the reading survives without the hue.

## What every claim was checked against

Zone colours and thresholds from `ColorPalette.swift`. Siri phrases from
`HealthBarIntents.swift` and `HealthBarShortcuts.swift`. Widget families from
`HealthBarWidgets.swift`; Lock Screen, Dynamic Island, StandBy, Smart Stack and
the Mac menu bar from `HealthBarLiveActivity.swift`. Nine languages counted out
of `Localizable.xcstrings`. Share codes from `SharingAPIClient.swift`. The four
demo states are the ones `OnboardingView.swift` cycles through. Everything else
comes from the shipping `description.txt` and `whatsNew.txt`.

The score formula and its inputs appear nowhere on the page.
