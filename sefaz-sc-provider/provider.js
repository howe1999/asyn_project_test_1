/**
 * Provider/adapter entry point for Santa Catarina, matching the
 * interface expected of the existing Paraná provider: given raw
 * QR-code content, return a normalized Receipt.
 *
 * Two entry points are exposed because SC's public infrastructure
 * genuinely offers two different ways in, with very different
 * reliability profiles - this isn't a stylistic choice, it reflects
 * what was actually observed while testing against the real system:
 *
 *   fromQrContent()   Primary path, recommended for production. A real
 *                      NFC-e QR code from SC encodes a full URL
 *                      pointing at NFCe_Detalhes.aspx?rq=<opaque
 *                      token>. This is a single GET request; in manual
 *                      testing it did NOT trigger the Cloudflare
 *                      challenge. This matches what the task actually
 *                      asks for ("take an NFC-e QR code ... access the
 *                      correct source") - the QR code already contains
 *                      the resolved URL, so this provider does not
 *                      need to (and cannot, since `rq` is an opaque
 *                      token it has no way to construct) reconstruct
 *                      it from the bare access key.
 *
 *   fromAccessKey()    Fallback for when only the bare 44-digit key is
 *                      available with no QR/URL (e.g. manually
 *                      re-typed from a paper receipt). This must POST
 *                      to the manual lookup form
 *                      (ConsultaPublicaNFCe.aspx), carrying forward
 *                      __VIEWSTATE/__EVENTVALIDATION from an initial
 *                      GET plus a session cookie. After a successful
 *                      POST, SC normally returns an MS AJAX delta
 *                      containing a `pageRedirect` instruction instead
 *                      of the invoice HTML directly. The provider now
 *                      follows that redirect with the same session
 *                      cookie to retrieve the actual invoice page.
 *
 *                      In manual testing the POST path previously
 *                      triggered a Cloudflare Turnstile challenge, but
 *                      with the right cookie/session it can succeed.
 *                      The code still throws
 *                      HumanVerificationRequiredError explicitly when
 *                      a challenge page is detected.
 */

import * as cheerio from 'cheerio';

import {
  InvalidAccessKeyError,
  WrongDocumentModelError,
  ensureIsNfce,
  parseAccessKey,
} from './accessKey.js';
import {
  HumanVerificationRequiredError,
  InvalidQrContentError,
  NfceScError,
  NfceScNetworkError,
} from './exceptions.js';
import { NfceParserSC } from './parser.js';

const ALLOWED_HOSTS = new Set(['sat.sef.sc.gov.br']);
const KEY_IN_TEXT_RE = /\d{44}/;

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

// Substrings observed on the real Cloudflare Turnstile challenge page
// (see exceptions.js HumanVerificationRequiredError for full context).
const VERIFICATION_MARKERS = [
  'Efetue a validação de segurança',
  'cloudflare',
  'Verify you are human',
];

const MANUAL_FORM_URL =
  'https://sat.sef.sc.gov.br/tax.NET/Sat.DFe.NFCe.Web/Consultas/ConsultaPublicaNFCe.aspx';

export class NfceProviderSC {
  /** @param {{ timeoutMs?: number, fetchImpl?: typeof fetch }} [opts] */
  constructor(opts = {}) {
    this.timeoutMs = opts.timeoutMs ?? 20000;
    // Injectable for tests / for reuse of leap-api's existing
    // injectable HTTP client convention (see engineering docs:
    // "an injectable HTTP client").
    this.fetchImpl = opts.fetchImpl ?? fetch;
    // Deliberately NOT storing a cookie jar on `this`. A provider
    // instance may be reused across many concurrent requests (e.g. as
    // a Fastify singleton); keeping session state on the instance would
    // leak one caller's SEFAZ-SC session cookies into another caller's
    // request. Instead, each call that needs session continuity
    // (fromAccessKey's GET-then-POST) creates its own local Map and
    // threads it through explicitly - see that method below.
  }

