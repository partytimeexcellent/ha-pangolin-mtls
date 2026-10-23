# Developing the ingress prototype

This is an incremental Phase 2 prototype, not the completed proof of concept. Version `0.1.0-dev.3` includes default-off certificate generation, built-in SQLite, and short-lived enrollment packages; Pangolin requests are not implemented. See [phase-2-results.md](phase-2-results.md) for verified and unverified behavior.

## Reproducible local checks

Use Node **24.22.1**, recorded in `pangolin_access/.node-version`. The project's engine check rejects other major versions. In the `pangolin_access` directory:

```sh
npm ci
npm run check
npm audit --audit-level=high
```

`check` typechecks server, UI and tests, builds the backend and React/Vite assets, then runs authorization and certificate lifecycle tests. OpenSSL 3.x must be on PATH. The cryptographic tests generate disposable credentials in private temporary directories, verify chains/purpose/private-key matching and P12 password protection, then remove the fixtures. Never replace these fixtures with real device or CA material. API tests use Fastify injection with a synthetic peer and user ID; they do not connect to Home Assistant or Pangolin. Asset tests use a simulated ingress subpath. These tests are not a real Supervisor or Apple-client acceptance result.

The production entrypoint always reads `/data/options.json`, validates it and binds port 8099. It has no loopback-admin mode, default identity, command-line auth bypass, or environment override. Use tests for local development; do not expose a development proxy that fabricates trusted headers on a network.

## Container build

With Docker available, from the repository root:

```sh
docker build --build-arg BUILD_ARCH=amd64 --tag ha-pangolin-prototype pangolin_access
```

Build on the matching native architecture, or use an explicitly configured cross-build environment. HA's architecture name is `aarch64`; Node/Docker report `arm64`. The CI workflow uses separate native amd64/aarch64 jobs. It builds but never publishes images and uses read-only repository permissions with pinned action revisions. Initial checks passed on [GitHub Actions](https://github.com/partytimeexcellent/ha-pangolin-mtls/actions/runs/39898052083); consult [recorded results](phase-2-results.md) for the tested commit and remaining gates.

The CI smoke script uses an empty `/data` tmpfs and a synthetic non-secret configuration to run the real entrypoint. It checks privilege dropping, state permissions, rejection of direct loopback HTTP and disposable CA/P12 generation before signaling graceful shutdown. It does not impersonate an ingress peer and does not certify a real Supervisor installation.

The Docker base pins Node's patch version and Debian release; registry digests and Debian package snapshots are not yet locked. The runtime installs Debian's supported OpenSSL and CA certificate packages. Reproducibility means the source/dependency lock is recorded, not a claim of byte-identical image rebuilds. Multi-architecture manifest publication, SBOM/container scans, and release signing remain later gates.

See the [app setup guide](../pangolin_access/DOCS.md) to install a local build on the isolated Supervisor instance. Do not run acceptance against the household's only working access path.
