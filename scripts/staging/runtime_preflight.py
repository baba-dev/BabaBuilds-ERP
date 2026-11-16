#!/usr/bin/env python3
"""D3 stage service preflight: never boot with a production or shared DB URL."""
import os
import re
import sys
from urllib.parse import unquote, urlsplit

def valid():
    if os.getenv("ERP_STAGING_MODE") != "1":
        return False
    try:
        db = urlsplit(os.getenv("DATABASE_URL", ""))
        origin = urlsplit(os.getenv("NEXTAUTH_URL", ""))
        name = unquote(db.path.lstrip("/"))
        return (db.scheme in ("postgres", "postgresql") and
                db.hostname in ("localhost", "127.0.0.1", "::1") and
                re.fullmatch(r"bababuilds_erp_staging_[a-z0-9]{4,12}", name) is not None and
                origin.scheme == "http" and origin.hostname in ("localhost", "127.0.0.1", "::1") and
                origin.port == 3101 and
                os.getenv("HOSTNAME") == "127.0.0.1" and
                os.getenv("PORT") == "3101" and
                bool(os.getenv("NEXTAUTH_SECRET")) and
                os.getenv("AUTH_GOOGLE_ENABLED") == "false" and
                os.getenv("AUTH_EMAIL_ENABLED") == "false" and
                all(not os.getenv(name) for name in (
                  "CLOUDFLARE_API_TOKEN", "GOOGLE_CLIENT_SECRET", "EMAIL_SERVER_PASSWORD",
                  "STRIPE_SECRET_KEY", "RAZORPAY_KEY_SECRET", "CRON_SECRET", "GROQ_API_KEY"
                )))
    except (ValueError, TypeError):
        return False

if __name__ == "__main__":
    if not valid():
        print("Staging runtime preflight failed; refusing to start", file=sys.stderr)
        sys.exit(1)
    print("ERP PostgreSQL staging runtime preflight PASS")
