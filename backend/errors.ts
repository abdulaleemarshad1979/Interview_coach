export class ServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export function safeError(error: unknown): ServiceError {
  if (error instanceof ServiceError) return error;
  const upstream = error as { status?: number; name?: string };
  if (upstream?.name === 'AbortError' || upstream?.name === 'APIUserAbortError') {
    return new ServiceError(499, 'CANCELLED', 'The request was cancelled. Your saved answers are available to resume.', true);
  }
  if (upstream?.name === 'TimeoutError' || upstream?.name === 'APIConnectionTimeoutError') {
    return new ServiceError(504, 'PROVIDER_TIMEOUT', 'The AI provider timed out. Please retry.', true);
  }
  if (upstream?.status === 429) {
    return new ServiceError(429, 'PROVIDER_RATE_LIMIT', 'The AI provider is busy. Please retry shortly.', true);
  }
  if (upstream?.status === 401 || upstream?.status === 403) {
    return new ServiceError(503, 'PROVIDER_CONFIGURATION', 'The AI provider credentials or model access need attention.', false);
  }
  return new ServiceError(502, 'PROVIDER_UNAVAILABLE', 'The AI service is temporarily unavailable. Your saved answers have been retained.', true);
}