  // ------------------------------------------------------------------
  // "Identify": can this provider handle the given QR content at all?
  // ------------------------------------------------------------------
  /**
   * Static, side-effect-free check for whether a given piece of QR
   * content belongs to Santa Catarina - the "identify" half of the
   * task's "identify and access the correct SEFAZ/SVRS source". An
   * outer provider-selection/router layer (already assumed to exist in
   * leap-api per the task description) is expected to call this - or
   * an equivalent check for each candidate provider - before choosing
   * which provider's fetch/parse methods to invoke, the same way it
   * presumably already does for Paraná.
   *
   * Recognizes SC content two ways, since a real QR code encodes a
   * full URL while a manually re-typed value may just be the bare
   * 44-digit key:
   *   - A URL whose host is a known SEFAZ-SC host.
   *   - A 44-digit access key whose UF code (first two digits) is 42.
   *
   * Deliberately does not throw or validate the check digit here -
   * that belongs to the actual fetch path, once a provider has already
   * been selected. This method only answers "is this SC's concern?".
   *
   * @param {string} qrContent
   * @returns {boolean}
   */
  static canHandle(qrContent) {
    const text = String(qrContent ?? '').trim();
    if (!text) return false;

    try {
      const url = new URL(text);
      return url.protocol === 'https:' && ALLOWED_HOSTS.has(url.hostname.toLowerCase());
    } catch {
      // Not a URL - fall through and check for a bare access key.
    }

    const digitsOnly = text.replace(/\s+/g, '');
    if (/^\d{44}$/.test(digitsOnly)) {
      return digitsOnly.slice(0, 2) === '42';
    }

    return false;
  }

  // ------------------------------------------------------------------
  // Primary path: real QR-code content
  // ------------------------------------------------------------------
  /**
   * @param {string} qrContent
   * @returns {Promise<import('./models.js').Receipt>}
   */
  async fromQrContent(qrContent) {
    const url = this._extractUrl(qrContent);
    this._validateHost(url);

    // If a plain 44-digit key is embedded anywhere in the QR text
    // (some states put it there alongside the URL), validate it as an
    // early, cheap sanity check before making a network call.
    const key = this._extractKeyFromText(qrContent);
    if (key) {
      this._validateKey(key);
    }

    // A single GET, no session continuity needed - see module docstring.
    const html = await this._get(url);
    this._raiseIfVerificationPage(html);

    return new NfceParserSC(html, url).parse();
  }

  // ------------------------------------------------------------------
  // Fallback path: bare access key via the manual lookup form
  // ------------------------------------------------------------------
  /**
   * @param {string} accessKey
   * @returns {Promise<import('./models.js').Receipt>}
   */
  async fromAccessKey(accessKey) {
    const info = this._validateKey(accessKey);

    // Request-scoped cookie jar: created fresh for this single call and
    // never stored on `this`, so concurrent calls on a shared provider
    // instance cannot see each other's session state.
    const cookieJar = new Map();

    const getHtml = await this._get(MANUAL_FORM_URL, cookieJar);
    this._raiseIfVerificationPage(getHtml);
    const hidden = this._extractHiddenFields(getHtml);

    const payload = new URLSearchParams({
      'ctl00$ctl00$ctl00$scmMain':
        'ctl00$ctl00$ctl00$scmMain|ctl00$ctl00$ctl00$Body$Main$Main$sepConsultaNFCe$btnBuscar',
      __EVENTTARGET: 'ctl00$ctl00$ctl00$Body$Main$Main$sepConsultaNFCe$btnBuscar',
      __EVENTARGUMENT: '',
      __VIEWSTATE: hidden.__VIEWSTATE ?? '',
      __VIEWSTATEGENERATOR: hidden.__VIEWSTATEGENERATOR ?? '',
      __EVENTVALIDATION: hidden.__EVENTVALIDATION ?? '',
      'ctl00$ctl00$ctl00$Body$Main$Main$sepConsultaNFCe$txtChave': info.raw,
      __ASYNCPOST: 'true',
    });

    let resp;
    try {
      resp = await this._fetchWithTimeout(MANUAL_FORM_URL, {
        method: 'POST',
        headers: {
          ...DEFAULT_HEADERS,
          Cookie: this._cookieHeader(cookieJar),
          'X-MicrosoftAjax': 'Delta=true',
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        },
        body: payload.toString(),
      });
    } catch (err) {
      throw new NfceScNetworkError(String(err));
    }
    if (!resp.ok) {
      throw new NfceScNetworkError(`POST ${MANUAL_FORM_URL} returned ${resp.status}`);
    }
    this._storeCookies(resp, cookieJar);

    const deltaText = await resp.text();
    this._raiseIfVerificationPage(deltaText);

    // Debug aid: when SC_DEBUG_DUMP is set to a file path, save the raw
    // MS AJAX 'delta' response before attempting to parse it.
    if (process.env.SC_DEBUG_DUMP) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(process.env.SC_DEBUG_DUMP, deltaText, 'utf-8');
    }

