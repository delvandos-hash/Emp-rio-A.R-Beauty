/**
 * Loader de teste — app multifoto (zlib+base64)
 * branch: test/variacao-multifoto-v2
 * Após validar, fazer merge para main com o app.js expandido.
 */
async function loadApp() {
  const res = await fetch('/js/app.compressed.b64', { cache: 'no-store' });
  if (!res.ok) throw new Error('Falha ao carregar app.compressed.b64: ' + res.status);
  const b64 = (await res.text()).replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const ab = await new Response(stream).arrayBuffer();
  let src = new TextDecoder().decode(ab);
  src = src.replace(/from\s+['"]\.\/prices\.js['"]/, "from '/js/prices.js'");
  const blob = new Blob([src], { type: 'text/javascript' });
  await import(URL.createObjectURL(blob));
}
loadApp().catch((e) => {
  console.error('[multifoto]', e);
  const el = document.getElementById('bootStatus');
  if (el) {
    el.style.display = 'block';
    el.innerHTML = '<p style="padding:1rem;color:#b91c1c">Erro no app de teste (multifoto): ' + (e && e.message) + '</p>';
  }
});
