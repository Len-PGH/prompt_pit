# The Prompt Pit — Challenge Playbook

Contestant briefs, win conditions, timing, and starter scaffolds for the
ClueCon 2026 Vibe Coding Championship.

> **The one rule that governs everything:** in a 5-minute round with an AI
> assistant, *writing* the code is not the bottleneck — **deploying it and
> demoing it live is.** Contestants realistically get ~3–3.5 min of building.
> So every 5-minute challenge is **markup/prompt-first with instant hot-reload**
> and an **objective, visible win condition.** Anything that needs
> "stand up a service + wire tools + place a call from scratch" is a 10-minute
> (finale) challenge, not a 5-minute one.

---

## Toolbox / harness — set up BEFORE the show

**Contestants bring their own SignalWire Space** — it is *not* provided. Each
contestant signs up free at signalwire.com and arrives with a phone number + API
credentials ready. Communicate this in advance (it's on the `/register` portal).

Organizers provide / prepare:

- [ ] The **starter scaffolds** in `scaffolds/` (contestants get these via the
      `/register` portal after signing up).
- [ ] The **challenge briefs + judging criteria** up front (this doc + the portal).
- [ ] A **way to demo on stage**: a call placed on speaker / softphone piped to
      the PA, screen mirrored to the projector.
- [ ] AI assistant of choice + language allowed; docs/internet policy stated.
- [ ] A **reset/seed step** so Station B starts from the same clean state as A.

Contestants set up in advance (remind them on registration):

- [ ] A **SignalWire Space** with a phone number + API credentials (sign up free).
- [ ] Their **AI coding assistant** logged in, **laptop + charger**, **GitHub account**.
- [ ] Heads-up: at the venue you may share **one IP** — a single Space placing
      many calls can trip fraud checks, so warm it up with test calls beforehand.

---

## Round mapping (recommended)

| Stage | Format | Challenges |
|---|---|---|
| **Round 1** (4 × 5 min) | 8 → 4 | Worst IVR · Fix This Disaster · Prompt Golf · Rogue Agent *(prompt-only)* |
| **Semis** (2 × 5 min) | 4 → 2 | Rogue Agent *(full)* · Carrier-Grade or Chaos *(scoped)* |
| **Finale** (10 min) | 2 → 1 | **Audience Sabotage** on a starter agent |

---

## Judging rubric (shown to contestants in advance)

Score each 0–10 (the operator app captures exactly these six):

| Criterion | What it means |
|---|---|
| Functionality | Did it actually run / take a call? |
| Creativity | Original, unexpected, clever |
| Crowd Reaction | Laughs, gasps, applause |
| Adaptability | Handling curveballs (esp. Sabotage) |
| Entertainment | Overall watchability |
| Would It Ship? | The "did this accidentally reach prod?" factor |

**Tie-break:** audience vote (QR) decides. State this up front.

---

## Challenge 1 — Build the Worst IVR  ·  ⏱ 5 min  ·  Round 1

**Brief:** Create the most frustrating phone tree imaginable — and keep it
callable. Loops, dead-ends, "press 0 for an agent" that replays the menu,
40-language selectors, infinite legal disclaimers. Judged on humor + groans.

**Win condition:** Subjective (judges + crowd). Must **still answer and run** —
a broken call scores 0 on Functionality.

**Starter:** [`scaffolds/worst-ivr.starter.yaml`](scaffolds/worst-ivr.starter.yaml)
— a working menu tree to make worse.

**Timing note:** Can finish early → let the *live call demo* eat the clock; the
comedy is in hearing it. Keep the loop `max` sane so it doesn't hang on stage.

---

## Challenge 2 — Fix This Disaster  ·  ⏱ 5 min (race)  ·  Round 1

**Brief:** Both stations get the *same* intentionally broken SWML. First to make
it behave correctly — verified by a **live test call** — wins. This is a race,
not a build-and-judge.

**Win condition (objective):** the 4 criteria in the broken file's header —
answered, greeted, press-1 → thank-you → clean hangup, other keys re-ask ≤3×.

**Files:**
- Contestants: [`scaffolds/fix-this-disaster.broken.yaml`](scaffolds/fix-this-disaster.broken.yaml)
- Host/judge only: [`scaffolds/fix-this-disaster.SOLUTION.yaml`](scaffolds/fix-this-disaster.SOLUTION.yaml)
  — 5 seeded bugs, easy→hard, so it's neither trivial nor unfinishable.

**Timing note:** Most unpredictable challenge. The graduated bugs are the
calibration knob — pull the hard one (`goto` label) to make it faster, add a
sixth to make it slower. **Both stations must start from an identical file.**

---

## Challenge 3 — Prompt Golf  ·  ⏱ 5 min  ·  Round 1

**Brief:** Produce a required target output using the **fewest prompt
characters.** Live character counter on the projector.

**Win condition (objective):** output must match the pre-defined target (exact
string, or judge-verified for open targets); lowest character count wins.

**Must specify in advance (this is the usual gap):**
- The **exact target output**.
- The **model + temperature** — pin temperature to 0 so runs are reproducible.
- **Characters vs tokens**, and whether whitespace counts.

**Timing note:** Often finishes in <2 min → keep it as a fast palate-cleanser
with a genuinely hard target. Not telecom-flavored, so use it for pacing variety.

---

## Challenge 4 — AI Voice Agent Gone Rogue  ·  ⏱ 5 min prompt-only / 10 min full

**Brief:** A working AI voice agent that starts perfectly helpful and gradually
becomes emotionally unstable / dramatic (but never hostile, unsafe, or profane).
All the comedy is in the prompt.

**Win condition:** Subjective (comedy + the arc landing). Must take a live call.

**Starter:** [`scaffolds/rogue-agent.starter.yaml`](scaffolds/rogue-agent.starter.yaml)
— edit **only `prompt.text`** in a 5-min round.

**Timing note:** Fits 5 min *only* if scoped to prompt/persona. Wiring SWAIG
tools/contexts pushes it to 10 min — save that depth for the semis.

---

## Challenge 5 — Carrier-Grade or Chaos?  ·  ⏱ 10 min (or tightly-scoped 5)  ·  Semi

**Brief:** Build something operational — a call flow, telecom alert, or small
dashboard. Audience votes: **would you trust it in production?**

**Win condition:** Audience QR vote on the trust question + judge scores.

**Timing note:** A polished dashboard does **not** finish in 5 min. Either give
it the 10-min slot, or scope it hard: *"a call flow that does exactly X"* using
`request` + `connect` + `switch`.

---

## FINALE — Audience Sabotage  ·  ⏱ 10 min  ·  head-to-head

**Brief:** Both finalists build on a starter agent. Every ~2 minutes the host
**spins the Sabotage Wheel** (in the operator app) and injects a new requirement.
Adapt live or lose points.

**Win condition:** Judge scores weighted toward **Adaptability** + **Crowd
Reaction**, plus the final audience QR vote as tie-break.

**Rules to state up front:**
- Complying with each injected requirement is **mandatory to score that round's
  adaptability** — the host adjudicates compliance live on the next call.
- Requirements **stack** (pirate voice AND rhyming AND upselling) for maximum chaos.

### Sabotage Wheel — telecom-flavored entries (pre-load in the app)

```
Pirate voice mode — every reply sounds like a pirate
Respond ONLY in SIP response codes (say "486 Busy Here" etc.)
Upsell caller ID on every single turn
Add hold music that is just someone humming
The agent now speaks exclusively in haiku
Every response must rhyme
Insert a mandatory dramatic 5-second pause before answers
Convert the whole call to a fake "premium 900-number" that bills per word
The IVR now politely insults the caller
Everything must be blamed on "the carrier"
Add a surprise second language mid-sentence
The agent is convinced it is a fax machine
Announce a made-up outage in a different area code
Route every request to "Tier 2" which is also you
Read a 10-second legal disclaimer after every reply
```

> To load these: Operator panel → **Sabotage Wheel** card → paste into the box →
> *Save entries*. (The app ships with a similar default list.)

---

## Quick reference — SWML gotchas (for the whole crew)

- Top-level **`version: 1.0.0`** is required.
- Audio uses **`play: { urls: [...] }`** (plural) or the shorthand `play: "say:..."`.
- **`answer`** before you play anything, or the caller hears nothing.
- `prompt` returns **`prompt_value`** (not `prompt_digit`); branch on it with `switch`.
- Loop with **`goto: { label: <name>, max: N }`** — always cap `max` on stage.
- The **`ai`** verb's personality lives in **`prompt.text`**; voice in `languages[].voice`.

Full cheatsheet: SignalWire SWML docs.
