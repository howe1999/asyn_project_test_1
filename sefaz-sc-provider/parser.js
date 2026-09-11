/**
 * Parses the invoice-content fragment rendered by SEFAZ-SC's public
 * NFC-e lookup.
 *
 * Both ConsultaPublicaNFCe.aspx (manual form) and NFCe_Detalhes.aspx (QR
 * deep link) render this same fragment. It appears to come from a
 * shared national XSLT template for the NFC-e DANFE (consumer-facing
 * auxiliary document) - the selector names below were confirmed against
 * a real captured SC response and are, notably, IDENTICAL to the ones
 * already used by the existing PR parser:
 *
 *   #u20            seller name
 *   #tabResult      item table
 *   .txtTit         item description
 *   .Rqtd           item quantity ("Qtde.: N")
 *   .RvlUnit        item unit price ("Vl. Unit.: N")
 *   .valor          item line total
 *   .txtMax         grand total
 *   #infos          metadata block (issue info / access key / consumer)
 *   .totalNumb      totals column values
 *
 * Only the outer transport/session mechanics differ between PR and SC -
 * not this inner fragment. Fields below that PR's parser did not need
 * (unit of measure, payment breakdown) are new here; the address
 * cleanup step is also new, since SC's markup can contain empty address
 * fragments that would otherwise render as doubled commas.
 *
 * Known limitation: the response HTML nests a second, invalid <html>
 * tag inside the outer ASP.NET page (the XSLT-rendered fragment was not
 * stripped of its own html/head/body wrapper before being embedded).
 * cheerio tolerates this fine for id/class lookups, but it's worth
 * flagging as a data-quality quirk of the source system rather than a
 * parsing bug if it ever looks surprising in a debugger.
 */

import * as cheerio from 'cheerio';

import { NfceScNotFoundError, NfceScParseError } from './exceptions.js';
import { makeReceipt, makeReceiptItem } from './models.js';

const CNPJ_RE = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/;

function cleanText(s) {
  if (!s) return '';
  return s.replace(/\s+/g, ' ').trim();
}

