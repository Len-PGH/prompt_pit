"""
Point a SignalWire number's Voice handler straight at one challenge route.

Uses the classic phone-number update with `call_handler=relay_script` +
`call_relay_script_url` (the SWML the challenge serves). Re-runs each launch, so
a changing tunnel URL just re-wires automatically — no dashboard step. No-op if
no number is set.

    PUBLIC_URL=https://<host> CHALLENGE_ACTIVE=worst-ivr python configure_number.py
"""
import os
import sys
import httpx

SPACE = os.environ.get("SIGNALWIRE_SPACE", "")
PROJECT = os.environ.get("SIGNALWIRE_PROJECT", "")
TOKEN = os.environ.get("SIGNALWIRE_TOKEN", "")
NUMBER = os.environ.get("CHALLENGE_NUMBER", "")
ACTIVE = os.environ.get("CHALLENGE_ACTIVE", "worst-ivr")
AUTH_USER = os.environ.get("SWML_BASIC_AUTH_USER", "pit")
AUTH_PASS = os.environ.get("SWML_BASIC_AUTH_PASSWORD", "")
BASE = os.environ.get("PUBLIC_URL", "").rstrip("/")

VALID = {"worst-ivr", "fix-disaster", "carrier", "rogue-agent"}


def main():
    if not NUMBER:
        print("[configure_number] CHALLENGE_NUMBER not set — skipping. "
              "Point a number's Voice handler at " + (BASE or "<tunnel>") + "/" + ACTIVE + "/ manually.")
        return 0
    if not (SPACE and PROJECT and TOKEN and BASE):
        print("[configure_number] SignalWire creds / PUBLIC_URL missing — skipping.")
        return 0
    active = ACTIVE if ACTIVE in VALID else "worst-ivr"
    host = BASE.split("://", 1)[-1]
    script_url = f"https://{AUTH_USER}:{AUTH_PASS}@{host}/{active}/"

    auth = (PROJECT, TOKEN)
    relay = f"https://{SPACE}/api/relay/rest"
    with httpx.Client(auth=auth, timeout=15) as c:
        num = None
        for n in (c.get(f"{relay}/phone_numbers", params={"page_size": 100}).json() or {}).get("data", []):
            if n.get("number") == NUMBER:
                num = n
                break
        if not num:
            print(f"[configure_number] {NUMBER} not found in {SPACE} — check the number/space.")
            return 0
        r = c.put(f"{relay}/phone_numbers/{num['id']}",
                  json={"call_handler": "relay_script", "call_relay_script_url": script_url})
        ok = r.status_code < 300 and (r.json() or {}).get("call_handler") == "relay_script"
        masked = script_url.replace(f":{AUTH_PASS}@", ":***@")
        print(f"[configure_number] {NUMBER} Voice -> '{active}'  ({masked})  "
              + ("attached: YES ✓" if ok else f"attached: NO (HTTP {r.status_code})"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
