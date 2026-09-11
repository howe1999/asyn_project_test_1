import {
  HumanVerificationRequiredError,
  InvalidQrContentError,
  NfceScNetworkError,
  NfceScNotFoundError,
  NfceScParseError,
  NfceScError,
} from '../exceptions.js';

/**
 * Map an error thrown by any NFC-e provider to an HTTP response shape.
 * This would be used in leap-api's central error handler, allowing
 * provider-specific errors to be converted into consistent API errors.
 *
 * @param {Error} error
 * @returns {{ status: number, code: string, message: string }}
 */
export function mapProviderError(error) {
  if (error instanceof InvalidQrContentError) {
    return {
      status: 400,
      code: 'INVALID_NFCE_QR_CONTENT',
      message: error.message,
    };
  }

  if (error instanceof NfceScNotFoundError) {
    return {
      status: 404,
      code: 'NFCE_NOT_FOUND',
      message: error.message,
    };
  }

  if (error instanceof HumanVerificationRequiredError) {
    return {
      status: 409,
      code: 'UPSTREAM_HUMAN_VERIFICATION_REQUIRED',
      message: error.message,
    };
  }

  if (error instanceof NfceScNetworkError) {
    return {
      status: 502,
      code: 'UPSTREAM_NETWORK_ERROR',
      message: error.message,
    };
  }

  if (error instanceof NfceScParseError) {
    return {
      status: 500,
      code: 'UPSTREAM_PARSE_ERROR',
      message: error.message,
    };
  }

  if (error instanceof NfceScError) {
    return {
      status: 500,
      code: 'UPSTREAM_PROVIDER_ERROR',
      message: error.message,
    };
  }

  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: error.message || 'Internal server error',
  };
}