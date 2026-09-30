const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '../../..');
const envPath = path.join(root, '.env');

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

process.env.NODE_PATH = [path.resolve(__dirname, '../node_modules'), process.env.NODE_PATH]
  .filter(Boolean)
  .join(path.delimiter);
Module._initPaths();

require('ts-node').register({
  compilerOptions: { module: 'commonjs' },
  transpileOnly: true,
});
require(path.join(root, 'prisma', 'seed.ts'));
