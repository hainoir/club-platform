import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const mobileRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const pairs = [
  ['duty-time.ts', 'lib/duty/duty-time.ts'],
  ['duty-constants.ts', 'lib/duty/duty-constants.ts'],
  ['china-public-holidays.ts', 'lib/duty/china-public-holidays.ts'],
  ['app-user.ts', 'lib/app-user.ts'],
];
const mismatches = [];
for (const [name, source] of pairs) {
  const copy = `mobile/src/shared/${name}`;
  try {
    if (!readFileSync(resolve(mobileRoot, 'src/shared', name)).equals(
      readFileSync(resolve(mobileRoot, '..', source)))) mismatches.push(`${copy} != ${source}`);
  } catch (error) {
    mismatches.push(`${copy} != ${source}: ${error.message}`);
  }
}
if (mismatches.length) {
  console.error(`Shared files out of sync:\n${mismatches.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Shared files are byte-identical (4/4).');
}
