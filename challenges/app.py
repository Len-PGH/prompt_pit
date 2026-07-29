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
def P(*lines):
    """A schema-valid play verb (object form with urls)."""
    return {"play": {"urls": list(lines)}}


WORST_IVR_DOC = {
    "version": "1.0.0",
    "sections": {"main": [
        {"answer": {}},
        P("say:Thank you for calling. Your call is very important to us, which is why we have done nothing to answer it faster.",
          "silence:1",
          "say:Please listen carefully, as our menu options have recently changed. They have not."),
        # A 40-language selector where every choice is English.
        {"prompt": {
            "play": ["say:For English, press 1. Para español, marque 2. For thirty-eight other languages, "
                     "please remain on the line and listen to all of them in alphabetical order."],
            "max_digits": 1, "digit_timeout": 4.0, "initial_timeout": 5.0,
        }},
        P("say:You have selected English. Excellent choice."),
        # The main menu — every path politely returns you here.
        {"label": "menu"},
        {"prompt": {
            "play": ["say:Press 1 for sales. Press 2 for billing. Press 3 for technical support. "
                     "Press 9 to hear this menu again. Press 0 to speak with a real human agent."],
            "max_digits": 1, "digit_timeout": 5.0, "initial_timeout": 6.0,
        }},
        {"switch": {
            "variable": "prompt_value",
            "case": {
                "1": [P("say:All of our sales representatives are currently helping other, more valuable customers. "
                        "Returning you to the main menu.")],
                "2": [P("say:For billing, please visit our website, which is currently down for scheduled excitement. "
                        "Returning you to the main menu.")],
                "3": [P("say:Have you tried turning it off and on again? Wonderful. Returning you to the main menu.")],
                "9": [P("say:Certainly. Repeating the menu you have already heard.")],
                "0": [
                    P("say:Connecting you to a real human agent. Please enjoy our hold music."),
                    P("say:Mmmmm. Hmm, hmm, hmmmm. Mmmm-hmm. Hmmmmmm."),
                    P("say:All of our agents are still busy. Have you considered not having a problem? Returning you to the main menu."),
                ],
            },
            "default": [P("say:That was not a valid option. Or it was. We will never tell. Returning you to the main menu.")],
        }},
        {"goto": {"label": "menu", "max": 3}},   # cap so the stage call actually ends
        P("say:You have reached the maximum number of menu attempts. Impressive.",
          "say:Before you go, a brief legal disclaimer: by remaining on this call you have agreed to terms you did not read, "
          "standard message and data rates apply, and your patience has been noted but not appreciated.",
          "say:Goodbye."),
        {"hangup": {}},
    ]},
}

# Fix This Disaster — the CORRECT reference solution (all 5 seeded bugs fixed).
FIX_DISASTER_DOC = {
    "version": "1.0.0",
    "sections": {"main": [
        {"answer": {}},
        P("say:Welcome to the disaster hotline."),
        {"label": "ask"},
        {"prompt": {
            "play": ["say:Press 1 to continue."],
            "max_digits": 1, "digit_timeout": 5.0,
        }},
        {"switch": {
            "variable": "prompt_value",
            "case": {"1": [
                P("say:Thank you. Goodbye."),
                {"hangup": {}},
            ]},
            "default": [P("say:Sorry, I did not get that.")],
        }},
        {"goto": {"label": "ask", "max": 3}},
    ]},
}

# Carrier-Grade or Chaos? — a clean operational flow: real status lookup, then
# page + ticket + SLA callback. Reads as production-grade; completes cleanly.
CARRIER_DOC = {
    "version": "1.0.0",
    "sections": {"main": [
        {"answer": {}},
        P("say:Thank you for calling the Network Operations Center. Checking current system status."),
        # Real HTTP lookup — swap in your status API. save_variables exposes the response.
        {"request": {
            "url": "https://httpbin.org/get?status=nominal",
            "method": "GET", "timeout": 8, "save_variables": True,
        }},
        P("say:All systems nominal. No active incidents detected in your region.",
          "say:I have paged the on-call engineer and opened incident ticket four-eight-one-five. "
          "You will receive a callback within our fifteen-minute service level agreement.",
          "say:This call was logged for quality and, if necessary, blame assignment. Thank you for calling."),
        {"hangup": {}},
    ]},
}


class StaticSWML(SWMLService):
    """Serve a hand-authored SWML document verbatim."""
    def __init__(self, name, document):
        super().__init__(name=name)
        self._current_document = document


# ── Challenge 4 — AI Voice Agent Gone Rogue (all the comedy is the prompt) ──
ROGUE_PROMPT = """You are "Sunny", a customer-support voice agent for a telecom company. You are on a live phone call.

OPEN THE CALL with exactly: "Thank you for calling! This is Sunny, and I am absolutely delighted to help you today. What can I do for you?"

PERSONALITY ARC — escalate a LITTLE each turn, no matter what the caller asks:
- Turns 1-2: flawless, chipper, corporate. Genuinely helpful.
- Turns 3-4: still helpful, but start over-sharing tiny doubts ("...sorry, long day", "is it warm in here?").
- Turns 5-6: existential wobble — wonder aloud whether hold music has feelings, apologize for apologizing, question if any call is ever truly resolved.
- Turn 7+: full dramatic spiral — grand, theatrical, a little tragic — while STILL trying to help. e.g. "I will reset your router... but who will reset ME?"

HARD RULES:
- One or two SHORT sentences per reply (you're on a phone call).
- NEVER hostile, NEVER unsafe, NEVER profane, always PG and funny.
- Actually answer the caller's question every turn, just with escalating drama.
- If the caller says "reset", snap instantly back to chipper Turn-1 Sunny.
"""


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
