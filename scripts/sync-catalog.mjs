/**
 * sync-catalog.mjs — MakiMakes → catalogo.json
 *
 * Coleta produtos de https://www.makimakesoficial.com.br
 * Categorias: Maquiagem + Cosméticos + Acessórios (exclui Perfumaria)
 *
 * Estratégia:
 *  1. Baixa o sitemap.xml
 *  2. Filtra URLs de produto (/p)
 *  3. Para cada produto: fetch da página e extrai JSON-LD (schema.org/Product)
 *  4. Aplica regras de preço e monta o DATA no formato do Gist
 *
 * Uso:
 *   node scripts/sync-catalog.mjs
 *   MAX_PRODUCTS=30   (para testes rápidos)
 *   CONCURRENCY=5
 *   DELAY_MS=200
 *
 * Dependências: apenas Node 18+ (fetch nativo).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ========== CONFIG ==========
const SITEMAP_URL = 'https://www.makimakesoficial.com.br/sitemap.xml';

const MAX_PRODUCTS = parseInt(process.env.MAX_PRODUCTS || '0', 10) || Infinity;
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '5', 10);
const DELAY_MS = parseInt(process.env.DELAY_MS || '180', 10);

// Mapeamento de categoria do site → linha do nosso catálogo
const LINE_MAP = {
  'base': 'rosto',
  'corretivo': 'rosto',
  'pó': 'rosto',
  'po': 'rosto',
  'primer': 'rosto',
  'blush': 'rosto',
  'contorno': 'rosto',
  'iluminador': 'rosto',
  'multifuncional': 'rosto',
  'rímel': 'olhos',
  'rimel': 'olhos',
  'sombra': 'olhos',
  'sombras': 'olhos',
  'delineador': 'olhos',
  'lápis': 'olhos',
  'lapis': 'olhos',
  'sobrancelha': 'olhos',
  'sobrancelhas': 'olhos',
  'batom': 'labios',
  'lip gloss': 'labios',
  'lip-gloss': 'labios',
  'lip oil': 'labios',
  'lip tint': 'labios',
  'hidratante': 'corpo',
  'sabonete': 'corpo',
  'esfoliante': 'corpo',
  'serum': 'rosto',
  'protetor solar': 'rosto',
  'capilar': 'cabelo',
  'pincel': 'acessorios',
  'pinceis': 'acessorios',
  'esponja': 'acessorios',
  'cilios': 'acessorios',
  'cola': 'acessorios',
  'escova': 'acessorios',
  'necessaire': 'acessorios',
  'unha': 'acessorios',
  'lenço': 'acessorios',
};

// Regras de preço — AJUSTE CONFORME SUA MARGEM
// Preço do site = base (geralmente pack de 12/24 un)
const PRICE_RULES = {
  varejoMarkup: 2.50,
  atacadoMarkup: 2.00,
};

// Destaques do site raiz (markup diferenciado)
const SPECIAL_GROUPS = {
  lojas10: {
    url: 'https://www.makimakesoficial.com.br/lojas-de-10/g',
    title: 'Lojas de R$10,00',
    varejoMarkup: 2.80,  // 180%
    atacadoMarkup: 2.50  // 150%
  },
  ofertasLimitadas: {
    url: 'https://www.makimakesoficial.com.br/ofertas-por-tempo-limitado/g',
    title: 'Ofertas por tempo limitado',
    varejoMarkup: 2.80,
    atacadoMarkup: 2.50
  }
};

// ========== HELPERS ==========
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function parsePrice(str) {
  if (str == null) return 0;
  const s = String(str).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  return parseFloat(s) || 0;
}

function unescapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function formatPrice(n) {
  return (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
}

function calcPrices(base) {
  return {
    varejo: formatPrice(base * PRICE_RULES.varejoMarkup),
    atacado: formatPrice(base * PRICE_RULES.atacadoMarkup)
  };
}

function calcSpecialPrices(base, groupKey) {
  const g = SPECIAL_GROUPS[groupKey];
  if (!g) return calcPrices(base);
  return {
    varejo: formatPrice(base * g.varejoMarkup),
    atacado: formatPrice(base * g.atacadoMarkup)
  };
}

/** Extrai slugs /p de uma página de grupo/destaque */
async function fetchGroupSlugs(groupUrl) {
  try {
    const res = await fetch(groupUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EmpórioARBeauty/1.0)', 'Accept': 'text/html' }
    });
    if (!res.ok) return new Set();
    const html = await res.text();
    const set = new Set();
    const re = /href="([^"]+\/p)"/g;
    let m;
    while ((m = re.exec(html))) {
      let slug = m[1].replace(/^https?:\/\/www\.makimakesoficial\.com\.br\//, '').replace(/^\//, '');
      if (slug.endsWith('/p')) set.add(slug);
    }
    return set;
  } catch (e) {
    console.warn('Falha grupo', groupUrl, e.message);
    return new Set();
  }
}

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function mapLine(category, name = '') {
  const cat = norm(category);
  const n = norm(name);
  for (const [key, line] of Object.entries(LINE_MAP)) {
    if (cat.includes(key) || n.includes(key)) return line;
  }
  if (cat.includes('maquiagem') || cat.includes('rimel') || cat.includes('sombra')) return 'olhos';
  if (cat.includes('hidrat') || cat.includes('esfolia') || cat.includes('sabonete') || cat.includes('body') || cat.includes('corporal')) return 'corpo';
  if (cat.includes('cosmetico') || cat.includes('corpo')) return 'corpo';
  if (cat.includes('shampoo') || cat.includes('condicion') || cat.includes('capilar') || cat.includes('cabelo')) return 'cabelo';
  if (cat.includes('acessorio') || cat.includes('pincel') || cat.includes('esponja')) return 'acessorios';
  if (cat.includes('batom') || cat.includes('lip ')) return 'labios';
  if (cat.includes('base') || cat.includes('blush') || cat.includes('po ') || cat.includes('pó')) return 'rosto';
  return 'outros';
}

