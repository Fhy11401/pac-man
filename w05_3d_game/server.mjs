import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const portArgument = process.argv.find(argument => argument.startsWith('--port='));
const port = Number(portArgument?.slice('--port='.length) ?? process.env.PORT ?? 5182);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RangeError('The local server port must be an integer from 0 to 65535.');
const projectId = createHash('sha256').update(path.resolve(root).replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase(), 'utf8').digest('hex');
const health = Buffer.from(JSON.stringify({ app:'night-hotel-local', protocol:1, projectId, runtime:'node', pid:process.pid }));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4' };
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow:'GET, HEAD' }); res.end('Method not allowed'); return; }
    if (pathname === '/__night_hotel_health') {
      res.writeHead(200, { 'Content-Type':'application/json; charset=utf-8', 'Content-Length':health.length, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : health); return;
    }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const relative = path.relative(root, file);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(403); res.end('Forbidden'); return; }
    const stat = fs.statSync(file);
    if (!stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Use START_GAME.cmd or START_EDITOR.cmd to find this project's server or choose an available port.` : error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`The Night Hotel ready: http://127.0.0.1:${server.address().port}/\nKeep this window open. Ctrl+C stops the server. No installation or internet required.`));
