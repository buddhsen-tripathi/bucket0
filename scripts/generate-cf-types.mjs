import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const result = spawnSync('./node_modules/.bin/wrangler', ['types'], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
// Scope Workers' DOM/runtime declarations to a module. The UI uses browser DOM types.
const file = 'worker-configuration.d.ts';
const declarations = readFileSync(file, 'utf8').replace(/^(?=(?:interface |type |declare (?!module )))/gm, 'export ');
writeFileSync(file, declarations);
