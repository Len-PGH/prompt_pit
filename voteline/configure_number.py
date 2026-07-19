"""
Keep the SignalWire number's SWML handlers pointed at the current tunnel.

Both voice and messaging run as Call Fabric **swml_webhook resources** (SWML,
never cXML). This script find-or-creates them and refreshes their request URLs
each run — so tunnel changes never break anything.

Why resources (not the classic phone-numbers URL fields): once a number's
message handler is `swml_webhooks`, the classic Relay-REST phone-numbers PUT
rejects every update ("Message handler is not valid"). The Fabric resource PUT
works regardless.

One-time (per number): in the dashboard, set the number's Voice handler to the
`prompt-pit-voice` SWML Script and its Messaging handler to `prompt-pit-sms`.
After that this script keeps them fresh with zero manual steps.

    python configure_number.py https://<host>
"""
import os
import sys
import time
import httpx

NODE_URL = os.environ.get("NODE_URL", "http://prompt-pit:3000").rstrip("/")

SPACE = os.environ.get("SIGNALWIRE_SPACE", "")
PROJECT = os.environ.get("SIGNALWIRE_PROJECT", "")
TOKEN = os.environ.get("SIGNALWIRE_TOKEN", "")
NUMBER = os.environ.get("VOTE_NUMBER", "")
AUTH_USER = os.environ.get("VOICE_AUTH_USER", "vote")
AUTH_PASS = os.environ.get("VOICE_AUTH_PASSWORD", "")
SMS_SECRET = os.environ.get("SMS_SECRET", os.environ.get("INTERNAL_TOKEN", ""))
VOICE_RES = "prompt-pit-voice"
SMS_RES = "prompt-pit-sms"


def find_or_refresh(c, fabric, name, used_for, url):
    """Find a swml_webhook resource by name and refresh its URL, or create it."""
    lr = c.get(fabric, params={"page_size": 100})
    for res in (lr.json() or {}).get("data", []):
        if res.get("type") == "swml_webhook" and res.get("display_name") == name:
            c.put(f"{fabric}/swml_webhooks/{res['id']}", json={"primary_request_url": url})
            return res["id"], "refreshed"
    cr = c.post(f"{fabric}/swml_webhooks",
                json={"name": name, "used_for": used_for,
                      "primary_request_url": url, "primary_request_method": "POST"})
    return (cr.json() or {}).get("id"), "created"


def app_public_url():
    """The app's own cloudflared URL — everything is served behind it."""
    for _ in range(30):
        try:
            u = (httpx.get(f"{NODE_URL}/api/public", timeout=5).json() or {}).get("publicUrl")
            if u:
                return u.rstrip("/")
        except Exception:
            pass
        time.sleep(2)
    return ""


def main():
    if not (SPACE and PROJECT and TOKEN and NUMBER):
        print("[configure_number] SignalWire creds/number not set — skipping.")
        return 0
    base = app_public_url()
    if not base:
        print("[configure_number] app public URL not available yet — skipping.")
        return 0
    host = base.split("://", 1)[-1]
    voice_url = f"https://{AUTH_USER}:{AUTH_PASS}@{host}/agent/"
    sms_url = f"{base}/sms?k={SMS_SECRET}"

    auth = (PROJECT, TOKEN)
    relay = f"https://{SPACE}/api/relay/rest"
    fabric = f"https://{SPACE}/api/fabric/resources"

    with httpx.Client(auth=auth, timeout=12) as c:
        voice_id, va = find_or_refresh(c, fabric, VOICE_RES, "calling", voice_url)
        sms_id, sa = find_or_refresh(c, fabric, SMS_RES, "messaging", sms_url)
        print(f"[configure_number] voice resource '{VOICE_RES}' {va} -> https://{AUTH_USER}:***@{host}/agent/")
        print(f"[configure_number] sms   resource '{SMS_RES}' {sa} -> {base}/sms?k=***")

        # Report attach state (find the number in the full list; filter_number is flaky).
        num = None
        for n in (c.get(f"{relay}/phone_numbers", params={"page_size": 100}).json() or {}).get("data", []):
            if n.get("number") == NUMBER:
                num = n
                break
        v_ok = num and num.get("calling_handler_resource_id") == voice_id
        s_ok = num and num.get("messaging_handler_resource_id") == sms_id
        print(f"[configure_number] voice attached: {'YES ✓' if v_ok else 'NO'} | sms attached: {'YES ✓' if s_ok else 'NO'}")
        if not (v_ok and s_ok):
            print("[configure_number] ONE-TIME dashboard step (SignalWire → Phone Numbers → "
                  + NUMBER + "):")
            if not v_ok:
                print(f"    Voice     -> 'Handle calls using: a SWML Script' -> {VOICE_RES}")
            if not s_ok:
                print(f"    Messaging -> 'Handle messages using: a SWML Script' -> {SMS_RES}")
            print("    (Do this once; URLs then auto-refresh on every launch.)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
