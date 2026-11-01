import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const realRoot = fs.realpathSync(root);
const portArgument = process.argv.find(argument => argument.startsWith('--port='));
const port = Number(portArgument?.slice('--port='.length) ?? process.env.PORT ?? 5182);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RangeError('The local server port must be an integer from 0 to 65535.');
const projectId = createHash('sha256').update(path.resolve(root).replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase(), 'utf8').digest('hex');
const health = Buffer.from(JSON.stringify({ app:'night-hotel-local', protocol:1, projectId, runtime:'node', pid:process.pid }));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4' };
const safeHeaders = { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' };
const outside = (base, file) => { const relative = path.relative(base, file); return relative.startsWith('..') || path.isAbsolute(relative); };
function byteRange(value, size) {
  if (!value || size === 0) return null;
  // Multiple/unknown ranges can fall back to 200. Never round a huge offset.
  const match = /^bytes\s*=\s*(\d*)-(\d*)\s*$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const length = BigInt(size);
  if (!match[1]) { const suffix = BigInt(match[2]); return suffix === 0n ? false : { start:Number(suffix >= length ? 0n : length - suffix), end:size - 1 }; }
  const start = BigInt(match[1]), end = match[2] ? BigInt(match[2]) : length - 1n;
  if (start >= length || end < start) return false;
  return { start:Number(start), end:Number(end < length ? end : length - 1n) };
}
function reply(req, res, status, body, headers = {}) {
  const data = Buffer.from(body);
  res.writeHead(status, { ...safeHeaders, 'Content-Type':'text/plain; charset=utf-8', 'Content-Length':data.length, ...headers });
  res.end(req.method === 'HEAD' ? undefined : data);
}
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    if (!['GET', 'HEAD'].includes(req.method)) { reply(req, res, 405, 'Method not allowed', { Allow:'GET, HEAD' }); return; }
    if (pathname === '/__night_hotel_health') {
      res.writeHead(200, { 'Content-Type':'application/json; charset=utf-8', 'Content-Length':health.length, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : health); return;
    }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (outside(root, file) || outside(realRoot, fs.realpathSync(file))) { reply(req, res, 403, 'Forbidden'); return; }
    const stat = fs.statSync(file);
    if (!stat.isFile()) { reply(req, res, 404, 'Not found'); return; }
    // Range applies only to GET. Without a strong validator, If-Range requests
    // receive the full current representation instead of a possibly stale slice.
    const range = req.method === 'GET' && !req.headers['if-range'] ? byteRange(req.headers.range, stat.size) : null;
    if (range === false) { reply(req, res, 416, '', { 'Content-Range':`bytes */${stat.size}`, 'Accept-Ranges':'bytes' }); return; }
    const headers = { ...safeHeaders, 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges':'bytes', 'Content-Length':range ? range.end - range.start + 1 : stat.size };
    if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${stat.size}`;
    res.writeHead(range ? 206 : 200, headers);
    if (req.method === 'HEAD' || stat.size === 0) res.end();
    else {
      const stream = fs.createReadStream(file, range || {});
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    }
  } catch { if (!res.headersSent) reply(req, res, 404, 'Not found'); else res.destroy(); }
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Use START_GAME.cmd or START_EDITOR.cmd to find this project's server or choose an available port.` : error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`The Night Hotel ready: http://127.0.0.1:${server.address().port}/\nKeep this window open. Ctrl+C stops the server. No installation or internet required.`));
