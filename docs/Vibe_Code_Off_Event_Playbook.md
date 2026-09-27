**LIVE COMPETITION FORMAT**

# **Vibe Code-Off**

**Event Playbook**

Eight competitors. Any tools. One prompted outcome. Working software wins.

|  |  |  |
| :---- | :---- | :---- |

| Core principle: Competitors work in their own environment of choice. They may use any tools, models, frameworks, boilerplate, or hosted services. The result is judged only by whether the announced criteria visibly work before time expires. |
| :---- |

*Prepared as a practical run-of-show, prompt bank, and judging guide*

# **1\. Event Concept**

The Vibe Code-Off is a live, single-elimination competition in which eight participants use their preferred development environment and AI-assisted tools to build a prompted outcome under a strict time limit. Each matchup is decided by visible completion of the required behaviors, supported by usability, quality, creativity, and presentation.

| The audience should always be able to answer three questions: What must be built? How much time remains? Which required behaviors actually work? |
| :---- |

## **Bracket Structure**

* Quarterfinals: 4 matchups involving all 8 competitors.  
* Semifinals: 2 matchups involving the 4 quarterfinal winners.  
* Championship: 1 final matchup between the 2 semifinal winners.  
* Total: 7 matchups in a standard sequential single-elimination bracket.

## **Contestant Environment**

Each competitor works in an environment of their own choice. The competition does not attempt to standardize editors, operating systems, frameworks, models, coding agents, or deployment methods. This makes the event a test of each participant’s complete workflow rather than familiarity with an artificial contest setup.

# **2\. Timing Options**

The following schedules assume all seven matchups occur sequentially on one stage, with an announcer guiding the audience through prompt reveals, transitions, demonstrations, judging, and the final result.

| Total Event | Quarterfinals(each) | Semifinals(each) | Championship | ProductionOverhead |
| :---: | :---: | :---: | :---: | :---: |
| 60 minutes | 5 min | 6 min | 8 min | 20 min |
| 75 minutes | 7 min | 9 min | 11 min | 18 min |
| 90 minutes | 9 min | 11 min | 14 min | 18 min |

## **Recommended Format: 75 Minutes**

Seventy-five minutes is the strongest balance between pace and build quality. The 60-minute format will feel intentionally frantic, while the 90-minute format allows competitors to build more substantial applications rather than mostly polished mockups or landing pages.

| Segment | Time |
| :---- | :---: |
| Opening, rules, and bracket introduction | 4 min |
| Four quarterfinals | 28 min (4 x 7\) |
| Two semifinals | 18 min (2 x 9\) |
| Championship | 11 min |
| Demos, judging, transitions, and winner announcement | 14 min |
| **Total** | **75 min** |

# **3\. Alternative: Simultaneous Heats**

If all four quarterfinal matchups run simultaneously, the competition has only three coding periods: quarterfinals, semifinals, and championship. This produces much better builds because each round can be longer, but the audience and announcer cannot closely follow every competitor during the opening round.

| Total Event | Production Time Reserved | Equal Coding Time per Round |
| ----- | :---: | :---: |
| 60 minutes | 15 min | 15 min |
| 75 minutes | 15 min | 20 min |
| 90 minutes | 15 min | 25 min |
| **Use simultaneous heats when build quality matters more than following every keystroke. Use sequential heats when the announcer, audience narrative, and head-to-head drama are the main attraction.** |  |  |

# **4\. Prompt Design Principles**

Each prompt should describe an outcome rather than prescribe an implementation. Contestants should be free to choose their architecture, technology, models, and workflow. The required behaviors must be objective enough that judges can mark them complete or incomplete during a short live demonstration.

* Quarterfinal prompts should have one clear interaction and an immediately visible result.  
* Semifinal prompts should require multiple states, a short workflow, or a lightweight integration.  
* Championship prompts should produce a complete mini-product with an end-to-end user journey.  
* Every challenge should have four or five binary completion criteria.  
* Only behavior demonstrated before time expires counts.  
* Prompts should be funny or memorable without requiring specialized domain knowledge.

| Do not judge the sophistication of the prompt chain, the amount of generated code, or the elegance of the architecture unless those qualities create a visibly better working result. |
| :---- |

# **5\. Quarterfinal Prompt Bank**

Designed for approximately 5 to 9 minutes. Each prompt centers on one clear interaction, minimal integration, and a visually obvious completion state.

**1\. The Excuse Generator**

Build an application that:

* Accepts a situation from the user.  
* Generates three excuses.  
* Labels each excuse as “Believable,” “Risky,” or “Absolutely Not.”  
* Lets the user copy one excuse.

**Completion test:** Enter “I missed the morning meeting” and produce three labeled, copyable results.

**2\. Executive Decision Machine**

Build an application that:

* Accepts a decision and up to three options.  
* Selects one option.  
* Gives a short explanation.  
* Includes a “Regret This Decision” button that chooses again.

**Completion test:** Enter three lunch options and receive a decision with reasoning.

**3\. Emergency Landing Page**

Build a responsive landing page for a fictional product announced by the host. It must include:

* Product name and headline.  
* Three benefits.  
* A call-to-action button.  
* One interactive element, animation, or state change.

**Example:** *Build the launch page for CloudPillow, the first pillow with enterprise observability.*

**4\. Bad Idea Detector**

Build an application that:

* Accepts an idea.  
* Scores it from 0 to 100\.  
* Displays at least three reasons for the score.  
* Shows a different visual state for good and bad ideas.

**Completion test:** Evaluate “Uber, but for emotional support raccoons.”

**5\. Meeting Cost Calculator**

Build a calculator that accepts:

* Number of attendees.  
* Meeting length.  
* Average hourly compensation.  
* Displays total meeting cost and cost per minute.  
* Displays a humorous equivalent, such as coffees, pizzas, or streaming subscriptions.

**6\. Tiny Support Desk**

Build a support-ticket interface that:

* Accepts a customer complaint.  
* Assigns a priority.  
* Assigns a category.  
* Generates a suggested first response.

**Completion test:** Submit “Our production API has been returning errors for 20 minutes.”

**7\. Audience Poll**

Build a live-looking poll that:

* Displays at least three choices.  
* Allows voting.  
* Prevents accidental double submission in the same session.  
* Updates the visible results immediately.  
* Does not require a real multi-user backend unless the host explicitly requires one.

**8\. Password Judgment Engine**

Build a password evaluator that:

* Accepts a password.  
* Displays strength.  
* Explains at least two weaknesses.  
* Suggests a stronger alternative without displaying the original password elsewhere.

**9\. Reverse To-Do List**

Build an application where users enter something they completed. It must:

* Add the accomplishment to a list.  
* Award points.  
* Display a changing congratulatory message.  
* Allow an item to be removed.

**10\. Corporate Translator**

Build a translator that converts plain language into corporate language and back.

* Convert plain language into plausible corporate language.  
* Convert corporate language back into blunt language.  
* Provide a visible way to switch direction.  
* Preserve the meaning closely enough to demonstrate the transformation.

**Completion test:** “We have no idea why it broke” becomes corporate language, and the generated corporate version can be converted back.

# **6\. Semifinal Prompt Bank**

Designed for approximately 9 to 11 minutes. These prompts require multiple states, a workflow, or a simple integration.

**1\. Incident Commander**

Build an incident-management dashboard that:

* Accepts an incident description.  
* Assigns severity.  
* Generates an initial response checklist.  
* Tracks at least three checklist items as complete or incomplete.  
* Produces a status update suitable for customers.

**Completion test:** Use “Customers cannot complete checkout.”

**2\. Voice of the Customer**

Build an application that accepts multiple customer comments and:

* Classifies each as positive, neutral, or negative.  
* Groups comments into themes.  
* Identifies the most urgent issue.  
* Produces a one-paragraph executive summary.  
* May use supplied sample comments or a contestant-built input interface.

**3\. Escape Room**

Build a small interactive puzzle with:

* At least two sequential clues.  
* A state that prevents skipping directly to the end.  
* A visible win condition.  
* A reset button.  
* A theme announced at the beginning of the round.

**4\. Inbox Triage Simulator**

Build an interface containing at least six sample messages. It must:

* Categorize messages as urgent, reply, delegate, or ignore.  
* Allow the user to change the category.  
* Generate a reply for one selected message.  
* Display a count for each category.

**5\. Travel Disaster Assistant**

Build an application that accepts:

* Original destination.  
* Type of disruption.  
* Time constraint.  
* User priority, such as cheapest, fastest, or least annoying.  
* Produces a recovery plan with at least three ordered actions.

**6\. API Status Dashboard**

Build a dashboard for at least three fictional services that:

* Shows operational, degraded, and down states.  
* Allows a service’s state to be changed.  
* Maintains a visible incident history.  
* Calculates overall system status.

**7\. Product Review Investigator**

Build an application that accepts a collection of reviews and:

* Produces an overall score.  
* Extracts repeated complaints.  
* Extracts repeated praise.  
* Flags at least one suspicious or low-information review.  
* Recommends whether to buy the product.

**8\. Smart Queue**

Build a queue-management system where:

* Tasks have urgency and required skills.  
* Workers have different skills.  
* The application assigns each task to an appropriate worker.  
* The user can add a new task and see it routed.

**Completion test:** Include at least three workers and five tasks.

**9\. Choose Your Own Disaster**

Build an interactive story where:

* The user makes at least three decisions.  
* Decisions change later choices or results.  
* There are at least two endings.  
* The final screen summarizes the user’s decisions.

**10\. Conference Networking Assistant**

Build an application that:

* Accepts a person’s role, interests, and objective.  
* Suggests three people from a supplied attendee list.  
* Explains each match.  
* Generates an opening line for the selected person.

# **7\. Championship Prompt Bank**

Designed for approximately 11 to 25 minutes, depending on the event format. These prompts should produce a complete mini-product with an obvious end-to-end demonstration.

**1\. Build the Company**

The host announces a ridiculous fictional startup. Contestants must build a working product experience containing:

* A landing or onboarding screen.  
* One core product workflow.  
* Meaningful generated or calculated output.  
* Persistent state during the session.  
* A polished success screen.

**Example:** *Compliance Clown, an AI system that explains regulatory violations using balloon animals.*

**2\. Rescue This Business**

Contestants receive a fictional struggling business with a short description, three customer complaints, basic performance numbers, and one operational constraint. Build an application that:

* Diagnoses the primary problem.  
* Recommends three actions.  
* Prioritizes those actions.  
* Creates one customer-facing artifact.  
* Shows a simple before-and-after projection.

**3\. Real-Time Operations Center**

Build an operations dashboard that:

* Displays incoming events.  
* Classifies events by severity.  
* Updates visible metrics.  
* Allows an operator to acknowledge or resolve an event.  
* Generates a final incident summary.  
* May simulate the events, but they must visibly arrive or change over time.

**4\. The Impossible Concierge**

Build a concierge application that accepts a complicated request containing multiple constraints. It must:

* Extract the constraints.  
* Produce a plan.  
* Identify at least one conflict between constraints.  
* Ask for or simulate one clarification.  
* Revise the plan based on the answer.

**Example:** *Plan a team dinner for 12 people tonight, under $40 each, including two vegans, one gluten-free guest, and someone who refuses to cross a bridge.*

**5\. Human Versus Bureaucracy**

Build an assistant that guides a user through a fictional bureaucratic process. It must:

* Ask for required information.  
* Validate at least two fields.  
* Show progress through multiple steps.  
* Detect missing information.  
* Produce a completed application or action plan.

**Example:** *Obtain a dragon permit or register a time machine.*

**6\. Multi-Agent War Room**

Build a system where at least three named roles evaluate the same problem, such as an engineer, finance leader, and customer advocate. The system must:

* Produce a recommendation from each role.  
* Identify disagreements.  
* Produce a final combined decision.  
* Allow the user to change one fact and rerun the decision.  
* The roles do not need to be literal autonomous agents; visible behavior is what counts.

**7\. Fix the Broken Product**

Provide contestants with a deliberately incomplete starter application or API. They must:

* Diagnose the problem.  
* Restore the primary workflow.  
* Add one missing feature announced by the host.  
* Improve user-visible error handling.  
* Demonstrate both success and failure cases.

**8\. Build for the Audience**

The audience selects a user type, a problem, a personality or visual theme, and one strange mandatory feature. Contestants must build a working application that:

* Clearly serves the selected user.  
* Solves the selected problem.  
* Incorporates the selected theme.  
* Implements the mandatory feature.  
* Completes one end-to-end workflow.

| Strongest championship format: “Build for the Audience.” Neither finalist can pre-optimize for a known application type, and the audience has a direct stake in the result. |
| :---- |

# **8\. Surprise Modifiers**

A surprise modifier may be revealed halfway through a semifinal or championship. One modifier per round is enough. More than one risks turning the contest into random sabotage rather than a demonstration of skill.

| • Add dark mode. | • Make one feature keyboard accessible. |
| :---- | :---- |
| • Make it usable on mobile. | • Explain the result to a five-year-old. |
| • Add undo. | • Add a “maximum chaos” mode. |
| • Support a second user type. | • Preserve the user’s work after refresh. |
| • Add an export or copy function. | • Add one voice interaction. |
| • Handle an empty input. | • Add one real-time or simulated-real-time event. |
| • Handle a deliberately invalid input. | • Replace a happy path with an error and recover gracefully. |
| • Add a timer. |  |

# **9\. Contestant Rules**

## **Allowed**

* Any operating system, IDE, editor, framework, programming language, model, coding agent, local tool, or hosted service.  
* Existing personal boilerplate, templates, snippets, and previously installed packages.  
* Documentation, web searches, and reference material.  
* Multiple AI tools or model providers.  
* Manual coding alongside generated code.  
* Local execution, hosted previews, tunnels, or other reasonable demonstration methods.

## **Not Allowed**

* A previously completed implementation of the announced challenge.  
* Help from another human during the round.  
* Changing, redefining, or ignoring the required criteria.  
* Presenting a static mockup as though it were functional.  
* Continuing to type, prompt, edit, deploy, or repair after time is called.  
* Using hidden preparation that makes the announced challenge effectively prebuilt.

