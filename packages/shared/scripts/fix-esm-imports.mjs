// tsc 输出的 ESM 里，相对导入没有扩展名；Node 的 ESM 解析要求显式 .js。
// Vite 能容忍，但包声明了 import 条件，就应当对 Node 也成立。
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('../dist/esm/', import.meta.url).pathname;

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(path);
    } else if (entry.name.endsWith('.js')) {
      const source = await readFile(path, 'utf8');
      const fixed = source.replace(
        /(from\s+['"])(\.\.?\/[^'"]+?)(['"])/g,
        (match, head, specifier, tail) => {
          if (/\.[cm]?js$/.test(specifier)) return match;
          return `${head}${specifier}.js${tail}`;
        },
      );
      if (fixed !== source) await writeFile(path, fixed);
    }
  }
}

await walk(root);
