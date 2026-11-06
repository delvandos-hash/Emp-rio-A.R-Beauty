/**
 * Feed Google Merchant Center — /feed.xml
 * ESM + esbuild (netlify.toml)
 *
 * Env opcional:
 *   GIST_CATALOG_URL — default: Gist público do catálogo
 *   SITE_URL — default: https://emporioar-beauty.netlify.app
 */
const GIST_URL =
  process.env.GIST_CATALOG_URL ||
  'https://gist.githubusercontent.com/delvandos-hash/081d1d5efa2e2003cf859964a650dfb5/raw/catalogo.json';
const SITE_URL = (process.env.SITE_URL || 'https://emporioar-beauty.netlify.app').replace(/\/$/, '');

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normId(s = '') {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function priceMerchant(str) {
  if (str == null || str === '') return '';
  const s = String(str).trim().replace(/\s/g, '');
  let n;
  if (s.includes(',')) n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  else n = parseFloat(s);
  if (!n || n <= 0) return '';
  return n.toFixed(2);
}

function collectItems(j) {
  const out = [];
  const DATA = j.DATA || {};
  for (const groups of Object.values(DATA)) {
    for (const g of groups || []) {
      for (const it of g.items || []) {
        out.push({ it, brand: g.brand || '', cat: g.cat || '' });
      }
    }
  }
  // Inclui destaques que por algum motivo não estejam no DATA
  for (const key of ['lojas10', 'ofertasLimitadas']) {
    for (const it of j.DESTAQUES?.[key]?.items || []) {
      out.push({ it, brand: it.brand || '', cat: it.cat || '' });
    }
  }
  return out;
}

export async function handler() {
  try {
    const res = await fetch(GIST_URL, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) throw new Error('catalogo HTTP ' + res.status);
    const j = await res.json();
    const BRAND = j.BRAND || {};
    const seen = new Set();
    const items = [];

    for (const { it, brand, cat } of collectItems(j)) {
      const id = `${normId(brand || it.brand)}-${normId(it.nome)}-${normId(it.volume || '')}`.slice(0, 50);
      if (!id || seen.has(id)) continue;
      seen.add(id);

      const rawPrice = it.somenteAtacado ? it.atacado : (it.varejo || it.atacado);
      const price = priceMerchant(rawPrice);
      if (!price) continue;

      const link = `${SITE_URL}/?produto=${encodeURIComponent(id)}`;
      const availability = (it.disponivel || '').toLowerCase() === 'sim' ? 'in_stock' : 'out_of_stock';
      const title = (it.nome || '').slice(0, 150);
      const description = (it.notas || it.nome || '').slice(0, 5000);
      const image = it.foto || (Array.isArray(it.fotos) && it.fotos[0]) || '';
      const gtin = String(it.gtin || '').replace(/\D/g, '');

      let extra = '';
      if (gtin.length >= 8) extra += `\n  <g:gtin>${esc(gtin)}</g:gtin>`;
      else extra += `\n  <g:identifier_exists>false</g:identifier_exists>`;

      items.push(`<item>
  <g:id>${esc(id)}</g:id>
  <g:title>${esc(title)}</g:title>
  <g:description>${esc(description)}</g:description>
  <g:link>${esc(link)}</g:link>
  <g:image_link>${esc(image)}</g:image_link>
  <g:price>${price} BRL</g:price>
  <g:availability>${availability}</g:availability>
  <g:brand>${esc(brand || it.brand || 'Genérico')}</g:brand>
  <g:condition>new</g:condition>
  <g:product_type>${esc(cat || it.cat || 'Maquiagem')}</g:product_type>${extra}
</item>`);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${esc(BRAND.name || 'Empório A.R. Beauty')}</title>
    <link>${esc(SITE_URL)}/</link>
    <description>Catálogo de maquiagem e cosméticos — varejo e atacado</description>
${items.join('\n')}
  </channel>
</rss>`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
      body: xml,
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: 'Erro ao gerar feed: ' + (e.message || e),
    };
  }
}
