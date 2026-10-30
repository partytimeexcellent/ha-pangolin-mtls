# HA Pangolin Access

Development build for testing administrator identity, dedicated CA creation and client PKCS#12 exports inside Home Assistant ingress. **Certificate creation requires verified administrator setup and an HTTPS Home Assistant URL. Pangolin resource discovery and public CA installation are available in Pangolin setup; mTLS enablement remains a dashboard step.**

Configure allowed Home Assistant user IDs and the exact HTTPS origin, then enable certificate management only when ready. The dashboard requires an explicit action to create a CA or client identity. Exports are password-protected, single-use and expire after five minutes. No host port is exposed. See [DOCS.md](DOCS.md). This build is not a remote-access solution yet.
