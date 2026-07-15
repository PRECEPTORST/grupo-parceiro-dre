# GPResults — Contexto do Projeto

> Documento de contexto geral do app. Serve para retomar o trabalho em uma sessão
> nova sem perder o histórico. Atualizado em **2026-07-15**.

---

## 1. O que é

**GPResults** é um web app de **DRE em tempo real + orçamento + insights** para o cliente
**Grupo Parceiro Agronegócios** (comércio de grãos — soja, milho, café, logística).
Gera o DRE a partir dos lançamentos contábeis, compara o **realizado × orçado**, aponta
desvios e usa IA (Claude) para dar uma leitura executiva desses desvios.

- **Nome do produto:** GPResults. **Marca visual:** Grupo Parceiro (logo/cores).
- **Repositório local:** `~/Projects/grupo-parceiro-dre` (fora do iCloud, de propósito).
- **Produção:** https://grupo-parceiro-dre.vercel.app (Vercel, projeto `preceptorst/grupo-parceiro-dre`).
- **Fornecedor/estúdio:** Preceptor! Venture Studio (Luciano). **Contato no cliente:** Juliano (admin), sócios César e Isaias, além do "Controler".

## 2. Origem — a proposta

Nasceu da proposta comercial (`Proposta_Preceptor_Grupo_Parceiro.pdf`), vendida em 3 sprints.
**Importante: a proposta é ponto de partida, NÃO escopo rígido** (orientação explícita do Luciano).
Sprints originais: (1) DRE em tempo real vs orçamento; (2) camada de confiabilidade +
projeção de fluxo de caixa; (3) alertas no WhatsApp com materialidade. Recorrência prevista:
operação/SLA + consumo de IA (tokens Claude) repassado com transparência.

Hoje o app já vai além do Sprint 1 (dashboard, insights, orçamento por conta). Sprints 2 e 3
(projeção de caixa, testes de sanidade/materialidade, alertas WhatsApp) **ainda não** foram feitos.

## 3. Stack técnica

- **Front:** Vite + React 19 + TypeScript, Tailwind v4, Recharts (gráficos).
- **Back:** funções serverless da Vercel em `api/*.ts` (Node).
- **Persistência:** Vercel Blob privado (documento JSON versionado). `localStorage` como cache offline.
- **IA:** `@anthropic-ai/sdk`, modelo **`claude-opus-4-8`** (Claude Opus 4.8).
- **Lint/test:** oxlint, vitest. **Deploy:** `npx vercel deploy --prod --yes`.

Fundação herdada do projeto irmão `preceptor-pricing` (mesmo padrão de auth/Blob).

## 4. Arquitetura — 4 camadas

```
Safragold/Enoki  →  Ingestão  →  Classificação (IA)  →  Motor do DRE (código puro)  →  UI
```

1. **Ingestão** — `api/safragold-sync.ts`: puxa os lançamentos conciliados. **Hoje devolve dados
   SIMULADOS** (a integração real com o ERP ainda não existe — ver seção 11).
2. **Classificação (agente Claude)** — `api/classificar.ts`: mapeia cada **conta** do ERP para uma
   linha do DRE, com grau de confiança. Classifica por conta e só as ainda não classificadas.
3. **Motor do DRE (determinístico)** — `src/lib/dre.ts`: agrega e calcula. **Zero IA.** Testado
   (`src/lib/dre.test.ts`, 8 testes).
4. **UI** — React (abas Início/DRE/Orçamento/Lançamentos/Usuários).

**REGRA DE OURO:** a matemática do DRE é SEMPRE código puro e determinístico. O Claude só
**classifica contas**, **sugere orçamento** e **gera insights** — nunca calcula o resultado.
Um sócio jamais pode receber um número que "mudou porque o modelo achou".

## 5. Modelo de dados (`src/lib/tipos.ts`)

