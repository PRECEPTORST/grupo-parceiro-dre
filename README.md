# DRE — Grupo Parceiro

Agente de **DRE em tempo real** para o Grupo Parceiro (Preceptor! Venture Studio).
Gera o DRE a partir dos lançamentos conciliados no **Safragold**, compara o
realizado contra um **orçamento** e aponta os desvios. Sprint 1 da proposta.

## Arquitetura (4 camadas)

1. **Ingestão** — `api/safragold-sync.ts`: puxa os lançamentos conciliados do
   Safragold e normaliza para `LancamentoCanonico`. Hoje devolve dados
   **simulados** até termos o acesso real (ver TODO no arquivo).
2. **Classificação (agente Claude)** — `api/classificar.ts`: mapeia cada **conta**
   do Safragold para uma linha do DRE, com grau de confiança. Única parte com IA
   do Sprint 1. Classifica por conta e só as ainda não classificadas → custo baixo.
3. **Motor do DRE (determinístico)** — `src/lib/dre.ts`: agrega por linha e calcula
   os subtotais. Zero IA, 100% testado (`src/lib/dre.test.ts`). Compara realizado
   × orçado.
4. **UI** — React: abas **DRE**, **Orçamento** (manual / planilha / sugerido por IA)
   e **Lançamentos**.

A matemática do DRE é sempre determinística; o Claude só **classifica** e **sugere
orçamento**. Um sócio nunca recebe um número que mudou "porque o modelo achou".

## Rodar

```bash
npm install
npm test        # testes do motor do DRE
npm run dev     # front (as funções /api rodam no deploy Vercel — ver vite.config.ts)
```

## Variáveis de ambiente

Ver `.env.example`. Necessárias em produção (Vercel):

- `BLOB_READ_WRITE_TOKEN` — Vercel Blob (estado + usuários).
- `AUTH_SECRET` — segredo do cookie de sessão (HMAC).
- `ANTHROPIC_API_KEY` — Claude (classificação + sugestão de orçamento).
- `SAFRAGOLD_BASE_URL` / `SAFRAGOLD_API_KEY` — **a preencher** quando descobrirmos
  como o Safragold entrega os dados. Sem isso, o sync devolve dados simulados.

## Próximos passos (roadmap da proposta)

- **Sprint 1 (aqui):** DRE em tempo real + comparação com orçamento. Falta fechar
  a integração real do Safragold (passo 0).
- **Sprint 2:** camada de confiabilidade (testes de sanidade, "provável erro" ×
  "desvio real com materialidade") + projeção de caixa. A `confianca` da
  classificação e a fila de revisão já são as sementes.
- **Sprint 3:** alertas no WhatsApp com materialidade e frequência.

## Fundação herdada do preceptor-pricing

Auth por token (cookie HMAC + papéis), Blob versionado com leitura consistente
(`lib/auth.ts`, `lib/blobdoc.ts`), sync em nuvem com cache offline
(`src/context/DreContext.tsx`). Mesmo padrão, cliente/produto diferentes.
