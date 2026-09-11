import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { NfceScNotFoundError, NfceScParseError } from './exceptions.js';
import { NfceParserSC } from './parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, 'scSampleResponse.html');
const sampleHtml = readFileSync(FIXTURE_PATH, 'utf-8');

describe('NfceParserSC', () => {
  it('parses seller info', () => {
    const receipt = new NfceParserSC(sampleHtml, 'https://example.test').parse();
    expect(receipt.emitente).toBe('CENTRO DE JARDINAGEM JUNKES LTDA EPP');
    expect(receipt.cnpj).toBe('03.821.728/0001-72');
  });

  it('produces an address with no doubled commas', () => {
    const receipt = new NfceParserSC(sampleHtml).parse();
    expect(receipt.endereco).not.toMatch(/,\s*,/);
    expect(receipt.endereco).toContain('SERRARIA');
    expect(receipt.endereco).toContain('SAO JOSE');
  });

  it('parses the single item', () => {
    const receipt = new NfceParserSC(sampleHtml).parse();
    expect(receipt.itens).toHaveLength(1);
    const item = receipt.itens[0];
    expect(item.descricao).toContain('PIMENTA CHEIRO');
    expect(item.codigo).toBe('20222');
    expect(item.quantidade).toBe(1);
    expect(item.unidade).toBe('UN');
    expect(item.valorUnitario).toBeCloseTo(13.2);
    expect(item.valorTotal).toBeCloseTo(13.2);
  });

  it('parses totals', () => {
    const receipt = new NfceParserSC(sampleHtml).parse();
    expect(receipt.qtdItens).toBe(1);
    expect(receipt.valorTotal).toBeCloseTo(13.2);
  });

  it('parses payment info', () => {
    const receipt = new NfceParserSC(sampleHtml).parse();
    expect(receipt.pagamentos).toHaveLength(1);
    expect(receipt.pagamentos[0].forma).toContain('PIX');
    expect(receipt.pagamentos[0].valor).toBeCloseTo(13.2);
  });

  it('parses metadata', () => {
    const receipt = new NfceParserSC(sampleHtml).parse();
    expect(receipt.numero).toBe('31881');
    expect(receipt.serie).toBe('7');
    expect(receipt.protocoloAutorizacao).toBe('342240199788566');
    expect(receipt.chaveAcesso).toBe('42240203821728000172650070000318811000319318');
  });

  it('parses the consumer as not identified', () => {
    const receipt = new NfceParserSC(sampleHtml).parse();
    expect(receipt.consumidor.toLowerCase()).toContain('identificado');
  });

  it('throws NfceScNotFoundError when seller is missing and error text is present', () => {
    const html =
      '<html><body>Chave de Acesso inv\u00e1lida. O d\u00edgito verificador n\u00e3o confere.</body></html>';
    expect(() => new NfceParserSC(html).parse()).toThrow(NfceScNotFoundError);
  });

  it('throws NfceScParseError on unrelated html', () => {
    const html = '<html><body><p>hello world</p></body></html>';
    expect(() => new NfceParserSC(html).parse()).toThrow(NfceScParseError);
  });
});
