import {createServer} from 'node:http';
import {isIP} from 'node:net';
import {createContactHandler} from './contact.mjs';

const handle = createContactHandler();
const port = Number(process.env.PORT || 3000);
const server = createServer({requestTimeout: 15000, headersTimeout: 10000, maxHeaderSize: 8192}, async (req, res) => {
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16384) {
        res.writeHead(413, {'Content-Type': 'application/json', Connection: 'close'});
        res.end(JSON.stringify({ok: false, message: 'Reduza o tamanho da mensagem.'}));
        return;
      }
      chunks.push(chunk);
    }
    const method = req.method || 'GET';
    const request = new Request(new URL(req.url, 'http://localhost'), {
      method, headers: req.headers,
      ...(method !== 'GET' && method !== 'HEAD' ? {body: Buffer.concat(chunks)} : {})
    });
    // This listener is loopback-only. Nginx must overwrite X-Real-IP (see deploy/nginx-locations.conf).
    const forwarded = req.headers['x-real-ip'];
    const ip = typeof forwarded === 'string' && isIP(forwarded) ? forwarded : req.socket.remoteAddress;
    const response = await handle(request, ip);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    if (!res.headersSent) res.writeHead(500, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: false, message: 'Não foi possível processar o envio.'}));
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Contact API listening on port ${port}`));
