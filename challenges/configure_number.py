"""
Point a SignalWire number's Voice handler at one challenge route.

Uses a Call Fabric swml_webhook resource (SWML) — find-or-create, then refresh
its URL each run so tunnel changes never break it. No-op if no number is set.

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
RES_NAME = "pit-challenge-voice"

VALID = {"worst-ivr", "fix-disaster", "carrier", "rogue-agent"}


def find_or_refresh(c, fabric, name, url):
    lr = c.get(fabric, params={"page_size": 100})
    for res in (lr.json() or {}).get("data", []):
        if res.get("type") == "swml_webhook" and res.get("display_name") == name:
            c.put(f"{fabric}/swml_webhooks/{res['id']}", json={"primary_request_url": url})
            return res["id"], "refreshed"
    cr = c.post(f"{fabric}/swml_webhooks",
                json={"name": name, "used_for": "calling",
                      "primary_request_url": url, "primary_request_method": "POST"})
    return (cr.json() or {}).get("id"), "created"


def main():
    if not NUMBER:
        print("[configure_number] CHALLENGE_NUMBER not set — skipping. "
              "Point a number's Voice handler at " + (BASE or "<tunnel>") + "/" + ACTIVE + " manually.")
        return 0
    if not (SPACE and PROJECT and TOKEN and BASE):
        print("[configure_number] SignalWire creds / PUBLIC_URL missing — skipping.")
        return 0
    active = ACTIVE if ACTIVE in VALID else "worst-ivr"
    host = BASE.split("://", 1)[-1]
    voice_url = f"https://{AUTH_USER}:{AUTH_PASS}@{host}/{active}/"

    auth = (PROJECT, TOKEN)
    relay = f"https://{SPACE}/api/relay/rest"
    fabric = f"https://{SPACE}/api/fabric/resources"
    with httpx.Client(auth=auth, timeout=12) as c:
        vid, action = find_or_refresh(c, fabric, RES_NAME, voice_url)
        print(f"[configure_number] voice resource '{RES_NAME}' {action} -> "
              f"https://{AUTH_USER}:***@{host}/{active}")
        num = None
        for n in (c.get(f"{relay}/phone_numbers", params={"page_size": 100}).json() or {}).get("data", []):
            if n.get("number") == NUMBER:
                num = n
                break
        v_ok = num and num.get("calling_handler_resource_id") == vid
        print(f"[configure_number] number {NUMBER} -> '{active}' | attached: {'YES ✓' if v_ok else 'NO'}")
        if not v_ok:
            print(f"[configure_number] ONE-TIME (SignalWire → Phone Numbers → {NUMBER}): "
                  f"Voice → 'Handle calls using: a SWML Script' → {RES_NAME}. "
                  "Then it auto-refreshes every launch.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
