# Changelog

## 0.1.0-dev.2

- Show the specific failed stage and a fixed diagnostic code instead of replacing all access failures with a generic message.
- Distinguish mismatched, missing and opaque browser origins while retaining strict origin, session, CSRF and ingress authorization checks.
- Log only fixed access-denial codes; never request URLs, identities, headers, bodies or tokens.
- Display the installed build version and add tests for safe diagnostic rendering.

## 0.1.0-dev.1

- Add an ingress-only administrator access prototype with explicit user allowlisting, session expiry, CSRF/origin checks, rate limits and relative UI assets.
- Add local HA packaging and automated negative authorization tests.
- Certificate issuance and Pangolin configuration are intentionally unavailable pending live ingress acceptance.
