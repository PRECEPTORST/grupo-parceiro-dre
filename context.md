# GPResults — Contexto do Projeto

> Memória geral do app, para retomar o trabalho numa sessão nova sem perder o histórico.
> **Sempre ler e atualizar este arquivo ao começar/terminar.** Atualizado em **2026-07-16**.

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
nos insights, **DRE por cereal + resultado por saca**, **insights e sincronização do Safragold
automáticos**, **orçamento por periodicidade (mensal/trimestral/quadrimestral/anual)** e **receita de
grão orçada por sacas × preço + meta × realizado**.

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
   `src/lib/importar.ts` (parse de planilha), `src/lib/orcamento.ts` (periodicidade + distribuição
   sazonal + receita de grão sacas × preço). Todos testados.
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
- **`Orcamento`**: `{ competencia 'YYYY-MM', valores: Record<conta, number>, sacas?: Record<conta,
  number>, precoSaca?: Record<conta, number>, margemSaca?: Record<conta, number>, origem, atualizadoEm,
  status: 'rascunho'|'aprovado', aprovadoPor?, aprovadoEm? }`. **Orçamento é POR CONTA e sempre mês a
  mês.** Contas de RECEITA DE GRÃO (3.1.0x): `valores[receita] = sacas × precoSaca` (venda); **`margemSaca`
  = margem bruta esperada R$/saca → preço de compra/saca = precoSaca − margemSaca → `valores[custo 4.1.0x]
  = sacas × preço de compra`** (aquisição). Logo receita − custo = sacas × margem (reconcilia no DRE).
  Chaves de `sacas`/`precoSaca`/`margemSaca` são a conta de RECEITA (3.1.0x); a conta de custo (4.1.0x)
  é derivada. As demais contas só têm `valores`. A **periodicidade** (mensal/trimestral/quadrimestral/
  anual) é só a lente de edição — o dado continua um `Orcamento` por competência (DRE/caixa/dashboard não
  mudam). Retrocompatível: orçamento antigo que gravava receita/custo de grão só por valor é preservado
  até informar sacas/preço/margem (`graoAtivo` = tem sacas OU preço OU margem).
- **`Grao`** = 'soja'|'milho'|'sorgo'|'cafe' (`GRAOS`, `ROTULO_GRAO`).
- **`EstadoDre`** (persistido no Blob): `{ lancamentos[], classificacoes[], orcamentos[],
  premissasCaixa?, confiabilidade?, sacas? }`. `sacas` = `Record<competencia, Partial<Record<Grao,
  number>>>` (sacas vendidas por grão/mês, informadas manualmente).

## 6. Funcionalidades por tela

- **Início (Dashboard)** — `DashboardPage.tsx`: hero "Resultado líquido", KPIs (receita líq., lucro
  bruto, EBITDA) com margem/desvio, evolução, Realizado × Orçado, maiores desvios, e o card
  **"✦ Insights"** (IA). No mês corrente mostra "(até DD/MM)" e a projeção de fechamento. **Insights
  AUTOMÁTICOS:** o card gera a análise sozinho ao abrir e ao trocar de competência (guarda de `useRef`
  contra refetch no StrictMode); o botão vira "Atualizar análise" (regeração manual). ⚠️ Gasta token a
  cada geração — se virar problema, cachear a análise por competência no Blob.
- **DRE** — `DrePage.tsx`: DRE **analítico** (cada linha expande nas contas; realizado × orçado ×
  desvio; subtotais). **DRE parcial até hoje** no mês corrente (`ateData`; nota "realizado até DD/MM").
  **Sacas + R$/saca** nos KPIs (receita líq., lucro bruto, resultado líq. = total ÷ sacas). Seção
  **"Resultado por cereal"** (`resumoGraos`): receita bruta / deduções / custo / lucro bruto por grão
  + lucro/saca. Rateio: **deduções pela receita**, **custos compartilhados do CPV por volume de sacas**,
  aquisição direta pela conta do grão. Soma dos lucros brutos por grão **reconcilia com o DRE**. Sacas
  informadas manualmente na própria tela (admin/sócio). Badge "pendente de aprovação" no orçamento.
  **Painel "Meta × realizado por grão"** (`metasGrao`): quando há orçamento de sacas/preço/margem,
  compara **volume (sacas)**, **preço/saca** e **margem/saca**, real × meta, com variação ▲/▼. Realizado:
  preço/saca = receita bruta ÷ sacas; **margem/saca = (receita bruta − aquisicao) ÷ sacas** (spread
  venda − compra, sem deduções nem CPV rateado — casa com a margem orçada). Meta vem de
  `Orcamento.sacas`/`precoSaca`/`margemSaca`. `resumoGraos` expõe `aquisicao` (compra direta 4.1.0x).
