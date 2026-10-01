import { test } from "node:test";
import assert from "node:assert/strict";
import { crc16, detectKeyType, generate, generateDynamic, isValidKey, parse, validate } from "../src/index.ts";

const EVP = "123e4567-e12b-12d1-a456-426655440000";

test("crc16 bate com o vetor padrão CCITT-FALSE", () => {
  assert.equal(crc16("123456789"), "29B1");
});

test("exemplo do manual do BR Code (vetor externo, CRC 1D3D)", () => {
  const p = `00020126580014br.gov.bcb.pix0136${EVP}5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D`;
  assert.ok(validate(p));
  const d = parse(p);
  assert.equal(d.key, EVP);
  assert.equal(d.name, "Fulano de Tal");
  assert.equal(d.city, "BRASILIA");
  assert.equal(d.dynamic, false);
});

test("generate -> validate -> parse (ida e volta)", () => {
  const code = generate({ key: EVP, name: "José da Silva Ltda", city: "Araripe", amount: 10.5, txid: "PEDIDO123", message: "Obrigado" });
  assert.ok(validate(code));
  assert.deepEqual(parse(code), {
    key: EVP,
    url: undefined,
    message: "Obrigado",
    amount: 10.5,
    name: "JOSE DA SILVA LTDA",
    city: "ARARIPE",
    txid: "PEDIDO123",
    dynamic: false,
  });
});

test("valor com duas casas e sem valor", () => {
  assert.match(generate({ key: "a@b.com", name: "A", city: "B", amount: 10.5 }), /540510\.50/);
  assert.doesNotMatch(generate({ key: "a@b.com", name: "A", city: "B" }), /54\d\d\d/);
});

test("trunca nome e cidade", () => {
  const data = parse(generate({ key: "a@b.com", name: "N".repeat(40), city: "C".repeat(40) }));
  assert.equal(data.name.length, 25);
  assert.equal(data.city.length, 15);
});

test("payload adulterado falha na validação", () => {
  const code = generate({ key: "a@b.com", name: "A", city: "B", amount: 1 });
  assert.equal(validate(code.replace("1.00", "9.00")), false);
  assert.throws(() => parse(code.replace("1.00", "9.00")), /CRC/);
});

test("entradas inválidas lançam erro", () => {
  const base = { key: "a@b.com", name: "A", city: "B" };
  assert.throws(() => generate({ ...base, key: "" }));
  assert.throws(() => generate({ ...base, amount: 0 }));
  assert.throws(() => generate({ ...base, txid: "com espaço" }));
  assert.throws(() => generate({ ...base, message: "x".repeat(100) }));
});

test("detectKeyType reconhece os 5 tipos e rejeita inválidas", () => {
  assert.equal(detectKeyType("52998224725"), "cpf");
  assert.equal(detectKeyType("11222333000181"), "cnpj");
  assert.equal(detectKeyType("12ABC34501DE35"), "cnpj"); // CNPJ alfanumérico (exemplo oficial)
  assert.equal(detectKeyType("+5588999998888"), "phone");
  assert.equal(detectKeyType("a@b.com"), "email");
  assert.equal(detectKeyType(EVP), "evp");
  for (const bad of ["52998224726", "11222333000182", "11111111111", "88999998888", "sem-arroba", "+1999999999"]) {
    assert.equal(detectKeyType(bad), null, bad);
  }
  assert.ok(isValidKey("52998224725"));
});

test("generate rejeita chave inválida, a menos que validateKey seja false", () => {
  assert.throws(() => generate({ key: "52998224726", name: "A", city: "B" }), /chave Pix válida/);
  assert.doesNotThrow(() => generate({ key: "52998224726", name: "A", city: "B", validateKey: false }));
});

test("generateDynamic gera e lê payload dinâmico", () => {
  const code = generateDynamic({ url: "https://pix.exemplo.com.br/qr/v2/abc123", name: "Loja", city: "Araripe" });
  assert.ok(validate(code));
  assert.match(code, /010212/);
  const d = parse(code);
  assert.equal(d.dynamic, true);
  assert.equal(d.url, "pix.exemplo.com.br/qr/v2/abc123");
  assert.equal(d.key, undefined);
  assert.throws(() => generateDynamic({ url: "", name: "A", city: "B" }));
  assert.throws(() => generateDynamic({ url: "x".repeat(90), name: "A", city: "B" }));
});

test("crc16 usa bytes UTF-8, como o padrão", () => {
  assert.equal(crc16("é"), "7ACB");
});

test("amount: rejeita mais de 2 casas e aceita erro de ponto flutuante", () => {
  const base = { key: "a@b.com", name: "A", city: "B" };
  assert.throws(() => generate({ ...base, amount: 10.555 }), /2 casas/);
  assert.throws(() => generate({ ...base, amount: 0.004 }));
  assert.throws(() => generate({ ...base, amount: Number.NaN }));
  assert.throws(() => generate({ ...base, amount: 1e10 }));
  assert.equal(parse(generate({ ...base, amount: 0.1 + 0.2 })).amount, 0.3);
  assert.equal(parse(generate({ ...base, amount: 9999999999.99 })).amount, 9999999999.99);
});

test("campo acima de 99 caracteres falha cedo, em qualquer campo", () => {
  assert.throws(() => generate({ key: "a@b.com", name: "A", city: "B", message: "x".repeat(100) }), /excede 99/);
  assert.throws(() => generate({ key: `${"a".repeat(55)}@${"b".repeat(10)}.com`, name: "A", city: "B", message: "mensagem" }), /excede 99/);
});

test("entradas que não são string não quebram com TypeError", () => {
  assert.throws(() => generate({ key: 123 as never, name: "A", city: "B" }), /key é obrigatória/);
  assert.throws(() => generate({ key: "a@b.com", name: undefined as never, city: "B" }), /name é obrigatório/);
  assert.equal(validate(undefined as never), false);
  assert.equal(detectKeyType(undefined as never), null);
});

test("parse rejeita estrutura inválida mesmo com CRC correto", () => {
  const signed = (body: string) => body + "6304" + crc16(body + "6304");
  assert.throws(() => parse(signed("000202")), /BR Code/);
  assert.throws(() => parse(signed("00020126")), /TLV/);
  assert.throws(() => parse(signed("000201" + "5920ABC")), /tamanho/);
});
