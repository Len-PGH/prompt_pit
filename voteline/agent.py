"""
The Prompt Pit — phone + SMS vote line.

A SignalWire Agents SDK voice agent that lets callers vote by phone, plus an
SMS keyword webhook. Both feed the SAME live tally as the web /vote page, via
the Node app's internal bridge (/api/external-vote), deduped per phone number.

Voice:  caller talks -> agent asks who they're voting for -> cast_vote tool
        POSTs the vote to the Node app.
SMS:    text "A"/"B"/"1"/"2" (or a contestant's name) -> /sms records + replies.

No SignalWire API secrets are needed here: SignalWire simply fetches these
webhooks. Point your number's Voice + Messaging handlers at the URLs the
container prints at startup.
"""
import os
import httpx

from signalwire import AgentBase
from signalwire.core.function_result import FunctionResult
from starlette.requests import Request
from starlette.responses import JSONResponse

NODE_URL = os.environ.get("NODE_URL", "http://prompt-pit:3000").rstrip("/")
INTERNAL_TOKEN = os.environ.get("INTERNAL_TOKEN", "")
SMS_SECRET = os.environ.get("SMS_SECRET", INTERNAL_TOKEN)
VOTE_NUMBER = os.environ.get("VOTE_NUMBER", "")
HTTP_TIMEOUT = 4.0

_ROUND = {"R1": "Round 1", "SF": "the Semi-Finals", "F": "the Grand Finale"}


def _speak_time(sec):
    """Turn seconds into a spoken duration, e.g. '2 minutes and 30 seconds'."""
    sec = int(sec or 0)
    if sec <= 0:
        return "no time"
    m, s = divmod(sec, 60)
    mp = f"{m} minute{'s' if m != 1 else ''}" if m else ""
    sp = f"{s} second{'s' if s != 1 else ''}" if s else ""
    return (mp + " and " + sp) if (mp and sp) else (mp or sp)


def _clock_short(t):
    """Compact SMS clock like '2m30s' / '45s', or '' when not running."""
    if not (t and t.get("running") and t.get("remainingSec")):
        return ""
    m, s = divmod(int(t["remainingSec"]), 60)
    return f"{m}m{s:02d}s" if m else f"{s}s"


# --------------------------------------------------------------------------
# Node bridge helpers
# --------------------------------------------------------------------------
def fetch_matchup():
    import sys
    try:
        r = httpx.get(f"{NODE_URL}/api/current", timeout=HTTP_TIMEOUT)
        d = r.json()
        print(f"[MATCHUP] votingOpen={d.get('votingOpen')} match={d.get('label')!r} "
              f"a={(d.get('a') or {}).get('name')!r} b={(d.get('b') or {}).get('name')!r} "
              f"timer={d.get('timer')}", file=sys.stderr, flush=True)
        return d
    except Exception as e:
        print(f"[MATCHUP] FETCH FAILED: {e!r}", file=sys.stderr, flush=True)
        return {"votingOpen": False, "a": {"name": None}, "b": {"name": None}, "label": ""}


def fetch_showinfo():
    try:
        r = httpx.get(f"{NODE_URL}/api/showinfo", timeout=HTTP_TIMEOUT)
        return r.json()
    except Exception:
        return {}


def post_vote(side, voter, channel):
    try:
        r = httpx.post(
            f"{NODE_URL}/api/external-vote",
            json={"side": side, "voter": voter, "channel": channel},
            headers={"x-internal-token": INTERNAL_TOKEN},
            timeout=HTTP_TIMEOUT,
        )
        return r.json()
    except Exception:
        return {"ok": False, "error": "bridge unreachable"}


def caller_number(raw_data):
    """Best-effort extraction of the caller's number for dedupe."""
    rd = raw_data or {}
    call = rd.get("call") if isinstance(rd.get("call"), dict) else {}
    for val in (call.get("from"), rd.get("caller_id_num"), rd.get("from")):
        if isinstance(val, str) and val:
            return val
    # Fall back to the call id so at least one call == one vote.
    return call.get("call_id") or rd.get("call_id") or "unknown"