/** Convert a Brazilian-formatted number string (e.g. '1.234,56') to a Number. */
function cleanMoney(s) {
  if (!s) return 0;
  let cleaned = cleanText(s).replace('R$', '').trim();
  cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

export class NfceParserSC {
  /**
   * @param {string} html
   * @param {string} [sourceUrl]
   */
  constructor(html, sourceUrl = '') {
    this.$ = cheerio.load(html);
    this.url = sourceUrl;
  }

  /** @returns {import('./models.js').Receipt} */
  parse() {
    this._checkNotFound();

    const { emitente, cnpj, endereco } = this._parseSeller();
    if (!emitente || !cnpj) {
      throw new NfceScParseError(
        'Could not find seller name/CNPJ in the response; the page ' +
          'structure may not match what this parser expects.',
      );
    }

    const itens = this._parseItems();
    const { qtdItens, valorTotal } = this._parseTotals();
    const pagamentos = this._parsePayments();
    const { numero, serie, emissao, protocolo, chave } = this._parseMetadata();
    const consumidor = this._parseConsumer();

    return makeReceipt({
      emitente,
      cnpj,
      endereco,
      dataEmissao: emissao,
      numero,
      serie,
      protocoloAutorizacao: protocolo,
      chaveAcesso: chave,
      qtdItens,
      valorTotal,
      itens,
      pagamentos,
      consumidor,
      url: this.url,
      uf: 'SC',
    });
  }

  // --------------------------------------------------------------
  _checkNotFound() {
    const $ = this.$;
    // Only treat these substrings as fatal when the seller block is
    // also missing, to avoid false positives on a legitimate invoice
    // that happens to contain similar words elsewhere in its data.
    if ($('#u20').length > 0) return;

    const text = cleanText($.root().text());
    if (text.includes('não existe') || text.toLowerCase().includes('chave de acesso inválida')) {
      throw new NfceScNotFoundError(text.slice(0, 300));
    }
  }

  _parseSeller() {
    const $ = this.$;
    const nameTag = $('#u20').first();
    const emitente = nameTag.length ? cleanText(nameTag.text()) : '';

    const fullText = cleanText($.root().text());
    const cnpjMatch = fullText.match(CNPJ_RE);
    const cnpj = cnpjMatch ? cnpjMatch[0] : '';

    let endereco = '';
    if (nameTag.length) {
      const textDivs = nameTag.parent().find('div.text');
      // textDivs[0] is the CNPJ line; textDivs[1], when present, is the
      // address line. SC sometimes leaves an empty fragment for a
      // missing "complemento" field (e.g. "198, , SERRARIA"), so empty
      // pieces are dropped before rejoining.
      if (textDivs.length > 1) {
        const raw = cleanText($(textDivs[1]).text());
        const pieces = raw
          .split(',')
          .map((p) => p.trim())
          .filter((p) => p.length > 0);
        endereco = pieces.join(', ');
      }
    }

    return { emitente, cnpj, endereco };
  }

  _parseItems() {
    const $ = this.$;
    const items = [];
    const table = $('table#tabResult');
    if (!table.length) return items;

    table.find('tr').each((_, row) => {
      const $row = $(row);
      const nameTag = $row.find('span.txtTit').first();
      const totalTag = $row.find('span.valor').first();
      if (!nameTag.length || !totalTag.length) return;

      let codigo = '';
      const codeTag = $row.find('span.RCod').first();
      if (codeTag.length) {
        // Pull out the digits/alphanumerics after "Código:" rather than
        // string-replacing a fixed label, since the accent on "Código"
        // is not guaranteed to round-trip identically through every
        // encoding path.
        const m = cleanText(codeTag.text()).match(/([A-Za-z0-9]+)\s*\)?\s*$/);
        codigo = m ? m[1] : '';
      }

      let quantidade = 1;
      const qtyTag = $row.find('span.Rqtd').first();
      if (qtyTag.length) {
        const qtyText = cleanText(qtyTag.text()).replace('Qtde.:', '');
        const parsed = cleanMoney(qtyText);
        if (Number.isFinite(parsed)) quantidade = parsed;
      }

      let unidade = '';
      const unitTag = $row.find('span.RUN').first();
      if (unitTag.length) {
        unidade = cleanText(unitTag.text()).replace('UN:', '').trim();
      }

      let valorUnitario = 0;
      const priceTag = $row.find('span.RvlUnit').first();
      if (priceTag.length) {
        const priceText = cleanText(priceTag.text()).replace('Vl. Unit.:', '');
        valorUnitario = cleanMoney(priceText);
      }

      items.push(
        makeReceiptItem({
          descricao: cleanText(nameTag.text()),
          quantidade,
          unidade,
          valorUnitario,
          valorTotal: cleanMoney(totalTag.text()),
          codigo,
        }),
      );
    });

    return items;
  }

  _parseTotals() {
    const $ = this.$;
    let qtdItens = 0;
    let valorTotal = 0;

    const totalBlock = $('#totalNota');
    if (!totalBlock.length) return { qtdItens, valorTotal };

    totalBlock.find('[id="linhaTotal"]').each((_, row) => {
      const $row = $(row);
      const label = $row.find('label').first();
      const value = $row.find('span.totalNumb').first();
      if (!label.length || !value.length) return;

      const labelText = cleanText(label.text());
      if (labelText.includes('Qtd. total de itens')) {
        const n = parseInt(cleanText(value.text()), 10);
        if (!Number.isNaN(n)) qtdItens = n;
      } else if (labelText.includes('Valor a pagar')) {
        valorTotal = cleanMoney(value.text());
      }
    });

    return { qtdItens, valorTotal };
  }

  _parsePayments() {
    const $ = this.$;
    const payments = [];
    const totalBlock = $('#totalNota');
    if (!totalBlock.length) return payments;

    const formaRow = totalBlock.find('[id="linhaForma"]').first();
    if (!formaRow.length) return payments;

    // The actual payment-method rows are the #linhaTotal siblings that
    // follow #linhaForma - #linhaForma itself only holds the "Forma de
    // pagamento:" / "Valor pago R$:" column headers, not a payment
    // value.
    let row = formaRow.nextAll('[id="linhaTotal"]').first();
    while (row.length) {
      const label = row.find('label').first();
      const value = row.find('span.totalNumb').first();
      if (!label.length || !value.length) break;

      const method = cleanText(label.text());
      if (!method) break;

      payments.push({ forma: method, valor: cleanMoney(value.text()) });
      row = row.nextAll('[id="linhaTotal"]').first();
    }

    return payments;
  }

  _parseMetadata() {
    const $ = this.$;
    const infoBlock = $('#infos');
    const text = infoBlock.length ? cleanText(infoBlock.text()) : '';

    const numero = this._extract(/N[uú]mero:\s*(\d+)/, text);
    const serie = this._extract(/S[ée]rie:\s*(\d+)/, text);
    const emissao = this._extract(/Emiss[ãa]o:\s*([\d/]+\s+[\d:]+)/, text);
    const protocolo = this._extract(/Protocolo de Autoriza[çc][ãa]o:\s*(\d+)/, text);

    const chaveTag = $('span.chave').first();
    const chave = chaveTag.length ? cleanText(chaveTag.text()).replace(/\s+/g, '') : '';

    return { numero, serie, emissao, protocolo, chave };
  }

  _parseConsumer() {
    const $ = this.$;
    const infoBlock = $('#infos');
    if (!infoBlock.length) return '';

    let result = '';
    infoBlock.find('[data-role="collapsible"]').each((_, section) => {
      const $section = $(section);
      const heading = $section.find('h4').first();
      if (heading.length && heading.text().includes('Consumidor')) {
        const li = $section.find('li').first();
        if (li.length) result = cleanText(li.text());
      }
    });
    return result;
  }

  _extract(pattern, text) {
    const m = text.match(pattern);
    return m ? m[1] : '';
  }
}
