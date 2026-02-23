import { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      type: "customJwt",
      issuer: "https://lucky-bream-55.clerk.accounts.dev",
      jwks: "https://lucky-bream-55.clerk.accounts.dev/.well-known/jwks.json",
      algorithm: "RS256",
    },
  ],
} satisfies AuthConfig;
