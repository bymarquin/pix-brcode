export { qrMatrix, qrSvg } from "./qr.ts";
export type { QrEcc, QrOptions, QrSvgOptions } from "./qr.ts";

export type KeyType = "cpf" | "cnpj" | "email" | "phone" | "evp";

export interface PixOptions {
  /** Chave Pix: CPF/CNPJ (só dígitos), e-mail, telefone (+55...) ou chave aleatória (EVP). */
  key: string;
  /** Nome do recebedor (máx. 25 caracteres, vira maiúsculo e sem acento). */
  name: string;
  /** Cidade do recebedor (máx. 15 caracteres, vira maiúsculo e sem acento). */
  city: string;
  /** Valor em reais, com no máximo 2 casas. Se omitido, o pagador digita o valor. */
  amount?: number;
  /** Identificador da transação (1 a 25 letras/números). Padrão: "***". */
  txid?: string;
  /** Mensagem ao pagador. */
  message?: string;
  /** Valida o formato da chave. Padrão: true. */
  validateKey?: boolean;
}

export interface PixDynamicOptions {
  /** URL do payload no PSP (com ou sem `https://`). */
  url: string;
  name: string;
  city: string;
  txid?: string;
}

export interface PixData {
  key?: string;
  /** URL do payload dinâmico (campo 26.25), quando existir. */
  url?: string;
  message?: string;
  amount?: number;
  name: string;
  city: string;
  txid?: string;
  /** true para BR Code dinâmico (ponto de iniciação 12). */
  dynamic: boolean;
}

const GUI = "br.gov.bcb.pix";
const MAX_FIELD = 99;
const MAX_CENTS = 999_999_999_999;

// ---------- CRC16/CCITT-FALSE (poly 0x1021, init 0xFFFF) ----------

const CRC_TABLE = (() => {
  const table = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i << 8;
    for (let b = 0; b < 8; b++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
    table[i] = c;
  }
  return table;
})();

const encoder = new TextEncoder();
const ASCII_ONLY = /^[\x00-\x7f]*$/;

