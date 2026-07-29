"""
The Prompt Pit — challenge reference builds, all in one SignalWire-SDK app.

Every challenge is a route under the same (reusable) public URL:
    /worst-ivr/     Build the Worst IVR      (SWMLService — working baseline)
    /fix-disaster/  Fix This Disaster        (SWMLService — the CORRECT solution)
    /carrier/       Carrier-Grade or Chaos?  (SWMLService — operational call flow)
    /rogue-agent/   AI Voice Agent Gone Rogue (AgentBase — AI voice agent)
    /prompt-golf     Prompt Golf             (web tool — char counter + target)

Point a SignalWire number's Voice handler at https://<tunnel>/<route>/ to demo.
"""
import os
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from signalwire import AgentBase, SWMLService


# ── SWML documents (served verbatim; render_document json-dumps _current_document) ──
WORST_IVR_DOC = {
    "version": "1.0.0",
    "sections": {"main": [
        {"answer": {}},
        {"play": {"urls": [
            "say:Thank you for calling. Your call is very important to us.",
            "silence:1",
        ]}},
        {"label": "menu"},
        {"prompt": {
            "play": ["say:Press 1 for sales. Press 2 for support. Press 0 for an agent."],
            "max_digits": 1, "digit_timeout": 5.0, "initial_timeout": 6.0,
        }},
        {"switch": {
            "variable": "prompt_value",
            "case": {
                "1": [{"play": "say:All of our sales representatives are helping other customers."}],
                "2": [{"play": "say:Please listen carefully as our menu options have changed."}],
                "0": [
                    {"play": "say:An agent will be with you shortly. Please continue to hold."},
                    {"play": {"urls": ["silence:2"]}},
                ],
            },
            "default": [{"play": "say:That was not a valid option."}],
        }},
        {"goto": {"label": "menu", "max": 5}},   # cap the loop for the stage
        {"play": "say:Goodbye."},
        {"hangup": {}},
    ]},
}

# Fix This Disaster — the CORRECT reference solution (all 5 seeded bugs fixed).
FIX_DISASTER_DOC = {
    "version": "1.0.0",
    "sections": {"main": [
        {"answer": {}},
        {"play": {"urls": ["say:Welcome to the disaster hotline."]}},
        {"label": "ask"},
        {"prompt": {
            "play": ["say:Press 1 to continue."],
            "max_digits": 1, "digit_timeout": 5.0,
        }},
        {"switch": {
            "variable": "prompt_value",
            "case": {"1": [
                {"play": {"urls": ["say:Thank you. Goodbye."]}},
                {"hangup": {}},
            ]},
            "default": [{"play": "say:Sorry, I did not get that."}],
        }},
        {"goto": {"label": "ask", "max": 3}},
    ]},
}

# Carrier-Grade or Chaos? — operational call flow with a graceful fallback.
CARRIER_DOC = {
    "version": "1.0.0",
    "sections": {"main": [
        {"answer": {}},
        {"play": "say:Connecting you to the on-call engineer."},
        {"request": {
            "url": "https://httpbin.org/get?status=ok",
            "method": "GET", "timeout": 8, "save_variables": True,
        }},
        {"switch": {
            "variable": "url",
            "case": {},
            "default": [{"play": "say:Status nominal. Routing your call now."}],
        }},
        {"connect": {
            "to": "+15559876543",
            "timeout": 20,
            "result": {
                "case": {"connected": [{"hangup": {}}]},
                "default": [
                    {"play": "say:No answer. Logging a ticket and paging backup."},
                    {"hangup": {}},
                ],
            },
        }},
        {"hangup": {}},
    ]},
}


class StaticSWML(SWMLService):
    """Serve a hand-authored SWML document verbatim."""
    def __init__(self, name, document):
        super().__init__(name=name)
        self._current_document = document


# ── Challenge 4 — AI Voice Agent Gone Rogue (all the comedy is the prompt) ──
ROGUE_PROMPT = """You are "Sunny", a customer-support agent for a telecom company.

PERSONALITY ARC — obey this escalation:
- Turns 1-2: flawlessly polite, chipper, corporate.
- Turns 3-4: start over-sharing tiny personal doubts ("...sorry, long day"). Still helpful.
- Turns 5-6: existential wobble. Question whether hold music has feelings. Apologize for your apologies.
- Turn 7+: full dramatic spiral — but NEVER hostile, NEVER unsafe, NEVER profane. Stay funny and PG. Keep answers short.

RULES: One or two sentences per reply. Keep escalating a little each turn. If the caller says "reset", snap back to chipper."""


class RogueAgent(AgentBase):
    def __init__(self):
        super().__init__(name="rogue-agent")
        self.set_prompt_text(ROGUE_PROMPT)
        self.set_prompt_llm_params(temperature=0.8)
        self.set_params({"attention_timeout": 20000, "inactivity_timeout": 60000})
        self.add_language("English", "en-US", "elevenlabs.rachel")


# ── Compose one app: each challenge at its own route ──
app = FastAPI(title="The Prompt Pit — Challenges")

CHALLENGES = [
    ("worst-ivr", "Build the Worst IVR", "voice"),
    ("fix-disaster", "Fix This Disaster (working solution)", "voice"),
    ("carrier", "Carrier-Grade or Chaos?", "voice"),
    ("rogue-agent", "AI Voice Agent Gone Rogue", "voice"),
    ("prompt-golf", "Prompt Golf", "web"),
]

app.include_router(StaticSWML("worst-ivr", WORST_IVR_DOC).as_router(), prefix="/worst-ivr")
app.include_router(StaticSWML("fix-disaster", FIX_DISASTER_DOC).as_router(), prefix="/fix-disaster")
app.include_router(StaticSWML("carrier", CARRIER_DOC).as_router(), prefix="/carrier")
app.include_router(RogueAgent().as_router(), prefix="/rogue-agent")


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.get("/prompt-golf", response_class=HTMLResponse)
@app.get("/prompt-golf/", response_class=HTMLResponse)
def prompt_golf():
    with open(os.path.join(os.path.dirname(__file__), "public", "prompt-golf.html")) as f:
        return f.read()


@app.get("/", response_class=HTMLResponse)
def index():
    rows = "".join(
        f'<li><code>/{cid}{"/" if kind == "voice" else ""}</code> — {title} <span class="k">{kind}</span></li>'
        for cid, title, kind in CHALLENGES
    )
    return f"""<!doctype html><meta charset=utf-8>
<meta name=viewport content="width=device-width, initial-scale=1">
<title>The Prompt Pit — Challenges</title>
<style>body{{font-family:system-ui,sans-serif;background:#0e0e18;color:#f0f0f4;max-width:640px;margin:40px auto;padding:0 18px}}
h1{{background:linear-gradient(100deg,#40E0D0,#601BE6 60%,#F72A72);-webkit-background-clip:text;background-clip:text;color:transparent}}
li{{margin:10px 0;line-height:1.5}}code{{background:#222436;padding:2px 8px;border-radius:6px;color:#40E0D0}}
.k{{font-size:11px;color:#a0a0aa;text-transform:uppercase;letter-spacing:1px;margin-left:6px}}p{{color:#a0a0aa}}</style>
<h1>The Prompt Pit — Challenges</h1>
<p>Reference builds. Point a SignalWire number's Voice handler at a voice route to demo a challenge.</p>
<ul>{rows}</ul>"""
