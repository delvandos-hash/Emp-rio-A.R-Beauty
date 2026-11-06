/**
 * Proxy CEP — evita bloqueio CSP/CORS no browser.
 * GET /.netlify/functions/cep?cep=74350750
 */
export async function handler(event) {
  try {
    const raw = event.queryStringParameters?.cep || '';
    const cep = String(raw).replace(/\D/g, '');
    if (cep.length !== 8) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ erro: true, message: 'CEP deve ter 8 dígitos' }),
      };
    }

    // 1) ViaCEP
    try {
      const r = await fetch('https://viacep.com.br/ws/' + cep + '/json/', {
        headers: { Accept: 'application/json' },
      });
      if (r.ok) {
        const data = await r.json();
        if (!data.erro) {
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'public, max-age=86400',
            },
            body: JSON.stringify({
              cep: data.cep || cep,
              localidade: data.localidade || '',
              uf: data.uf || '',
              bairro: data.bairro || '',
              logradouro: data.logradouro || '',
              source: 'viacep',
            }),
          };
        }
      }
    } catch (_) {}

    // 2) BrasilAPI (fallback)
    try {
      const r2 = await fetch('https://brasilapi.com.br/api/cep/v1/' + cep, {
        headers: { Accept: 'application/json' },
      });
      if (r2.ok) {
        const data = await r2.json();
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=86400',
          },
          body: JSON.stringify({
            cep: data.cep || cep,
            localidade: data.city || data.localidade || '',
            uf: data.state || data.uf || '',
            bairro: data.neighborhood || data.bairro || '',
            logradouro: data.street || data.logradouro || '',
            source: 'brasilapi',
          }),
        };
      }
    } catch (_) {}

    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ erro: true, message: 'CEP não encontrado' }),
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ erro: true, message: String(e.message || e) }),
    };
  }
}
