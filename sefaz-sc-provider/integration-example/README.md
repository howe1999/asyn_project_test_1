# # Integration Example

This directory demonstrates how the SEFAZ-SC provider would be integrated

into the existing leap-api architecture without requiring the actual

leap-api source code.

## Files

- `providerRegistry.js`  

  Contains a list of all NFC-e providers (currently SC and a mock PR) and

  exposes `selectProvider(qrContent)` to pick the correct one via

  `canHandle()`.

- `nfceService.js`  

  Simulates the leap-api service layer. It uses the provider registry,

  calls `fromQrContent()`, and returns the normalized receipt wrapped in

  the ASYN success envelope: `{ data: receipt }`.

- `errorHandler.js`  

  Maps provider errors to HTTP status codes and error codes, following

  the structured error envelope described in the ASYN engineering

  overview.

- `mockParanaProvider.js`  

  Placeholder for the existing Paraná provider. In a real leap-api

  repository, this would be the actual PR provider import.

## How to map to real leap-api

- `providerRegistry.js` -> `leap-api/src/providers/nfce/index.js`

- `nfceService.js` -> `leap-api/src/services/nfce/parseNfceService.js`

- `errorHandler.js` -> part of `leap-api/src/errors/globalHandler.js`

- `mockParanaProvider.js` -> existing `leap-api/src/providers/nfce/parana.js`