/**
 * Normalized data structures.
 *
 * Field names follow the same convention as the existing PR parser
 * (emitente/cnpj/itens/valorTotal/...) so the shared internal Receipt
 * shape can be reused across providers with minimal translation. Two
 * fields are additive on top of what PR's parser produced (unidade on
 * each item, pagamentos on the receipt), because SC's response exposes
 * this data and PR's parser simply had no field for it.
 *
 * Plain factory functions are used instead of classes/TypeScript
 * interfaces to match leap-api's existing JavaScript ESM style.
 */

/**
 * @typedef {Object} ReceiptItem
 * @property {string} descricao
 * @property {number} quantidade
 * @property {number} valorUnitario
 * @property {number} valorTotal
 * @property {string} [codigo]
 * @property {string} [unidade]
 * @property {string} [categoria]
 */

/**
 * @typedef {Object} PaymentInfo
 * @property {string} forma
 * @property {number} valor
 */

/**
 * @typedef {Object} Receipt
 * @property {string} emitente
 * @property {string} cnpj
 * @property {string} dataEmissao
 * @property {number} qtdItens
 * @property {number} valorTotal
 * @property {ReceiptItem[]} itens
 * @property {string} url
 * @property {string} uf
 * @property {string} [endereco]
 * @property {string} [numero]
 * @property {string} [serie]
 * @property {string} [protocoloAutorizacao]
 * @property {string} [chaveAcesso]
 * @property {string} [consumidor]
 * @property {PaymentInfo[]} [pagamentos]
 */

/** @param {Partial<ReceiptItem>} fields @returns {ReceiptItem} */
export function makeReceiptItem(fields) {
  return {
    descricao: '',
    quantidade: 1,
    valorUnitario: 0,
    valorTotal: 0,
    codigo: '',
    unidade: '',
    categoria: '',
    ...fields,
  };
}

/** @param {Partial<Receipt>} fields @returns {Receipt} */
export function makeReceipt(fields) {
  return {
    emitente: '',
    cnpj: '',
    dataEmissao: '',
    qtdItens: 0,
    valorTotal: 0,
    itens: [],
    url: '',
    uf: '',
    endereco: '',
    numero: '',
    serie: '',
    protocoloAutorizacao: '',
    chaveAcesso: '',
    consumidor: '',
    pagamentos: [],
    ...fields,
  };
}