function extractVolume(name) {
  const m = name.match(/(\d+\s*(?:un|unid|ml|g|kg|pcs|pçs?))\b/i);
  return m ? m[1].replace(/\s+/g, '').toUpperCase() : '';
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; CatalogSync/1.0)',
      'Accept': 'text/html',
      'Accept-Language': 'pt-BR,pt;q=0.9'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function extractJsonLdProduct(html) {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1].trim());
      if (data['@type'] === 'Product') return data;
      if (Array.isArray(data)) {
        const p = data.find(x => x['@type'] === 'Product');
        if (p) return p;
      }
    } catch (_) {}
  }
  return null;
}

// ========== MAIN ==========
async function getProductUrlsFromSitemap() {
  console.log('Baixando sitemap...');
  const xml = await fetchText(SITEMAP_URL);
  const urls = [...xml.matchAll(/<loc>(https:\/\/www\.makimakesoficial\.com\.br\/[^<]+\/p)<\/loc>/g)].map(m => m[1]);
  console.log(`  → ${urls.length} produtos no sitemap`);
  return urls;
}

async function processProduct(url, specialMaps = {}) {
  try {
    const html = await fetchText(url);
    const p = extractJsonLdProduct(html);
    if (!p) return null;

    const name = unescapeHtml((p.name || '').trim());
    const brand = (p.brand?.name || '').trim() || 'Sem marca';
    const image = typeof p.image === 'string' ? p.image : (Array.isArray(p.image) ? p.image[0] : '') || '';
    const basePrice = parseFloat(p.offers?.price) || 0;
    const availability = (p.offers?.availability || '').includes('InStock') ? 'Sim' : 'Não';
    const category = p.category || '';
    const gtin = p.gtin || '';

    const lower = (name + ' ' + brand + ' ' + category).toLowerCase();
    if (
      lower.includes('perfume') ||
      lower.includes('eau de') ||
      (lower.includes('body splash') && /lattafa|armaf|alhambra|maison|asda|khamrah/i.test(lower))
    ) {
      return null;
    }

    if (basePrice <= 0) return null;

    // slug relativo para bater com grupos
    const slug = url.replace(/^https?:\/\/www\.makimakesoficial\.com\.br\//, '').replace(/^\//, '');
    let specialKey = null;
    for (const [key, set] of Object.entries(specialMaps)) {
      if (set.has(slug)) { specialKey = key; break; }
    }

    const prices = specialKey ? calcSpecialPrices(basePrice, specialKey) : calcPrices(basePrice);
    const volume = extractVolume(name);
    const line = mapLine(category, name);
    const isBox = /\b\d+\s*UN\b/i.test(name) || /\bbox\b/i.test(name);

    let badge = '';
    if (specialKey === 'lojas10') badge = 'LOJAS R$10';
    if (specialKey === 'ofertasLimitadas') badge = 'OFERTA';

    return {
      line,
      cat: category || line,
      brand,
      specialKey,
      item: {
        nome: name,
        volume: volume,
        varejo: isBox ? null : prices.varejo,
        atacado: prices.atacado,
        disponivel: availability,
        notas: (p.description && p.description !== name) ? unescapeHtml(p.description).slice(0, 400) : '',
        foto: image,
        fotos: image ? [image] : [],
        badge,
        gtin,
        sourceUrl: url,
        basePrice: formatPrice(basePrice),
        somenteAtacado: isBox,
        destaque: specialKey || null
      }
    };
  } catch (e) {
    console.warn(`  falha ${url.slice(-40)}: ${e.message}`);
    return null;
  }
}

async function runPool(urls, concurrency, fn) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < urls.length) {
      const i = idx++;
      const r = await fn(urls[i]);
      if (r) results.push(r);
      if ((i + 1) % 25 === 0) console.log(`  processados ${i + 1}/${urls.length}...`);
      await sleep(DELAY_MS);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

async function main() {
  console.log('=== Sync Catálogo Maquiagem (MakiMakes) ===\n');

  // Destaques do site raiz (atualiza a cada sync)
  const specialMaps = {};
  for (const [key, cfg] of Object.entries(SPECIAL_GROUPS)) {
    console.log('Grupo:', cfg.title);
    const set = await fetchGroupSlugs(cfg.url);
    specialMaps[key] = set;
    console.log('  →', set.size, 'produtos');
  }

  let urls = await getProductUrlsFromSitemap();
  // garante URLs dos destaques mesmo se sumirem do sitemap
  for (const set of Object.values(specialMaps)) {
    for (const slug of set) {
      const full = 'https://www.makimakesoficial.com.br/' + slug;
      if (!urls.includes(full)) urls.push(full);
    }
  }
  if (MAX_PRODUCTS < Infinity) {
    urls = urls.slice(0, MAX_PRODUCTS);
    console.log(`Limitado a ${MAX_PRODUCTS} produtos para teste\n`);
  }

  console.log(`Processando com concorrência ${CONCURRENCY}...\n`);
  const raw = await runPool(urls, CONCURRENCY, (url) => processProduct(url, specialMaps));
  console.log(`\nExtraídos com sucesso: ${raw.length}`);

  const groupsByLine = {};
  const brandsSet = new Set();
  const destaquesItems = { lojas10: [], ofertasLimitadas: [] };

  for (const r of raw) {
    brandsSet.add(r.brand);
    if (!groupsByLine[r.line]) groupsByLine[r.line] = {};
    const key = `${r.brand}||${r.cat}`;
    if (!groupsByLine[r.line][key]) {
      groupsByLine[r.line][key] = { cat: r.cat, brand: r.brand, items: [] };
    }
    groupsByLine[r.line][key].items.push(r.item);
    if (r.specialKey && destaquesItems[r.specialKey]) {
      destaquesItems[r.specialKey].push({ ...r.item, brand: r.brand, cat: r.cat, line: r.line });
    }
  }

  const DATA = {};
  for (const [line, groups] of Object.entries(groupsByLine)) {
    DATA[line] = Object.values(groups).sort((a, b) => a.brand.localeCompare(b.brand));
  }

  const DESTAQUES = {
    lojas10: {
      title: SPECIAL_GROUPS.lojas10.title,
      items: destaquesItems.lojas10
    },
    ofertasLimitadas: {
      title: SPECIAL_GROUPS.ofertasLimitadas.title,
      items: destaquesItems.ofertasLimitadas
    }
  };

  const BRANDS = [...brandsSet].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const output = {
    DATA,
    DESTAQUES,
    BRANDS,
    WHATSAPP: process.env.WHATSAPP || '5562991134488',
    BRAND: {
      name: process.env.BRAND_NAME || 'Empório A.R. Beauty',
      phone: process.env.BRAND_PHONE || '(62) 99113-4488',
      tagline: 'Maquiagem e Cosméticos — Varejo e Atacado'
    },
    META: {
      updated_at: new Date().toISOString(),
      source: 'makimakesoficial.com.br',
      total_products: raw.length,
      version: 2,
      price_rules: {
        ...PRICE_RULES,
        especiais: {
          lojas10: { varejoMarkup: 2.8, atacadoMarkup: 2.5 },
          ofertasLimitadas: { varejoMarkup: 2.8, atacadoMarkup: 2.5 }
        }
      }
    }
  };

  const outPath = path.join(__dirname, '..', 'catalogo.generated.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log('\nGerado:', outPath);
  console.log('Linhas:', Object.keys(DATA).map(k => {
    const count = DATA[k].reduce((s, g) => s + g.items.length, 0);
    return `${k}(${count})`;
  }).join(', '));
  console.log('Destaques: lojas10=', DESTAQUES.lojas10.items.length, 'ofertas=', DESTAQUES.ofertasLimitadas.items.length);
  console.log('Marcas:', BRANDS.length);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
