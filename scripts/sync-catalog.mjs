/**
 * sync-catalog.mjs — MakiMakes → catalogo.public.json
 * Usando Puppeteer para contornar JavaScript do site.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SITEMAP_URL = 'https://www.makimakesoficial.com.br/sitemap.xml';
const MAX_PRODUCTS = parseInt(process.env.MAX_PRODUCTS || '0', 10) || Infinity;
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '2', 10);
const DELAY_MS = parseInt(process.env.DELAY_MS || '500', 10);

const LINE_MAP = {
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
  lojas10: { url: 'https://www.makimakesoficial.com.br/lojas-de-10/g', title: 'Lojas de R$10,00', ...SPECIAL_PRICE_RULES.lojas10 },
  ofertasLimitadas: { url: 'https://www.makimakesoficial.com.br/ofertas-por-tempo-limitado/g', title: 'Ofertas por tempo limitado', ...SPECIAL_PRICE_RULES.ofertasLimitadas },
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
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
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function unescapeHtml(s) { if (!s) return ''; return String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))); }

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

// --- PAGINAÇÃO INTELIGENTE COM PUPPETEER ---
async function fetchGroupSlugsWithPuppeteer(groupUrl) {
  const set = new Set();
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  try {
    console.log(`  Abrindo vitrine: ${groupUrl}`);
    await page.goto(groupUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    
    let hasNextPage = true;
    let pageNum = 1;
    
    while (hasNextPage && pageNum <= 10) {
      console.log(`    Lendo página ${pageNum}...`);
      
      // Extrai os links dos produtos da tela atual
      const links = await page.evaluate(() => {
        const arr = [];
        document.querySelectorAll('a[href$="/p"]').forEach(a => arr.push(a.href));
        return arr;
      });
      
      let countBefore = set.size;
      links.forEach(url => {
        let slug = url.replace(/^https?:\/\/www\.makimakesoficial\.com\.br\//, '').replace(/^\//, '');
        if (slug.endsWith('/p')) set.add(slug);
      });
      
      console.log(`    -> Total acumulado: ${set.size} produtos.`);
      
      // Se não encontrou produtos novos, para.
      if (set.size === countBefore && pageNum > 1) break;

      // Tenta achar o botão de "Próxima Página" ou "Carregar mais"
      const clickedNext = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('a, button'));
        const nextBtn = elements.find(el => {
          const txt = (el.textContent || '').toLowerCase().trim();
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          return txt === 'próximo' || txt === 'próxima' || txt === '>' || txt === '»' || txt.includes('carregar mais') || aria.includes('próxima') || aria.includes('next');
        });
        
        if (nextBtn && !nextBtn.disabled && !nextBtn.classList.contains('disabled')) {
          nextBtn.click();
          return true;
        }
        return false;
      });
      
      if (clickedNext) {
        console.log(`    Clicou em "Próxima". Aguardando carregar...`);
        await sleep(3000); // Espera a página carregar os novos itens
        pageNum++;
      } else {
        console.log(`    Fim da paginação (botão próximo não encontrado ou desabilitado).`);
        hasNextPage = false;
      }
    }
  } catch (e) {
    console.warn(`  Erro ao paginar vitrine: ${e.message}`);
  } finally {
    await browser.close();
  }
  
  return set;
}

async function getProductUrlsFromSitemap() {
  const xml = await fetchText(SITEMAP_URL);
  return [...xml.matchAll(/<loc>(https:\/\/www\.makimakesoficial\.com\.br\/[^<]+\/p)<\/loc>/g)].map(m => m[1]);
}

// --- SCRAPER DE PRODUTO COM PUPPETEER ---
async function processProduct(url, page, specialMaps = {}) {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(1000);

    const html = await page.content();
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

    let desc = (p.description && p.description !== name) ? unescapeHtml(p.description).trim() : '';
    desc = desc.replace(/Atacado/gi, '').replace(/Varejo/gi, '').replace(/\s+/g, ' ').trim();
    if (desc.toLowerCase() === name.toLowerCase()) desc = '';

    // Extrai variações via Puppeteer (só se a página tiver botões de opção)
    const variacoes = await page.evaluate(() => {
      const vars = [];
      document.querySelectorAll('select').forEach(sel => {
        const name = sel.name.toLowerCase();
        if (name.includes('tamanho') || name.includes('cor') || name.includes('tom') || name.includes('variacao')) {
          sel.querySelectorAll('option').forEach(opt => {
            if (opt.value && !opt.text.toLowerCase().includes('selecione')) {
              vars.push({ id: opt.value, nome: opt.text.trim(), estoque: 10 });
            }
          });
        }
      });
      document.querySelectorAll('button[data-variant], button[data-option], .swatch-element').forEach(btn => {
        const nome = btn.getAttribute('data-variant') || btn.getAttribute('data-option') || btn.textContent.trim();
        if (nome && nome.length < 30) vars.push({ id: nome, nome: nome, estoque: 10 });
      });
      const unique = [];
      const map = new Set();
      for (const v of vars) {
        if (!map.has(v.nome)) { map.add(v.nome); unique.push(v); }
      }
      return unique.slice(0, 20);
    });

    const baseItem = {
      nome: name, volume: volume, varejo: isBox ? null : prices.varejo, atacado: prices.atacado,
      disponivel: availability, notas: desc,
      foto: image, fotos: image ? [image] : [], badge, gtin, somenteAtacado: isBox, destaque: specialKey || null,
      variacoes: variacoes.length > 0 ? variacoes : undefined
    };

    return {
      line, cat: category || line, brand, specialKey,
      internalItem: { ...baseItem, sourceUrl: url, basePrice: formatPrice(basePrice) },
      publicItem: baseItem
    };
  } catch (e) { 
    return null; 
  }
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
  console.log('=== Sync Catálogo (Puppeteer) ===');
  
  // 1. Puxa vitrines de forma inteligente
  const specialMaps = {};
  for (const [key, cfg] of Object.entries(SPECIAL_GROUPS)) {
    console.log('Buscando vitrine:', cfg.title);
    specialMaps[key] = await fetchGroupSlugsWithPuppeteer(cfg.url);
    console.log(`  ✅ Total final da vitrine: ${specialMaps[key].size} produtos.`);
  }

  // 2. Puxa sitemap (produtos normais)
  let urls = await getProductUrlsFromSitemap();
  for (const set of Object.values(specialMaps)) { for (const slug of set) { const full = 'https://www.makimakesoficial.com.br/' + slug; if (!urls.includes(full)) urls.push(full); } }
  if (MAX_PRODUCTS < Infinity) urls = urls.slice(0, MAX_PRODUCTS);

  // 3. Processa cada produto
  console.log(`\nProcessando ${urls.length} produtos...`);
  const browser = await puppeteer.launch({ headless: 'new' });
  const pages = await Promise.all(Array.from({ length: CONCURRENCY }, () => browser.newPage()));
  const results = [];
  
  let idx = 0;
  async function worker(page) {
    while (idx < urls.length) {
      const i = idx++;
      const r = await processProduct(urls[i], page, specialMaps);
      if (r) results.push(r);
      await sleep(DELAY_MS);
    }
  }
  
  await Promise.all(pages.map(p => worker(p)));
  await browser.close();

  // 4. Salva os dados
  const { internal, public: publicOutput, DATA_PUBLIC } = buildOutputs(results, SPECIAL_GROUPS);

  const dataDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'catalogo.generated.json'), JSON.stringify(internal, null, 2));
  const publicPath = path.join(dataDir, 'catalogo.public.json');
  fs.writeFileSync(publicPath, JSON.stringify(publicOutput, null, 2));
  
  console.log('Destaques Lojas R$10:', publicOutput.DESTAQUES.lojas10.items.length);
  console.log('Destaques Ofertas:', publicOutput.DESTAQUES.ofertasLimitadas.items.length);

  // 5. Envio para o Gist
  const gistId = process.env.GIST_ID;
  const gistToken = process.env.GIST_TOKEN;
  if (gistId && gistToken) {
    console.log('\n🚀 Enviando atualização para o Gist...');
    try {
      const res = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${gistToken}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'EmpórioAR-Beauty-Action' },
        body: JSON.stringify({ files: { 'catalogo.json': { content: JSON.stringify(publicOutput, null, 2) } } })
      });
      if (!res.ok) throw new Error(await res.text());
      console.log('🎉 Gist atualizado com sucesso!');
    } catch (err) {
      console.error('❌ Erro ao atualizar o Gist:', err.message);
    }
  }
}

main().catch(console.error);
