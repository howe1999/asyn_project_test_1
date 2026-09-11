import { describe, expect, it } from 'vitest';

import {
  InvalidAccessKeyError,
  WrongDocumentModelError,
  ensureIsNfce,
  parseAccessKey,
} from './accessKey.js';

// Real, checksum-valid SC NFC-e key, captured during manual testing.
const SC_NFCE_KEY = '42240203821728000172650070000318811000319318';

// Same structure but with mod=55 (NF-e, not NFC-e) - also checksum-valid,
// used to confirm the "wrong document type" branch specifically (not
// just "invalid key").
const SC_NFE_KEY = '42260548193233000184550010000006681135217298';

describe('parseAccessKey', () => {
  it('parses a valid SC key', () => {
    const info = parseAccessKey(SC_NFCE_KEY);
    expect(info.uf).toBe('SC');
    expect(info.ufCode).toBe('42');
    expect(info.model).toBe('65');
    expect(info.cnpj).toBe('03821728000172');
    expect(info.series).toBe('007');
    expect(info.number).toBe('000031881');
  });

  it('accepts a key with spaces', () => {
    const spaced = '4224 0203 8217 2800 0172 6500 7000 0318 8110 0031 9318';
    const info = parseAccessKey(spaced);
    expect(info.raw).toBe(SC_NFCE_KEY);
  });

  it('rejects the wrong length', () => {
    expect(() => parseAccessKey('1234')).toThrow(InvalidAccessKeyError);
  });

  it('rejects a bad check digit', () => {
    const lastDigit = Number(SC_NFCE_KEY.at(-1));
    const tampered = SC_NFCE_KEY.slice(0, -1) + ((lastDigit + 1) % 10);
    expect(() => parseAccessKey(tampered)).toThrow(InvalidAccessKeyError);
  });

  it('ensureIsNfce passes for an NFC-e key', () => {
    const info = parseAccessKey(SC_NFCE_KEY);
    expect(() => ensureIsNfce(info)).not.toThrow();
  });

  it('ensureIsNfce rejects an NF-e key', () => {
    const info = parseAccessKey(SC_NFE_KEY);
    expect(info.model).toBe('55');
    expect(() => ensureIsNfce(info)).toThrow(WrongDocumentModelError);
  });
});
