/**
 * Internal ASYN NFC-e receipt contract.
 *
 * This is the shared shape that every state provider (PR, SC, etc.)
 * should be able to produce. Because the real Paraná provider source
 * was not available during this exercise, this contract is based on:
 *
 *   1. The ASYN engineering overview's description of invoice records.
 *   2. The field naming convention already used by the PR parser
 *      (emitente, cnpj, itens, valorTotal, ...).
 *   3. Brazilian NFC-e data exposed by the SEFAZ-SC response.
 *
 * SC currently adds two fields that PR did not need:
 *   - `unidade` on each item
 *   - `pagamentos` on the receipt
 *
 * These are additive fields. They do not replace or rename any PR
 * field, so a client written against the PR shape can still read the
 * base fields from an SC receipt.
 */

export const ReceiptBaseFields = [
  'emitente',
  'cnpj',
  'dataEmissao',
  'qtdItens',
  'valorTotal',
  'itens',
  'url',
  'uf',
];

export const ReceiptOptionalFields = [
  'endereco',
  'numero',
  'serie',
  'protocoloAutorizacao',
  'chaveAcesso',
  'consumidor',
  'pagamentos',
];

export const ReceiptItemBaseFields = [
  'descricao',
  'quantidade',
  'valorUnitario',
  'valorTotal',
];

export const ReceiptItemOptionalFields = [
  'codigo',
  'unidade',
  'categoria',
];