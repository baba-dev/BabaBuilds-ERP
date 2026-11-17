# BabaBuilds Node.js 26.13.1 shared ARM64 foundation — Phase A

## Scope

This PR supplies only the shared **inactive** runtime at

`/opt/bababuilds/runtimes/node-v26.13.1-linux-arm64`.

ERP continues using `/opt/bababuilds-erp/node26/bin/node`, while
MenuMinute web/worker and ClubKeep continue using
`/opt/menuminute/node24/bin/node`. No systemd unit, application code,
database, backup, media, or existing runtime is changed.

## Supply-chain verification

- Release: [Node.js 26.13.1 LTS, 11 November 2026](https://nodejs.org/en/blog/release/v26.13.1)
- Artifact: `node-v26.13.1-linux-arm64.tar.xz` from version-pinned official HTTPS distribution path.
- Official published signed SHA-256: `89e1853138db51e8b82d3e98ba9c0d3f2956a28e5e55ea1b7e12d25aae92d5dd`.
- GPG key: Antoine du Hamel, fingerprint `5BE8A3F6C8A5C01D106C0AD820B1A390B168D356`, copied from [nodejs/release-keys](https://github.com/nodejs/release-keys/tree/481637f813e912c4aa3622d7964ab426c97b8e8d/keys).
- In the trusted-main GitHub Actions job, check the key fingerprint, verify the detached GPG signature on `SHASUMS256.txt` with `gpgv`, require the exact reviewed digest in the signed manifest, and verify the downloaded archive against that digest.
- Upon delivery, the VPS re-verifies the SHA and the root-owned installer file against its pinned Git blob SHA. The installer itself separately verifies the archive SHA and safe extraction paths.

No floating `latest` Node URLs, unattended third-party installation scripts, `curl | bash`, root global npm installations, or trust in an unpinned download.

## Production installation safety

The workflow is **main-only**, in the existing `erp-production` environment and
serializes with ERP promotion using `erp-immutable-production` concurrency.
It requires existing ERP, PostgreSQL 17, MenuMinute web/worker, ClubKeep web,
and ClubKeep Redis units to be active. It snapshots each unit's `ExecStart`
before/after the installation and refuses changing or already-switched services.

The Python 3.12+ installer uses a nonblocking root lock, checks real
root-owned directory ancestry, validates every archive entry and symlink,
uses `tarfile.extractall(filter="data")`, and atomically renames from a
private staging directory on the target filesystem. It records a reviewed
runtime manifest and the installed Node binary SHA-256.

Repeated invocations only **verify** an existing installation; they never
overwrite it. A corrupt or unexpected existing installation fails closed.

### Expected pass markers

- `NODE26_OFFICIAL_SIGNED_ARTIFACT_VERIFIED release=v26.13.1 arch=linux-arm64`
- `BABABUILDS_SHARED_NODE26_PASS action=installed` (or `already_installed`)
- `BABABUILDS_NODE26_FOUNDATION_PASS no_services_switched`

### Read-only verification on VPS

```bash
sudo /usr/bin/python3 /usr/local/lib/bababuilds-platform/provision_node26.py --inventory
/opt/bababuilds/runtimes/node-v26.13.1-linux-arm64/bin/node --version
/opt/bababuilds/runtimes/node-v26.13.1-linux-arm64/bin/npm --version
systemctl is-active bababuilds-erp menuminute-web menuminute-worker clubkeep-web clubkeep-redis postgresql@17-main
```

The `--inventory` operation prints only runtime metadata, legacy presence,
and service status: no secrets.

## Rollback and next stages

There is **no runtime cutover in Phase A**, hence no application rollback is needed.
If the GPG/key/archive checks fail, no host file is installed.
If the host's current health or permissions fail, installation is blocked.
No directory deletion or service restart is performed.

Phase B can update ClubKeep CI/manifest/release helper/systemd to use this
shared runtime with reversible Node 24 rollback. Phase C can then migrate
MenuMinute web + worker together. **Node24 removal is forbidden in Phase A.**

Do not alter ERP's own Node26 path until a separately reviewed handoff.
