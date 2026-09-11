# ASYN / SEFAZ-SC NFC-e Provider

This is a **Node.js / JavaScript ESM** implementation of the Santa Catarina
NFC-e provider requested in the interview exercise.

## 1. What this program does

The primary flow is:

```
NFC-e QR-code URL
      |
      v
validate URL + SEFAZ-SC host (HTTPS only, correct hostname)
      |
      v
GET SEFAZ-SC NFCe_Detalhes.aspx
      |
      v
HTML
      |
      v
NfceParserSC
      |
      v
normalized ASYN Receipt
```

The provider also exposes a fallback for a bare 44-digit access key. That
fallback uses the public ASP.NET Web Forms lookup page and can encounter
Cloudflare Turnstile. It therefore throws `HumanVerificationRequiredError`
instead of pretending that the lookup succeeded.

## 2. Project structure

```
sefaz-sc-provider/
├── accessKey.js                    Access-key parsing + mod-11 validation
├── exceptions.js                   Explicit provider error types
├── models.js                       Normalized Receipt / ReceiptItem factories
├── receiptContract.js              Declared shared Receipt/ReceiptItem field contract
├── parser.js                       SEFAZ-SC HTML -> Receipt
├── provider.js                     Main adapter / network boundary
├── index.js                        Public module exports for leap-api
├── cli.js                          Human-friendly command-line entry point
├── scSampleResponse.html           Offline HTML fixture used by tests
│
├── accessKey.test.js               Access-key unit tests
├── parser.test.js                  HTML parser unit tests
├── provider.test.js                End-to-end provider-flow tests with mocked HTTP
├── canHandle.test.js               Provider-selection ("identify") unit tests
├── contract.test.js                Verifies SC output satisfies receiptContract.js
│
├── integration-example/            How this would plug into leap-api (see below)
│   ├── README.md
│   ├── providerRegistry.js         Picks a provider via canHandle()
│   ├── nfceService.js              Mock leap-api service layer
│   ├── errorHandler.js             Maps provider errors to HTTP responses
│   └── mockParanaProvider.js       Placeholder standing in for the real PR provider
│
├── package.json
└── package-lock.json
```

### Which file is the real program entry point?

There are two meanings of “entry point”:

1. **For leap-api integration:** `index.js` is the public module entry point.
It exports `NfceProviderSC` and the models/errors.
2. **For you to run it manually:** `cli.js` is the executable entry point.

Inside the actual provider, the main method is:

```jsx
await provider.fromQrContent(qrContent)
```

That is the method that corresponds directly to the interview requirement:
“take an NFC-e QR code and retrieve the receipt data from the correct source.”

## 3. You do NOT need Java

You need **Node.js**, not the Java JDK.

Recommended environment:

- Node.js 20 LTS or newer
- npm (comes with Node.js)
- Internet access if you want to call the real SEFAZ-SC endpoint

Check your installation:

```bash
node --version
npm --version
```

If `node` is not found, install Node.js from the official Node.js website:
https://nodejs.org/

## 4. Install dependencies

Open a terminal in this directory:

```bash
cd sefaz-sc-provider
npm install
```

This installs:

- `cheerio` - HTML parsing
- `vitest` - automated tests

There is no database, MySQL, Prisma or Fastify requirement for this standalone
exercise. In the real ASYN repository, this module would be placed under the
API’s provider/adapter layer and called by the existing service layer - see
section 7 and `integration-example/` for what that would look like.

## 5. Run the automated tests

Run all tests:

```bash
npm test
```

The current suite contains **36 tests**:

```
accessKey.test.js    6
parser.test.js       9
provider.test.js    11
canHandle.test.js    6
contract.test.js     4
----------------------
total               36
```

The provider tests do not call SEFAZ. They inject a fake `fetch` implementation
and use the captured HTML fixture, so they are deterministic and safe to run
without depending on the external service.

You can also run the syntax check:

```bash
npm run check
```

## 6. Run the program manually

### Option A - primary interview flow: QR-code URL

Copy the complete URL encoded by the NFC-e QR code and run:

```bash
npm start -- "https://sat.sef.sc.gov.br/..."
```

or:

```bash
node cli.js "https://sat.sef.sc.gov.br/..."
```

If SEFAZ-SC returns the invoice page, the program prints the normalized
Receipt as formatted JSON.

### Option B - fallback: 44-digit access key

```bash
npm start -- --access-key 42240203821728000172650070000318811000319318
```

This is **not the primary path required by the exercise**. SEFAZ-SC can put
this manual lookup behind Cloudflare Turnstile. If that happens, the expected
result is an explicit `HumanVerificationRequiredError`.

## 7. How the code is used from leap-api

In the real API, the intended usage is approximately:

```jsx
import { NfceProviderSC } from './provider.js';

const provider = new NfceProviderSC();
const receipt = await provider.fromQrContent(qrContent);
```

The service layer should not need to know the SC HTML selectors or the SC
network protocol. Those details stay inside `NfceProviderSC` and
`NfceParserSC`.

Conceptually:

```
Route
  -> Service
      -> Provider/Adapter
          -> SEFAZ-SC
          -> Parser
      -> normalized Receipt
```

This follows the ASYN architecture described in the engineering overview:
providers/adapters translate external systems into internal contracts, while
routes/services remain above the provider-specific protocol details.

### `integration-example/` - a concrete, runnable sketch of that wiring

