exports.handler = async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Empório A.R. Beauty</title>
    <link>https://emporioar-beauty.netlify.app/</link>
    <description>Catálogo de maquiagem e cosméticos</description>
  </channel>
</rss>`;
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    },
    body: xml
  };
};
