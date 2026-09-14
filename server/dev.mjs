// Local development only. Serves dist/ as static files and the contact API on the same
// origin/port, so the browser can call /api/contact with relative URLs exactly like in
// production. Not used in any deployment: Vercel uses api/*.js and the VPS uses Nginx +
// server/index.mjs (see deploy/nginx-locations.conf and DEPLOY-VPS.md).
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {isIP} from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createContactHandler} from './contact.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const handle = createContactHandler();
const port = Number(process.env.PORT || 3000);

const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.mp4': 'video/mp4'
};

async function serveStatic(res, pathname) {
  const decoded = decodeURIComponent(pathname);
  let filePath = path.normalize(path.join(root, decoded));
  if (!filePath.startsWith(root)) { res.writeHead(403); res.end(); return; }
  try {
    let info = await stat(filePath);
    if (info.isDirectory()) filePath = path.join(filePath, 'index.html');
    const ext = path.extname(filePath);
    res.writeHead(200, {'Content-Type': types[ext] || 'application/octet-stream'});
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
    res.end('Não encontrado.');
  }
}

async function serveApi(req, res, url) {
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16384) {
        res.writeHead(413, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ok: false, message: 'Reduza o tamanho da mensagem.'}));
        return;
      }
      chunks.push(chunk);
    }
    const method = req.method || 'GET';
    const request = new Request(url, {
      method, headers: req.headers,
      ...(method !== 'GET' && method !== 'HEAD' ? {body: Buffer.concat(chunks)} : {})
    });
    const ip = req.socket.remoteAddress;
    const response = await handle(request, isIP(ip) ? ip : 'unknown');
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    if (!res.headersSent) res.writeHead(500, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: false, message: 'Não foi possível processar o envio.'}));
  }
}

const server = createServer({requestTimeout: 15000, headersTimeout: 10000, maxHeaderSize: 8192}, async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === '/api/contact' || url.pathname === '/api/contact/config.json') {
    await serveApi(req, res, url);
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  await serveStatic(res, url.pathname === '/' ? '/index.html' : url.pathname);
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Site local em http://localhost:${port}`);
  console.log('Configure APP_ORIGIN com essa mesma origem (ex.: http://localhost:3000) para testar o formulário.');
});