Since the real `leap-api` source was not available during this exercise,
`integration-example/` is a small, self-contained illustration of how this
provider would sit inside it, using a clearly-labeled **mock** of the PR
provider (not a real import):

- `providerRegistry.js` holds a list of providers (`NfceProviderSC` and the
mock `NfceProviderPR`) and exposes `selectProvider(qrContent)`, which picks
the right one by calling each provider’s `canHandle()`.
- `nfceService.js` simulates the leap-api service layer: it selects a
provider, calls `fromQrContent()`, and returns the result in ASYN’s
standard `{ data }` response envelope.
- `errorHandler.js` maps every provider error type to an HTTP status and
error code, so a route/global error handler would only need to call one
function regardless of which state provider threw.
- `mockParanaProvider.js` is explicitly a placeholder - see the comment at
the top of that file. In the real repository this would be replaced with
an import of the actual PR provider.

`integration-example/README.md` also lists where each file would map to
inside a real `leap-api` checkout (e.g. `providerRegistry.js` ->
`leap-api/src/providers/nfce/index.js`).

## 8. What is tested

### Access key (`accessKey.test.js`)

- valid SC NFC-e key
- whitespace in key
- wrong length
- wrong check digit
- valid NFC-e model 65
- valid but wrong document model 55

### Parser (`parser.test.js`)

- seller / CNPJ
- address cleanup
- item extraction
- quantity / unit / unit price / line total
- invoice totals
- payment method
- invoice metadata
- consumer information
- known “not found” page
- unrelated HTML

### Provider (`provider.test.js`)

- complete QR -> HTTP -> parser flow
- SSRF/host protection
- rejects plain HTTP even on the correct host
- rejects a non-HTTPS scheme (e.g. `ftp:`) even on the correct host
- accepts a URL with an explicit port on the correct host
- invalid embedded key rejected before network access
- Cloudflare mapped to explicit error
- non-2xx response mapped to network error
- fetch failure mapped to network error
- wrong-state access key rejected before fallback request
- MS AJAX delta parsing, including `|` characters inside HTML content

### Provider selection (`canHandle.test.js`)

- accepts the real QR deep-link URL format (`NFCe_Detalhes.aspx`)
- accepts the documented `/nfce/consulta?p=` URL format
- rejects a URL from a different state/host
- accepts a bare 44-digit key with UF code 42
- rejects a bare 44-digit key with a different UF code
- rejects empty or garbage input without throwing

### Contract (`contract.test.js`)

- SC’s normalized Receipt contains every base field declared in
`receiptContract.js`
- SC’s normalized Receipt contains every optional field it currently
populates
- each item contains every base `ReceiptItem` field
- each item contains every optional `ReceiptItem` field

## 9. Important limitation

The primary QR-code flow is the path to use for this exercise.

The `fromAccessKey()` fallback depends on the manual SEFAZ-SC lookup page and
its ASP.NET/Microsoft AJAX protocol. During manual probing that page returned
Cloudflare Turnstile before a successful lookup response could be captured.
Therefore the fallback is deliberately documented as **not production-verified**.

The code does not attempt to bypass Cloudflare.

## 10. Fixes applied after a second review pass

Two issues were found and corrected after the first working version:

- **HTTPS + `hostname` enforcement.** URL validation previously accepted any
protocol as long as a host was present, and compared against `url.host`
(which includes the port). This meant `http://` or even `ftp://` on the
right domain could slip past validation, and a URL with an explicit port
would be wrongly rejected. `_extractUrl`/`_validateHost`/`canHandle` now
require `protocol === 'https:'` and compare on `url.hostname`. Covered by
the new tests in `provider.test.js` listed above.
- **Request-scoped cookies instead of an instance-level jar.** The cookie
jar used by `fromAccessKey()`’s GET-then-POST sequence was previously
stored on `this`. If a single `NfceProviderSC` instance is reused across
concurrent calls (e.g. as a long-lived Fastify singleton), that would leak
one caller’s SEFAZ-SC session cookies into another caller’s request. Each
call to `fromAccessKey()` now creates its own local `Map` and threads it
through explicitly; `fromQrContent()`’s single GET needs no cookie
continuity at all and sends none.

## 11. Open item worth flagging to the interviewer

`models.js`’s field names follow the same convention as the PR parser this
exercise was handed (`emitente`, `cnpj`, `itens`, …), with two additive
fields SC’s response exposes and PR’s did not (`unidade`, `pagamentos`).
`receiptContract.js` documents this explicitly, and `contract.test.js`
verifies SC’s output satisfies that declared contract - but that contract
was written from the PR parser’s naming convention and the ASYN engineering
overview, not from a diff against real `leap-api` source, since none was
available during this exercise.

So this should be described as “the same convention and normalized
semantics, self-consistently verified,” not “byte-for-byte identical to the
real PR provider’s output” - if asked directly, say so rather than claiming
certainty the evidence doesn’t support.

## 12. Before submitting to the interviewer

A clean local verification sequence is:

```bash
npm install
npm run check
npm test
```

Then, if you have a real SC NFC-e QR URL available:

```bash
npm start -- "<REAL_SC_NFCE_QR_URL>"
```

The final interview explanation should emphasize that the main engineering
challenge is not merely HTML parsing. It is keeping the ASYN internal Receipt
contract stable while isolating SC-specific transport and parsing behavior
inside the provider/adapter - and being explicit about which parts of that
claim are verified versus assumed.