- **`LancamentoCanonico`**: `{ id, data (ISO), contaSafragold, historico, valor (reais, positivo), centroCusto? }`.
- **Linhas do DRE** (`LINHAS_DRE`): receita_bruta, deducoes, custo_produto, despesas_comerciais,
  despesas_administrativas, outras_receitas_operacionais, depreciacao_amortizacao,
  receita_financeira, despesa_financeira, impostos_lucro. Cada uma tem rótulo + sinal (+1/-1).
- **Subtotais calculados:** receita líquida, lucro bruto, resultado operacional (EBIT), EBITDA,
  resultado antes do IR, resultado líquido.
- **`Classificacao`**: `{ contaSafragold, linha, confianca (0..1), justificativa }`. Confiança < 0.8
  (`LIMIAR_REVISAO`) → marca para revisão (semente do Sprint 2).
- **`Orcamento`**: `{ competencia 'YYYY-MM', valores: Record<contaSafragold, number>, origem, atualizadoEm }`.
  **Orçamento é POR CONTA** (não por linha); os totais de linha e subtotais são derivados.
- **`EstadoDre`** (persistido no Blob): `{ lancamentos[], classificacoes[], orcamentos[] }`.

## 6. Funcionalidades por tela

- **Início (Dashboard)** — `DashboardPage.tsx`: hero de "Resultado líquido" (Oswald + sparkline),
  KPIs (receita líquida, lucro bruto, EBITDA) com margem e desvio, gráfico de evolução (área),
  Realizado × Orçado (barras), maiores desvios do mês, e o card **"✦ Insights"** (IA, sob demanda).
- **DRE** — `DrePage.tsx`: DRE **analítico** — cada linha expande nas **contas** que a compõem
  (realizado × orçado × desvio, cores por sinal), com subtotais. Botão recolher/expandir tudo.
- **Orçamento** — `OrcamentoPage.tsx`: todas as contas agrupadas por linha do DRE, valor por conta;
  botão **"✨ Sugerir com IA"**. Abre na competência mais recente que tem dados.
