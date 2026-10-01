// marca dist/cjs como CommonJS (o package raiz é "type": "module")
import { writeFileSync } from "node:fs";
writeFileSync(new URL("../dist/cjs/package.json", import.meta.url), '{"type":"commonjs"}\n');
