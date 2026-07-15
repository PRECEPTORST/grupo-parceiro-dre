# GPResults — Contexto do Projeto

> Memória geral do app, para retomar o trabalho numa sessão nova sem perder o histórico.
> **Sempre ler e atualizar este arquivo ao começar/terminar.** Atualizado em **2026-07-15**.

---

## 1. O que é

**GPResults** é um web app de **DRE em tempo real + orçamento + fluxo de caixa + confiabilidade +
insights** para o cliente **Grupo Parceiro Agronegócios** (comércio de grãos — **soja, milho,
sorgo e café** + armazenagem/logística). Gera o DRE a partir dos lançamentos contábeis, compara
**realizado × orçado**, projeta caixa, checa a sanidade dos dados e usa IA (Claude) para leituras
executivas — sem nunca deixar a IA calcular o resultado.

- **Nome do produto:** GPResults. **Marca visual:** Grupo Parceiro (logo/cores).
- **Repositório local:** `~/Projects/grupo-parceiro-dre` (fora do iCloud, de propósito).
- **GitHub:** **PRIVADO** `Luvas-prog/grupo-parceiro-dre` (conta gh = **Luvas-prog**, ≠ conta Vercel
  `preceptorst`). `origin` configurado, `main` rastreando `origin/main` — `git push` normal.
- **Produção:** https://grupo-parceiro-dre.vercel.app (Vercel, projeto `preceptorst/grupo-parceiro-dre`).
- **Fornecedor/estúdio:** Preceptor! Venture Studio (Luciano). **Cliente:** Juliano (admin), sócios
  César e Isaias, e o "Controler".

## 2. Origem — a proposta e o que já foi entregue

Nasceu da proposta comercial (`Proposta_Preceptor_Grupo_Parceiro.pdf`), 3 sprints. **A proposta é
ponto de partida, NÃO escopo rígido** (orientação explícita do Luciano). Sprints: (1) DRE em tempo
real vs orçamento; (2) confiabilidade + projeção de fluxo de caixa; (3) alertas no WhatsApp com
materialidade. Recorrência: operação/SLA + consumo de IA (tokens Claude) repassado com transparência.

**Estado dos sprints:** Sprint 1 ✅, **Sprint 2 ✅ (fluxo de caixa + confiabilidade/materialidade)**,
Sprint 3 ⬜ (WhatsApp). **Além dos sprints, já entregue:** papel sócio + aprovação de orçamento,
plano de contas de grãos, importar orçamento (planilha/documento), DRE até a data de hoje, run-rate
nos insights, e **DRE por cereal + resultado por saca**.

## 3. Stack técnica

- **Front:** Vite + React 19 + TypeScript, Tailwind v4, Recharts (gráficos).
- **Back:** funções serverless da Vercel em `api/*.ts` (Node).
- **Persistência:** Vercel Blob privado (documento JSON versionado). `localStorage` como cache offline.
- **IA:** `@anthropic-ai/sdk`, modelo **`claude-opus-4-8`** (Claude Opus 4.8).
- **Lint/test:** oxlint, vitest (**46 testes**). **Deploy:** `npx vercel deploy --prod --yes`.

Fundação herdada do projeto irmão `preceptor-pricing` (mesmo padrão de auth/Blob).

## 4. Arquitetura — 4 camadas + REGRA DE OURO

```
Enoki (ERP)  →  Ingestão  →  Classificação (IA)  →  Motores determinísticos  →  UI
```

1. **Ingestão** — `api/safragold-sync.ts`: puxa os lançamentos conciliados. **Hoje devolve dados
   SIMULADOS** (integração real com o Enoki ainda não existe — ver seção 11).
2. **Classificação (agente Claude)** — `api/classificar.ts`: mapeia cada **conta** do ERP para uma
   linha do DRE, com grau de confiança. Só classifica as ainda não classificadas.
3. **Motores determinísticos (zero IA):** `src/lib/dre.ts` (DRE), `src/lib/caixa.ts` (fluxo de caixa),
   `src/lib/confiabilidade.ts` (sanidade/materialidade), `src/lib/graos.ts` (por cereal/saca),
   `src/lib/importar.ts` (parse de planilha). Todos testados.