# --------------------------------------------------------------------------
# Voice agent
# --------------------------------------------------------------------------
class VoteAgent(AgentBase):
    def __init__(self):
        super().__init__(name="vote-line", route="/agent")
        self.prompt_add_section(
            "Role",
            body=("You are the automated vote line for 'The Prompt Pit', a live "
                  "coding game show. You are warm, fast, and brief — one short "
                  "sentence per turn."),
        )
        self.prompt_add_section(
            "This is a LIVE show — state changes during the call",
            body=(
                "Voting opens and closes, matches change, and the clock moves WHILE you "
                "are on the phone. NEVER answer about voting from memory or from an earlier "
                "tool result — the answer goes stale in seconds. Before you tell a caller "
                "whether voting is open (or which match it is), call get_matchup again to "
                "get the current truth. If the caller says voting just opened, believe them "
                "and re-check — do not argue from an old result."
            ),
        )
        self.prompt_add_section(
            "How to run the call",
            body=(
                "1. FIRST call get_matchup to learn the two contestants and whether "
                "voting is open right now.\n"
                "2. Greet the caller. If voting is open, say they can vote for Station A "
                "(give the name) or Station B (give the name), and ask who gets their vote.\n"
                "3. When the caller picks a side, ALWAYS call cast_vote with 'a' or 'b' — do "
                "not decide yourself whether voting is open; cast_vote checks live and will "
                "tell you if it's closed. If it reports closed, THEN say voting isn't open.\n"
                "4. Confirm the vote is counted and thank them.\n"
                "5. If voting is closed and they want to vote, re-check with get_matchup "
                "before concluding, then offer the current show status instead.\n"
                "6. If they are unclear about their vote, ask them to say A or B."
            ),
        )
        self.prompt_add_section(
            "Answering questions about the show",
            body=(
                "Callers may ask what's going on. Use the right tool and answer briefly:\n"
                "- What challenge / round / who's playing right now -> get_show_status.\n"
                "- Who's winning / the score / who's ahead -> get_standings (live running "
                "totals while voting is open, plus whether voting has closed and who won).\n"
                "- How much time is left / the clock -> get_time_remaining.\n"
                "- The bracket, who advanced, who the champion is -> get_bracket.\n"
                "Only report what the tool returns — never guess or invent a leader, score, or time."
            ),
        )

    @AgentBase.tool(
        name="get_matchup",
        description="Get the current two contestants and whether voting is open. Call this first, before greeting.",
        parameters={"type": "object", "properties": {}},
    )
    def get_matchup(self, args, raw_data):
        d = fetch_matchup()
        a = (d.get("a") or {}).get("name")
        b = (d.get("b") or {}).get("name")
        if not a and not b:
            return FunctionResult("The next matchup isn't set yet — check back in a moment.")
        a = a or "Station A"
        b = b or "Station B"
        where = _ROUND.get(d.get("round")) or d.get("label") or "the current round"
        status = "Voting is open" if d.get("votingOpen") else "Voting isn't open yet"
        t = d.get("timer") or {}
        clock = ""
        if t.get("running") and t.get("remainingSec"):
            clock = f", and there are {_speak_time(t['remainingSec'])} left on the clock"
        return FunctionResult(
            f"We're in {where}. Station A is {a}, and Station B is {b}. {status}{clock}."
        )

    @AgentBase.tool(
        name="cast_vote",
        description="Record the caller's vote once they clearly choose. Use 'a' for Station A or 'b' for Station B.",
        parameters={
            "type": "object",
            "properties": {"choice": {"type": "string", "enum": ["a", "b"],
                                      "description": "'a' for Station A, 'b' for Station B"}},
            "required": ["choice"],
        },
    )
    def cast_vote(self, args, raw_data):
        choice = (args or {}).get("choice")
        if choice not in ("a", "b"):
            return FunctionResult("Please tell me A or B.")
        res = post_vote(choice, caller_number(raw_data), "call")
        if res.get("ok"):
            return FunctionResult("Your vote is counted. Thanks for voting in The Prompt Pit!")
        if res.get("error") == "voting closed":
            return FunctionResult("Voting just closed, so I couldn't record that one.")
        return FunctionResult("Sorry, I couldn't record that vote right now.")

    @AgentBase.tool(
        name="get_show_status",
        description="Get what's happening right now: the active challenge, the current "
                    "matchup, the round, and how many contestants remain.",
        parameters={"type": "object", "properties": {}},
    )
    def get_show_status(self, args, raw_data):
        d = fetch_showinfo()
        if not d:
            return FunctionResult("I couldn't reach the show right now — try again in a moment.")
        if d.get("champion"):
            return FunctionResult(f"The show is over — {d['champion']} is the champion of The Prompt Pit!")
        parts = []
        ch = d.get("challenge") or {}
        if ch.get("title"):
            parts.append(f"The active challenge is '{ch['title']}': {ch.get('tagline') or ch.get('brief') or ''}".strip())
        st = d.get("bracketStats") or {}
        mt = d.get("match") or {}
        if mt.get("a") and mt.get("b"):
            rd = st.get("roundName") or (mt.get("label") or "")
            parts.append(f"On stage now in {rd}: {mt['a']} versus {mt['b']}.")
        elif st.get("roundName"):
            parts.append(f"We're in {st['roundName']}.")
        if st.get("contestantsRemaining"):
            parts.append(f"{st['contestantsRemaining']} contestants remain.")
        t = d.get("timer") or {}
        if t.get("running") and t.get("remainingSec"):
            parts.append(f"There are {_speak_time(t['remainingSec'])} left on the clock.")
        parts.append("Voting is open." if d.get("votingOpen") else "Voting isn't open at the moment.")
        return FunctionResult(" ".join(p for p in parts if p) or "The show hasn't started yet.")

    @AgentBase.tool(
        name="get_time_remaining",
        description="Get the round countdown clock — how much time the contestants have left. "
                    "Use when the caller asks about time, the clock, or how long is left.",
        parameters={"type": "object", "properties": {}},
    )
    def get_time_remaining(self, args, raw_data):
        d = fetch_showinfo()
        t = (d or {}).get("timer") or {}
        if not t:
            return FunctionResult("I don't have the round clock right now.")
        rem = t.get("remainingSec") or 0
        if t.get("running"):
            if rem <= 0:
                return FunctionResult("Time is up for this round!")
            return FunctionResult(f"There are {_speak_time(rem)} left on the clock.")
        if rem > 0:
            return FunctionResult(f"The clock is paused with {_speak_time(rem)} remaining.")
        return FunctionResult("The round clock isn't running right now.")

    @AgentBase.tool(
        name="get_standings",
        description="Get who is currently ahead in the match on stage (judges' scores plus "
                    "audience votes). Use when the caller asks who's winning or the score.",
        parameters={"type": "object", "properties": {}},
    )
    def get_standings(self, args, raw_data):
        d = fetch_showinfo()
        if not d:
            return FunctionResult("I couldn't reach the show right now — try again in a moment.")
        s = d.get("standings") or {}
        if not s.get("revealed"):
            return FunctionResult("There's no matchup on stage right now.")
        a, b = s["a"], s["b"]
        # Round already decided.
        if s.get("winner"):
            return FunctionResult(
                f"Voting is closed and {s['winner']} won that round, "
                f"{a['total']} to {b['total']} (judges plus audience)."
            )
        # Prefix reflects whether voting is still live.
        if s.get("votingOpen"):
            lead_in = "Voting is open and it's live!"
        else:
            lead_in = "Voting has closed — the winner is being confirmed."
        if s.get("tie"):
            return FunctionResult(
                f"{lead_in} It's a dead tie, {a['total']} to {b['total']} "
                f"between {a['name']} and {b['name']}."
            )
        lead, trail = (a, b) if a["total"] >= b["total"] else (b, a)
        return FunctionResult(
            f"{lead_in} {s['leader']} leads {lead['total']} to {trail['total']} "
            f"(that's judges' scores plus audience votes)."
        )

    @AgentBase.tool(
        name="get_bracket",
        description="Get the tournament bracket status: who has advanced, the current round, "
                    "and the champion if the show is finished.",
        parameters={"type": "object", "properties": {}},
    )
    def get_bracket(self, args, raw_data):
        d = fetch_showinfo()
        if not d:
            return FunctionResult("I couldn't reach the show right now — try again in a moment.")
        if d.get("champion"):
            return FunctionResult(f"The bracket is complete — {d['champion']} is the champion!")
        st = d.get("bracketStats") or {}
        winners = [b for b in (d.get("bracket") or []) if b.get("done") and b.get("winner")]
        parts = []
        if st.get("roundName"):
            parts.append(f"We're in {st['roundName']}.")
        parts.append(f"{st.get('matchesDecided', 0)} of {st.get('matchesTotal', 7)} matches are decided, "
                     f"with {st.get('contestantsRemaining', '?')} contestants still standing.")
        if winners:
            recent = ", ".join(w["winner"] for w in winners[-3:])
            parts.append(f"Recently advanced: {recent}.")
        return FunctionResult(" ".join(parts))


