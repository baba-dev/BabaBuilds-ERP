#!/usr/bin/env python3
"""D3 stage service preflight: never boot with a production or shared DB URL."""
import errno
import os
import re
import socket
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

def network_egress_blocked():
    """Prove the cgroup IPAddressDeny rule is active, not merely configured.

    The test process shares the stage service's systemd network restrictions.
    A TCP connect to a reserved public IP must be denied with EPERM/EACCES.
    A timeout or refused connection is NOT proof of isolation.
    """
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.settimeout(1.5)
            probe.connect(("1.1.1.1", 443))
    except OSError as error:
        return error.errno in (errno.EACCES, errno.EPERM)
    return False


def preflight(config_only=False):
    """Config can be validated before the service starts; egress only inside unit."""
    return valid() and (config_only or network_egress_blocked())


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--config-only", action="store_true",
        help="Operator build-time check only. Never used by the systemd service."
    )
    args = parser.parse_args()
    if not valid():
        print("ERP staging configuration invalid; refusing to start", file=sys.stderr)
        sys.exit(1)
    if not args.config_only and not network_egress_blocked():
        print("ERP staging kernel network egress denial cannot be verified; "
              "refusing to start (check systemd IPAddressDeny support)", file=sys.stderr)
        sys.exit(1)
    print("ERP staging configuration PASS" if args.config_only
          else "ERP staging configuration and kernel egress isolation PASS")
