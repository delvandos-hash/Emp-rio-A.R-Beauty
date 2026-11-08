/**
 * Empório A.R. Beauty — Catálogo completo
 */
import { parsePrice, formatPriceBR as formatPrice } from './prices.js';

const GIST_RAW_URL = 'https://gist.githubusercontent.com/delvandos-hash/081d1d5efa2e2003cf859964a650dfb5/raw/catalogo.json';
const CATALOG_URLS = [GIST_RAW_URL, '/catalogo.json'];
const PAGE_SIZE = 48;
const STOCK_CACHE_MS = 10 * 60 * 1000;
const CANONICAL_HOME = 'https://emporioar-beauty.netlify.app/';

// TEMP: full file will be restored in next commit — bootstrap from last good commit via dynamic import fails CORS.
// Minimal working shell so site is not stuck on PLACEHOLDER.
console.error('app.js incomplete restore — uploading full file');
