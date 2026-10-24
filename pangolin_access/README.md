# HA Pangolin Access

Development build for testing administrator identity, dedicated CA creation and client PKCS#12 exports inside Home Assistant ingress. **Certificate management is off by default; Pangolin supports explicit read-only connection and selected-resource checks; remote configuration is not implemented.**

Configure allowed Home Assistant user IDs and the exact HTTPS origin, then enable certificate management only when ready. The dashboard requires an explicit action to create a CA or client identity. Exports are password-protected, single-use and expire after five minutes. No host port is exposed. See [DOCS.md](DOCS.md). This build is not a remote-access solution yet.
