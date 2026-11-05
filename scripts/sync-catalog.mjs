/**
 * sync-catalog.mjs — MakiMakes → catalogo.public.json (LIMPO)
 * Correções:
 *  - Paginação por URL (?pageNumber=N) — lê as 4 páginas de Lojas R$10
 *  - publicItem NUNCA contém basePrice nem sourceUrl
 *  - Descrições (notas) e variações preservadas no JSON público
 *  - Copia automática do público para a raiz (catalogo.json)
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
const MAX_GROUP_PAGES = parseInt(process.env.MAX_GROUP_PAGES || '10', 10);

const LINE_MAP = {
  'base': 'rosto', 'corretivo': 'rosto', 'pó': 'rosto', 'po': 'rosto', 'primer': 'rosto',
  'blush': 'rosto', 'contorno': 'rosto', 'iluminador': 'rosto', 'multifuncional': 'rosto',
  'rímel': 'olhos', 'rimel': 'olhos', 'sombra': 'olhos', 'sombras': 'olhos',
  'delineador': 'olhos', 'lápis': 'olhos', 'lapis': 'olhos', 'sobrancelha': 'olhos', 'sobrancelhas': 'olhos',
  'batom': 'labios', 'lip gloss': 'labios', 'lip-gloss': 'labios', 'lip oil': 'labios', 'lip tint': 'labios',
  'hidratante': 'corpo', 'sabonete': 'corpo', 'esfoliante': 'corpo', 'serum': 'rosto', 'protetor solar': 'rosto',
  'capilar': 'cabelo', 'pincel': 'acessorios', 'pinceis': 'acessorios', 'esponja': 'acessorios',
  'cilios': 'acessorios', 'cola': 'acessorios', 'escova': 'acessorios', 'necessaire': 'acessorios',
  'unha': 'acessorios', 'lenço': 'acessorios', 'lenco': 'acessorios'
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
    ...SPECIAL_PRICE_RULES.lojas10
  },
  ofertasLimitadas: {
    url: 'https://www.makimakesoficial.com.br/ofertas-por-tempo-limitado/g',
    title: 'Ofertas por tempo limitado',
    ...SPECIAL_PRICE_RULES.ofertasLimitadas
  },
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function formatPrice(n) { return (Math.round(n * 100) / 100).toFixed(2).replace('.', ','); }
function calcPrices(base) {
  return {
    varejo: formatPrice(base * PRICE_RULES.varejoMarkup),
    atacado: formatPrice(base * PRICE_RULES.atacadoMarkup)
  };
}
function calcSpecialPrices(base, groupKey) {
  const g = SPECIAL_PRICE_RULES[groupKey];
  if (!g) return calcPrices(base);
  return {
    varejo: formatPrice(base * g.varejoMarkup),
    atacado: formatPrice(base * g.atacadoMarkup)
  };
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
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
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

/**
 * Paginação ROBUSTA por URL (?pageNumber=N).
 * O site MakiMakes usa: /lojas-de-10/g?pageNumber=2 ... pageNumber=4
 * Não depende de clique em botão (que falhava e parava na página 1).
 */