4. **UI** — React (abas Início/DRE/Orçamento/Fluxo de caixa/Confiabilidade/Lançamentos/Usuários).

**REGRA DE OURO:** toda a matemática (DRE, caixa, materialidade, por-saca) é SEMPRE código puro e
determinístico. O Claude só **classifica contas**, **sugere/importa orçamento** e **narra insights/
resumos** — nunca calcula o resultado nem decide o que é anomalia. Um sócio jamais pode receber um
número que "mudou porque o modelo achou".

## 4.1. Plano de contas padrão (`src/lib/planoContas.ts`)

Catálogo canônico de ~86 contas para **comércio de grãos** (venda por cultura, deduções, CPV com
frete/armazenagem/quebra/hedge, despesas comerciais/administrativas, financeiras, IRPJ/CSLL), já
**classificado por linha do DRE**. `mapaEfetivo(classificacoes)` = plano como BASE + classificações
do usuário por cima (usuário sempre vence). **Todas as telas usam `mapaEfetivo`** → contas já nascem
classificadas; dá para orçar/ler o DRE mesmo sem lançamentos. `catalogoPorLinha()` alimenta o
Orçamento; `nomeConta(conta, fallback)` dá o nome exibido ("3.1.01 · Venda de soja"). `GRAO_DE_CONTA`
liga contas de venda/aquisição ao grão (soja/milho/sorgo/café). Existe **PDF do plano** em
`public/Plano_de_Contas_Grupo_Parceiro.pdf` (gerado do `planoContas.ts` via reportlab — **regenerar
de lá** quando o cliente ajustar), publicado para aprovação do cliente.

## 5. Modelo de dados (`src/lib/tipos.ts`)

- **`LancamentoCanonico`**: `{ id, data (ISO 'YYYY-MM-DD'), contaSafragold, historico, valor (reais,
  positivo), centroCusto? }`.
- **Linhas do DRE** (`LINHAS_DRE`, 10): receita_bruta, deducoes, custo_produto, despesas_comerciais,
  despesas_administrativas, outras_receitas_operacionais, depreciacao_amortizacao, receita_financeira,
  despesa_financeira, impostos_lucro. Cada uma tem rótulo + sinal (+1/-1).
- **Subtotais:** receita líquida, lucro bruto, resultado operacional (EBIT), EBITDA, resultado antes
  do IR, resultado líquido.
- **`Classificacao`**: `{ contaSafragold, linha, confianca (0..1), justificativa }`. Confiança < 0.8
  (`LIMIAR_REVISAO`) → fila de revisão.
- **`Orcamento`**: `{ competencia 'YYYY-MM', valores: Record<conta, number>, origem, atualizadoEm,
  status: 'rascunho'|'aprovado', aprovadoPor?, aprovadoEm? }`. **Orçamento é POR CONTA.**
- **`Grao`** = 'soja'|'milho'|'sorgo'|'cafe' (`GRAOS`, `ROTULO_GRAO`).
- **`EstadoDre`** (persistido no Blob): `{ lancamentos[], classificacoes[], orcamentos[],
  premissasCaixa?, confiabilidade?, sacas? }`. `sacas` = `Record<competencia, Partial<Record<Grao,
  number>>>` (sacas vendidas por grão/mês, informadas manualmente).

## 6. Funcionalidades por tela

- **Início (Dashboard)** — `DashboardPage.tsx`: hero "Resultado líquido", KPIs (receita líq., lucro
  bruto, EBITDA) com margem/desvio, evolução, Realizado × Orçado, maiores desvios, e o card
  **"✦ Insights"** (IA, sob demanda). No mês corrente mostra "(até DD/MM)" e a projeção de fechamento.
- **DRE** — `DrePage.tsx`: DRE **analítico** (cada linha expande nas contas; realizado × orçado ×
  desvio; subtotais). **DRE parcial até hoje** no mês corrente (`ateData`; nota "realizado até DD/MM").
  **Sacas + R$/saca** nos KPIs (receita líq., lucro bruto, resultado líq. = total ÷ sacas). Seção
  **"Resultado por cereal"** (`resumoGraos`): receita bruta / deduções / custo / lucro bruto por grão
  + lucro/saca. Rateio: **deduções pela receita**, **custos compartilhados do CPV por volume de sacas**,
  aquisição direta pela conta do grão. Soma dos lucros brutos por grão **reconcilia com o DRE**. Sacas
  informadas manualmente na própria tela (admin/sócio). Badge "pendente de aprovação" no orçamento.
