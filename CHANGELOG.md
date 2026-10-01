# Changelog

## 0.2.0

- `detectKeyType` e `isValidKey`: validam CPF, CNPJ (inclusive alfanumérico), e-mail, telefone `+55` e chave aleatória (EVP).
- `generate` agora valida a chave por padrão (`validateKey: false` desliga).
- `generateDynamic`: gera BR Code dinâmico (campo 26.25 com a URL do PSP).
- `parse` passa a informar `dynamic`.
- Build duplo ESM + CommonJS (`require` e `import`).
- Teste com o exemplo oficial do manual do BR Code (CRC `1D3D`).

## 0.1.0

- `generate`, `parse`, `validate` e `crc16` para BR Code estático.
