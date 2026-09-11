/**
 * Error hierarchy for the SC (Santa Catarina) NFC-e provider.
 *
 * These map to failure modes actually observed while probing the real
 * SEFAZ-SC system by hand, not hypothetical cases - see provider.js and
 * the project README for the full write-up of what was tested.
 */

export class NfceScError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class InvalidQrContentError extends NfceScError {}

export class NfceScNetworkError extends NfceScError {}

export class NfceScNotFoundError extends NfceScError {}

export class NfceScParseError extends NfceScError {}

/**
 * SEFAZ-SC returned a Cloudflare Turnstile challenge page instead of
 * invoice data.
 *
 * Observed behavior during manual testing:
 *   - The manual lookup form (ConsultaPublicaNFCe.aspx) reliably
 *     triggers this challenge for a client with no prior "cleared"
 *     browser session (verification passed once grants a temporary
 *     pass, scoped to that specific browser/cookie jar).
 *   - The direct QR-code deep link (NFCe_Detalhes.aspx?rq=...) did NOT
 *     trigger this challenge in manual testing - this is why
 *     `fromQrContent()` is the recommended production path, and
 *     `fromAccessKey()` (which must use the manual form) is documented
 *     as a fallback with a known reliability risk.
 *
 * A stateless HTTP client cannot solve this challenge: it requires
 * executing browser-side JavaScript in a way Cloudflare trusts. This is
 * a business/architecture decision point, not something to be patched
 * around with more scraping code.
 */
export class HumanVerificationRequiredError extends NfceScError {}
