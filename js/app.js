/**
 * Loader teste multifoto — 3 partes zlib+base64
 * branch: test/variacao-multifoto
 */
async function loadApp() {
  const parts = ['c0', 'c1', 'c2'];
  const pieces = [];
  for (const p of parts) {
    const res = await fetch('/js/app-parts/' + p + '.b64', { cache: 'no-store' });
    if (!res.ok) throw new Error('Falha ' + p);
    pieces.push(await res.text());
  }
  const b64 = pieces.join('').replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const ab = await new Response(stream).arrayBuffer();
  let src = new TextDecoder().decode(ab);
  src = src.replace(/from\s+['"]\.\/prices\.js['"]/, "from '/js/prices.js'");
  await import(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
}
loadApp().catch((e) => {
  console.error(e);
  const el = document.getElementById('bootStatus');
  if (el) {
    el.style.display = 'block';
    el.innerHTML = '<p style="padding:1rem;color:#b91c1c">Erro app teste: ' + (e && e.message) + '</p>';
  }
});
