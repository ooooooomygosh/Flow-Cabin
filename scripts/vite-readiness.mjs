import { stripVTControlCharacters } from 'node:util';

// Inspect only the log captured from the child we spawned, never another server's response.
export function hasViteLocalOrigin(output, origin) {
  return stripVTControlCharacters(output).split(/\r?\n/).some(line => {
    const local = line.match(/\bLocal:\s+(\S+)/);
    return local?.[1] === origin || local?.[1] === origin + '/';
  });
}
