/** Gerador de QR Code (modo byte, versões 1 a 40) sem dependências. */

export type QrEcc = "L" | "M" | "Q" | "H";

export interface QrOptions {
  /** Nível de correção de erros. Padrão: "M". */
  ecc?: QrEcc;
  /** Força uma máscara (0 a 7). Padrão: a de menor penalidade. */
  mask?: number;
}

export interface QrSvgOptions extends QrOptions {
  /** Borda em módulos. Padrão: 4 (o mínimo da especificação). */
  margin?: number;
  /** Largura/altura em pixels. Se omitido, o SVG escala com o container. */
  size?: number;
  /** Cor dos módulos. Padrão: "#000". */
  dark?: string;
  /** Cor do fundo. Padrão: "#fff". */
  light?: string;
}

const ECC_ROW = { L: 0, M: 1, Q: 2, H: 3 } as const;
const FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 } as const;

// índice = versão (1 a 40); linhas = L, M, Q, H
const ECC_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
const BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

const encoder = new TextEncoder();

// ---------- capacidade ----------

function rawModules(version: number): number {
  let n = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    n -= (25 * align - 10) * align - 55;
    if (version >= 7) n -= 36;
  }
  return n;
}

const dataCodewords = (version: number, row: number) =>
  Math.floor(rawModules(version) / 8) - ECC_PER_BLOCK[row][version] * BLOCKS[row][version];

// ---------- Reed-Solomon sobre GF(256), polinômio 0x11D ----------

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 2);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => (result[i] ^= gfMul(coef, factor)));
  }
  return result;
}

/** Divide em blocos, calcula a correção de erros e intercala os bytes. */
function interleave(data: number[], version: number, row: number): number[] {
  const numBlocks = BLOCKS[row][version];
  const blockEcc = ECC_PER_BLOCK[row][version];
  const raw = Math.floor(rawModules(version) / 8);
  const shortBlocks = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const divisor = rsDivisor(blockEcc);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - blockEcc + (i < shortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < shortBlocks) dat.push(0); // posição ignorada na intercalação
    blocks.push(dat.concat(ecc));
  }
  const out: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortLen - blockEcc || j >= shortBlocks) out.push(block[i]);
    });
  }
  return out;
}

// ---------- dados ----------

function encodeData(bytes: Uint8Array, version: number, row: number): number[] {
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4); // modo byte
  push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const capacity = dataCodewords(version, row) * 8;
  push(0, Math.min(4, capacity - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) codewords.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0xec; codewords.length < capacity / 8; pad ^= 0xec ^ 0x11) codewords.push(pad);
  return codewords;
}

function pickVersion(length: number, row: number): number {
  for (let version = 1; version <= 40; version++) {
    const lengthBits = version < 10 ? 8 : 16;
    if (4 + lengthBits + length * 8 <= dataCodewords(version, row) * 8) return version;
  }
  throw new Error("texto grande demais para um QR Code");
}

// ---------- desenho ----------

function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let pos = version * 4 + 10; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function runPenalty(line: boolean[]): number {
  let penalty = 0;
  for (let i = 0, run = 1; i < line.length; i++) {
    if (i + 1 < line.length && line[i + 1] === line[i]) run++;
    else {
      if (run >= 5) penalty += 3 + (run - 5);
      run = 1;
    }
  }
  return penalty;
}

function countOf(text: string, pattern: string): number {
  let count = 0;
  for (let i = text.indexOf(pattern); i !== -1; i = text.indexOf(pattern, i + 1)) count++;
  return count;
}

function penalty(m: boolean[][]): number {
  const size = m.length;
  const cols = m[0].map((_, x) => m.map((row) => row[x]));
  let total = 0;
  for (const line of [...m, ...cols]) {
    total += runPenalty(line);
    const s = line.map((d) => (d ? "1" : "0")).join("");
    total += 40 * (countOf(s, "10111010000") + countOf(s, "00001011101"));
  }
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) total += 3;
    }
  }
  const dark = m.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  const cells = size * size;
  total += (Math.ceil(Math.abs(dark * 20 - cells * 10) / cells) - 1) * 10;
  return total;
}

function draw(version: number, row: number, ecc: QrEcc, codewords: number[], requestedMask?: number): boolean[][] {
  const size = version * 4 + 17;
  const grid = () => Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const modules = grid();
  const reserved = grid();
  const set = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark;
    reserved[y][x] = true;
  };

  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dist !== 2 && dist !== 4);
      }
    }
  }
  const align = alignmentPositions(version);
  align.forEach((cx, i) => {
    align.forEach((cy, j) => {
      const onFinder = (i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0);
      if (onFinder) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    });
  });

  const drawFormat = (mask: number) => {
    const data = (FORMAT_BITS[ecc] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0);

  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, dark);
      set(b, a, dark);
    }
  }

  let bit = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!reserved[y][x] && bit < codewords.length * 8) {
          modules[y][x] = ((codewords[bit >>> 3] >>> (7 - (bit & 7))) & 1) !== 0;
          bit++;
        }
      }
    }
  }

  const applyMask = (mask: number) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!reserved[y][x] && MASKS[mask](x, y)) modules[y][x] = !modules[y][x];
  };
  let mask = requestedMask;
  if (mask === undefined) {
    let best = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(m);
      drawFormat(m);
      const p = penalty(modules);
      if (p < best) [best, mask] = [p, m];
      applyMask(m);
    }
  }
  applyMask(mask as number);
  drawFormat(mask as number);
  return modules;
}

// ---------- API ----------

/** Matriz do QR Code (`true` = módulo escuro) para o texto, em UTF-8. */
export function qrMatrix(text: string, options: QrOptions = {}): boolean[][] {
  const ecc = options.ecc ?? "M";
  if (!(ecc in ECC_ROW)) throw new Error("ecc deve ser L, M, Q ou H");
  if (options.mask !== undefined && !(Number.isInteger(options.mask) && options.mask >= 0 && options.mask <= 7)) {
    throw new Error("mask deve ser um inteiro de 0 a 7");
  }
  const row = ECC_ROW[ecc];
  const bytes = encoder.encode(text);
  const version = pickVersion(bytes.length, row);
  const codewords = interleave(encodeData(bytes, version, row), version, row);
  return draw(version, row, ecc, codewords, options.mask);
}

const COLOR = /^(#[0-9a-f]{3,8}|[a-z]+)$/i;

/** QR Code como string SVG (um único `<path>`), pronto para `<img>` ou `innerHTML`. */
export function qrSvg(text: string, options: QrSvgOptions = {}): string {
  const { margin = 4, size, dark = "#000", light = "#fff" } = options;
  if (!Number.isInteger(margin) || margin < 0) throw new Error("margin deve ser um inteiro >= 0");
  if (size !== undefined && !(Number.isInteger(size) && size > 0)) throw new Error("size deve ser um inteiro > 0");
  if (!COLOR.test(dark) || !COLOR.test(light)) throw new Error("dark e light devem ser cores como #000 ou black");
  const m = qrMatrix(text, options);
  const total = m.length + margin * 2;
  let path = "";
  m.forEach((line, y) => {
    for (let x = 0; x < line.length; x++) {
      if (!line[x]) continue;
      let end = x;
      while (end + 1 < line.length && line[end + 1]) end++;
      const w = end - x + 1;
      path += `M${x + margin} ${y + margin}h${w}v1h-${w}z`;
      x = end;
    }
  });
  const dimension = size ? ` width="${size}" height="${size}"` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}"${dimension} shape-rendering="crispEdges" role="img" aria-label="QR Code">` +
    `<rect width="${total}" height="${total}" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`
  );
}
