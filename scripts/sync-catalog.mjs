/**
 * sync-catalog.mjs — MakiMakes → catalogo.public.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SITEMAP_URL = 'https://www.makimakesoficial.com.br/sitemap.xml';
const MAX_PRODUCTS = parseInt(process.env.MAX_PRODUCTS || '0', 10) || Infinity;
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '3', 10); // Reduzido para não bloquear
const DELAY_MS = parseInt(process.env.DELAY_MS || '250', 10);

const LINE_MAP = { /* ... (mantenha o mesmo mapa de linhas que já estava) ... */ 
  'base': 'rosto', 'corretivo': 'rosto', 'pó': 'rosto', 'po': 'rosto', 'primer': 'rosto', 'blush': 'rosto', 'contorno': 'rosto', 'iluminador': 'rosto', 'multifuncional': 'rosto',
  'rímel': 'olhos', 'rimel': 'olhos', 'sombra': 'olhos', 'sombras': 'olhos', 'delineador': 'olhos', 'lápis': 'olhos', 'lapis': 'olhos', 'sobrancelha': 'olhos', 'sobrancelhas': 'olhos',
  'batom': 'labios', 'lip gloss': 'labios', 'lip-gloss': 'labios', 'lip oil': 'labios', 'lip tint': 'labios',
  'hidratante': 'corpo', 'sabonete': 'corpo', 'esfoliante': 'corpo', 'serum': 'rosto', 'protetor solar': 'rosto',
  'capilar': 'cabelo', 'pincel': 'acessorios', 'pinceis': 'acessorios', 'esponja': 'acessorios', 'cilios': 'acessorios', 'cola': 'acessorios', 'escova': 'acessorios', 'necessaire': 'acessorios', 'unha': 'acessorios', 'lenço': 'acessorios'
};

const PRICE_RULES = { varejoMarkup: 2.50, atacadoMarkup: 2.00 };
const SPECIAL_PRICE_RULES = {
  lojas10:          { varejoMarkup: 1.80, atacadoMarkup: 1.50 },
  ofertasLimitadas: { varejoMarkup: 1.80, atacadoMarkup: 1.50 },
};

const SPECIAL_GROUPS = {
  lojas10: {
    url: 'https://www.makimakesoficial.com.br/lojas-de-10/g',
    title: 'Lojas de R$10,00',
    ...SPECIAL_PRICE_RULES.lojas10,
  },
  ofertasLimitadas: {
    url: 'https://www.makimakesoficial.com.br/ofertas-por-tempo-limitado/g',
    title: 'Ofertas por tempo limitado',
    ...SPECIAL_PRICE_RULES.ofertasLimitadas,
  },
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function parsePrice(str) { if (str == null) return 0; const s = String(str).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'); return parseFloat(s) || 0; }
function unescapeHtml(s) { if (!s) return ''; return String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))); }
function formatPrice(n) { return (Math.round(n * 100) / 100).toFixed(2).replace('.', ','); }
function calcPrices(base) { return { varejo: formatPrice(base * PRICE_RULES.varejoMarkup), atacado: formatPrice(base * PRICE_RULES.atacadoMarkup) }; }
function calcSpecialPrices(base, groupKey) { const g = SPECIAL_PRICE_RULES[groupKey]; if (!g) return calcPrices(base); return { varejo: formatPrice(base * g.varejoMarkup), atacado: formatPrice(base * g.atacadoMarkup) }; }
function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); }

function mapLine(category, name = '') {
  const cat = norm(category); const n = norm(name);
  for (const [key, line] of Object.entries(LINE_MAP)) { if (cat.includes(key) || n.includes(key)) return line; }
  if (cat.includes('maquiagem') || cat.includes('rimel') || cat.includes('sombra')) return 'olhos';
  if (cat.includes('hidrat') || cat.includes('esfolia') || cat.includes('sabonete') || cat.includes('body') || cat.includes('corporal')) return 'corpo';
  if (cat.includes('cosmetico') || cat.includes('corpo')) return 'corpo';
  if (cat.includes('shampoo') || cat.includes('condicion') || cat.includes('capilar') || cat.includes('cabelo')) return 'cabelo';
  if (cat.includes('acessorio') || cat.includes('pincel') || cat.includes('esponja')) return 'acessorios';
  if (cat.includes('batom') || cat.includes('lip ')) return 'labios';
  if (cat.includes('base') || cat.includes('blush') || cat.includes('po ') || cat.includes('pó')) return 'rosto';
  return 'outros';
}