| Only behavior demonstrated before time expires counts. Source code, prompts, architecture, and explanations do not substitute for a working result. |
| :---- |

# **10\. Judging Framework**

Each prompt should be accompanied by a judge checklist containing four or five binary requirements. Judges first determine what works, then use the weighted categories below to separate competitors with similar completion levels.

| Category | Weight | What Judges Evaluate |
| :---: | :---: | :---- |
| **Completion** | 50% | How many required criteria visibly work during the demonstration. |
| **Usability** | 20% | Whether a new user can understand and operate the result. |
| **Quality** | 15% | Whether the experience feels coherent rather than stitched together. |
| **Creativity** | 10% | Whether the competitor produced something memorable or unexpectedly effective. |
| **Presentation** | 5% | Whether the competitor clearly demonstrates the result within the allotted time. |

## **Tie-Breaking Order**

1. Number of required criteria completed.  
2. Reliability of the completed criteria during the live demonstration.  
3. Usability and clarity of the end-to-end workflow.  
4. Judge vote based on overall quality and creativity.

# **11\. Announcer and Production Guide**

The announcer should translate the development activity into a simple story for the audience without attempting to narrate every keystroke. The host’s job is to keep the criteria, time pressure, and head-to-head differences visible.

* Before each round: introduce the competitors, reveal the complete prompt, and read the completion criteria aloud.  
* At the start: confirm the timer and make clear that only demonstrated behavior counts.  
* During the build: periodically remind the audience of the requirements and call out visible milestones.  
* At the midpoint: reveal the modifier, when one is being used.  
* At time: require hands off keyboards and stop all prompts, edits, and deployments.  
* During demos: ask each competitor to follow the same requirement order.  
* Before judging: restate which criteria visibly passed or failed.  
* After the decision: immediately advance the bracket and introduce the next matchup.

| Keep demonstrations standardized: same maximum demo time, same checklist order, and no post-time repairs disguised as presentation. |
| :---- |

# **12\. Recommended Event Lineup**

For a 75-minute sequential event, the following structure creates a clear rise in difficulty while keeping the challenges varied and entertaining.

| Round | Suggested Prompt Type | Recommended Time |
| :---: | :---- | :---: |
| **Quarterfinal 1** | The Excuse Generator or Bad Idea Detector | 7 min |
| **Quarterfinal 2** | Meeting Cost Calculator or Tiny Support Desk | 7 min |
| **Quarterfinal 3** | Emergency Landing Page or Audience Poll | 7 min |
| **Quarterfinal 4** | Executive Decision Machine or Corporate Translator | 7 min |
| **Semifinal 1** | Incident Commander or API Status Dashboard | 9 min |
| **Semifinal 2** | Smart Queue or Inbox Triage Simulator | 9 min |
| **Championship** | Build for the Audience | 11 min |

The championship should ideally include audience-selected ingredients: a user type, a problem, a visual or personality theme, and one strange mandatory feature. This creates an unpredictable final while keeping the completion criteria objective.

# **13\. Organizer Checklist**

## **Before the Event**

* ☐ Confirm all eight contestants and seed the bracket.  
* ☐ Publish allowed and prohibited tool rules.  
* ☐ Require every contestant to verify their display, network, audio, and demo URL.  
* ☐ Prepare more prompts than the event requires.  
* ☐ Create a binary checklist for every selected prompt.  
* ☐ Prepare one backup prompt for each round.  
* ☐ Assign a head judge and at least one additional judge.

## **Before Each Matchup**

* ☐ Load the prompt and checklist for judges.  
* ☐ Confirm the timer and demo limit.  
* ☐ Verify both contestants can display their environment.  
* ☐ Read the criteria exactly as written.  
* ☐ Confirm hands off until the official start.

## **At Time**

* ☐ Stop all edits, prompts, deployments, and debugging.  
* ☐ Capture the current result before anything changes.  
* ☐ Run each demo in the same checklist order.  
* ☐ Record pass or fail for every required criterion.

## **After the Matchup**

* ☐ Apply weighted scoring only after completion is recorded.  
* ☐ Resolve ties using the published tie-breaking order.  
* ☐ Announce the winner and update the bracket immediately.  
* ☐ Reset displays and load the next prompt before introducing the next contestants.

# **14\. Final Operating Principle**

| The competition is not “who generated the most code.” It is who used their preferred tools to turn an unpredictable prompt into the strongest working outcome before the clock reached zero. |
| :---- |

The format works best when the criteria are simple enough to understand immediately, difficult enough that not everyone finishes, and visible enough that the audience can judge progress alongside the official judges. The tools are unrestricted; the outcome is not.