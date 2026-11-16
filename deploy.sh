#!/usr/bin/env bash
# The former in-place deploy script is intentionally retired.
# Live ERP uses a pinned Node 22 standalone release and PostgreSQL 17.
# Never automatically restart the old PM2 npm entrypoint or recompile in-place.
set -Eeuo pipefail
echo 'BLOCKED: in-place ERP deployment is retired. Follow standalone deployment issue #640.' >&2
exit 1
