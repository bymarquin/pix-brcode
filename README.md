# pix-brcode

Gera, lê e valida **Pix copia-e-cola** (BR Code / EMV) em TypeScript. Zero dependências, funciona em Node e no navegador.

## Uso

```ts
import { generate, parse, validate } from "pix-brcode";

const code = generate({
  key: "123e4567-e12b-12d1-a456-426655440000", // CPF/CNPJ, e-mail, telefone ou chave aleatória
  name: "José da Silva",
  city: "Araripe",
  amount: 10.5, // opcional
  txid: "PEDIDO123", // opcional (1-25 letras/números)
  message: "Obrigado!", // opcional
});

validate(code); // true
parse(code); // { key, name: "JOSE DA SILVA", city: "ARARIPE", amount: 10.5, txid: "PEDIDO123", ... }
```

Para virar QR Code, passe o `code` para qualquer gerador de QR (ex.: `qrcode`):

```ts
import QRCode from "qrcode";
const png = await QRCode.toDataURL(code);
```

## API

| Função | O que faz |
|---|---|
| `generate(opts)` | Monta o BR Code estático com CRC16. Lança `Error` se os dados forem inválidos. |
| `validate(payload)` | `true` se o CRC confere. |
| `parse(payload)` | Lê os campos. Lança `Error` se o CRC ou a estrutura forem inválidos. |
| `crc16(texto)` | CRC16/CCITT-FALSE em 4 dígitos hexa. |

Nome e cidade são convertidos para maiúsculas, sem acento, e truncados em 25 e 15 caracteres, como o padrão exige.

## Limites

- Só gera BR Code **estático** (campo 26 com chave). Payload dinâmico (URL) é lido por `parse` (`url`), mas ainda não é gerado.
- Não valida o formato da chave Pix (CPF, telefone etc.).
- Não gera imagem de QR Code.

## Desenvolvimento

```bash
npm install
npm test     # node:test, requer Node 22.18+ (roda TypeScript direto)
npm run build
```

## Licença

MIT
