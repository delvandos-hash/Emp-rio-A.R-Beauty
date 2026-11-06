export function parsePrice(str) {
  if (str == null || str === '') return 0;
  const s = String(str).trim().replace(/\s/g, '');
  if (s.includes(',')) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return parseFloat(s) || 0;
}

export function formatPriceBR(n) {
  return Number(n).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function validateProductPrices(item) {
  const v = parsePrice(item.varejo);
  const a = parsePrice(item.atacado);
  if (v <= 0) return { ok: false, reason: 'varejo inválido' };
  if (a <= 0) return { ok: false, reason: 'atacado inválido' };
  if (a > v) return { ok: false, reason: 'atacado maior que varejo' };
  return { ok: true };
}