function extractVolume(name) { const m = name.match(/(\d+\s*(?:un|unid|ml|g|kg|pcs|pçs?))\b/i); return m ? m[1].replace(/\s+/g, '').toUpperCase() : ''; }

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CatalogSync/1.0)', 'Accept': 'text/html', 'Accept-Language': 'pt-BR,pt;q=0.9' } });
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
      if (Array.isArray(data)) { const p = data.find(x => x['@type'] === 'Product'); if (p) return p; }
    } catch (_) {}
  }
  return null;
}

// --- FUNÇÃO CORRIGIDA PARA LER TODAS AS PÁGINAS ---
async function fetchGroupSlugs(groupUrl) {
  const set = new Set();
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const url = `${groupUrl}?page=${page}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EmpórioARBeauty/1.0)', 'Accept': 'text/html' } });
      if (!res.ok) break;
      
      const html = await res.text();
      const re = /href="([^"]+\/p)"/g;
      let m;
      let countBefore = set.size;

      while ((m = re.exec(html))) {
        let slug = m[1].replace(/^https?:\/\/www\.makimakesoficial\.com\.br\//, '').replace(/^\//, '');
        if (slug.endsWith('/p')) set.add(slug);
      }

      // Se não encontrou nenhum produto novo nesta página, para o loop
      if (set.size === countBefore) {
        hasMore = false;
      } else {
        page++;
        await sleep(500); // Pausa entre páginas
      }
    } catch (e) {
      console.warn(`Fim da paginação em ${groupUrl} (Página ${page}):`, e.message);
      hasMore = false;
    }
  }
  return set;
}

async function getProductUrlsFromSitemap() {
  const xml = await fetchText(SITEMAP_URL);
  return [...xml.matchAll(/<loc>(https:\/\/www\.makimakesoficial\.com\.br\/[^<]+\/p)<\/loc>/g)].map(m => m[1]);
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
    if (lower.includes('perfume') || lower.includes('eau de') || (lower.includes('body splash') && /lattafa|armaf|alhambra|maison|asda|khamrah/i.test(lower))) return null;
    if (basePrice <= 0) return null;

    const slug = url.replace(/^https?:\/\/www\.makimakesoficial\.com\.br\//, '').replace(/^\//, '');
    let specialKey = null;
    for (const [key, set] of Object.entries(specialMaps)) { if (set.has(slug)) { specialKey = key; break; } }

    const prices = specialKey ? calcSpecialPrices(basePrice, specialKey) : calcPrices(basePrice);
    const volume = extractVolume(name);
    const line = mapLine(category, name);
    const isBox = /\b\d+\s*UN\b/i.test(name) || /\bbox\b/i.test(name);
    const badge = specialKey === 'lojas10' ? 'LOJAS R$10' : (specialKey === 'ofertasLimitadas' ? 'OFERTA' : '');

    const baseItem = {
      nome: name, volume: volume, varejo: isBox ? null : prices.varejo, atacado: prices.atacado,
      disponivel: availability, notas: (p.description && p.description !== name) ? unescapeHtml(p.description).slice(0, 400) : '',
      foto: image, fotos: image ? [image] : [], badge, gtin, somenteAtacado: isBox, destaque: specialKey || null
    };

    return {
      line, cat: category || line, brand, specialKey,
      internalItem: { ...baseItem, sourceUrl: url, basePrice: formatPrice(basePrice) },
      publicItem: baseItem
    };
  } catch (e) { return null; }
}

async function runPool(urls, concurrency, fn) {
  const results = []; let idx = 0;
  async function worker() {
    while (idx < urls.length) {
      const i = idx++; const r = await fn(urls[i]);
      if (r) results.push(r);
      await sleep(DELAY_MS);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

function buildOutputs(raw, specialGroups) {
  const groupsByLine = {}; const brandsSet = new Set();
  const destaquesInternal = { lojas10: [], ofertasLimitadas: [] }; const destaquesPublic = { lojas10: [], ofertasLimitadas: [] };

  for (const r of raw) {
    brandsSet.add(r.brand);
    if (!groupsByLine[r.line]) groupsByLine[r.line] = {};
    const key = `${r.brand}||${r.cat}`;
    if (!groupsByLine[r.line][key]) groupsByLine[r.line][key] = { cat: r.cat, brand: r.brand, items: [], publicItems: [] };
    
    groupsByLine[r.line][key].items.push(r.internalItem);
    groupsByLine[r.line][key].publicItems.push(r.publicItem);
    
    if (r.specialKey && destaquesInternal[r.specialKey]) {
      destaquesInternal[r.specialKey].push({ ...r.internalItem, brand: r.brand, cat: r.cat, line: r.line });
      destaquesPublic[r.specialKey].push({ ...r.publicItem, brand: r.brand, cat: r.cat, line: r.line });
    }
  }

  const DATA_INTERNAL = {}; const DATA_PUBLIC = {};
  for (const [line, groups] of Object.entries(groupsByLine)) {
    DATA_INTERNAL[line] = Object.values(groups).map(g => ({ cat: g.cat, brand: g.brand, items: g.items })).sort((a, b) => a.brand.localeCompare(b.brand));
    DATA_PUBLIC[line] = Object.values(groups).map(g => ({ cat: g.cat, brand: g.brand, items: g.publicItems })).sort((a, b) => a.brand.localeCompare(b.brand));
  }

  const DESTAQUES_INTERNAL = {}; const DESTAQUES_PUBLIC = {};
  for (const [k, cfg] of Object.entries(specialGroups)) {
    DESTAQUES_INTERNAL[k] = { title: cfg.title, items: destaquesInternal[k] };
    DESTAQUES_PUBLIC[k]   = { title: cfg.title, items: destaquesPublic[k] };
  }

  const metaCommon = { updated_at: new Date().toISOString(), source: 'makimakes', total_products: raw.length, version: 3 };
  const BRAND = { name: process.env.BRAND_NAME || 'Empório A.R. Beauty', phone: '(62) 99113-4488', tagline: 'Maquiagem e Cosméticos' };
  const WHATSAPP = process.env.WHATSAPP || '5562991134488';

  return {
    internal: { DATA: DATA_INTERNAL, DESTAQUES: DESTAQUES_INTERNAL, BRANDS: [...brandsSet].sort(), WHATSAPP, BRAND, META: { ...metaCommon, price_rules: { ...PRICE_RULES, especiais: SPECIAL_PRICE_RULES } } },
    public: { DATA: DATA_PUBLIC, DESTAQUES: DESTAQUES_PUBLIC, BRANDS: [...brandsSet].sort(), WHATSAPP, BRAND, META: metaCommon },
    DATA_PUBLIC
  };
}

async function main() {
  console.log('=== Sync Catálogo ===');
  const specialMaps = {};
  for (const [key, cfg] of Object.entries(SPECIAL_GROUPS)) {
    console.log('Buscando vitrine:', cfg.title);
    specialMaps[key] = await fetchGroupSlugs(cfg.url);
    console.log(`  → ${specialMaps[key].size} produtos encontrados.`);
  }

  let urls = await getProductUrlsFromSitemap();
  for (const set of Object.values(specialMaps)) { for (const slug of set) { const full = 'https://www.makimakesoficial.com.br/' + slug; if (!urls.includes(full)) urls.push(full); } }
  if (MAX_PRODUCTS < Infinity) urls = urls.slice(0, MAX_PRODUCTS);

  console.log(`Processando ${urls.length} páginas...`);
  const raw = await runPool(urls, CONCURRENCY, (url) => processProduct(url, specialMaps));
  
  const { internal, public: publicOutput, DATA_PUBLIC } = buildOutputs(raw, SPECIAL_GROUPS);

  const dataDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'catalogo.generated.json'), JSON.stringify(internal, null, 2));
  fs.writeFileSync(path.join(dataDir, 'catalogo.public.json'), JSON.stringify(publicOutput, null, 2));
  
  fs.mkdirSync(path.join(dataDir, 'linhas'), { recursive: true });
  for (const [line, groups] of Object.entries(DATA_PUBLIC)) {
    fs.writeFileSync(path.join(dataDir, 'linhas', `${line}.json`), JSON.stringify({ [line]: groups, WHATSAPP: publicOutput.WHATSAPP, BRAND: publicOutput.BRAND, DESTAQUES: publicOutput.DESTAQUES, BRANDS: publicOutput.BRANDS, META: publicOutput.META }, null, 2));
  }

  console.log('\n✅ Sucesso!');
  console.log('Destaques Lojas R$10:', publicOutput.DESTAQUES.lojas10.items.length);
  console.log('Destaques Ofertas:', publicOutput.DESTAQUES.ofertasLimitadas.items.length);
}

main().catch(console.error);