/** CRC16/CCITT-FALSE sobre os bytes UTF-8 do texto, em 4 dígitos hexa maiúsculos. */
export function crc16(input: string): string {
  // ASCII (o caso comum) já são os próprios bytes: evita alocar um Uint8Array
  const bytes = ASCII_ONLY.test(input) ? null : encoder.encode(input);
  const length = bytes ? bytes.length : input.length;
  let crc = 0xffff;
  for (let i = 0; i < length; i++) {
    const byte = bytes ? bytes[i] : input.charCodeAt(i);
    crc = ((crc << 8) ^ CRC_TABLE[(crc >> 8) ^ byte]) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// ---------- chaves Pix ----------

function validCpf(s: string): boolean {
  if (/^(\d)\1{10}$/.test(s)) return false;
  for (const n of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number(s[i]) * (n + 1 - i);
    if (((sum * 10) % 11) % 10 !== Number(s[n])) return false;
  }
  return true;
}

const CNPJ_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Aceita CNPJ numérico e o alfanumérico (cada caractere vale seu código ASCII - 48). */
function validCnpj(s: string): boolean {
  if (/^(.)\1{13}$/.test(s)) return false;
  const digit = (len: number) => {
    const weights = CNPJ_WEIGHTS.slice(CNPJ_WEIGHTS.length - len);
    let sum = 0;
    for (let i = 0; i < len; i++) sum += (s.charCodeAt(i) - 48) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return digit(12) === Number(s[12]) && digit(13) === Number(s[13]);
}

// DDDs em uso no Brasil
const DDD = new Set(
  "11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99".split(" "),
);

/** Pix só aceita celular: +55, DDD válido e 9 dígitos começando em 9. */
const validPhone = (s: string) => /^\+55\d{2}9\d{8}$/.test(s) && DDD.has(s.slice(3, 5));

const EMAIL_LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const EMAIL_DOMAIN = /^([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

/** E-mail de até 77 caracteres (limite do Pix), local de até 64, domínio com TLD. */
function validEmail(s: string): boolean {
  const at = s.lastIndexOf("@");
  return s.length <= 77 && at > 0 && at <= 64 && EMAIL_LOCAL.test(s.slice(0, at)) && EMAIL_DOMAIN.test(s.slice(at + 1));
}

/** Descobre o tipo da chave Pix, ou `null` se o formato for inválido. */
export function detectKeyType(key: string): KeyType | null {
  const k = typeof key === "string" ? key.trim() : "";
  if (/^\d{11}$/.test(k)) return validCpf(k) ? "cpf" : null;
  if (/^[0-9A-Z]{12}\d{2}$/.test(k)) return validCnpj(k) ? "cnpj" : null;
  if (validPhone(k)) return "phone";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k)) return "evp";
  if (validEmail(k)) return "email";
  return null;
}

/** true se a chave tem formato de CPF, CNPJ, e-mail, telefone ou chave aleatória válidos. */
export const isValidKey = (key: string): boolean => detectKeyType(key) !== null;

// ---------- montagem ----------

const text = (v: unknown): string => (typeof v === "string" ? v : "");

/** Remove acentos e caracteres fora do ASCII imprimível. */
const ascii = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .trim();

function tlv(id: string, value: string): string {
  if (value.length > MAX_FIELD) throw new Error(`campo ${id} excede ${MAX_FIELD} caracteres`);
  return id + String(value.length).padStart(2, "0") + value;
}

function merchant(name: unknown, city: unknown) {
  const n = ascii(text(name)).toUpperCase().slice(0, 25);
  const c = ascii(text(city)).toUpperCase().slice(0, 15);
  if (!n) throw new Error("name é obrigatório");
  if (!c) throw new Error("city é obrigatório");
  return tlv("59", n) + tlv("60", c);
}

function additionalData(txid = "***"): string {
  if (txid !== "***" && !/^[A-Za-z0-9]{1,25}$/.test(txid)) throw new Error("txid deve ter 1 a 25 letras/números");
  return tlv("62", tlv("05", txid));
}

function formatAmount(amount: number): string {
  const exact = amount * 100;
  const cents = Math.round(exact);
  if (!Number.isFinite(amount) || cents < 1 || cents > MAX_CENTS) {
    throw new Error("amount deve estar entre 0.01 e 9999999999.99");
  }
  if (Math.abs(cents - exact) > 1e-6) throw new Error("amount aceita no máximo 2 casas decimais");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function assemble(dynamic: boolean, account: string, amount: string, tail: string): string {
  const body =
    tlv("00", "01") +
    tlv("01", dynamic ? "12" : "11") +
    tlv("26", account) +
    tlv("52", "0000") +
    tlv("53", "986") +
    amount +
    tlv("58", "BR") +
    tail +
    "6304";
  return body + crc16(body);
}

/** Gera o Pix copia-e-cola estático. Lança Error se os dados forem inválidos. */
export function generate(opts: PixOptions): string {
  const key = text(opts?.key).trim();
  if (!key) throw new Error("key é obrigatória");
  if (opts.validateKey !== false && !detectKeyType(key)) {
    throw new Error("key não é uma chave Pix válida (CPF, CNPJ, e-mail, telefone +55 ou chave aleatória)");
  }
  const message = ascii(text(opts.message));
  const account = tlv("00", GUI) + tlv("01", key) + (message ? tlv("02", message) : "");
  const amount = opts.amount === undefined ? "" : tlv("54", formatAmount(opts.amount));
  return assemble(false, account, amount, merchant(opts.name, opts.city) + additionalData(opts.txid));
}

/** Gera o Pix copia-e-cola dinâmico: valor e chave vêm do payload hospedado em `url`. */
export function generateDynamic(opts: PixDynamicOptions): string {
  const url = text(opts?.url).trim().replace(/^https?:\/\//i, "");
  if (!url) throw new Error("url é obrigatória");
  if (/\s/.test(url)) throw new Error("url não pode ter espaços");
  const account = tlv("00", GUI) + tlv("25", url);
  return assemble(true, account, "", merchant(opts.name, opts.city) + additionalData(opts.txid));
}

// ---------- leitura ----------

function readTlv(s: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (let i = 0; i < s.length; ) {
    const header = s.slice(i, i + 4);
    if (!/^\d{4}$/.test(header)) throw new Error("TLV malformado");
    const length = Number(header.slice(2));
    const value = s.slice(i + 4, i + 4 + length);
    if (value.length !== length) throw new Error("TLV com tamanho inconsistente");
    fields.set(header.slice(0, 2), value);
    i += 4 + length;
  }
  return fields;
}

/** true se o CRC do payload confere. */
export function validate(payload: string): boolean {
  const p = text(payload).trim();
  return p.length >= 8 && p.slice(-8, -4) === "6304" && crc16(p.slice(0, -4)) === p.slice(-4).toUpperCase();
}

/** Lê um Pix copia-e-cola. Lança Error se o CRC ou a estrutura forem inválidos. */
export function parse(payload: string): PixData {
  if (!validate(payload)) throw new Error("CRC inválido");
  const root = readTlv(payload.trim());
  if (root.get("00") !== "01") throw new Error("não é um BR Code (campo 00 deve ser 01)");
  const account = readTlv(root.get("26") ?? "");
  const amount = root.get("54");
  return {
    key: account.get("01"),
    url: account.get("25"),
    message: account.get("02"),
    amount: amount === undefined ? undefined : Number(amount),
    name: root.get("59") ?? "",
    city: root.get("60") ?? "",
    txid: readTlv(root.get("62") ?? "").get("05"),
    dynamic: root.get("01") === "12",
  };
}