- **Orçamento** — `OrcamentoPage.tsx`: contas por linha, valor por conta. **Status/aprovação**: badge
  (rascunho/pendente/aprovado), botões "Salvar rascunho" e (só sócio) "✓ Aprovar orçamento".
  **"✨ Sugerir com IA"** e **"⬆ Importar"** (modal 3 caminhos: manual, planilha/CSV determinístico
  `importar.ts`, ou documento via IA `api/importar-orcamento.ts`, com prévia).
- **Fluxo de caixa** — `CaixaPage.tsx` (Sprint 2): projeção determinística `caixa.ts`. Converte DRE
  (competência) em caixa por PRAZOS editáveis, projeta futuro por orçamento+histórico, roda o saldo a
  partir de um saldo inicial. Hero do saldo, alerta de liquidez, premissas editáveis, gráfico + tabela
  mensal, e **Detalhe DIÁRIO** (`projetarCaixaDiario`): curva dia a dia + **calendário** (cada dia com
  **a receber ▲ / a pagar ▼** e saldo; dias negativos em vermelho; menor saldo destacado). **Clicar no
  dia abre modal com TODOS os lançamentos.** Mensal e diário são _rollups_ da MESMA base de eventos
  (data exata) → sempre fecham. Depreciação é não-caixa. Seam do Enoki: `MovimentoCaixa[]`.
- **Confiabilidade** — `ConfiabilidadePage.tsx` (Sprint 2): motor `confiabilidade.ts` roda 6 regras
  (não classificada, baixa confiança, variação atípica, duplicidade, sumiço ≥3m, data futura).
  **Materialidade de DUAS TRILHAS:** custos/despesas por **piso R$ (default 1.000)**; receitas por
  **% da própria conta (default 3%)**. Variação de receita dispara a 3% da média; custo pelo relativo
  (60%) com piso R$. Severidade pesa contra o RESULTADO líquido. Índice de confiança (0–100%), achados
  por severidade (com **código · nome** da conta) e ações (reclassificar via Select, ignorar em
  `EstadoDre.confiabilidade`), resumo executivo da IA (`api/resumo-confiabilidade.ts`). É a base do Sprint 3.
- **Lançamentos** — `LancamentosPage.tsx`: tabela (data, conta **código · nome**, histórico, valor,
  linha do DRE via `mapaEfetivo`), botões **Sincronizar** e **Classificar** (admin).
- **Usuários** — `Usuarios.tsx`: gestão de usuários (sócio/admin).
- **Login** — `Login.tsx`: senha; 1º acesso cria o admin.

## 7. Papéis de acesso (4 níveis) + aprovação do orçamento

`Papel = 'socio' | 'admin' | 'orcamento' | 'consulta'` (`lib/auth.ts`, espelho em `src/lib/permissoes.ts`):
- **socio** — tudo do admin + **APROVA o planejamento orçamentário** (exclusivo). Vê Usuários (gate
  do menu usa `podeAdministrar` = sócio ou admin).
- **admin** — faz tudo (usuários, sincronizar, classificar, editar orçamento), menos aprovar.
- **orcamento** — vê tudo e edita o orçamento (rascunho).
- **consulta** — só visualiza.

**Aprovação (cliente):** orçamento tem `status`; só o sócio aprova; qualquer edição nos valores
volta a `rascunho`. Não aprovado **ainda é usado** como prévia, com badge "pendente de aprovação"
(Dashboard/DRE/Orçamento). **Enforcement no servidor** (`api/estado.ts::conciliarOrcamentos`): só o
sócio carimba `aprovado`; `consulta`→403; `orcamento` só grava a linha `orcamentos`. `api/usuarios.ts`:
sócio/admin gerenciam; mantém ≥1 admin-level. Papel revalidado a cada request (revogação imediata).

## 8. Agentes de IA (endpoints, todos Claude Opus 4.8; a IA só narra)

