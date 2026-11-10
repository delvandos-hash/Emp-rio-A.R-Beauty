/**
 * Loader de teste (branch test/variacao-multifoto)
 * Monta o app completo a partir de partes base64 no repo.
 */
const PARTS = 11;

async function loadApp() {
  const pieces = [];
  for (let i = 0; i < PARTS; i++) {
    const n = String(i).padStart(2, '0');
    const res = await fetch('/js/app-parts/part' + n + '.b64', { cache: 'no-store' });
    if (!res.ok) throw new Error('Falha parte ' + n);
    pieces.push(await res.text());
  }
  const b64 = pieces.join('').replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  let src = new TextDecoder().decode(bytes);
  src = src.replace(/from\s+['"]\.\/prices\.js['"]/, "from '/js/prices.js'");
  const blob = new Blob([src], { type: 'text/javascript' });
  await import(URL.createObjectURL(blob));
}

loadApp().catch((e) => {
  console.error(e);
  const el = document.getElementById('bootStatus');
  if (el) {
    el.style.display = 'block';
    el.innerHTML = '<p style="padding:1rem;color:#b91c1c">Erro ao carregar app de teste. ' + (e && e.message) + '</p>';
  }
});
