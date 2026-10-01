# Changelog

## 0.3.0

- Pacote publicado no npm como `@m4rquin/pix-brcode` (os nomes sem escopo `pix-brcode` e `brpix` foram barrados por semelhança com `pix-br-code` e `urix`).
- `qrSvg` e `qrMatrix`: gerador de QR Code próprio (modo byte, versões 1 a 40, níveis L/M/Q/H), sem dependências. Conferido contra a lib `qrcode` (todas as versões, máscaras e níveis) e lido de volta por um decodificador independente.
- Telefone: só celular com DDD real. E-mail: regras de tamanho e caracteres.
- `crc16` até 2x mais rápido no caso ASCII e correto para UTF-8.

## 0.2.0

- `detectKeyType` e `isValidKey`: validam CPF, CNPJ (inclusive alfanumérico), e-mail, telefone `+55` e chave aleatória (EVP).
- `generate` agora valida a chave por padrão (`validateKey: false` desliga).
- `generateDynamic`: gera BR Code dinâmico (campo 26.25 com a URL do PSP).
- `parse` passa a informar `dynamic`.
- Build duplo ESM + CommonJS (`require` e `import`).
- Teste com o exemplo oficial do manual do BR Code (CRC `1D3D`).

## 0.1.0

- `generate`, `parse`, `validate` e `crc16` para BR Code estático.
