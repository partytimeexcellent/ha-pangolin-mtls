# Developing the ingress prototype

This is Phase 2's first increment, not the full proof of concept. Certificate generation, SQLite, enrollment packages and Pangolin requests are not implemented. See [phase-2-results.md](phase-2-results.md) for verified and unverified behavior.

## Reproducible local checks

Use Node **24.22.1**, recorded in `pangolin_access/.node-version`. The project's engine check rejects other major versions. In the `pangolin_access` directory:

```sh
npm ci
npm run check
npm audit --audit-level=high
```

`check` typechecks server, UI and tests, builds the backend and React/Vite assets, then runs negative and positive authorization tests. Tests use Fastify request injection with a synthetic trusted peer and user ID; they do not connect to Home Assistant or Pangolin. The bundled assets are checked under a simulated ingress subpath. This is not a real browser or Supervisor acceptance test.

The production entrypoint always reads `/data/options.json`, validates it and binds port 8099. It has no loopback-admin mode, default identity, command-line auth bypass, or environment override. Use tests for local development; do not expose a development proxy that fabricates trusted headers on a network.

## Container build

With Docker available, from the repository root:

```sh
docker build --build-arg BUILD_ARCH=amd64 --tag ha-pangolin-prototype pangolin_access
```

Build on the matching native architecture, or use an explicitly configured cross-build environment. HA's architecture name is `aarch64`; Node/Docker report `arm64`. The CI workflow uses separate native amd64/aarch64 jobs. It builds but never publishes images and uses read-only repository permissions with pinned action revisions. Initial checks passed on [GitHub Actions](https://github.com/partytimeexcellent/ha-pangolin-mtls/actions/runs/39898052083); consult [recorded results](phase-2-results.md) for the tested commit and remaining gates.

The CI smoke script uses an empty `/data` tmpfs and a synthetic non-secret configuration to run the real entrypoint. It checks privilege dropping, state permissions and rejection of direct loopback HTTP before signaling graceful shutdown. It does not impersonate an ingress peer and does not certify a real Supervisor installation.

The Docker base pins Node's patch version and Debian release; registry digests and Debian package snapshots are not yet locked. No extra system packages are installed in this increment. Reproducibility means the source/dependency lock is recorded, not a claim of byte-identical image rebuilds. Multi-architecture manifest publication, SBOM/container scans, and release signing remain later gates.

See the [app setup guide](../pangolin_access/DOCS.md) to install a local build on the isolated Supervisor instance. Do not run acceptance against the household's only working access path.
