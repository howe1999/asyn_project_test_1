import { NfceProviderSC } from '../provider.js';
import { NfceProviderPR } from './mockParanaProvider.js';

/**
 * In leap-api, this registry would contain all supported NFC-e
 * providers (PR, SC, etc.) and would be used by the service layer to
 * pick the correct one based on QR content.
 */
const providers = [new NfceProviderSC(), new NfceProviderPR()];

/**
 * Select the first provider whose `canHandle` returns true.
 *
 * @param {string} qrContent
 * @returns {import('../provider.js').NfceProviderSC | NfceProviderPR | undefined}
 */
export function selectProvider(qrContent) {
  return providers.find((provider) => provider.canHandle(qrContent));
}