- **Orçamento** — `OrcamentoPage.tsx`: **Periodicidade** (mensal/trimestral/quadrimestral/anual, fixa
  no calendário) + Ano + Período no cabeçalho. **Mensal** = tela de um input por conta; **tri/quadri/
  anual** = GRADE mês a mês (colunas = meses do período) + coluna **"Total do período"** que distribui
  pela **sazonalidade do histórico** da conta (`distribuirSazonal`; fallback igual, soma fecha exata).
  **Receita de grão** tem seção própria **"Receita e custo por grão · sacas × preço × margem"**: por mês
  informa **sacas + preço venda/saca + margem bruta/saca**; deriva **preço compra/saca (venda − margem)**,
  **= Receita** (sacas × venda), **(−) Custo aquisição** (sacas × compra, grava na conta 4.1.0x) e **=
  Margem bruta** (receita − custo). Contas de receita E custo de grão saem do editor de valor (derivadas,
  sem dupla entrada). **Impostos automáticos — SÓ REFERÊNCIA no Orçamento, NÃO entra no orçamento salvo nem
  no DRE** (decisão do cliente: no DRE os tributos vêm do Enoki/realizado). Botão "⚙ Alíquotas" →
  `ModalImpostos`: tabela de `RegraImposto` (nome · conta · base venda/compra/margem · alíquota %) em
  `EstadoDre.impostos` (default `impostosPadrao`: Funrural 1,5% compra, PIS 0,65% venda, COFINS 3% venda,
  ICMS 0% inativo — EDITÁVEIS, confirmar com contador). A seção "Impostos automáticos" só EXIBE a
  estimativa por mês/regra (base venda = TODA a receita orçada EXCETO financeira; compra = aquisição de
  grão; margem = venda − compra). NÃO grava em `Orcamento.valores`. As contas de regra ATIVA saem do
  editor de valor (aparecem só na estimativa, sem dupla entrada) e não são persistidas (limpa até valor
  legado); contas de dedução SEM regra ativa (ex.: ISS, devoluções) seguem editáveis normalmente. **Salvar/Aprovar agem sobre TODOS os meses do período**; badge de status é
  agregado. **"✨ Sugerir com IA"** e **"⬆ Importar"** atuam só nas **contas de valor** (import = totais
  do período distribuídos pela sazonalidade); a receita de grão é planejada na grade sacas × preço.
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
  linha do DRE via `mapaEfetivo`), botões **Sincronizar** e **Classificar** (admin). **Sincronização
  AUTOMÁTICA:** o Safragold sincroniza sozinho uma vez por sessão ao abrir o app (após hidratar a
  nuvem, só para quem pode gravar) — a lógica é `sincronizarSafragold` no `DreContext`, reusada pelo
  botão manual. Não gasta token (só puxa dados). Consulta/orçamento não disparam o auto-sync.
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
- **Verificação de UI:** o preview do harness serve **o projeto do diretório da SESSÃO**. Se a sessão
  abrir fora de `~/Projects/grupo-parceiro-dre` (ex.: rodando o Claude a partir de `preceptor-pricing`),
  o preview serve o OUTRO app. Soluções: (a) **abrir o Claude Code direto em `~/Projects/grupo-parceiro-
  dre`** (aí a config `dre` na porta 5173 já funciona); ou (b) repontar: adicionar uma config no
  `launch.json` da sessão rodando `npm --prefix ~/Projects/grupo-parceiro-dre run dev -- --port 5174`.
- **Modo de verificação local (`?demo`)** — AGORA É FEATURE DE DEV COMMITADA (`src/dev/demo.tsx`, ativado
  em `main.tsx` por import dinâmico sob `import.meta.env.DEV`): mocka a auth (`AuthContext` exportado) e
  semeia um cenário no localStorage → confere Orçamento/DRE sem backend/login. **Fora do bundle de
  produção** (verificado). Rodar `npm run dev` e abrir `?demo`. Substitui o antigo hack temporário — não
  precisa mais editar/reverter `main.tsx`/`AuthContext` à mão nem arriscar `git checkout` apagando edição real.
- **Datas ISO:** `new Date('YYYY-MM-DD')` é UTC → desloca 1 dia em BRT. Usar `formatDataBR` (split).
- **Vercel Blob:** força cache de CDN por pathname; cada gravação cria objeto novo (`addRandomSuffix`)
  e a leitura pega o mais recente via `list()` (ver `lib/blobdoc.ts`).
