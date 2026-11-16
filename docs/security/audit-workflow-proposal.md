# Weekly ERP security audit policy

The scheduled audit should be read-only, reproducible, and independent of automatic deployment.

- Use GitHub-hosted runners with Node 26 from .nvmrc.
- Install lockfile dependencies reproducibly with npm ci --ignore-scripts.
- Capture both full-tree and production-only npm audit --json reports as artifacts.
- Publish vulnerability counts to the workflow summary.
- Give the workflow contents:read only, and do not invoke npm audit fix, create PRs or mutate branches.
- No deployment workflow changes are included.
