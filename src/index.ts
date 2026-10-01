export interface PixOptions {
  /** Chave Pix: CPF/CNPJ, e-mail, telefone (+55...) ou chave aleatória (EVP). */
  key: string;
  /** Nome do recebedor (máx. 25 caracteres, vira maiúsculo e sem acento). */
  name: string;
  /** Cidade do recebedor (máx. 15 caracteres, vira maiúsculo e sem acento). */
  city: string;
  /** Valor em reais. Se omitido, o pagador digita o valor. */
  amount?: number;
  /** Identificador da transação (1 a 25 letras/números). Padrão: "***". */
  txid?: string;
  /** Mensagem ao pagador. */
  message?: string;
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
}

const tlv = (id: string, value: string) => id + String(value.length).padStart(2, "0") + value;

/** Remove acentos e caracteres fora do ASCII imprimível. */
const ascii = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .trim();

/** CRC16/CCITT-FALSE (poly 0x1021, init 0xFFFF), 4 dígitos hexa maiúsculos. */
export function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Gera o Pix copia-e-cola (BR Code estático). Lança Error se os dados forem inválidos. */
export function generate(opts: PixOptions): string {
  const key = opts.key?.trim();
  const name = ascii(opts.name ?? "").toUpperCase().slice(0, 25);
  const city = ascii(opts.city ?? "").toUpperCase().slice(0, 15);
  if (!key) throw new Error("key é obrigatória");
  if (!name) throw new Error("name é obrigatório");
  if (!city) throw new Error("city é obrigatório");

  const txid = opts.txid ?? "***";
  if (txid !== "***" && !/^[A-Za-z0-9]{1,25}$/.test(txid)) {
    throw new Error("txid deve ter 1 a 25 letras/números");
  }

  const message = opts.message ? ascii(opts.message) : "";
  const account = tlv("00", "br.gov.bcb.pix") + tlv("01", key) + (message ? tlv("02", message) : "");
  if (account.length > 99) throw new Error("key + message excedem o limite do campo 26 (99 caracteres)");

  let amount = "";
  if (opts.amount !== undefined) {
    if (!Number.isFinite(opts.amount) || opts.amount <= 0 || opts.amount > 9999999999.99) {
      throw new Error("amount deve ser maior que 0");
    }
    amount = tlv("54", opts.amount.toFixed(2));
  }

  const body =
    tlv("00", "01") +
    tlv("01", "11") +
    tlv("26", account) +
    tlv("52", "0000") +
    tlv("53", "986") +
    amount +
    tlv("58", "BR") +
    tlv("59", name) +
    tlv("60", city) +
    tlv("62", tlv("05", txid)) +
    "6304";

  return body + crc16(body);
}

function readTlv(s: string): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  while (i < s.length) {
    const id = s.slice(i, i + 2);
    const len = Number(s.slice(i + 2, i + 4));
    if (id.length < 2 || !/^\d{2}$/.test(s.slice(i + 2, i + 4))) throw new Error("TLV malformado");
    const value = s.slice(i + 4, i + 4 + len);
    if (value.length !== len) throw new Error("TLV com tamanho inconsistente");
    out.set(id, value);
    i += 4 + len;
  }
  return out;
}

/** true se o CRC do payload confere. */
export function validate(payload: string): boolean {
  const p = payload.trim();
  if (p.length < 8 || p.slice(-8, -4) !== "6304") return false;
  return crc16(p.slice(0, -4)) === p.slice(-4).toUpperCase();
}

/** Lê um Pix copia-e-cola. Lança Error se o CRC ou a estrutura forem inválidos. */
export function parse(payload: string): PixData {
  if (!validate(payload)) throw new Error("CRC inválido");
  const root = readTlv(payload.trim());
  const account = readTlv(root.get("26") ?? "");
  const extra = readTlv(root.get("62") ?? "");
  const amount = root.get("54");
  return {
    key: account.get("01"),
    url: account.get("25"),
    message: account.get("02"),
    amount: amount ? Number(amount) : undefined,
    name: root.get("59") ?? "",
    city: root.get("60") ?? "",
    txid: extra.get("05"),
  };
}
