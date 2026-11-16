#!/usr/bin/env python3
"""D3 staging HTTP probe: only loopback; no cookies or customer data printed."""
import json
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE = "http://127.0.0.1:3101"


def request(path, method="GET"):
    req = Request(BASE + path, method=method,
                  headers={"Host": "127.0.0.1:3101", "Accept": "text/html,application/json"})
    try:
        with urlopen(req, timeout=10) as res:
            return res.status
    except HTTPError as exc:
        return exc.code


def main():
    login = request("/login")
    providers = request("/api/auth/providers")
    webhook = request("/api/webhooks/forbidden-test", "POST")
    cron = request("/api/cron/ar-reminders")
    result = {"login_status": login, "providers_status": providers,
              "webhook_status": webhook, "cron_status": cron}
    if login not in (200, 301, 302, 303, 307, 308) or providers != 200:
        raise RuntimeError("Staging login or NextAuth providers unavailable")
    if webhook != 403 or cron != 403:
        raise RuntimeError("External webhook/cron routes not blocked")
    print(json.dumps({"status": "PASS", **result}))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, URLError, ValueError) as exc:
        print("D3 STAGING HTTP PROBE FAILED: " + str(exc), file=sys.stderr)
        sys.exit(1)
