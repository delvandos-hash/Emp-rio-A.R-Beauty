/**
 * Feed Google Merchant Center — /feed.xml
 *
 * Env vars no Netlify:
 *   GIST_CATALOG_URL  → URL raw do catalogo.json público (Gist)
 *   SITE_URL          → https://emporioar-beauty.netlify.app
 *
 * Formato alinhado ao Google Merchant (preço com ponto decimal).
 * ESM (package.json type: module)
 */
const GIST_URL = process.env.GIST_CATALOG_URL;
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

/** Converte "237,60" ou "1.234,56" → "237.60" (exigido pelo Merchant) */
function priceMerchant(str) {
  if (str == null || str === '') return '';
  const s = String(str).trim().replace(/\s/g, '');
  let n;
  if (s.includes(',')) {
    n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  } else {
    n = parseFloat(s);
  }
  if (!n || n <= 0) return '';
  return n.toFixed(2);
}

export async function handler() {
  if (!GIST_URL) {
    return {
      statusCode: 501,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: 'Feed não configurado: variável GIST_CATALOG_URL ausente.',
    };
  }
  try {
    const res = await fetch(GIST_URL, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) throw new Error('gist ' + res.status);
    const j = await res.json();
    const DATA = j.DATA || {};
    const BRAND = j.BRAND || {};

    const items = [];
    for (const groups of Object.values(DATA)) {
      for (const g of groups || []) {
        for (const it of g.items || []) {
          const id = `${normId(g.brand)}-${normId(it.nome)}-${normId(it.volume || '')}`;
          const rawPrice = it.somenteAtacado ? it.atacado : (it.varejo || it.atacado);
          const price = priceMerchant(rawPrice);
          if (!price) continue;

          const link = `${SITE_URL}/?produto=${encodeURIComponent(id)}`;
          const availability = (it.disponivel || '').toLowerCase() === 'sim' ? 'in_stock' : 'out_of_stock';
          const title = (it.nome || '').slice(0, 150);
          const description = (it.notas || it.nome || '').slice(0, 5000);
          const image = it.foto || (Array.isArray(it.fotos) && it.fotos[0]) || '';
          const gtin = (it.gtin || '').replace(/\D/g, '');

          let extra = '';
          if (gtin && gtin.length >= 8) {
            extra += `\n  <g:gtin>${esc(gtin)}</g:gtin>`;
          } else {
            extra += `\n  <g:identifier_exists>false</g:identifier_exists>`;
          }

          items.push(`<item>
  <g:id>${esc(id.slice(0, 50))}</g:id>
  <g:title>${esc(title)}</g:title>
  <g:description>${esc(description)}</g:description>
  <g:link>${esc(link)}</g:link>
  <g:image_link>${esc(image)}</g:image_link>
  <g:price>${price} BRL</g:price>
  <g:availability>${availability}</g:availability>
  <g:brand>${esc(g.brand || 'Genérico')}</g:brand>
  <g:condition>new</g:condition>
  <g:product_type>${esc(g.cat || 'Maquiagem')}</g:product_type>${extra}
</item>`);
        }
      }
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
