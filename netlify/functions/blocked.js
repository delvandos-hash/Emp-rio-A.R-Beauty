export async function handler() {
  return {
    statusCode: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: 'Not found'
  };
}
