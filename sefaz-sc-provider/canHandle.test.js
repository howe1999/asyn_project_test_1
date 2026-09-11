import { describe, expect, it } from 'vitest';

import { NfceProviderSC } from './provider.js';

describe('NfceProviderSC.canHandle', () => {
  // Existing test: deep-link URL format
  it('accepts a real SEFAZ-SC deep-link URL', () => {
    expect(
      NfceProviderSC.canHandle(
        'https://sat.sef.sc.gov.br/tax.NET/Sat.DFe.NFCe.Web/NFCe_Detalhes.aspx?rq=abc',
      ),
    ).toBe(true);
  });

  // New test: /nfce/consulta URL format used by the actual QR code
  it('accepts the /nfce/consulta URL format used by the actual QR code', () => {
    expect(
      NfceProviderSC.canHandle(
        'https://sat.sef.sc.gov.br/nfce/consulta?p=42240203821728000172650070000318811000319318',
      ),
    ).toBe(true);
  });

  it('rejects a URL from a different state/host', () => {
    expect(NfceProviderSC.canHandle('https://www.fazenda.pr.gov.br/nfce/consulta')).toBe(false);
  });

  it('accepts a bare 44-digit key with UF code 42', () => {
    expect(NfceProviderSC.canHandle('42240203821728000172650070000318811000319318')).toBe(true);
  });

  it('rejects a bare 44-digit key with a different UF code', () => {
    expect(NfceProviderSC.canHandle('41240203821728000172650070000318811000319310')).toBe(false);
  });

  it('rejects empty or garbage input without throwing', () => {
    expect(NfceProviderSC.canHandle('')).toBe(false);
    expect(NfceProviderSC.canHandle('not a url or a key')).toBe(false);
    expect(NfceProviderSC.canHandle(undefined)).toBe(false);
  });
});