import { test } from "node:test";
import assert from "node:assert/strict";
import QRCode from "qrcode";
import { generate, qrMatrix, qrSvg, type QrEcc } from "../src/index.ts";

/** Referência independente: a lib `qrcode`, forçando modo byte e a máscara pedida. */
function reference(text: string, ecc: QrEcc, mask?: number): boolean[][] {
  const qr = QRCode.create([{ data: text, mode: "byte" }] as never, { errorCorrectionLevel: ecc, maskPattern: mask } as never);
  const { size, data } = qr.modules as unknown as { size: number; data: Uint8Array };
  return Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => data[y * size + x] === 1));
}

const sample = (len: number) => Array.from({ length: len }, (_, i) => "abcXYZ019-./:@"[(i * 7 + (i >> 3)) % 14]).join("");
const sameMatrix = (a: boolean[][], b: boolean[][]) => a.length === b.length && a.every((row, y) => row.every((v, x) => v === b[y][x]));

test("QR: idêntico à referência em todos os níveis e versões 1 a 40 (máscara 0)", () => {
  for (const ecc of ["L", "M", "Q", "H"] as const) {
    const max = ecc === "L" ? 2953 : ecc === "M" ? 2331 : ecc === "Q" ? 1663 : 1273;
    const versions = new Set<number>();
    for (let len = 1; len <= max; len += 37) {
      const text = sample(len);
      const mine = qrMatrix(text, { ecc, mask: 0 });
      versions.add((mine.length - 17) / 4);
      assert.ok(sameMatrix(mine, reference(text, ecc, 0)), `ecc=${ecc} len=${len}`);
    }
    assert.ok(versions.size >= 25, `${ecc}: poucas versões cobertas (${versions.size})`);
  }
});

test("QR: as 8 máscaras batem com a referência (versões com blocos e info de versão)", () => {
  for (const len of [20, 150, 700]) {
    for (let mask = 0; mask < 8; mask++) {
      const text = sample(len);
      assert.ok(sameMatrix(qrMatrix(text, { mask }), reference(text, "M", mask)), `len=${len} mask=${mask}`);
    }
  }
});

test("QR: escolha automática de máscara bate com a referência em payloads Pix", () => {
  const codes = [
    generate({ key: "a@b.com", name: "Loja", city: "Araripe", amount: 10.5 }),
    generate({ key: "123e4567-e12b-12d1-a456-426655440000", name: "José da Silva", city: "Araripe", txid: "PEDIDO123", message: "Obrigado" }),
  ];
  for (const code of codes) for (const ecc of ["L", "M", "Q", "H"] as const) assert.ok(sameMatrix(qrMatrix(code, { ecc }), reference(code, ecc)), `${code.length} ${ecc}`);
});

test("QR: texto UTF-8 e limites", () => {
  assert.ok(sameMatrix(qrMatrix("olá, mundo ✓", { mask: 3 }), reference("olá, mundo ✓", "M", 3)));
  assert.throws(() => qrMatrix("x".repeat(2332)), /grande demais/);
  assert.throws(() => qrMatrix("a", { ecc: "X" as never }), /ecc/);
  assert.throws(() => qrMatrix("a", { mask: 8 }), /mask/);
});

test("qrSvg gera SVG válido e valida as opções", () => {
  const svg = qrSvg("pix", { size: 200, dark: "#0D1117", light: "white" });
  assert.match(svg, /^<svg [^>]*viewBox="0 0 29 29"[^>]*width="200"/);
  assert.match(svg, /<path d="M\d+ \d+h\d+v1h-\d+z/);
  assert.throws(() => qrSvg("pix", { dark: '"/><script>' }), /cores/);
  assert.throws(() => qrSvg("pix", { margin: -1 }), /margin/);
  assert.throws(() => qrSvg("pix", { size: 0 }), /size/);
});
