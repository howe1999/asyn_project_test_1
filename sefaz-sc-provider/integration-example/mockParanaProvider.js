/**
 * Placeholder for the existing Paraná NFC-e provider.
 *
 * This file exists only to demonstrate how the SC provider would be
 * registered alongside other state providers in leap-api. The real
 * Paraná provider already exists in the ASYN codebase; it would be
 * imported from its actual location instead of this mock.
 */

export class NfceProviderPR {
  static canHandle(qrContent) {
    const text = String(qrContent ?? '').trim();
    if (!text) return false;

    try {
      const url = new URL(text);
      return url.hostname.toLowerCase() === 'www.fazenda.pr.gov.br';
    } catch {
      // Not a URL.
    }

    const digitsOnly = text.replace(/\s+/g, '');
    if (/^\d{44}$/.test(digitsOnly)) {
      return digitsOnly.slice(0, 2) === '41';
    }

    return false;
  }

  async fromQrContent(qrContent) {
    // Real implementation would fetch and parse Paraná SEFAZ.
    // This mock just returns a dummy object so the integration example
    // can run without network access.
    return {
      emitente: 'MOCK PARANA',
      cnpj: '00.000.000/0000-00',
      dataEmissao: '01/01/2024 00:00:00',
      qtdItens: 0,
      valorTotal: 0,
      itens: [],
      url: qrContent,
      uf: 'PR',
    };
  }
}