- `api/classificar.ts` — conta → linha do DRE (tool use, enum forçado, confiança).
- `api/sugerir-orcamento.ts` — orçamento por conta a partir do histórico + mercado de grãos.
- `api/importar-orcamento.ts` — extrai orçamento do TEXTO de um documento (só mapeia contas conhecidas).
- `api/insights.ts` — leitura executiva do DRE (resumo + pontos + recomendações). `max_tokens: 2800`,
  prompt conciso (senão trunca). No mês corrente recebe `diaAtual`/`diasNoMes` + projeção e devolve
  `projecaoFechamento` (contas que devem não atingir / estourar o orçado até o fim do mês).
- `api/resumo-confiabilidade.ts` — resumo executivo dos achados (só narra o que o motor detectou).

**DRE até a data:** `montarDre(comp, lanc, mapa, orc?, ateData?)` conta o realizado só até `ateData`.
Run-rate determinístico em `projecaoFechamento(dre, diaAtual, diasNoMes)` (extrapolação linear).
⚠️ Datas: formatar ISO com `formatDataBR` (split de string) — `new Date('YYYY-MM-DD')` é UTC e
desloca 1 dia em fuso negativo (BRT).

## 9. Identidade visual

- **Fonte de verdade:** manual de marca oficial (Google Drive, pasta `1v5Ql3qqEiG9xI3CmtGXJw-9YPWGZ8h6c`).
- **Paleta:** dourado `#CD8D05`, verde-escuro `#0F7A49`, verde-limão `#B0D243`, creme `#FFF0DA`.
  Tokens em `src/index.css`. **Fontes:** Oswald (títulos/números) + Sora (texto).
- **Tema CLARO/creme premium** com **menu lateral escuro** (escolha do cliente). Logo branco na
  sidebar, wordmark dourado "GPResults", ícones SVG (`src/components/icons.tsx`). Assets em `public/`.
- **NÃO pode ter "cara de BI"** (feedback explícito do cliente).

## 10. Deploy e infraestrutura

- **Vercel**, conta `preceptorst`, projeto `grupo-parceiro-dre`. Deploy via CLI
  `npx vercel deploy --prod --yes` (auto-deploy por git é intermitente — usar CLI). Padrão da sessão:
  commit → `git push origin main` → `npx vercel deploy --prod --yes`.
- **Variáveis de ambiente (Vercel):** `BLOB_READ_WRITE_TOKEN`, `AUTH_SECRET`, `ANTHROPIC_API_KEY`
  (todos configurados). `SAFRAGOLD_BASE_URL`/`SAFRAGOLD_API_KEY` — a preencher se a integração for por API.
- Preview do Vercel é **protegido por SSO** → cliente não acessa link de preview. Para o cliente ver
  ao vivo, publicar em PROD (temporariamente) ou usar o link direto de produção.
- `scripts/seed-demo.mjs` — semeia o Blob com um cenário de demonstração (lê token do `.env.local`).

## 11. Integração com o ERP Enoki — O GRANDE PENDENTE ⏳

ERP = **Enoki ERP.lab** (`https://parceirodograo.enoki.com.br/ERP.lab`). ("Safragold" na proposta é
como o cliente chamava; a plataforma real é a Enoki.)

- **Tecnologia:** ASP.NET/IIS sobre **Gizmox Visual WebGui** — transmite a UI de forma proprietária
  (tipo "área de trabalho remota" no browser). **NÃO tem API REST pronta** nem doc pública.
- **Caminhos possíveis** (mudam só o adapter `safragold-sync.ts::buscarDoSafragold()`+`normalizar()`):
  1. API/webservice (ideal), 2. export periódico (CSV/Excel), 3. acesso só-leitura ao banco,
  4. **web scraping via navegador** (paliativo — em avaliação agora).
- **Scraping (em andamento):** `scripts/enoki-scrape.mjs` (Playwright) = script de **reconhecimento**
  — loga (credenciais só do `.env.local`: `ENOKI_URL`/`ENOKI_USUARIO`/`ENOKI_SENHA`), tira screenshots
  e salva o DOM em `scripts/enoki-out/` (gitignored). **Rodar na máquina do Luciano** (`npm i -D
  playwright && npx playwright install chromium && node scripts/enoki-scrape.mjs`) e analisar a saída
  para ver SE dá pra raspar (Gizmox é frágil/proprietário). ⚠️ **Nunca colar senha no chat** (já houve
  vazamento do login CONSULTORIA em chat — trocar). Contato Enoki: Patrocínio-MG, WhatsApp +55 34 99126-9481.