# Module-level app so uvicorn can serve "agent:app".
_agent = VoteAgent()
app = _agent.get_app()


# --------------------------------------------------------------------------
# SMS keyword voting  (SWML messaging webhook — NOT LaML)
# --------------------------------------------------------------------------
def _swml_reply(to_number, from_number, body):
    """Return a messaging-SWML document that replies to the inbound message.

    Messaging SWML uses the `reply` verb (NOT `send_sms`, which is a call verb);
    `to`/`from` default to the inbound sender/recipient, so body is all we need.
    """
    doc = {
        "version": "1.0.0",
        "sections": {"main": [{"reply": {"body": body}}]},
    }
    import sys
    print(f"[SMS-OUT] {doc}", file=sys.stderr, flush=True)
    return JSONResponse(doc)


def _dig(obj, keys):
    """Find the first non-empty string value under any key in `keys` (recursive)."""
    stack = [obj]
    while stack:
        cur = stack.pop()
        if isinstance(cur, dict):
            for k, v in cur.items():
                if isinstance(v, str) and v.strip() and str(k).lower() in keys:
                    return v.strip()
                if isinstance(v, (dict, list)):
                    stack.append(v)
        elif isinstance(cur, list):
            stack.extend(cur)
    return ""


async def _inbound(request):
    """Extract (from, to, body) from an inbound message webhook — SWML JSON or form."""
    ctype = request.headers.get("content-type", "")
    data = {}
    try:
        if "application/json" in ctype:
            j = await request.json()
            if isinstance(j, dict):
                data = j
        else:
            data = {k: v for k, v in (await request.form()).items()}
    except Exception:
        data = {}
    body = _dig(data, {"body", "text", "message_body"})
    frm = _dig(data, {"from", "from_number", "source"})
    to = _dig(data, {"to", "to_number", "destination"}) or VOTE_NUMBER
    return frm, to, body


