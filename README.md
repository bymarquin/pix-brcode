<h1 align="center">
  <img src="assets/logo-animated.svg" width="480" alt="pix-brcode" />
</h1>

<p align="center">
  Gera, lê e valida <strong>Pix copia-e-cola</strong> (BR Code / EMV) em TypeScript.<br/>
  Gera também o QR Code (SVG). Zero dependências, funciona em Node e no navegador.
</p>

## Instalação

```bash
npm install brpix
```

O pacote no npm se chama `brpix`; o projeto e o repositório se chamam `pix-brcode`.

## Uso

```ts
import { generate, parse, validate } from "brpix";

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
import { generateDynamic } from "brpix";

generateDynamic({ url: "https://pix.exemplo.com.br/qr/v2/abc123", name: "Loja", city: "Araripe" });
```

### Validar chave

```ts
import { detectKeyType, isValidKey } from "brpix";

detectKeyType("52998224725"); // "cpf"
detectKeyType("12ABC34501DE35"); // "cnpj" (CNPJ alfanumérico)
detectKeyType("+5588999998888"); // "phone"
isValidKey("nao-e-chave"); // false
```

`generate` já valida a chave e lança `Error` se for inválida. Para desligar: `validateKey: false`.

### QR Code

Gera o QR direto, sem dependências, como SVG ou matriz de módulos:

```ts
import { generate, qrSvg } from "brpix";

const svg = qrSvg(generate({ key: "a@b.com", name: "Loja", city: "Araripe", amount: 10.5 }), {
  size: 320, // opcional (px); sem isso o SVG escala com o container
  ecc: "M", // L, M, Q ou H (padrão M)
});
document.querySelector("#pix").innerHTML = svg;
```

`qrMatrix(texto)` devolve `boolean[][]` (`true` = módulo escuro) se você quiser desenhar em canvas ou PDF.

## API

| Função | O que faz |
|---|---|
| `generate(opts)` | BR Code estático com CRC16. Lança `Error` se os dados forem inválidos. |
| `generateDynamic(opts)` | BR Code dinâmico (URL do payload no PSP). |
| `validate(payload)` | `true` se o CRC confere. |
| `parse(payload)` | Lê os campos. Lança `Error` se o CRC ou a estrutura forem inválidos. |
| `detectKeyType(key)` / `isValidKey(key)` | Tipo da chave (`cpf`, `cnpj`, `email`, `phone`, `evp`) ou `null`. |
| `qrSvg(texto, opts?)` | QR Code como string SVG. Opções: `ecc`, `size`, `margin`, `dark`, `light`. |
| `qrMatrix(texto, opts?)` | QR Code como matriz de booleanos. |
| `crc16(texto)` | CRC16/CCITT-FALSE em 4 dígitos hexa. |

Nome e cidade são convertidos para maiúsculas, sem acento, e truncados em 25 e 15 caracteres, como o padrão exige.

## Fora do escopo

- **Buscar o payload do Pix dinâmico na URL do PSP.** É um JWS assinado que exige verificar a assinatura e a cadeia de certificados; ler sem verificar daria dados em que não dá para confiar.
- **Confirmar que a chave existe.** Só o DICT do Banco Central sabe, via PSP autorizado. A lib valida o formato: dígitos verificadores de CPF/CNPJ, DDD real e celular com 9 no telefone, regras de tamanho e caracteres no e-mail.

## Desenvolvimento

```bash
npm install
npm test        # node:test, requer Node 22.18+ (roda TypeScript direto)
npm run coverage
npm run build  # gera dist/esm e dist/cjs
```

## Licença

MIT
