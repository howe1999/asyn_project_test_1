#!/usr/bin/env node

import { NfceProviderSC } from './provider.js';

const args = process.argv.slice(2);

function usage() {
  console.error(`
ASYN / SEFAZ-SC provider demo

Usage:
  node cli.js "<NFC-e QR URL>"
  node cli.js --access-key <44-digit NFC-e access key>

Examples:
  node cli.js "https://sat.sef.sc.gov.br/...NFCe_Detalhes.aspx?rq=..."
  node cli.js --access-key 4224...

The QR URL mode is the primary flow required by the interview task.
The access-key mode is a fallback and may require a browser/human
verification because SEFAZ-SC can present Cloudflare Turnstile.
`);
}

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  usage();
  process.exit(args.length === 0 ? 1 : 0);
}

const provider = new NfceProviderSC();

try {
  let receipt;
  if (args[0] === '--access-key') {
    if (!args[1]) throw new Error('Missing access key.');
    receipt = await provider.fromAccessKey(args[1]);
  } else {
    receipt = await provider.fromQrContent(args[0]);
  }

  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  console.error(`[${error.name}] ${error.message}`);
  process.exitCode = 1;
}
