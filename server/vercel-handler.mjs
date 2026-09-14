import {isIP} from 'node:net';
import {createContactHandler} from './contact.mjs';

export function createVercelHandler(route, options) {
  const handle = createContactHandler(options);
  return {
    fetch(request) {
      // Normalize the route whether Vercel supplies the original or rewritten URL.
      const url = new URL(request.url);
      url.pathname = route;
      url.search = '';
      const ip = request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim();
      return handle(new Request(url, request), ip && isIP(ip) ? ip : 'unknown');
    }
  };
}
