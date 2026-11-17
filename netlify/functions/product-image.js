/**
 * Proxy de imagens — Beauty
 * Só permite CDN allowlist (makimakes.jetassets.com.br).
 * Uso: /api/product-image?source=m&path=/produto/arquivo.png
 */
const ALLOWED = {
  m: {
    host: "makimakes.jetassets.com.br",
    // path must start with /produto/
  },
};

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);
const MAX_BYTES = 8 * 1024 * 1024;

function normalizePath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "";
  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return "";
  }
  if (
    decoded.includes("..") ||
    decoded.includes("\\") ||
    decoded.includes("?") ||
    decoded.includes("#") ||
    decoded.length > 1024
  ) {
    return "";
  }
  if (!decoded.startsWith("/produto/")) return "";
  return decoded;
}

async function readBodyLimited(response, maxBytes) {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  if (!size) return null;
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function handler(event) {
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": "no-store",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }

  try {
    const qs = event.queryStringParameters || {};
    const source = qs.source || "m";
    const path = normalizePath(qs.path || "");
    const conf = ALLOWED[source];
    if (!conf || !path) {
      return { statusCode: 400, headers, body: "Requisição inválida" };
    }

    const target = `https://${conf.host}${path}`;
    const response = await fetch(target, {
      headers: {
        "User-Agent": "EmporioAR-Beauty-ImageProxy/1.0",
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif",
      },
      redirect: "error",
    });
    if (!response.ok) {
      return { statusCode: 502, headers, body: "Imagem indisponível" };
    }
    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.has(contentType)) {
      return { statusCode: 415, headers, body: "Tipo não permitido" };
    }
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      return { statusCode: 413, headers, body: "Imagem muito grande" };
    }
    const bytes = await readBodyLimited(response, MAX_BYTES);
    if (!bytes) {
      return { statusCode: 413, headers, body: "Imagem inválida ou muito grande" };
    }
    return {
      statusCode: 200,
      headers: {
        ...headers,
        "Content-Type": contentType,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "public, max-age=86400",
      },
      body: Buffer.from(bytes).toString("base64"),
      isBase64Encoded: true,
    };
  } catch {
    return { statusCode: 502, headers, body: "Imagem temporariamente indisponível" };
  }
}
