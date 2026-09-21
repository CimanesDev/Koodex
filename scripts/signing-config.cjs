// electron-builder 26 signing configuration. Never put private keys here.
const env = process.env;
const required = (name) => {
  if (!env[name])
    throw new Error(
      `Set ${name} before building a signed release. See docs/code-signing.md.`,
    );
  return env[name];
};
const azure = env.KOODEX_SIGNING_METHOD === "azure";
if (!azure && !env.KOODEX_CERT_SHA1 && !env.WIN_CSC_LINK && !env.CSC_LINK) {
  throw new Error("No signing identity configured. See docs/code-signing.md.");
}
module.exports = {
  extends: "./electron-builder.yml",
  forceCodeSigning: true,
  win: azure
    ? {
        azureSignOptions: {
          publisherName: required("KOODEX_SIGNING_PUBLISHER"),
          endpoint: required("KOODEX_SIGNING_ENDPOINT"),
          codeSigningAccountName: required("KOODEX_SIGNING_ACCOUNT"),
          certificateProfileName: required("KOODEX_SIGNING_PROFILE"),
        },
      }
    : {
        signtoolOptions: {
          ...(env.KOODEX_CERT_SHA1
            ? { certificateSha1: env.KOODEX_CERT_SHA1 }
            : {}),
          signingHashAlgorithms: ["sha256"],
          rfc3161TimeStampServer: "http://timestamp.digicert.com",
        },
      },
};
