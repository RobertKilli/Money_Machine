import "server-only";
import { M5ProviderInfrastructureError, type M5CredentialReference, type M5EphemeralCredential, type M5ProviderCredentialPort } from "./m5-provider-execution-boundary";

/** Resolves only the two explicit server environment references after execution authorization. */
export class M5ProviderEnvironmentCredentialResolver implements M5ProviderCredentialPort {
  async resolve(reference: M5CredentialReference): Promise<M5EphemeralCredential> {
    if (reference.kind !== "API_KEY") throw new M5ProviderInfrastructureError("M5_PROVIDER_CREDENTIAL_REFERENCE_INVALID");
    const envName = reference.reference === "env:coingecko-pro-api-key" ? "COINGECKO_PRO_API_KEY"
      : reference.reference === "env:etherscan-api-key" ? "ETHERSCAN_API_KEY" : undefined;
    if (!envName) throw new M5ProviderInfrastructureError("M5_PROVIDER_CREDENTIAL_REFERENCE_INVALID");
    const value = process.env[envName];
    if (typeof value !== "string" || value.trim() !== value || value.length === 0 || value.length > 8192 || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new M5ProviderInfrastructureError("M5_PROVIDER_CREDENTIAL_MISSING");
    }
    return Object.freeze({ kind: "API_KEY", value });
  }
}
