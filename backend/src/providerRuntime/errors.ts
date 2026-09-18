export type ProviderRuntimeErrorCode =
  | "provider_runtime_unavailable"
  | "invalid_provider_request"
  | "oauth_state_invalid"
  | "oauth_state_expired"
  | "oauth_state_already_used"
  | "oauth_state_owner_mismatch"
  | "oauth_state_redirect_mismatch"
  | "provider_connection_not_found";

export class ProviderRuntimeError extends Error {
  readonly code: ProviderRuntimeErrorCode;
  readonly status: number;

  constructor(code: ProviderRuntimeErrorCode, message: string, status = 400) {
    super(message);
    this.name = "ProviderRuntimeError";
    this.code = code;
    this.status = status;
  }
}
