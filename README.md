# ResumoInteligente

Aplicativo web para transformar PDFs, DOCX, TXT e Markdown em resumos estruturados com IA.

## Requisitos

- Node.js 18+
- Uma chave do Google AI Studio para gerar resumos reais

## Instalação

```bash
npm install
npm --prefix server install
npm --prefix client install
copy .env.example .env
```

No macOS/Linux, use `cp .env.example .env` no último comando. Abra `.env` e preencha `GEMINI_API_KEY`. O padrão usa `gemini-3.6-flash`, mas você pode trocar em `GEMINI_MODEL`.

Crie a chave em [Google AI Studio](https://aistudio.google.com/apikey). Não compartilhe a chave nem faça commit do arquivo `.env`.

## Desenvolvimento

```bash
npm run dev
```

Acesse `http://localhost:5173`. O frontend usa o proxy do Vite para conversar com a API Express em `http://localhost:3001`.

O backend envia o texto para o Gemini e solicita JSON com resumo geral, 5 a 10 pontos importantes e 3 a 5 insights.

## Recursos

- Drag-and-drop e seleção de arquivos até 20 MB
- Extração com `pdf-parse` e `mammoth`
- Idiomas PT-BR, EN e ES; níveis curto, médio e detalhado
- Progresso de upload, estados de carregamento e mensagens de erro
- Exportação TXT/Markdown, cópia rápida e histórico em `localStorage`
- Tema claro/escuro responsivo

# resumointeligente
