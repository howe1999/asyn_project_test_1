import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { NfceParserSC } from './parser.js';
import {
  ReceiptBaseFields,
  ReceiptOptionalFields,
  ReceiptItemBaseFields,
  ReceiptItemOptionalFields,
} from './receiptContract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleHtml = readFileSync(join(__dirname, 'scSampleResponse.html'), 'utf8');

const receipt = new NfceParserSC(sampleHtml, 'https://example.test').parse();

describe('SC Receipt contract', () => {
  it('contains every base Receipt field expected by the ASYN contract', () => {
    for (const field of ReceiptBaseFields) {
      expect(receipt).toHaveProperty(field);
    }
  });

  it('contains every optional Receipt field currently populated by SC', () => {
    for (const field of ReceiptOptionalFields) {
      expect(receipt).toHaveProperty(field);
    }
  });

  it('exposes items that contain every base ReceiptItem field', () => {
    expect(receipt.itens.length).toBeGreaterThan(0);
    const item = receipt.itens[0];
    for (const field of ReceiptItemBaseFields) {
      expect(item).toHaveProperty(field);
    }
  });

  it('exposes items that contain every optional ReceiptItem field', () => {
    const item = receipt.itens[0];
    for (const field of ReceiptItemOptionalFields) {
      expect(item).toHaveProperty(field);
    }
  });
});