def _sms_status_line():
    """One compact SMS-friendly line describing the current show state."""
    d = fetch_showinfo()
    if not d:
        return "Show status is unavailable right now — try again shortly."
    if d.get("champion"):
        return f"The Prompt Pit is over — {d['champion']} is the champion!"
    st = d.get("bracketStats") or {}
    mt = d.get("match") or {}
    s = d.get("standings") or {}
    bits = []
    if st.get("roundName"):
        bits.append(st["roundName"])
    if mt.get("a") and mt.get("b"):
        bits.append(f"{mt['a']} vs {mt['b']}")
    clock = _clock_short(d.get("timer"))
    if clock:
        bits.append(clock + " left")
    if s.get("revealed"):
        a, b = s["a"], s["b"]
        if s.get("winner"):
            bits.append(f"CLOSED — {s['winner']} won {a['total']}-{b['total']}")
        else:
            score = f"{a['name']} {a['total']}-{b['total']} {b['name']}" if not s.get("tie") \
                    else f"TIE {a['total']}-{b['total']}"
            bits.append((("voting OPEN, " if d.get("votingOpen") else "voting closed, ") + score))
        if d.get("votingOpen"):
            bits.append("reply A or B")
    elif d.get("votingOpen"):
        bits.append("voting OPEN — reply A or B")
    return " | ".join(bits) if bits else "The show hasn't started yet."


def _map_keyword(text, d):
    t = (text or "").strip().lower()
    a_name = ((d.get("a") or {}).get("name") or "").strip().lower()
    b_name = ((d.get("b") or {}).get("name") or "").strip().lower()
    if t in ("a", "1", "station a") or (a_name and t == a_name):
        return "a"
    if t in ("b", "2", "station b") or (b_name and t == b_name):
        return "b"
    return None


async def sms(request: Request):
    # Inbound SignalWire messaging webhook (SWML swml_webhook handler). We record
    # the vote and RETURN SWML (reply verb) to reply — no LaML/cXML anywhere.
    import sys
    _raw = await request.body()
    print(f"[SMS-IN] {request.method} ct={request.headers.get('content-type')!r} "
          f"qs={dict(request.query_params)} len={len(_raw)} body={_raw[:500]!r}",
          file=sys.stderr, flush=True)
    frm, to, body = await _inbound(request)

    def reply(msg):
        return _swml_reply(frm, to, msg)

    # Shared-secret gate on the webhook URL (?k=...).
    if request.query_params.get("k") != SMS_SECRET:
        return reply("Vote line not configured.")

    # Status keyword: text back a one-line show update (no vote recorded).
    if (body or "").strip().lower() in ("status", "info", "score", "who", "?"):
        return reply(_sms_status_line())

    d = fetch_matchup()
    if not d.get("votingOpen"):
        return reply("Voting isn't open right now — text STATUS for a show update, or watch the stage for the next round!")
    side = _map_keyword(body, d)
    if side is None:
        a = (d.get("a") or {}).get("name") or "Station A"
        b = (d.get("b") or {}).get("name") or "Station B"
        return reply(f"Reply A for {a} or B for {b} — or STATUS for the score.")
    res = post_vote(side, frm or "sms-unknown", "sms")
    if res.get("ok"):
        name = ((d.get(side) or {}).get("name")) or ("Station " + side.upper())
        return reply(f"Thanks! Your vote for {name} is counted.")
    return reply("Sorry, we couldn't record that vote.")


# Register /sms and move it AHEAD of the SDK's catch-all route so it isn't
# shadowed (routes added after get_app() otherwise fall behind the catch-all).
# Accept GET too so SignalWire's URL validation / probes get valid SWML, not
# the catch-all's "Invalid route".
app.add_api_route("/sms", sms, methods=["POST", "GET"])
app.router.routes.insert(0, app.router.routes.pop())


if __name__ == "__main__":
    _agent.run()
