# Signing Koodex on Windows

The normal `npm run dist` build remains available for development. Use `npm run dist:signed` for distribution: it requires a signing identity and enables `forceCodeSigning` so missing signing cannot silently produce an unsigned release. This configuration targets the installed electron-builder **26** API.

You must first obtain a publicly trusted code-signing identity from a certificate authority or complete identity validation with Microsoft's Artifact Signing service (formerly Trusted Signing). A self-signed certificate will not establish public publisher trust. Check the provider's country and individual/business eligibility before purchasing. Koodex cannot complete identity verification for you.

For a certificate available through the Windows certificate store (including a hardware token with its vendor driver installed), set its thumbprint in PowerShell:

```powershell
$env:KOODEX_CERT_SHA1 = 'YOUR_CERTIFICATE_THUMBPRINT'
npm run dist:signed
```

If your provider supplies an exportable PFX, use `WIN_CSC_LINK` for its absolute path and `WIN_CSC_KEY_PASSWORD` for its password through your local secret manager or CI secret store. Do not commit certificates, passwords, or tokens. A non-exportable hardware-backed key uses the certificate-store route above.

For Microsoft's signing service, create an account, complete identity validation, create a public-trust certificate profile, and grant your build identity the certificate-profile signer role. Then configure:

```powershell
$env:KOODEX_SIGNING_METHOD = 'azure'
$env:KOODEX_SIGNING_PUBLISHER = 'EXACT CERTIFICATE COMMON NAME'
$env:KOODEX_SIGNING_ENDPOINT = 'YOUR ACCOUNT ENDPOINT'
$env:KOODEX_SIGNING_ACCOUNT = 'YOUR SIGNING ACCOUNT'
$env:KOODEX_SIGNING_PROFILE = 'YOUR CERTIFICATE PROFILE'
# Supply AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET through
# your secret manager for service-principal authentication.
npm run dist:signed
```

Verify the actual outputs before distribution:

```powershell
Get-AuthenticodeSignature -LiteralPath 'release/1.5.0/win-unpacked/Koodex.exe'
Get-AuthenticodeSignature -LiteralPath 'release/1.5.0/Koodex-1.5.0-x64-nsis.exe'
Get-AuthenticodeSignature -LiteralPath 'release/1.5.0/Koodex-1.5.0-x64-portable.exe'
```

Each must report `Valid` with your expected publisher and a timestamp. Signing identifies the publisher and protects integrity; it does not promise that Windows will never show a reputation warning.

References: [electron-builder 26 Windows signing configuration](https://www.electron.build/v26/docs/features/code-signing/code-signing-win/), [Microsoft signing account setup](https://learn.microsoft.com/en-us/azure/trusted-signing/quickstart).