- **iCloud + git/node_modules** dá problema → projeto em `~/Projects` (fora do iCloud).
- **Ações de IA/backend não rodam no modo demo** (precisam de sessão real): Classificar, Sincronizar,
  Sugerir, Insights, Gerar resumo só funcionam na produção logado.

## 13. Estado atual (2026-07-16)

| Área | Status |
|---|---|
| Identidade visual + layout (menu lateral) | ✅ Publicado |
| Dashboard (KPIs, gráficos) + **insights AUTOMÁTICOS** + run-rate | ✅ |
| DRE analítico + até a data de hoje | ✅ |
| DRE por cereal + resultado por saca + **meta × realizado (volume/preço/margem)** | ✅ |
| **Orçamento por periodicidade** (mensal→anual, grade mês a mês) | ✅ |
| **Receita de grão por sacas × preço** (valor calculado) | ✅ |
| **Margem bruta/saca → preço de compra + custo de aquisição** (grão) | ✅ |
| **Impostos automáticos** (estimativa % venda/compra — só referência no Orçamento) | ✅ |
| Orçamento por conta (+ IA + importar planilha/doc) | ✅ |
| Papel sócio + aprovação de orçamento (4 papéis) | ✅ |
| Fluxo de caixa mensal + diário (Sprint 2) | ✅ |
| Confiabilidade/materialidade (Sprint 2) | ✅ |
| Plano de contas de grãos (+ PDF p/ aprovação) | ✅ |
| **Sincronização Safragold automática** ao abrir | ✅ |
| Modo de verificação local `?demo` (dev) | ✅ |
| Dados | 🟢 **Reais jan–jun/2026** (DRE gerencial do cliente importada — ver §16) |
| **Integração Enoki (dados reais)** | ⏳ Scraping em reconhecimento |
| Sprint 3 (alertas WhatsApp) | ⬜ Próximo |

