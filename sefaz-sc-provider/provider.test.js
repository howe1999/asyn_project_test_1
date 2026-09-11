import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  HumanVerificationRequiredError,
  InvalidQrContentError,
  NfceScNetworkError,
} from './exceptions.js';
import { NfceProviderSC } from './provider.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleHtml = readFileSync(join(__dirname, 'scSampleResponse.html'), 'utf8');
const QR_URL = 'https://sat.sef.sc.gov.br/tax.NET/Sat.DFe.NFCe.Web/NFCe_Detalhes.aspx?rq=test-token';
const SC_NFCE_KEY = '42240203821728000172650070000318811000319318';

function response(body, { status = 200, headers = {} } = {}) {
  return new Response(body, { status, headers });
}

describe('NfceProviderSC', () => {
  it('runs the complete QR -> HTTP -> parser flow', async () => {
    const fetchImpl = vi.fn(async () => response(sampleHtml));
    const provider = new NfceProviderSC({ fetchImpl });

    const receipt = await provider.fromQrContent(QR_URL);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(QR_URL);
    expect(receipt.uf).toBe('SC');
    expect(receipt.emitente).toBe('CENTRO DE JARDINAGEM JUNKES LTDA EPP');
    expect(receipt.chaveAcesso).toBe(SC_NFCE_KEY);
    expect(receipt.itens).toHaveLength(1);
  });

  it('rejects an unexpected host before making a network call', async () => {
    const fetchImpl = vi.fn();
    const provider = new NfceProviderSC({ fetchImpl });

    await expect(
      provider.fromQrContent('https://example.com/nfce?rq=test'),
    ).rejects.toThrow(InvalidQrContentError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects an embedded invalid access key before making a network call', async () => {
    const fetchImpl = vi.fn();
    const provider = new NfceProviderSC({ fetchImpl });
    const invalidKeyUrl = `https://sat.sef.sc.gov.br/nfce?key=${SC_NFCE_KEY.slice(0, -1)}0`;

    await expect(provider.fromQrContent(invalidKeyUrl)).rejects.toThrow(InvalidQrContentError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps a Cloudflare/Turnstile page to HumanVerificationRequiredError', async () => {
    const fetchImpl = vi.fn(async () => response('<html>Verify you are human</html>'));
    const provider = new NfceProviderSC({ fetchImpl });

    await expect(provider.fromQrContent(QR_URL)).rejects.toThrow(
      HumanVerificationRequiredError,
    );
  });

  it('maps a non-2xx response to NfceScNetworkError', async () => {
    const fetchImpl = vi.fn(async () => response('server error', { status: 503 }));
    const provider = new NfceProviderSC({ fetchImpl });

    await expect(provider.fromQrContent(QR_URL)).rejects.toThrow(NfceScNetworkError);
  });

  it('maps a fetch failure to NfceScNetworkError', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('connection refused');
    });
    const provider = new NfceProviderSC({ fetchImpl });

    await expect(provider.fromQrContent(QR_URL)).rejects.toThrow(NfceScNetworkError);
  });

  it('rejects a wrong-state access key before making the fallback request', async () => {
    const fetchImpl = vi.fn();
    const provider = new NfceProviderSC({ fetchImpl });
    const prKey = '41240203821728000172650070000318811000319310';

    // This assertion intentionally focuses on the provider boundary. The exact
    // checksum validity of a non-SC sample is covered by accessKey.test.js.
    await expect(provider.fromAccessKey(prKey)).rejects.toThrow(InvalidQrContentError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a plain-HTTP URL even when the host is the correct SEFAZ-SC host', async () => {
    const fetchImpl = vi.fn();
    const provider = new NfceProviderSC({ fetchImpl });

    await expect(
      provider.fromQrContent('http://sat.sef.sc.gov.br/tax.NET/.../NFCe_Detalhes.aspx?rq=x'),
    ).rejects.toThrow(InvalidQrContentError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a non-HTTPS scheme (e.g. ftp) even when the host is the correct SEFAZ-SC host', async () => {
    const fetchImpl = vi.fn();
    const provider = new NfceProviderSC({ fetchImpl });

    await expect(
      provider.fromQrContent('ftp://sat.sef.sc.gov.br/tax.NET/.../NFCe_Detalhes.aspx?rq=x'),
    ).rejects.toThrow(InvalidQrContentError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('accepts a URL carrying an explicit port on the correct SEFAZ-SC host', async () => {
    // Host allowlisting must be based on `hostname`, not `host` (which
    // would include the port and would incorrectly reject an
    // otherwise-legitimate request just because a port was present).
    const portedUrl = 'https://sat.sef.sc.gov.br:8443/tax.NET/.../NFCe_Detalhes.aspx?rq=x';
    const fetchImpl = vi.fn(async () => response(sampleHtml));
    const provider = new NfceProviderSC({ fetchImpl });

    const receipt = await provider.fromQrContent(portedUrl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(receipt.uf).toBe('SC');
  });
});

it('parses a length-prefixed MS AJAX delta payload without breaking on pipes inside HTML', () => {
  const provider = new NfceProviderSC();
  const fragment = '<div id="u20">SELLER | SC</div><table id="tabResult"></table>';
  const delta = `${fragment.length}|updatePanel|ctl00$Body|${fragment}|0|hiddenField|x|ignored`;

  expect(provider._extractDeltaFragment(delta)).toBe(fragment);
});
