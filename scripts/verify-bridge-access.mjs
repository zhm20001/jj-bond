import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { jjBridgeMiddleware } from './jj-bridge.mjs';

const middleware = jjBridgeMiddleware();
const server = createServer((req, res) => middleware(req, res, () => res.end()));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const send = (headers = {}, method = 'POST', body = '{}') => new Promise((resolve, reject) => {
  const req = request({ hostname: '127.0.0.1', port, path: '/api/not-a-command', method,
    headers: { 'Content-Type': 'application/json', ...headers } }, (res) => {
    res.resume();
    res.on('end', () => resolve(res.statusCode));
  });
  req.on('error', reject);
  req.end(method === 'POST' ? body : undefined);
});
try {
  assert.equal(await send({ Origin: 'https://untrusted.example' }), 403);
  assert.equal(await send({ Origin: 'null' }), 403);
  assert.equal(await send({ Host: `untrusted.example:${port}` }), 403);
  assert.equal(await send({ 'Sec-Fetch-Site': 'cross-site' }), 403);
  assert.equal(await send({ 'Content-Type': 'text/plain' }), 415);
  assert.equal(await send({}, 'GET'), 405);
  assert.equal(await send({ Origin: `http://127.0.0.1:${port}` }), 404);
  assert.equal(await send(), 404); // Local CLI clients remain supported.
  assert.equal(await send({}, 'POST', 'x'.repeat(1024 * 1024 + 1)), 413);
  console.log('verify-bridge-access: ok');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