**Git:** branch `main`, último commit **`74ff0e6`** ("Orçamento de grão: margem bruta/saca → preço de
compra e custo"). Sessão 2026-07-16 (todos publicados em prod via CLI): `99c624a` insights automáticos,
`3d8fe9a` sync Safragold automático, `3891891` orçamento por periodicidade, `1fd9dd4` receita de grão
sacas×preço + meta×realizado, `0e1c8dd` modo `?demo`, `bbca565` context.md, `74ff0e6` margem/custo por
grão + meta×realizado de margem/saca + impostos automáticos no orçamento. GitHub `Luvas-prog/grupo-
parceiro-dre` (privado). **64 testes** passando. No working tree:
`scripts/enoki-scrape.mjs` (novo, não commitado) + `.gitignore` (enoki-out). Layout descartado em `ce8f743`.

**FEITO nesta sessão (2026-07-16, cont.):** (1) Painel **Meta × realizado** (DRE por cereal) compara
também **margem/saca orçada × realizada** — margem ORÇADA = spread venda − compra (`margemSaca`); margem
REALIZADA = `(receitaBruta − aquisicao)/sacas` (SEM deduções/CPV rateado); `resumoGraos` expõe
`aquisicao`. (2) **Impostos automáticos** no orçamento (ver seção 6): tabela de alíquotas editáveis
deriva as deduções (PIS/COFINS/Funrural/ICMS) de venda/compra e lança nas contas do DRE.

**RETOMAR AQUI (roadmap, seção 15):** Sprint 3 WhatsApp. Fonte contábil jan–jun JÁ CARREGADA na mão
(ver §16). Possível: IRPJ/CSLL sobre o RESULTADO (não sobre margem bruta — precisa do resultado após
despesas; melhor no nível DRE, não na seção de grão).

## 16. Importação manual da DRE gerencial jan–jun/2026 (sessão 2026-08-04)

Enquanto a Enoki não abre, o cliente mandou a planilha **`DRE ACUMULADO _CEREAIS.xlsx`** (aba "DRE ACUM
(2)", 1 coluna por mês). Importados **só jan–jun/2026** como dados REAIS, substituindo os simulados.

- **Contas NÃO seguem o plano** → classifiquei cada uma **pela descrição** (pedido do Luciano). Códigos
  sintéticos por grupo: `R.`/`D.`/`C.`/`DC.`/`DA.`/`DEP.`/`RF.`/`DF.`/`OR.`/`IL.` (63 contas). Aparecem
  no **DRE analítico** dentro da sua linha (o cliente quer o DRE "aberto" com todas as despesas/receitas).
- **Geração:** script Python lê o xlsx → `estado-real.json` (`{lancamentos, classificacoes, orcamentos:[]}`,
  269 lançamentos, 1 por conta×mês, `valor=abs`, zeros descartados, data=último dia do mês). Gravado no
  Blob por **`scripts/seed-real.mjs <json>`** (lê `BLOB_READ_WRITE_TOKEN` do `.env.local`; remove versões
  antigas). ⚠️ **O JSON e o gerador têm valores financeiros do cliente → ficam FORA do git** (no scratchpad
  da sessão). `seed-real.mjs` é genérico e foi commitado.
- **Sinais validados** contra o "LUCRO/PREJUÍZO" da planilha: batem exato em Jan/Fev/Abr/Mai. **Resíduos
  de auditoria:** Mar −R$ 802 e Jun −R$ 28.168 vêm de **ajuste manual nos subtotais da planilha** (em Jun
  o CUSTO TOTAL foi reduzido pelo "Desconto Obtido") — a soma das contas visíveis não fecha com o subtotal
  do cliente. Nossa versão soma as contas honestamente → **achado real de auditoria** p/ discutir c/ o cliente.
- **Excluídos do DRE:** seção INVESTIMENTOS (veículos, consórcios, terreno) — são capex, ficam abaixo da
  linha na própria planilha.
- **Classificações a confirmar (⚠️):** COMISSÃO→comerciais (planilha punha no custo); FRETE→CPV (assumido
  frete de compra/logística; se for de venda vira comercial); RETIRADA SÓCIOS→administrativas (é
  distribuição, tecnicamente fora do DRE); PERDA INADIMPLÊNCIA (R$ 910k em abr, derruba o mês)→administrativas;
  ICMS-PARCELAMENTO→deduções; MÓVEIS/UTENSÍLIOS→administrativas (pode ser imobilizado).
- ⚠️ **Anti-poluição:** `api/safragold-sync.ts::lancamentosSimulados()` agora devolve **`[]`** — antes
  injetava `sim-1…sim-12` (contas 3.1.01 etc.) que o auto-sync mergeava por cima do realizado e persistia
  na nuvem. Reativar dados fake NUNCA; quando a Enoki entrar, `buscarDoSafragold()` assume.
- **Reimportar** (se o cliente mandar planilha corrigida): regerar o `estado-real.json` e rodar
  `node scripts/seed-real.mjs <json>`. Sem orçamento nesta carga (`orcamentos:[]`) — DRE mostra só realizado.

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

**PRIORIDADE NOVA (definida em 2026-07-15): AUDITAR o DRE de jan–jun, mês a mês, DENTRO do app.**
A situação real não é só extrair da Enoki — é que **os números da Enoki não são confiáveis** e
precisam ser auditados antes de virar DRE. O cliente quer o app como **ferramenta de auditoria**.
Três dimensões da auditoria (feedback do Luciano):
  1. **Classificação** — contas caindo na linha errada do DRE. → JÁ EXISTE (reclassificar via
     `mapaEfetivo`/`classificacoes`; regras `nao_classificada`/`baixa_confianca`).
  2. **Duplicidade** — lançamentos repetidos. → JÁ EXISTE (regra `duplicidade` em `confiabilidade.ts`).
  3. **Conciliação bancária** — lançamentos "não condizentes com o movimento bancário". Confronta os
     lançamentos contra o **extrato do banco** (fonte externa da verdade). ➡️ **SAIU DE ESCOPO do
     GPResults (decisão 2026-07-16): será feita no app SEPARADO "Concili" que o Luciano está
     construindo.** Um core determinístico (importador OFX+CSV + motor `conciliacao.ts` reaproveitando
     os prazos da `caixa.ts`) chegou a ser prototipado e testado aqui, mas foi **revertido** do GPResults
     — reconstruir no Concili se necessário. As dimensões 1 e 2 (classificação, duplicidade) seguem
     nativas no GPResults via confiabilidade.

**PENDENTE p/ retomar:** COMO os lançamentos contábeis da Enoki (jan–jun) chegam para carregar/auditar
(razão/balancete Excel? PDF via IA? ainda travado?) — Luciano vai decidir e voltamos.

**Depois disso (roadmap que continua):**
- **Sprint 3 — alertas no WhatsApp com materialidade** (motor de confiabilidade já rankeia → base pronta;
  falta provedor: Twilio ou API oficial da Meta + custo).
- **Integração real com a Enoki** — `scripts/enoki-scrape.mjs` (scraping recon, nunca rodou: Playwright
  não instalado, credenciais ENOKI_* nem estão no `.env.local`). Segue como caminho de fundo.
- **App Concili (separado):** conciliação bancária (extrato OFX/CSV × lançamentos) — projeto próprio do
  Luciano, fora do GPResults.
- Possíveis pedidos de UI: mais indicadores, ajustes por feedback. (Insights automáticos já entregues.)
