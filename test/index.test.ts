import { test } from "node:test";
import assert from "node:assert/strict";
import { crc16, generate, parse, validate } from "../src/index.ts";

test("crc16 bate com o vetor padrão CCITT-FALSE", () => {
  assert.equal(crc16("123456789"), "29B1");
});

test("generate -> validate -> parse (ida e volta)", () => {
  const code = generate({
    key: "123e4567-e12b-12d1-a456-426655440000",
    name: "José da Silva Ltda",
    city: "Araripe",
    amount: 10.5,
    txid: "PEDIDO123",
    message: "Obrigado",
  });
  assert.ok(validate(code));
  assert.deepEqual(parse(code), {
    key: "123e4567-e12b-12d1-a456-426655440000",
    url: undefined,
    message: "Obrigado",
    amount: 10.5,
    name: "JOSE DA SILVA LTDA",
    city: "ARARIPE",
    txid: "PEDIDO123",
  });
});

test("valor com duas casas e sem valor", () => {
  assert.match(generate({ key: "a@b.com", name: "A", city: "B", amount: 10.5 }), /540510\.50/);
  assert.doesNotMatch(generate({ key: "a@b.com", name: "A", city: "B" }), /54\d\d\d/);
});

test("trunca nome e cidade", () => {
  const data = parse(generate({ key: "k", name: "N".repeat(40), city: "C".repeat(40) }));
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
