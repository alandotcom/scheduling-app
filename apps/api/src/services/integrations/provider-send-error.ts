// Vendor-neutral send failure raised by integration adapters. Adapters know
// which provider errors are transient (the journey domain does not), so they
// classify with `retryable`; the journey delivery dispatcher maps a
// non-retryable ProviderSendError to its own JourneyDeliveryNonRetryableError.
// Keeping this here lets adapters stay free of any journey import.
export class ProviderSendError extends Error {
  readonly retryable: boolean;

  constructor(
    message: string,
    options: { retryable: boolean; cause?: unknown },
  ) {
    super(
      message,
      options.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = "ProviderSendError";
    this.retryable = options.retryable;
  }
}
