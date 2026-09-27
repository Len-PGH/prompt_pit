# The Prompt Pit — Vibe Code-Off Challenge Reference

Eight competitors. Any tools. One prompted outcome. **Working software wins.**

Single-elimination bracket — 4 Quarterfinals → 2 Semifinals → 1 Championship (7 matchups).
Each prompt describes an *outcome*; contestants use any editor, model, agent, or framework.
Only behavior **demonstrated before time expires** counts.

> The full source playbooks live in [`docs/`](docs/): `Vibe_Code_Off_Event_Playbook.md`
> and `Vibe_Code_Off_Challenge_Ideas.md`. This file is the operator-facing summary that
> matches what the app serves (`CHALLENGES` / `CRITERIA` in `server.js`).

## Timing (recommended 75-minute sequential event)

| Round | Build time | Prompt style |
|---|---|---|
| Quarterfinal | 7 min | One clear interaction, immediately visible result |
| Semifinal | 9 min | Multiple states, a short workflow, or light integration |
| Championship | 11 min | A complete mini-product with an end-to-end journey |

The operator panel auto-sets the clock to the round's default when a prompt is selected.

## Judging — completion checklist + weighted rubric (0–100)

Judges first tick the prompt's **binary completion criteria** (what visibly works),
then set four 0–10 sliders. The total is weighted:

| Category | Weight | Source |
|---|---:|---|
| **Completion** | 50% | fraction of the prompt's binary criteria ticked |
| **Usability** | 20% | 0–10 slider |
| **Quality** | 15% | 0–10 slider |
| **Creativity** | 10% | 0–10 slider |
| **Presentation** | 5% | 0–10 slider |

**Tie-break order:** criteria completed → reliability during the live demo → usability/clarity → judge vote.
Audience votes (web QR / SMS / phone) are a separate crowd signal shown on stage.

---

## Quarterfinal prompt bank

Each has one clear interaction and an obvious completion state.

1. **The Excuse Generator** — situation in → three excuses labeled Believable / Risky / Absolutely Not, one copyable. *Test: "I missed the morning meeting."*
2. **Executive Decision Machine** — decision + up to three options → picks one with reasoning, plus a "Regret This Decision" button.
3. **Emergency Landing Page** — responsive launch page for a host-announced product: name+headline, three benefits, CTA, one interactive element.
4. **Bad Idea Detector** — idea → 0–100 score, ≥3 reasons, different visual state for good vs bad. *Test: "Uber, but for emotional support raccoons."*
5. **Meeting Cost Calculator** — attendees × length × hourly comp → total cost, cost/min, and a humorous equivalent.
6. **Tiny Support Desk** — complaint → priority + category + suggested first response. *Test: "Our production API has been returning errors for 20 minutes."*
7. **Audience Poll** — ≥3 choices, voting, no double-submit in a session, results update immediately.
8. **Password Judgment Engine** — strength + ≥2 weaknesses + a stronger suggestion, without echoing the original.
9. **Reverse To-Do List** — enter something you already did → add to list, award points, changing praise, allow removal.
10. **Corporate Translator** — plain ⇄ corporate both directions, with a visible switch. *Test: "We have no idea why it broke."*

## Semifinal prompt bank

Multiple states, a workflow, or a light integration.

1. **Incident Commander** — incident → severity, response checklist (track ≥3 items), customer status update. *Test: "Customers cannot complete checkout."*
2. **Voice of the Customer** — many comments → classify, group into themes, most-urgent, one-paragraph exec summary.
3. **Escape Room** — ≥2 sequential clues, no skipping, a win condition, reset, announced theme.
4. **Inbox Triage Simulator** — ≥6 messages → Urgent/Reply/Delegate/Ignore, change category, reply to one, counts per category.
5. **Travel Disaster Assistant** — destination + disruption + time + priority → ≥3 ordered actions that change with priority.
6. **API Status Dashboard** — ≥3 services with operational/degraded/down, change state, incident history, overall status.
7. **Product Review Investigator** — reviews → overall score, repeated complaints/praise, flag ≥1 suspicious, buy/skip.
8. **Smart Queue** — tasks (urgency+skills) routed to workers (skills); a new task routes live. *Test: ≥3 workers, 5 tasks.*
9. **Choose Your Own Disaster** — ≥3 consequential decisions, ≥2 endings, final screen summarizes the path.
10. **Conference Networking Assistant** — role+interests+objective → three matches with reasons + an opener.

## Championship prompt bank

A complete mini-product with an end-to-end demonstration.

1. **Build the Company** — host-announced startup → onboarding, one core workflow, meaningful output, session state, polished success. *e.g. Compliance Clown.*
2. **Rescue This Business** — diagnose, three prioritized actions, a customer-facing artifact, before/after projection.
3. **Real-Time Operations Center** — events arrive over time → classify, update metrics, resolve, final incident summary.
4. **The Impossible Concierge** — extract constraints, produce a plan, identify a conflict, clarify, revise.
5. **Human Versus Bureaucracy** — ask info, validate ≥2 fields, show progress, detect missing data, produce the application. *e.g. dragon permit.*
6. **Multi-Agent War Room** — ≥3 roles recommend, identify disagreements, combined decision, change one fact → rerun.
7. **Fix the Broken Product** — repair a broken starter, restore the workflow, add a host feature, improve errors, show success + failure.
8. **Build for the Audience** *(finale)* — the crowd picks user + problem + theme + one mandatory feature; ship an end-to-end app.

---

## Surprise Modifier Bank

Reveal **one** modifier mid-way through a semifinal or championship. More than one turns
skill into random sabotage. Loaded as the spin entries in the operator panel.

**Practical (adaptability):** Dark Mode · Mobile Panic · Undo That · Second Persona · Export It ·
Empty Means Empty · Garbage In · Keyboard Only · Refresh Survival · Clock Is Ticking · Voice of Reason ·
Something Happened · Failure Is a Feature · Explain Yourself.

**Chaos (keep a straight face):** Maximum Chaos Mode · Five-Year-Old Mode · Board Meeting Mode ·
Legal Has Entered the Chat · Passive-Aggressive Mode · Clippy's Revenge · Villain Mode · Medieval Mode ·
Reality TV Mode · Unnecessary Mascot · The Button Is Judging You · Everything Is Fine · AI Everywhere.

**Hostile Host (invalidate/complicate):** Breaking News · Executive Request · Compliance Says No ·
The API Is Down · No More Typing · Demo Gods Demand Tribute.

---

## Not allowed

A pre-built implementation of the announced prompt · help from another human during the round ·
changing or ignoring the criteria · presenting a static mockup as functional · editing/prompting/deploying
after time is called · hidden preparation that makes the prompt effectively prebuilt.
