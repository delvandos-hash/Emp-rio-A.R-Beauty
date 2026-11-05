/**
 * Feed Google Merchant — /feed.xml
 *
 * Requer env vars no Netlify:
 *   GIST_CATALOG_URL  → URL raw do catalogo.public.json no Gist
 *   SITE_URL          → https://emporioar-beauty.netlify.app
 *
 * Sem GIST_CATALOG_URL, retorna 501 (não publica feed vazio enganoso).
 */
const GIST_URL = process.env.GIST_CATALOG_URL;
const SITE_URL = process.env.SITE_URL || 'https://emporioar-beauty.netlify.app';

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

exports.handler = async () => {
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
          const id = `${normId(g.brand)}-${normId(it.nome)}-${normId(it.volume)}`;
          const price = it.somenteAtacado ? it.atacado : (it.varejo || it.atacado);
          const link = `${SITE_URL}/?produto=${encodeURIComponent(id)}`;
          items.push(`<item>
  <g:id>${esc(id)}</g:id>
  <g:title>${esc(it.nome)}</g:title>
  <g:description>${esc((it.notas || it.nome).slice(0, 5000))}</g:description>
  <g:link>${esc(link)}</g:link>
  <g:image_link>${esc(it.foto || '')}</g:image_link>
  <g:price>${esc(price)} BRL</g:price>
  <g:availability>${(it.disponivel || '').toLowerCase() === 'sim' ? 'in_stock' : 'out_of_stock'}</g:availability>
  <g:brand>${esc(g.brand || '')}</g:brand>
  <g:condition>new</g:condition>
</item>`);
        }
      }
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${esc(BRAND.name || 'Empório A.R. Beauty')}</title>
    <link>${esc(SITE_URL)}/</link>
    <description>Catálogo de maquiagem e cosméticos</description>
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
};