    // New behaviour: the successful POST usually returns a delta
    // containing a `pageRedirect` instruction. Follow it with the same
    // cookie jar to fetch the actual invoice page.
    const redirectUrl = this._extractRedirectUrl(deltaText);
    let invoiceHtml;
    let sourceUrl = MANUAL_FORM_URL;

    if (redirectUrl) {
      // Safety: still ensure the redirect is to the expected SC host.
      this._validateHost(redirectUrl);
      invoiceHtml = await this._get(redirectUrl, cookieJar);
      this._raiseIfVerificationPage(invoiceHtml);
      sourceUrl = redirectUrl;
    } else {
      // Fallback to the old heuristic: some SC deployments might return
      // the invoice fragment directly inside the delta response.
      const fragment = this._extractDeltaFragment(deltaText);
      if (fragment === null) {
        throw new NfceScError(
          "Could not locate an invoice fragment or page redirect inside " +
            "the MS AJAX 'delta' response; the panel layout may have changed.",
        );
      }
      invoiceHtml = fragment;
    }

    return new NfceParserSC(invoiceHtml, sourceUrl).parse();
  }

  // ------------------------------------------------------------------
  // Shared helpers
  // ------------------------------------------------------------------
  /**
   * @param {string} url
   * @param {Map<string,string>} [cookieJar] Optional request-scoped
   *   cookie jar. When omitted, no cookies are sent and none are kept -
   *   correct for fromQrContent's single stateless GET.
   */
  async _get(url, cookieJar = null) {
    let resp;
    try {
      resp = await this._fetchWithTimeout(url, {
        headers: cookieJar
          ? { ...DEFAULT_HEADERS, Cookie: this._cookieHeader(cookieJar) }
          : { ...DEFAULT_HEADERS },
      });
    } catch (err) {
      throw new NfceScNetworkError(`Failed to GET ${url}: ${err}`);
    }
    if (!resp.ok) {
      throw new NfceScNetworkError(`GET ${url} returned ${resp.status}`);
    }
    if (cookieJar) this._storeCookies(resp, cookieJar);
    return resp.text();
  }

  async _fetchWithTimeout(url, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /** @param {Map<string,string>} cookieJar */
  _cookieHeader(cookieJar) {
    return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  /** @param {Map<string,string>} cookieJar */
  _storeCookies(resp, cookieJar) {
    const setCookie =
      typeof resp.headers.getSetCookie === 'function'
        ? resp.headers.getSetCookie()
        : resp.headers.get('set-cookie')
          ? [resp.headers.get('set-cookie')]
          : [];
    for (const raw of setCookie) {
      const [pair] = raw.split(';');
      const eq = pair.indexOf('=');
      if (eq > -1) {
        cookieJar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
    }
  }

  _extractUrl(qrContent) {
    const trimmed = String(qrContent).trim();
    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new InvalidQrContentError(
        `QR content does not look like a URL: ${trimmed.slice(0, 80)}`,
      );
    }
    if (parsed.protocol !== 'https:') {
      throw new InvalidQrContentError(
        `URL protocol "${parsed.protocol}" is not allowed; the SEFAZ-SC ` +
          'endpoint is expected to be accessed over HTTPS only.',
      );
    }
    return trimmed;
  }

  _validateHost(url) {
    const hostname = new URL(url).hostname.toLowerCase();
    if (!ALLOWED_HOSTS.has(hostname)) {
      throw new InvalidQrContentError(
        `URL host "${hostname}" is not a recognized SEFAZ-SC host; ` +
          'refusing to fetch an unexpected domain.',
      );
    }
  }

  _extractKeyFromText(text) {
    const m = String(text).replace(/\s+/g, '').match(KEY_IN_TEXT_RE);
    return m ? m[0] : null;
  }

  _validateKey(key) {
    let info;
    try {
      info = parseAccessKey(key);
    } catch (err) {
      if (err instanceof InvalidAccessKeyError) {
        throw new InvalidQrContentError(err.message);
      }
      throw err;
    }
    try {
      ensureIsNfce(info);
    } catch (err) {
      if (err instanceof WrongDocumentModelError) {
        throw new InvalidQrContentError(err.message);
      }
      throw err;
    }
    if (info.uf !== 'SC') {
      throw new InvalidQrContentError(
        `Access key belongs to UF "${info.uf ?? info.ufCode}", not Santa ` +
          'Catarina (42) - wrong provider for this key.',
      );
    }
    return info;
  }

  _raiseIfVerificationPage(html) {
    const lowered = html.toLowerCase();
    if (VERIFICATION_MARKERS.some((marker) => lowered.includes(marker.toLowerCase()))) {
      throw new HumanVerificationRequiredError(
        'SEFAZ-SC returned a Cloudflare human-verification challenge instead of invoice data.',
      );
    }
  }

  _extractHiddenFields(html) {
    const $ = cheerio.load(html);
    const fields = {};
    for (const id of ['__VIEWSTATE', '__VIEWSTATEGENERATOR', '__EVENTVALIDATION']) {
      fields[id] = $(`input#${id}`).attr('value') ?? '';
    }
    return fields;
  }

  /**
   * Detect and extract a `pageRedirect` instruction from an MS AJAX
   * delta response. Returns the decoded redirect URL or `null` if
   * none is found.
   *
   * @param {string} deltaText
   * @returns {string|null}
   */
  _extractRedirectUrl(deltaText) {
    const marker = 'pageRedirect||';
    const startIndex = deltaText.indexOf(marker);
    if (startIndex === -1) return null;

    const afterMarker = deltaText.slice(startIndex + marker.length);
    const endIndex = afterMarker.indexOf('|');
    const encodedUrl = endIndex === -1 ? afterMarker : afterMarker.slice(0, endIndex);

    if (!encodedUrl) return null;

    // The redirect URL is usually URL-encoded, sometimes twice.
    let decoded = encodedUrl;
    try {
      decoded = decodeURIComponent(decoded);
      decoded = decodeURIComponent(decoded);
    } catch {
      // If double decoding fails, fall back to single decoding.
      try {
        decoded = decodeURIComponent(encodedUrl);
      } catch {
        decoded = encodedUrl;
      }
    }

    return decoded;
  }

  /**
   * Parse the Microsoft AJAX 'delta' partial-postback format: a
   * sequence of length-prefixed, pipe-delimited segments describing
   * which DOM node to update with which HTML.
   *
   * Heuristic and UNVERIFIED against a real successful response (see
   * docstring above). Picks the longest segment that looks like it
   * contains the invoice fragment (recognizable by known selector
   * names).
   */
  _extractDeltaFragment(deltaText) {
    // Microsoft AJAX delta responses are length-prefixed. Splitting the
    // whole response on "|" is unsafe because the HTML payload itself can
    // contain pipe characters. Read the declared payload length instead.
    let cursor = 0;
    let best = null;

    while (cursor < deltaText.length) {
      const lengthEnd = deltaText.indexOf('|', cursor);
      if (lengthEnd === -1) break;

      const lengthStr = deltaText.slice(cursor, lengthEnd);
      if (!/^\d+$/.test(lengthStr)) {
        cursor = lengthEnd + 1;
        continue;
      }

      const length = Number(lengthStr);
      const typeEnd = deltaText.indexOf('|', lengthEnd + 1);
      if (typeEnd === -1) break;
      const idEnd = deltaText.indexOf('|', typeEnd + 1);
      if (idEnd === -1) break;

      const contentStart = idEnd + 1;
      const content = deltaText.slice(contentStart, contentStart + length);
      if (content.length < length) break;

      if (content.includes('tabResult') || content.includes('id="u20"')) {
        if (best === null || content.length > best.length) best = content;
      }

      cursor = contentStart + length;
      if (deltaText[cursor] === '|') cursor += 1;
    }

    return best;
  }
}