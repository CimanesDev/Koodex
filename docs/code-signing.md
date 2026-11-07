# Signing Koodex on Windows

Release builds are unsigned unless you configure signing, so Windows may show a publisher warning. A self-signed certificate does not establish public trust; you need a certificate from a public CA or Microsoft's Artifact Signing (formerly Trusted Signing).

Koodex 2 is built with Tauri. Configure signing in `src-tauri/tauri.conf.json` under `bundle.windows`:

- **Certificate in the Windows store** (including hardware tokens): set `certificateThumbprint`, `digestAlgorithm: "sha256"` and `timestampUrl` (for example your CA's RFC 3161 timestamp server).
- **Artifact Signing or another tool**: set `signCommand`, e.g. `"signCommand": "trusted-signing-cli -e <endpoint> -a <account> -c <profile> %1"`.

See the [Tauri Windows signing guide](https://v2.tauri.app/distribute/sign/windows/). Never commit certificates, passwords or tokens. Run `npm run release` afterwards and upload the signed installer together with `SHA256SUMS.txt`.
