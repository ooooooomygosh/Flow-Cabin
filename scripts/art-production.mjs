import fs from 'node:fs/promises';
import path from 'node:path';
// Keep provenance and visual QA in the repository, outside shipped bundles.
export function artProduction() {
  let output;
  return { name:'cabin-art-production', apply:'build', configResolved(config) { output = path.resolve(config.root, config.build.outDir); }, async closeBundle() {
    for (const folder of ['pet-art/v21/sources','pet-art/v21/qa']) await fs.rm(path.join(output, folder), { recursive:true, force:true });
  } };
}
