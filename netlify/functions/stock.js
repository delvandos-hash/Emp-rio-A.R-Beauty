/**
 * Proxy de estoque ao vivo — allowlist de host.
 * Aceita:
 *   ?url=https://www.makimakesoficial.com.br/produto/p
 *   ?path=produto/p
 * ESM (package.json type: module)
 */
const ALLOWED_HOST = 'www.makimakesoficial.com.br';

function normalizePath(path) {
  let p = String(path || '').trim();
  p = p.replace(/^https?:\/\/(www\.)?makimakesoficial\.com\.br\//i, '');
  p = p.replace(/^\//, '').split('?')[0].split('#')[0];
  p = p.replace(/\/+$/, '');
  if (!p.endsWith('/p')) {
    if (p.endsWith('/p/')) p = p.slice(0, -1);
  }
  return p;
}

export async function handler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=60'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  const qs = event.queryStringParameters || {};
  let url = qs.url || '';
  const pathParam = qs.path || qs.slug || '';

  try {
    if (!url && pathParam) {
      const path = normalizePath(pathParam);
      if (!path.endsWith('/p')) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'path inválido (esperado .../p)' }) };
      }
      url = 'https://' + ALLOWED_HOST + '/' + path;
    }

    const u = new URL(url);
    if (u.hostname !== ALLOWED_HOST && u.hostname !== 'makimakesoficial.com.br') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'host não permitido' }) };
    }
    const path = normalizePath(u.pathname);
    if (!path.endsWith('/p')) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'path inválido' }) };
    }
    url = 'https://' + ALLOWED_HOST + '/' + path;
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'URL inválida' }) };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EmporioARBeauty/1.1; +https://emporioar-beauty.netlify.app)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9'
      }
    });
    clearTimeout(timer);
    if (!res.ok) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ disponivel: null, source: 'http-error', status: res.status })
      };
    }
    const html = (await res.text()).slice(0, 600000);

    let disponivel = null;
    const m = html.match(/"availability"\s*:\s*"(https:\/\/schema\.org\/[^"]+)"/i);
    if (m) {
      disponivel = /InStock/i.test(m[1]) ? 'Sim' : 'Não';
    } else if (/itemprop=["']availability["'][^>]*content=["'][^"']*OutOfStock/i.test(html)) {
      disponivel = 'Não';
    } else if (/itemprop=["']availability["'][^>]*content=["'][^"']*InStock/i.test(html)) {
      disponivel = 'Sim';
    } else if (/esgotado|indispon[ií]vel/i.test(html) && !/adicionar ao carrinho/i.test(html)) {
      disponivel = 'Não';
    } else if (/adicionar ao carrinho|em estoque/i.test(html)) {
      disponivel = 'Sim';
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ disponivel, source: 'live', url })
    };
  } catch (e) {
    clearTimeout(timer);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ disponivel: null, source: 'error', message: String(e.message || e) })
    };
  }
}