- **Status:** app roda com **dados simulados** até destravar a fonte real.

## 12. Armadilhas / lições aprendidas

- **Recharts v3 + React StrictMode:** barras/áreas travam em altura 0 → SEMPRE `isAnimationActive={false}`.
- **Insights da IA:** verboso; `max_tokens: 2800` + pedir concisão (senão trunca recomendações).
- **Verificação de UI:** o preview do harness fica preso ao diretório da sessão. Padrão que funciona:
  **modo demo temporário** (`?demo=1` no `main.tsx` + auth simulada no `AuthContext` + `?rota=`/`?y=`),
  screenshot via computer-use, e **reverter**. Pegou bugs reais. ⚠️ **`git checkout` para reverter o
  demo APAGA edições REAIS que estejam no mesmo arquivo** (aconteceu com o papel `socio` no
  `AuthContext`) — reverter seletivamente ou só depois de commitar a parte real.
- **Datas ISO:** `new Date('YYYY-MM-DD')` é UTC → desloca 1 dia em BRT. Usar `formatDataBR` (split).
- **Vercel Blob:** força cache de CDN por pathname; cada gravação cria objeto novo (`addRandomSuffix`)
  e a leitura pega o mais recente via `list()` (ver `lib/blobdoc.ts`).
- **iCloud + git/node_modules** dá problema → projeto em `~/Projects` (fora do iCloud).
- **Ações de IA/backend não rodam no modo demo** (precisam de sessão real): Classificar, Sincronizar,
  Sugerir, Insights, Gerar resumo só funcionam na produção logado.

## 13. Estado atual (2026-07-15)

| Área | Status |
|---|---|
| Identidade visual + layout (menu lateral) | ✅ Publicado |
| Dashboard (KPIs, gráficos, insights + run-rate) | ✅ |
| DRE analítico + até a data de hoje | ✅ |
| DRE por cereal + resultado por saca | ✅ |
| Orçamento por conta (+ IA + importar planilha/doc) | ✅ |
| Papel sócio + aprovação de orçamento (4 papéis) | ✅ |
| Fluxo de caixa mensal + diário (Sprint 2) | ✅ |
| Confiabilidade/materialidade (Sprint 2) | ✅ |
| Plano de contas de grãos (+ PDF p/ aprovação) | ✅ |
| Dados | 🟡 Simulados (semeados) |
| **Integração Enoki (dados reais)** | ⏳ Scraping em reconhecimento |
| Sprint 3 (alertas WhatsApp) | ⬜ Próximo |

**Git:** branch `main`, último commit **`83be94c`** ("DRE por cereal + resultados por saca"). No
working tree: `scripts/enoki-scrape.mjs` (novo, não commitado) + `.gitignore` (enoki-out). GitHub
`Luvas-prog/grupo-parceiro-dre` (privado). **46 testes** passando. Layout alternativo descartado
preservado no commit `ce8f743`.

## 14. Rodar localmente

```bash
cd ~/Projects/grupo-parceiro-dre
npm install
npm test          # 46 testes (dre, caixa, confiabilidade, importar, graos)
npm run dev       # front (funções /api rodam no deploy Vercel — ver proxy no vite.config.ts)
npm run build     # tsc + vite
npm run lint      # oxlint (2 warnings pré-existentes de fast-refresh)
```

Login: 1º acesso cria o admin. `scripts/seed-demo.mjs` semeia a nuvem para demonstração.

## 15. Próximos passos

1. **Integração real com a Enoki** — rodar/analisar o `scripts/enoki-scrape.mjs` e decidir o caminho
   (scraping viável? senão cobrar export CSV / acesso ao banco). Destrava sair dos dados simulados.
2. **Sprint 3 — alertas no WhatsApp com materialidade** (o motor de confiabilidade já rankeia por
   materialidade → base pronta; falta escolher provedor: Twilio ou API oficial da Meta + custo).
3. Possíveis pedidos de UI: mais indicadores, insights automáticos vs sob demanda, ajustes por feedback.
