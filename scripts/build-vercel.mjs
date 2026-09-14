import {cp, mkdir, readdir, rm, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'dist');
const output = path.join(root, 'build', 'vercel-public');
await stat(path.join(source, 'index.html'));
await rm(output, {recursive: true, force: true});
await mkdir(output, {recursive: true});
for (const entry of await readdir(source, {withFileTypes: true})) {
  // On Vercel, config is supplied by the Function; never copy the disabled static fallback.
  // Private files and server source are not part of the public output.
  if (entry.name.startsWith('.') || entry.name === 'api') continue;
  await cp(path.join(source, entry.name), path.join(output, entry.name), {
    recursive: true,
    filter: file => !path.basename(file).startsWith('.')
  });
}
console.log('Site prepared for Vercel: build/vercel-public');
