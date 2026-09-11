import { selectProvider } from './providerRegistry.js';

/**
 * Example of the leap-api service method that would be called from a
 * route handler. It receives raw QR content, selects the appropriate
 * state provider, and returns a normalized Receipt wrapped in ASYN's
 * standard response envelope.
 *
 * @param {string} qrContent
 * @returns {Promise<{ data: import('../models.js').Receipt }>}
 */
export async function parseNfce(qrContent) {
  const provider = selectProvider(qrContent);

  if (!provider) {
    throw new Error(`No NFC-e provider can handle this QR content: ${qrContent.slice(0, 80)}`);
  }

  const receipt = await provider.fromQrContent(qrContent);

  // ASYN successful responses are standardized around `data` and
  // optional `metadata`. The route layer can add metadata as needed.
  return { data: receipt };
}