async function fetchGroupSlugsWithPuppeteer(groupUrl) {
  const set = new Set();
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    console.log(`  Abrindo vitrine: ${groupUrl}`);

    for (let pageNum = 1; pageNum <= MAX_GROUP_PAGES; pageNum++) {
      const url = pageNum === 1 ? groupUrl : `${groupUrl}${groupUrl.includes('?') ? '&' : '?'}pageNumber=${pageNum}`;
      console.log(`    Lendo página ${pageNum}: ${url}`);

      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
        await sleep(1500);
      } catch (e) {
        console.warn(`    Falha ao abrir página ${pageNum}: ${e.message}`);
        break;
      }

      const links = await page.evaluate(() => {
        return [...new Set(
          Array.from(document.querySelectorAll('a[href$="/p"]'))
            .map(a => a.href)
            .filter(Boolean)
        )];
      });

      if (!links.length) {
        console.log(`    Nenhum produto na página ${pageNum} — fim da paginação.`);
        break;
      }

      let added = 0;
      for (const href of links) {
        let slug = href.replace(/^https?:\/\/www\.makimakesoficial\.com\.br\//, '').replace(/^\//, '');
        if (slug.endsWith('/p') && !set.has(slug)) {
          set.add(slug);
          added++;
        }
      }
      console.log(`    -> +${added} novos | Total acumulado: ${set.size}`);

      // Se a página retornou poucos itens e não adicionou nada novo, para
      if (added === 0) break;
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

async function processProduct(url, page, specialMaps = {}) {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(800);

    const html = await page.content();
    const p = extractJsonLdProduct(html);
    if (!p) return null;

    const name = unescapeHtml((p.name || '').trim());
    const brand = (p.brand?.name || '').trim() || 'Sem marca';
    const image = typeof p.image === 'string'
      ? p.image
      : (Array.isArray(p.image) ? p.image[0] : '') || '';
    const basePrice = parseFloat(p.offers?.price) || 0;
    const availability = (p.offers?.availability || '').includes('InStock') ? 'Sim' : 'Não';
    const category = p.category || '';
    const gtin = p.gtin || p.gtin13 || p.gtin12 || '';

    const lower = (name + ' ' + brand + ' ' + category).toLowerCase();
    // Filtra perfumes (não são o foco do catálogo de maquiagem)
    if (lower.includes('perfume') || lower.includes('eau de') ||
        (lower.includes('body splash') && /lattafa|armaf|alhambra|maison|asda|khamrah/i.test(lower))) {
      return null;
    }
    if (basePrice <= 0) return null;

    const slug = url.replace(/^https?:\/\/www\.makimakesoficial\.com\.br\//, '').replace(/^\//, '');
    let specialKey = null;
    for (const [key, set] of Object.entries(specialMaps)) {
      if (set.has(slug)) { specialKey = key; break; }
    }

    const prices = specialKey
      ? calcSpecialPrices(basePrice, specialKey)
      : calcPrices(basePrice);

    const volume = extractVolume(name);
    const isBox = /\b\d+\s*UN\b/i.test(name) || /\bbox\b/i.test(name) || /\bdisplay\b/i.test(name);
    const badge = specialKey === 'lojas10'
      ? 'LOJAS R$10'
      : (specialKey === 'ofertasLimitadas' ? 'OFERTA' : '');

    // Descrição real do produto (NÃO capturar banner de desconto)
    // No MakiMakes:
    //   .jet-product-summarized-description = resumo bom
    //   .jet-product-description = "Descrição Geral" completa
    //   .description (genérico) = texto promocional "Comprando acima de 12 unidades..." → IGNORAR
    let desc = '';
    const pageMeta = await page.evaluate(() => {
      const isPromo = (t) => {
        if (!t) return true;
        const s = t.toLowerCase();
        return /a cada \d+\s*unidades?|ganhe desconto|compre mais e pague menos|comprando acima de|pode mesclar as fragr|desconto de \d+%|menor pre[cç]o/i.test(s);
      };

      const sum = document.querySelector('.jet-product-summarized-description')?.innerText?.trim() || '';
      let full = document.querySelector('.jet-product-description')?.innerText?.trim() || '';
      // Remove rótulo "Descrição Geral"
      full = full.replace(/^descri[cç][aã]o\s*geral\s*/i, '').trim();

      let desc = '';
      if (sum && !isPromo(sum)) desc = sum;
      if (full && !isPromo(full)) {
        // Prefere texto mais completo; se já tem resumo, concatena sem repetir
        if (!desc) desc = full;
        else if (!desc.includes(full.slice(0, 40)) && !full.includes(desc.slice(0, 40))) {
          desc = (desc + ' ' + full).trim();
        } else if (full.length > desc.length) {
          desc = full;
        }
      }

      // Fallback seguro (nunca .description genérico do MakiMakes — é promo)
      if (!desc) {
        const itemprop = document.querySelector('[itemprop="description"]')?.innerText?.trim() || '';
        if (itemprop && !isPromo(itemprop) && itemprop.length > 40) desc = itemprop;
      }

      desc = desc.replace(/\s+/g, ' ').trim().slice(0, 1200);

      // Variações: fragrâncias MakiMakes (.grouping-text dentro de .jet-product-grouping)
      const vars = [];
      document.querySelectorAll('.jet-product-grouping .grouping-text, .grouping-text').forEach(el => {
        const nome = (el.textContent || '').trim();
        if (!nome || nome.length > 40) return;
        if (/fragr[aâ]ncias? dispon[ií]veis|hidrata/i.test(nome)) return;
        const link = el.closest('a')?.getAttribute('href') || '';
        vars.push({ id: nome, nome, href: link, estoque: 10 });
      });

      document.querySelectorAll('select').forEach(sel => {
        const n = (sel.name || sel.id || '').toLowerCase();
        if (/tamanho|cor|tom|variacao|opcao|sku|fragran/i.test(n)) {
          sel.querySelectorAll('option').forEach(opt => {
            if (opt.value && !/selecione|escolha/i.test(opt.textContent || '')) {
              vars.push({ id: opt.value, nome: (opt.textContent || '').trim(), estoque: 10 });
            }
          });
        }
      });

      const unique = [];
      const seen = new Set();
      for (const v of vars) {
        const key = (v.nome || '').toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        unique.push({ id: v.id || v.nome, nome: v.nome, estoque: v.estoque ?? 10 });
      }
      return { desc, variacoes: unique.slice(0, 24) };
    });

    desc = pageMeta.desc || '';
    // Último recurso: JSON-LD (só se não for promo nem só o nome)
    if (!desc) {
      const ld = unescapeHtml((p.description || '').trim());
      const promoLd = /a cada \d+|ganhe desconto|compre mais e pague menos|comprando acima de/i.test(ld);
      if (ld && !promoLd && ld.toLowerCase() !== name.toLowerCase() && ld.length > 30) {
        desc = ld.replace(/Atacado/gi, '').replace(/Varejo/gi, '').replace(/\s+/g, ' ').trim();
      }
    }
    // Sanitização final no Node
    if (/a cada \d+\s*unidades?|ganhe desconto|compre mais e pague menos|comprando acima de/i.test(desc)) {
      desc = '';
    }
    const variacoes = pageMeta.variacoes || [];

    const line = mapLine(category, name);
    const baseItem = {
      nome: name,
      volume,
      varejo: isBox ? null : prices.varejo,
      atacado: prices.atacado,
      disponivel: availability,
      notas: desc,
      foto: image,
      fotos: image ? [image] : [],
      badge,
      gtin: gtin || undefined,
      somenteAtacado: !!isBox,
      destaque: specialKey || null,
      variacoes: variacoes.length > 0 ? variacoes : undefined
    };

    return {
      line,
      cat: category || line,
      brand,
      specialKey,
      // INTERNO: com custo e origem
      internalItem: {
        ...baseItem,
        sourceUrl: url,
        basePrice: formatPrice(basePrice)
      },
      // PÚBLICO: sem custo e sem origem
      publicItem: { ...baseItem }
    };
  } catch (e) {
    return null;
  }
}

function buildOutputs(raw, specialGroups) {
  const groupsByLine = {};
  const brandsSet = new Set();
  const destaquesInternal = { lojas10: [], ofertasLimitadas: [] };
  const destaquesPublic = { lojas10: [], ofertasLimitadas: [] };

  for (const r of raw) {
    brandsSet.add(r.brand);
    if (!groupsByLine[r.line]) groupsByLine[r.line] = {};
    const key = `${r.brand}||${r.cat}`;
    if (!groupsByLine[r.line][key]) {
      groupsByLine[r.line][key] = { cat: r.cat, brand: r.brand, items: [], publicItems: [] };
    }
    groupsByLine[r.line][key].items.push(r.internalItem);
    groupsByLine[r.line][key].publicItems.push(r.publicItem);

    if (r.specialKey && destaquesInternal[r.specialKey]) {
      destaquesInternal[r.specialKey].push({
        ...r.internalItem,
        brand: r.brand,
        cat: r.cat,
        line: r.line
      });
      destaquesPublic[r.specialKey].push({
        ...r.publicItem,
        brand: r.brand,
        cat: r.cat,
        line: r.line
      });
    }
  }

  const DATA_INTERNAL = {};
  const DATA_PUBLIC = {};
  for (const [line, groups] of Object.entries(groupsByLine)) {
    DATA_INTERNAL[line] = Object.values(groups)
      .map(g => ({ cat: g.cat, brand: g.brand, items: g.items }))
      .sort((a, b) => a.brand.localeCompare(b.brand));
    DATA_PUBLIC[line] = Object.values(groups)
      .map(g => ({ cat: g.cat, brand: g.brand, items: g.publicItems }))
      .sort((a, b) => a.brand.localeCompare(b.brand));
  }

  const DESTAQUES_INTERNAL = {};
  const DESTAQUES_PUBLIC = {};
  for (const [k, cfg] of Object.entries(specialGroups)) {
    DESTAQUES_INTERNAL[k] = { title: cfg.title, items: destaquesInternal[k] || [] };
    DESTAQUES_PUBLIC[k] = { title: cfg.title, items: destaquesPublic[k] || [] };
  }

  const metaCommon = {
    updated_at: new Date().toISOString(),
    source: 'makimakes',
    total_products: raw.length,
    version: 4
  };
  const BRAND = {
    name: process.env.BRAND_NAME || 'Empório A.R. Beauty',
    phone: '(62) 99113-4488',
    tagline: 'Maquiagem e Cosméticos — Varejo e Atacado'
  };
  const WHATSAPP = process.env.WHATSAPP || '5562991134488';

  return {
    internal: {
      DATA: DATA_INTERNAL,
      DESTAQUES: DESTAQUES_INTERNAL,
      BRANDS: [...brandsSet].sort(),
      WHATSAPP,
      BRAND,
      META: { ...metaCommon, price_rules: { ...PRICE_RULES, especiais: SPECIAL_PRICE_RULES } }
    },
    public: {
      DATA: DATA_PUBLIC,
      DESTAQUES: DESTAQUES_PUBLIC,
      BRANDS: [...brandsSet].sort(),
      WHATSAPP,
      BRAND,
      META: metaCommon
    }
  };
}

async function main() {
  console.log('=== Sync Catálogo v4 (paginação URL + JSON público limpo) ===');

  // 1. Vitrines com paginação completa
  const specialMaps = {};
  for (const [key, cfg] of Object.entries(SPECIAL_GROUPS)) {
    console.log('\nBuscando vitrine:', cfg.title);
    specialMaps[key] = await fetchGroupSlugsWithPuppeteer(cfg.url);
    console.log(`  ✅ Total final da vitrine: ${specialMaps[key].size} produtos.`);
  }

  // 2. Sitemap (catálogo geral)
  let urls = await getProductUrlsFromSitemap();
  for (const set of Object.values(specialMaps)) {
    for (const slug of set) {
      const full = 'https://www.makimakesoficial.com.br/' + slug;
      if (!urls.includes(full)) urls.push(full);
    }
  }
  if (MAX_PRODUCTS < Infinity) urls = urls.slice(0, MAX_PRODUCTS);

  // 3. Processa produtos
  console.log(`\nProcessando ${urls.length} produtos...`);
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const pages = await Promise.all(
    Array.from({ length: CONCURRENCY }, () => browser.newPage())
  );
  for (const p of pages) {
    await p.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  }

  const results = [];
  let idx = 0;

  async function worker(page) {
    while (idx < urls.length) {
      const i = idx++;
      const r = await processProduct(urls[i], page, specialMaps);
      if (r) results.push(r);
      if ((i + 1) % 50 === 0) console.log(`  ... ${i + 1}/${urls.length}`);
      await sleep(DELAY_MS);
    }
  }

  await Promise.all(pages.map(p => worker(p)));
  await browser.close();

  // 4. Gera saídas
  const { internal, public: publicOutput } = buildOutputs(results, SPECIAL_GROUPS);

  const dataDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  // Interno (NÃO publicar)
  fs.writeFileSync(
    path.join(dataDir, 'catalogo.generated.json'),
    JSON.stringify(internal, null, 2)
  );

  // Público limpo
  const publicPath = path.join(dataDir, 'catalogo.public.json');
  fs.writeFileSync(publicPath, JSON.stringify(publicOutput, null, 2));

  // Copia o PÚBLICO para a raiz (é o que o Netlify serve em /catalogo.json)
  const rootPublic = path.join(__dirname, '..', 'catalogo.json');
  fs.writeFileSync(rootPublic, JSON.stringify(publicOutput, null, 2));

  console.log('\n--- Resultado ---');
  console.log('Destaques Lojas R$10:', publicOutput.DESTAQUES.lojas10?.items?.length || 0);
  console.log('Destaques Ofertas:', publicOutput.DESTAQUES.ofertasLimitadas?.items?.length || 0);
  console.log('Total produtos processados:', results.length);
  console.log('Arquivos gerados:');
  console.log('  data/catalogo.generated.json  (INTERNO — não publicar)');
  console.log('  data/catalogo.public.json     (público limpo)');
  console.log('  catalogo.json                 (cópia pública na raiz)');

  // Validação rápida: nenhum basePrice/sourceUrl no público
  const publicStr = JSON.stringify(publicOutput);
  if (publicStr.includes('"basePrice"') || publicStr.includes('"sourceUrl"')) {
    console.error('❌ ERRO: JSON público ainda contém campos sensíveis!');
    process.exit(1);
  }
  console.log('✅ JSON público validado: sem basePrice / sourceUrl');

  // 5. Atualiza Gist (se credenciais existirem)
  const gistId = process.env.GIST_ID;
  const gistToken = process.env.GIST_TOKEN;
  if (gistId && gistToken) {
    console.log('\n🚀 Enviando atualização para o Gist...');
    try {
      const res = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${gistToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'EmpórioAR-Beauty-Action'
        },
        body: JSON.stringify({
          files: {
            'catalogo.json': { content: JSON.stringify(publicOutput, null, 2) }
          }
        })
      });
      if (!res.ok) throw new Error(await res.text());
      console.log('🎉 Gist atualizado com sucesso!');
    } catch (err) {
      console.error('❌ Erro ao atualizar o Gist:', err.message);
    }
  } else {
    console.log('\n(Gist não atualizado — defina GIST_ID e GIST_TOKEN para publicar)');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
