/**
 * Proxy de estoque ao vivo — allowlist de host.
 * Mantido como estava. Sem alterações funcionais.
 */
const ALLOWED_HOST = 'www.makimakesoficial.com.br';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=120'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  let url = event.queryStringParameters?.url || '';
  try {
    const u = new URL(url);
    if (u.hostname !== ALLOWED_HOST) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'host não permitido' }) };
    }
    if (!u.pathname.endsWith('/p')) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'path inválido' }) };
    }
    url = u.toString();
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'URL inválida' }) };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EmpórioARBeauty/1.0)',
        'Accept': 'text/html'
      }
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { statusCode: 200, headers, body: JSON.stringify({ disponivel: null, source: 'http-error', status: res.status }) };
    }
    const html = (await res.text()).slice(0, 500000);

    let disponivel = null;
    const m = html.match(/"availability"\s*:\s*"(https:\/\/schema\.org\/[^"]+)"/);
    if (m) {
      disponivel = m[1].includes('InStock') ? 'Sim' : 'Não';
    } else if (/esgotado|indispon[ií]vel/i.test(html)) {
      disponivel = 'Não';
    } else if (/adicionar ao carrinho|em estoque/i.test(html)) {
      disponivel = 'Sim';
    }

    return { statusCode: 200, headers, body: JSON.stringify({ disponivel, source: 'live' }) };
  } catch (e) {
    clearTimeout(timer);
    return { statusCode: 200, headers, body: JSON.stringify({ disponivel: null, source: 'error', message: String(e.message || e) }) };
  }
};
