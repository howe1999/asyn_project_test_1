/**
 * Access-key (chave de acesso) parsing, shared national structure.
 *
 * The 44-digit access key format is not SC-specific - it's the same
 * national structure used by every state (PR included):
 *
 *   cUF(2) + AAMM(4) + CNPJ(14) + mod(2) + serie(3) + nNF(9)
 *          + tpEmis(1) + cNF(8) + cDV(1) = 44 digits
 *
 * Two checks matter before ever making a network call:
 *   1. The check digit (cDV) must match the mod-11 algorithm below.
 *   2. The `mod` field must be "65" (NFC-e). A syntactically valid key
 *      with mod="55" is a regular NF-e, not a consumer receipt, and
 *      SC's NFC-e-only endpoint will reject it - this was confirmed
 *      against a real SC response ("Chave de Acesso: modelo de DF-e
 *      diferente do solicitado.") during manual testing.
 */

const ACCESS_KEY_RE = /^\d{44}$/;

export const NFCE_MODEL = '65';

// Not exhaustive - extend as other states are supported. SC and PR are
// the two verified end-to-end so far.
const UF_CODES = {
  41: 'PR',
  42: 'SC',
  35: 'SP',
};

export class InvalidAccessKeyError extends Error {}
export class WrongDocumentModelError extends Error {}

/**
 * @typedef {Object} AccessKeyInfo
 * @property {string} raw
 * @property {string} ufCode
 * @property {string|undefined} uf
 * @property {string} year
 * @property {string} month
 * @property {string} cnpj
 * @property {string} model
 * @property {string} series
 * @property {string} number
 * @property {string} tpEmis
 * @property {string} cnf
 * @property {string} dv
 */

/** Standard mod-11 check digit used across all Brazilian NF-e/NFC-e keys. */
function checkDigit(base43) {
  const weights = [2, 3, 4, 5, 6, 7, 8, 9];
  let total = 0;
  const reversed = base43.split('').reverse();
  for (let i = 0; i < reversed.length; i++) {
    total += Number(reversed[i]) * weights[i % 8];
  }
  const resto = total % 11;
  return resto === 0 || resto === 1 ? 0 : 11 - resto;
}

/**
 * Parse and checksum-validate a 44-digit access key.
 *
 * Throws InvalidAccessKeyError if the key is malformed or the check
 * digit does not match. Does NOT check the document model - call
 * ensureIsNfce() separately, so callers can distinguish "not a valid
 * key at all" from "valid key, wrong document type".
 *
 * @param {string} key
 * @returns {AccessKeyInfo}
 */
export function parseAccessKey(key) {
  const digits = String(key).replace(/\s+/g, '');
  if (!ACCESS_KEY_RE.test(digits)) {
    throw new InvalidAccessKeyError(
      `Access key must be exactly 44 digits, got ${digits.length}: ${JSON.stringify(digits)}`,
    );
  }

  const info = {
    raw: digits,
    ufCode: digits.slice(0, 2),
    uf: UF_CODES[digits.slice(0, 2)],
    year: digits.slice(2, 4),
    month: digits.slice(4, 6),
    cnpj: digits.slice(6, 20),
    model: digits.slice(20, 22),
    series: digits.slice(22, 25),
    number: digits.slice(25, 34),
    tpEmis: digits.slice(34, 35),
    cnf: digits.slice(35, 43),
    dv: digits.slice(43, 44),
  };

  const expected = checkDigit(digits.slice(0, 43));
  if (String(expected) !== info.dv) {
    throw new InvalidAccessKeyError(
      `Check digit mismatch for ${digits}: expected ${expected}, got ${info.dv}`,
    );
  }

  return info;
}

/**
 * Throws WrongDocumentModelError if this key is not an NFC-e (mod=65).
 * @param {AccessKeyInfo} info
 */
export function ensureIsNfce(info) {
  if (info.model !== NFCE_MODEL) {
    throw new WrongDocumentModelError(
      `Document model is "${info.model}", expected "${NFCE_MODEL}" (NFC-e). ` +
        'This key identifies an NF-e or another document type, not a ' +
        "consumer receipt - SEFAZ-SC's NFC-e endpoint will reject it.",
    );
  }
}