- **Fluxo de caixa** — `CaixaPage.tsx` (Sprint 2): projeção de caixa mês a mês. Motor determinístico
  `src/lib/caixa.ts` (`projetarCaixa`, zero IA) converte o DRE (competência) em caixa por PRAZOS
  editáveis (recebimento/pagamento/impostos), projeta os meses futuros por orçamento+histórico e
  roda o saldo a partir de um saldo inicial. Hero do saldo projetado, alerta de liquidez (1º mês
  negativo — semente do Sprint 3), premissas editáveis (admin/orçamento), gráfico entradas/saídas +
  saldo e tabela mês a mês. **Detalhe DIÁRIO** (`projetarCaixaDiario`): seletor de mês do horizonte,
  curva dia a dia + **calendário do mês** (cada dia mostra **a receber**/**a pagar** e saldo; dias
  negativos em vermelho, menor saldo destacado) — mostra furos de caixa dentro do mês mesmo que ele
  feche positivo. **Clicar num dia abre um modal com TODOS os lançamentos** que compõem aquele caixa
  (conta, histórico, linha do DRE, data de origem; itens de mês projetado marcados como "projeção").
  O mensal e o diário são _rollups_ da
  MESMA base de eventos de caixa (data exata), então sempre fecham. Realizado usa a data real do
  lançamento + prazo; meses futuros replicam o ritmo diário do histórico. Depreciação é não-caixa
  (fica de fora). Seam do Enoki: `projetarCaixa`/`projetarCaixaDiario` aceitam `MovimentoCaixa[]`
  (contas a pagar/receber com vencimento) que substituem a estimativa por prazo quando existirem.
  Testado (`src/lib/caixa.test.ts`, 12 testes, incl. consistência mensal↔diário).
- **Lançamentos** — `LancamentosPage.tsx`: tabela dos lançamentos; botões **Sincronizar Safragold**
  e **Classificar** (admin). Mostra a linha do DRE de cada conta e marca as de baixa confiança.
- **Usuários** — `Usuarios.tsx`: gestão de usuários (só admin).
- **Login** — `Login.tsx`: senha; 1º acesso cria o admin.

## 7. Papéis de acesso (3 níveis)

Definidos em `lib/auth.ts` (`Papel = 'admin' | 'orcamento' | 'consulta'`) e espelhados no front
em `src/lib/permissoes.ts`:
- **admin** — faz tudo (usuários, sincronizar, classificar, orçamento).
- **orcamento** ("Consulta + orçamento") — vê tudo e edita o orçamento.
- **consulta** ("Somente consulta") — só visualiza.

**Enforcement REAL no servidor** (`api/estado.ts`): `consulta` recebe 403 no PUT; `orcamento` só
grava a linha `orcamentos` (lançamentos/classificações são preservados). A UI só esconde botões.
O papel é revalidado a cada request (revogação/mudança imediata).

## 8. Agentes de IA (endpoints, todos com Claude Opus 4.8)

- `api/classificar.ts` — conta → linha do DRE (tool use, enum forçado, confiança).
- `api/sugerir-orcamento.ts` — orçamento por conta a partir do histórico + mercado de grãos.
- `api/insights.ts` — análise executiva do DRE (realizado × orçado): resumo + pontos
  (positivo/atenção/risco) + recomendações. `max_tokens: 2800` e prompt conciso (senão trunca
  as recomendações). Card no Dashboard, sob demanda (controla custo de token).

## 9. Identidade visual

- **Fonte de verdade:** manual de marca oficial do Grupo Parceiro (Google Drive público, pasta
  `1v5Ql3qqEiG9xI3CmtGXJw-9YPWGZ8h6c`). Baixado e usado.
- **Paleta oficial:** dourado `#CD8D05`, verde-escuro `#0F7A49`, verde-limão `#B0D243`,
  creme `#FFF0DA`, preto/branco. Tokens em `src/index.css`.
- **Fontes:** **Oswald** (títulos/números) + **Sora** (texto).
- **Tema CLARO/creme premium** com **menu lateral escuro** (opção escolhida pelo cliente após
  comparar duas ao vivo). Logo branco na sidebar (`gp-logo-white.png`/`gp-mark-white.png`, gerados
  recolorindo o logo oficial), wordmark dourado "GPResults", ícones SVG (`src/components/icons.tsx`).
- Assets em `public/`. Favicon = escudo dourado.
- **NÃO pode ter "cara de BI"** (feedback explícito do cliente).

## 10. Deploy e infraestrutura

- **Vercel**, conta `preceptorst`, projeto `grupo-parceiro-dre`. Deploy via CLI:
  `npx vercel deploy --prod --yes` (auto-deploy por git é intermitente — usar CLI).
- **Variáveis de ambiente** (Vercel):
  - `BLOB_READ_WRITE_TOKEN` — Blob store privado `grupo-parceiro-dre` (todos os ambientes).
  - `AUTH_SECRET` — HMAC do cookie de sessão (Production + Preview).
  - `ANTHROPIC_API_KEY` — chave própria do projeto (todos os ambientes; validada).
  - `SAFRAGOLD_BASE_URL` / `SAFRAGOLD_API_KEY` — **a preencher** quando a integração existir.
- Preview do Vercel é **protegido por SSO** → cliente não acessa link de preview. Para o cliente
  avaliar variantes ao vivo, publicar em PROD temporariamente e reverter.
- `scripts/seed-demo.mjs` — utilitário que semeia o estado da nuvem com um cenário de demonstração
  (lê o token do `.env.local`). Foi usado para o cliente ver o app cheio de dados.

## 11. Integração com o ERP — O ÚNICO GRANDE PENDENTE ⏳

O ERP do Grupo Parceiro é o **Enoki ERP.lab** (fabricante Enoki, `enoki.com.br`), acessado em
`https://parceirodograo.enoki.com.br/ERP.lab`. (O "Safragold" mencionado na proposta é como o
cliente se referia; a plataforma real é a Enoki.)

- **Tecnologia:** ASP.NET/IIS sobre **Gizmox Visual WebGui** — framework antigo que transmite a
  UI de forma proprietária (tipo "área de trabalho remota" no browser). **NÃO tem API REST pronta**
  e a Enoki não publica documentação de API.
- **Credencial de consultoria** fornecida (login CONSULTORIA) — trocar depois, foi exposta em chat.
- **Caminho:** depende da **Enoki** (empresa em Patrocínio-MG, WhatsApp +55 34 99126-9481). Três
  opções possíveis, todas suportadas pela arquitetura do app (muda só o adapter `safragold-sync.ts`):
  1. **API/webservice** (ideal), 2. **exportação periódica** (CSV/Excel), 3. **acesso só-leitura ao banco**.
- **Status:** aguardando resposta da Enoki. Enquanto isso, o app roda com **dados simulados**.

Quando o acesso existir: implementar `buscarDoSafragold()` e `normalizar()` em `api/safragold-sync.ts`
(normalizar = mapear os campos reais para `LancamentoCanonico`, resolvendo débito/crédito → valor positivo).

## 12. Armadilhas / lições aprendidas

- **Recharts v3 + React StrictMode:** as barras/áreas travam em altura 0. **SEMPRE** usar
  `isAnimationActive={false}` em `<Bar>`/`<Line>`/`<Area>`.
- **Insights da IA:** o modelo é verboso e trunca as recomendações se `max_tokens` for baixo. Usar
  2800 + pedir concisão no prompt.
- **Verificação de UI:** a ferramenta de preview do harness fica presa ao diretório da sessão. Para
  ver este app, rodou-se um **modo demo** temporário (`?demo=1` no `main.tsx` + auth simulada),
  screenshot, e reverteu. Vale a pena — pegou bugs reais (gráficos vazios) antes do deploy.
- **Vercel Blob:** força cache de CDN na leitura por pathname fixo; por isso cada gravação cria um
  objeto novo (`addRandomSuffix`) e a leitura pega o mais recente via `list()` (ver `lib/blobdoc.ts`).
- **iCloud + git/node_modules** dá problema → projeto fica em `~/Projects` (fora do iCloud).

## 13. Estado atual (2026-07-15)

| Área | Status |
|---|---|
| Identidade visual + layout (menu lateral) | ✅ Publicado |
| Dashboard (KPIs, gráficos, insights) | ✅ |
| DRE analítico (contas por linha) | ✅ |
| Orçamento por conta (+ sugestão IA) | ✅ |
| Papéis de acesso (3 níveis, enforced) | ✅ |
| Insights da IA sobre desvios | ✅ |
| Projeção de fluxo de caixa (Sprint 2) | ✅ Código + testes (pendente deploy) |
| Dados | 🟡 Simulados (semeados para avaliação) |
| **Integração Enoki (dados reais)** | ⏳ Aguardando Enoki |
| Sprint 2 (materialidade/confiabilidade) | ⬜ Próximo |
| Sprint 3 (alertas WhatsApp) | ⬜ Não iniciado |

**Git:** branch `main`, último commit `5706597`. Layout alternativo "relatório no topo" (descartado
pelo cliente) preservado no commit `ce8f743`.

## 14. Rodar localmente

```bash
cd ~/Projects/grupo-parceiro-dre
npm install
npm test          # motor do DRE (8 testes)
npm run dev       # front (funções /api rodam no deploy Vercel — ver proxy no vite.config.ts)
npm run build     # tsc + vite
npm run lint      # oxlint
```

Login: 1º acesso cria o admin. Para ver dados sem sincronizar, `scripts/seed-demo.mjs` semeia a nuvem.

## 15. Próximos passos prováveis

1. **Integração real com a Enoki** (destrava tudo — sair dos dados simulados).
2. Projeção de fluxo de caixa (Sprint 2).
3. Camada de confiabilidade / materialidade (testes de sanidade nos lançamentos).
4. Alertas no WhatsApp (Sprint 3).
5. Possíveis pedidos de UI: mais indicadores no dashboard, insights automáticos vs sob demanda.
