<h1 align="center">
  <img src="assets/logo-animated.svg" width="480" alt="pix-brcode" />
</h1>

<p align="center">
  Gera, lê e valida <strong>Pix copia-e-cola</strong> (BR Code / EMV) em TypeScript.<br/>
  Zero dependências, funciona em Node e no navegador.
</p>

## Uso

```ts
import { generate, parse, validate } from "pix-brcode";

const code = generate({
  key: "123e4567-e12b-12d1-a456-426655440000", // CPF/CNPJ, e-mail, telefone (+55...) ou chave aleatória
  name: "José da Silva",
  city: "Araripe",
  amount: 10.5, // opcional
  txid: "PEDIDO123", // opcional (1-25 letras/números)
  message: "Obrigado!", // opcional
});

validate(code); // true
parse(code); // { key, name: "JOSE DA SILVA", city: "ARARIPE", amount: 10.5, txid: "PEDIDO123", dynamic: false, ... }
```

Funciona com `import` e `require`.

### Pix dinâmico

Quando o valor e a chave vêm de um payload hospedado no PSP:

```ts
import { generateDynamic } from "pix-brcode";

generateDynamic({ url: "https://pix.exemplo.com.br/qr/v2/abc123", name: "Loja", city: "Araripe" });
```

### Validar chave

```ts
import { detectKeyType, isValidKey } from "pix-brcode";

detectKeyType("52998224725"); // "cpf"
detectKeyType("12ABC34501DE35"); // "cnpj" (CNPJ alfanumérico)
detectKeyType("+5588999998888"); // "phone"
isValidKey("nao-e-chave"); // false
```

`generate` já valida a chave e lança `Error` se for inválida. Para desligar: `validateKey: false`.

### QR Code

Passe o `code` para qualquer gerador de QR (ex.: `qrcode`):

```ts
import QRCode from "qrcode";
const png = await QRCode.toDataURL(code);
```

## API

| Função | O que faz |
|---|---|
| `generate(opts)` | BR Code estático com CRC16. Lança `Error` se os dados forem inválidos. |
| `generateDynamic(opts)` | BR Code dinâmico (URL do payload no PSP). |
| `validate(payload)` | `true` se o CRC confere. |
| `parse(payload)` | Lê os campos. Lança `Error` se o CRC ou a estrutura forem inválidos. |
| `detectKeyType(key)` / `isValidKey(key)` | Tipo da chave (`cpf`, `cnpj`, `email`, `phone`, `evp`) ou `null`. |
| `crc16(texto)` | CRC16/CCITT-FALSE em 4 dígitos hexa. |

Nome e cidade são convertidos para maiúsculas, sem acento, e truncados em 25 e 15 caracteres, como o padrão exige.

## Limites

- Não gera imagem de QR Code (use uma lib de QR com o `code`).
- Não consulta o PSP: no Pix dinâmico, só monta e lê o código, não busca o payload da URL.
- E-mail e telefone são validados só pelo formato.

## Desenvolvimento

```bash
npm install
npm test        # node:test, requer Node 22.18+ (roda TypeScript direto)
npm run coverage
npm run build  # gera dist/esm e dist/cjs
```

## Licença

MIT
