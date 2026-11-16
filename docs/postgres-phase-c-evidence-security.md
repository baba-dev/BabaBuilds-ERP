# Phase C evidence safety

- Treat the SQLite snapshot, pg_dump archive and backup credentials as **restricted production data** even when the output JSON contains only hashes.
- Do not upload real database dumps, full PKs, access tokens, API keys, customer identifiers or restore passwords to GitHub, GitHub Actions, issue trackers, or chat.
- Store evidence as new files with 0600 mode under an operator-owned directory, rotate/restrict access and verify file lifecycle.
- Readonly checker never runs SQL mutations. It refuses the production ERP DB, every non-ERP DB and non-loopback connections.
- The restore tool only targets a new database whose name begins bababuilds_erp_drill; refuses existing schema relations and never DROPs or TRUNCATEs.
- Dump artifacts use temporary, private directories and are deleted after verification; the restored drill database remains a sensitive clone and must be retired by a separately authorized operator procedure.
- Raw-data comparison includes auth material but only via in-memory SHA256 fingerprints, not by revealing them in reports.
- Fingerprint equality is not a cryptographic data-validation proof against malicious DB changes; it is intended to detect accidental migration mismatches and must be supplemented by independent financial/business reconciliation.
- A PostgreSQL dump/restic snapshot is not a proven recoverable backup until an independent restore has been successfully verified.
