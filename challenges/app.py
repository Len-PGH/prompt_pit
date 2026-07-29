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
import httpx
from fastapi import FastAPI, Request, HTTPException
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
VOICE_IDS = {cid for cid, _, kind in CHALLENGES if kind == "voice"}

app.include_router(StaticSWML("worst-ivr", WORST_IVR_DOC).as_router(), prefix="/worst-ivr")
app.include_router(StaticSWML("fix-disaster", FIX_DISASTER_DOC).as_router(), prefix="/fix-disaster")
app.include_router(StaticSWML("carrier", CARRIER_DOC).as_router(), prefix="/carrier")
app.include_router(RogueAgent().as_router(), prefix="/rogue-agent")

# ── Live state: which challenge the number rings, and the public base URL ──
SPACE = os.environ.get("SIGNALWIRE_SPACE", "")
PROJECT = os.environ.get("SIGNALWIRE_PROJECT", "")
TOKEN = os.environ.get("SIGNALWIRE_TOKEN", "")
NUMBER = os.environ.get("CHALLENGE_NUMBER", "")
AUTH_USER = os.environ.get("SWML_BASIC_AUTH_USER", "pit")
AUTH_PASS = os.environ.get("SWML_BASIC_AUTH_PASSWORD", "")
ADMIN_KEY = os.environ.get("ADMIN_KEY", "")
STATE = {"active": os.environ.get("CHALLENGE_ACTIVE", "worst-ivr"), "base": os.environ.get("PUBLIC_URL", "").rstrip("/")}


def point_number(challenge):
    """Point CHALLENGE_NUMBER's Voice handler at a challenge route (relay_script SWML)."""
    base = STATE["base"]
    if not (SPACE and PROJECT and TOKEN and NUMBER and base and challenge in VOICE_IDS):
        return False
    host = base.split("://", 1)[-1]
    url = f"https://{AUTH_USER}:{AUTH_PASS}@{host}/{challenge}/"
    try:
        with httpx.Client(auth=(PROJECT, TOKEN), timeout=15) as c:
            num = next((n for n in (c.get(f"https://{SPACE}/api/relay/rest/phone_numbers",
                        params={"page_size": 100}).json() or {}).get("data", []) if n.get("number") == NUMBER), None)
            if not num:
                return False
            r = c.put(f"https://{SPACE}/api/relay/rest/phone_numbers/{num['id']}",
                      json={"call_handler": "relay_script", "call_relay_script_url": url})
            return r.status_code < 300 and (r.json() or {}).get("call_handler") == "relay_script"
    except Exception:
        return False


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.post("/admin/public-url")
async def set_public_url(request: Request):
    ra = request.client.host if request.client else ""
    if not (ra.startswith("127.") or ra == "::1" or ra.startswith("::ffff:127.")):
        raise HTTPException(403, "loopback only")
    body = await request.json()
    url = (body.get("url") or "").rstrip("/")
    if url:
        STATE["base"] = url
        point_number(STATE["active"])   # wire the number to the current active challenge
    return {"ok": True, "base": STATE["base"], "active": STATE["active"]}


@app.get("/api/state")
def api_state():
    return {
        "active": STATE["active"],
        "number": NUMBER,
        "base": STATE["base"],
        "challenges": [{"id": c, "title": t, "kind": k} for c, t, k in CHALLENGES],
    }


@app.post("/admin/active")
async def set_active(request: Request):
    if not ADMIN_KEY or request.headers.get("x-admin-key") != ADMIN_KEY:
        raise HTTPException(403, "forbidden")
    body = await request.json()
    ch = body.get("challenge")
    if ch not in VOICE_IDS:
        raise HTTPException(400, "not a voice challenge")
    STATE["active"] = ch
    ok = point_number(ch)
    return {"ok": ok, "active": ch, "number": NUMBER}


@app.get("/prompt-golf", response_class=HTMLResponse)
@app.get("/prompt-golf/", response_class=HTMLResponse)
def prompt_golf():
    with open(os.path.join(os.path.dirname(__file__), "public", "prompt-golf.html")) as f:
        return f.read()


@app.get("/admin", response_class=HTMLResponse)
def admin_page():
    with open(os.path.join(os.path.dirname(__file__), "public", "admin.html")) as f:
        return f.read()


@app.get("/", response_class=HTMLResponse)
def index():
    with open(os.path.join(os.path.dirname(__file__), "public", "index.html")) as f:
        return f.read()
