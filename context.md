# GPResults — Contexto do Projeto

> Memória geral do app, para retomar o trabalho numa sessão nova sem perder o histórico.
> **Sempre ler e atualizar este arquivo ao começar/terminar.** Atualizado em **2026-08-21** (Fases 1–3 do ROADMAP construídas — ver §28).

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

## 13. Estado atual (2026-08-18)

| Área | Status |
|---|---|
| Identidade visual + layout (menu lateral) | ✅ Publicado |
| Dashboard (KPIs, gráficos) + **insights AUTOMÁTICOS** + run-rate | ✅ |
| DRE analítico + até a data de hoje | ✅ |
| **Análise vertical: % do faturamento em cada linha do DRE** (§25) | ✅ |
| DRE por cereal + resultado por saca + **meta × realizado (volume/preço/margem)** | ✅ |
| **Orçamento por periodicidade** (mensal→anual, grade mês a mês) | ✅ |
| **Receita de grão por sacas × preço** + margem/saca → preço de compra | ✅ |
| **Impostos automáticos** (estimativa % venda/compra — só referência no Orçamento) | ✅ |
| Orçamento por conta (+ IA + importar planilha/doc) | ✅ |
| Papel sócio + aprovação de orçamento (4 papéis) | ✅ |
| Fluxo de caixa mensal + diário (Sprint 2) | ✅ |
| Confiabilidade/materialidade (Sprint 2) | ✅ |
| **Achados de auditoria** (motor estrutural + card na Confiabilidade — §17) | ✅ |
| Plano de contas de grãos (+ PDF p/ aprovação) | ✅ |
| **Importar DRE de planilha** (upload .xlsx + IA memoriza + preview — §18) | ✅ |
| **Linha "Investimentos" (capex) abaixo do resultado** (§19) | ✅ |
| **Rotina de lançar sacas** por cereal (grade mês × grão — §20) | ✅ |
| **Resultado líquido acumulado no ano** + nota de divergência (§21, §22) | ✅ |
| **Painel de margem de contribuição** (valor + % + gráfico, opção CPV/±comerciais — §23) | ✅ |
| **Quadro "Total de despesas"** (DRE + painel inicial — §24) | ✅ |
| Modo de verificação local `?demo` (dev) | ✅ |
| Dados do DRE | 🟢 **Reais jan–jul/2026** (DRE gerencial importada via app — §16/§18; reimport agrega mês novo) |
| **API Enoki (Safra Cloud) — FLUXO DE CAIXA real** | ✅ No ar em prod (5 empresas, homologação — §26) |
| **Resultado de caixa por grão** (da API, por centro de custo) | ✅ Card na aba Caixa (§26) |
| **DRE por competência automático** | ⏳ API é financeira, não contábil → aguardando Safra sobre export de balancete (§26) |
| Sprint 3 (alertas WhatsApp) | ⬜ Próximo no roadmap |

**Git:** branch `main`, último commit **`4aa092a`** ("Resultado de caixa por grão"). GitHub
`Luvas-prog/grupo-parceiro-dre` (privado). **104 testes** passando. Deploy sempre via
`npx vercel deploy --prod --yes`; produção estável em https://grupo-parceiro-dre.vercel.app.
No working tree (não commitado, de propósito): `scripts/enoki-scrape.mjs` (scraping recon, obsoleto — a API
já existe) + `scripts/verificar-blob.mjs` + `scripts/resetar-senha.mjs` (redefine senha de usuário: `node
scripts/resetar-senha.mjs <login>`) + `.gitignore`.

**Sessão 2026-08-18 (Enoki — seção 26):** API Safra Cloud "Integração ERP" é FINANCEIRA (contas a pagar/
receber), a mesma do Concili, SEM contábil → não alimenta o DRE por competência. Entregue: fluxo de caixa
REAL (endpoint `api/enoki-caixa.ts` + seam `movimentosReais`) e resultado de caixa por grão. Bug do seam
corrigido (misturava real + estimativa do DRE → +R$121M fantasma; agora usa só o real). Envs `ENOKI_*`
setadas na Vercel (homologação, 5 empresas). Usuários do app: **Juliano**/**Daiane** (admin), **Luciano**
(sócio). ⚠️ Falta pro DRE automático: URL de PRODUÇÃO da API + export contábil (Luciano perguntou ao Safra).

**Sessão 2026-08-04 (tudo em prod, testado, seções 16–25):** importação dos dados reais jan–jun + fim dos
simulados (§16), motor+card de auditoria (§17), rotina de importar .xlsx no app (§18), linha Investimentos
(§19), rotina de lançar sacas em grade (§20), resultado acumulado no ano + nota de divergência (§21/§22),
painel de margem de contribuição (§23), quadro Total de despesas (§24), análise vertical %Fat. no DRE (§25).
⚠️ **Segredos:** nenhuma senha é recuperável (o app guarda só HASH); redefinição de usuário é por outro
admin/sócio na tela Usuários. Chaves na Vercel são "Sensitive" (não revelam valor).

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

## 17. Motor de AUDITORIA + card na Confiabilidade (sessão 2026-08-04)

Card **"⚑ Achados de auditoria"** no topo da aba **Confiabilidade** (`ConfiabilidadePage`), alimentado
pelo motor DETERMINÍSTICO `src/lib/auditoria.ts` (`analisarAuditoria(lancamentos, mapa, resultadoDeclarado?, opcoes?)`,
9 testes em `auditoria.test.ts`; total do projeto = **73 testes**). Diferente da confiabilidade (que olha
lançamento-a-lançamento DENTRO de um mês), a auditoria olha o DRE ESTRUTURAL de TODO o período carregado.
**6 regras** (mesma entrada → mesma saída, zero IA):
  1. `tributos_vendas` (alta) — deduções/receita bruta < 1% → imposto s/ vendas faltando.
  2. `imposto_lucro` (alta) — IRPJ/CSLL = 0 com resultado-antes-do-IR acumulado > 0 (conservador: no
     semestre real o acumulado é ~breakeven, então NÃO dispara — correto).
  3. `depreciacao` (média) — depreciação idêntica em ≥3 meses (valor "chapado" = lançamento manual).
  4. `reconciliacao` (média) — soma das nossas contas ≠ **`EstadoDre.resultadoDeclarado`** (novo campo:
     `Record<'YYYY-MM', R$>` = LUCRO/PREJUÍZO informado na origem; `seed-real.mjs` grava da linha 79 da
     planilha). É o achado "subtotais não fecham" tornado DETERMINÍSTICO e genérico.
  5. `concentracao` (alta) — uma única conta ≥ 50% das despesas OPERACIONAIS do mês (**exclui o CPV** de
     propósito: em grãos o custo da mercadoria é sempre dominante; senão mediria concentração à toa).
  6. `margem` (baixa) — meses com margem bruta < 1%.
**Achados reais (jan–jun/2026):** 5 — [alta] inadimplência abr concentra 63% das despesas (R$ 910.928);
[alta] tributos 0,06% da receita; [média] reconciliação mar −R$ 802 / jun −R$ 28.168; [média] depreciação
R$ 8.627,64 chapada em 6 meses; [baixa] margem abr 0,92%. Card é read-only (não tem ação de reclassificar,
diferente do card de confiabilidade). Verificado visual via `?demo` (Confiabilidade ligada no demo
temporariamente e revertida). ⚠️ Adicionada config `dre` (porta 5174) no `launch.json` da SESSÃO
preceptor-pricing para o preview servir ESTE projeto — ver armadilha na §12.

## 26. API Enoki (Safra Cloud) + Fluxo de caixa REAL (sessão 2026-08-18)

**Achado central:** a "API do Enoki" que o cliente conseguiu é a **API Safra Cloud "Integração ERP"**
(a MESMA que o Concili usa). Base homolog.: `http://api.homologacao.parceiro.safracloud.com.br`,
namespace `/api/Customizados/v1/ParceiroDoGrao`, auth header **`X-Api-Key`**. Manual em
`~/Downloads/manual-api-enoki-safra.md.txt`. **É FINANCEIRA, não contábil** — Swagger confirma: só
`LancamentosFinanceiros`(recebimentos)/`LancamentosFinanceirosPagar`(pagamentos), `NfSaida`,
`OrdensCarregamento`, `Contratos`, `ContasBancarias`, `Parceiros`, `Produtos`, `Empresas`,
`FormasPagamento`. **NÃO tem razão/balancete contábil** (conta contábil + débito/crédito) → **não dá pra
alimentar o DRE por competência** (que bate com a planilha). Campo `centroCusto` é semântico ("RECEITA
SOJA", "COMPRA SORGO", "SECAGEM MILHO", "SEM CC").

⚠️ **Segurança:** a `X-Api-Key` foi colada no chat. **Decisão do Luciano (2026-08-18): NÃO rotacionar**
(é homologação, controle dele). NUNCA está em arquivo do repo (só usada inline em teste; na Vercel a chave
é setada pelo Luciano — eu não insiro segredos em serviços, regra do CLAUDE.md).

**PENDENTE — cliente espera "DRE aparecer sozinho".** Como a API não tem contábil, o Luciano vai
perguntar ao Safra/Enoki se existe **export de balancete/razão** (msg pronta enviada). Se SIM → automatiza
o DRE de competência. Se NÃO → decidir entre DRE de caixa (regime de caixa, difere da planilha) ou seguir
com o import manual (§18).

**ENTREGUE nesta sessão — Fluxo de caixa REAL:**
- `src/lib/enoki.ts` (`paraMovimento`/`normalizarMovimentos`/`numeroEnoki`; 7 testes): cada título vira
  `MovimentoCaixa` — quitado → dataQuitacao+valorPago; aberto → dataVencimento+valor. Recebimento=entrada,
  pagamento=saida. Exclui lote de migração (dataQuitacao=2026-01-01), zeros, datas inválidas.
- `api/enoki-caixa.ts`: puxa recebimentos+pagamentos (paginação `desdeId`+`top=200`, backoff 429, janelas
  ≤90 dias, `MAX_PAGINAS=40`), gate por env. Config: **`ENOKI_BASE_URL`, `ENOKI_API_KEY`, `ENOKI_EMPRESAS`
  (csv, default "1")**. `maxDuration:120` no vercel.json. Duplica a normalização (padrão do repo: api não
  importa de src/).
- `CaixaPage`: busca `/api/enoki-caixa?de&ate` (janela = competenciaSaldo → horizonte), passa
  `movimentosReais` p/ `projetarCaixa`/`projetarCaixaDiario` (o **seam `MovimentoCaixa` já existia** no
  motor `caixa.ts`!). Badge de status (real/estimativa/erro) + botão Atualizar. Degrada gracioso p/
  estimativa quando não configurada. **97 testes.**
- **Validado contra a homologação real:** pipeline completo (paginação+janelas+normalização) → 2.121
  movimentos numa janela de teste, paginação confirmada (lote de 682/1046 > 200). Front verificado no
  `?demo` (fallback quando endpoint ausente).
- ✅ **ATIVADA em prod (2026-08-18):** as 3 envs setadas, badge "● Fluxo com dados REAIS da Enoki" confirmado
  logado (homologação, empresa 1: 381 a receber / 520 a pagar). ⚠️ **BUG achado e corrigido na hora:** o seam
  do `caixa.ts` misturava real + estimativa por tipo/mês → nos meses sem recebimento real, a estimativa do DRE
  (~R$40M/mês de receita em competência) vazava e inflava o saldo (dava +R$121M em vez de ~−R$4,4M). Fix:
  **com dados reais, a projeção usa SÓ os títulos reais** (mês sem título = R$0), mensal e diário
  (`mensal.usouReais` gate). +2 asserts em caixa.test (98 testes).
- ✅ **5 empresas (2026-08-18):** `ENOKI_EMPRESAS`=`1,2,3,4,5` (consolida o grupo). Medido: 5 empresas na
  janela = 10,9s / 33 requests (empresa 1 concentra; 4/5 vazias na homologação). Bem dentro dos 120s.
- ✅ **Resultado de caixa por grão (2026-08-18):** `src/lib/resultadoGrao.ts` (`resultadoCaixaPorGrao`,
  `graoDeCentroCusto`, `naturezaDeCentroCusto`; 6 testes) usa o `centroCusto` (agora carregado em
  `MovimentoCaixa.centroCusto` — enoki.ts + endpoint) para montar, em REGIME DE CAIXA, receita − compra −
  custos diretos por cereal. Sinal vem do tipo (entrada+/saída−), balde do centro de custo (estorno reduz).
  Card na `CaixaPage` (só quando há grão). Validado real: soja −9,6M (comprando), milho +8,2M (vendendo),
  total −1,5M; overhead sem grão fora. É margem de TRADING em caixa, NÃO o DRE por competência. **104 testes.**
- ⏳ **Envs (registro):** `ENOKI_BASE_URL` (homologação) e `ENOKI_EMPRESAS` **setadas** na Vercel
  (2026-08-18, ambas "Sensitive"/write-only). **Falta só `ENOKI_API_KEY`** (rotacionada — o Luciano seta) +
  redeploy. Sem a chave, `enokiConfigurado()`=false → endpoint devolve `{configurado:false}` e o Caixa
  segue na estimativa. Quando setar a chave: `npx vercel deploy --prod --yes` e abrir Caixa logado.

## 25. Análise vertical no DRE — % do faturamento em cada linha (sessão 2026-08-04, pedido do cliente)

Coluna **"% Fat."** na tabela do DRE, em CADA linha, conta e subtotal = valor ÷ **faturamento (receita
bruta realizada)** × 100. Base = `dre.linhas.find(receita_bruta).realizado`, passada ao `LinhaGrupo`
(`pctFat(v)`). Verificado no `?demo` (fev): receita bruta 100%, lucro bruto 50% (300k/600k), deduções 0%.
⚠️ Base é receita BRUTA (faturamento); se o cliente quiser sobre a líquida, trocar o denominador. **90 testes.**

## 24. Quadro "Total de despesas" no DRE (sessão 2026-08-04, pedido do cliente)

Card no DRE (logo após a tabela analítica) somando, pela fórmula EXPLÍCITA do cliente: **despesas
administrativas + comerciais + despesa financeira − receita financeira + IRPJ/CSLL**. ⚠️ Por definição
dele, NÃO inclui depreciação, deduções nem CPV. Determinístico em `Subtotais.totalDespesas` (`dre.ts`).
`QuadroDespesas` (componente compartilhado `src/components/QuadroDespesas.tsx`) mostra as 5 linhas
(realizado + orçado quando há orçamento) e o total. Renderizado no **DRE** (após a tabela) E no **painel
inicial** (Dashboard, após o painel de margem de contribuição — pedido do cliente 2026-08-04). Verificado
no `?demo`: DRE 40+10+8−3+7 = **R$ 62.000**; Início (mai) 40+8+5 = **R$ 53.000**. **90 testes.**

## 23. Painel de MARGEM DE CONTRIBUIÇÃO (Dashboard + DRE) (sessão 2026-08-04, pedido do usuário GP)

Pedido: gráfico de evolução da margem de contribuição na tela inicial E no DRE + (no painel) uma caixa com
o valor e outra com a %. **Definição adotada com o cliente: MC = Receita líquida − Custo do produto (CPV)**
— numericamente é o próprio LUCRO BRUTO do DRE, exposto com o nome "margem de contribuição" + %. (⚠️ Por isso
há sobreposição intencional com a caixa "Lucro bruto" do Dashboard; se um dia entrarem outros custos variáveis
— comissão, frete de venda — é só somar em `custo` no `serieMargemContribuicao`.)
- `src/lib/margemContribuicao.ts` (`serieMargemContribuicao`, `PontoMC`; 4 testes): série por competência
  com `mc` (=lucroBruto) e `mcPct` (=mc/receitaLiquida).
- `src/components/PainelMargemContribuicao.tsx`: card reutilizável com 2 caixas (VALOR R$ verde, % DA RECEITA
  dourado) do mês selecionado + gráfico de evolução (Area de `mcPct` em %, tooltip mostra R$ e %; Recharts,
  `isAnimationActive={false}`). Renderizado no `DashboardPage` (após os KPIs secundários) e no `DrePage`
  (após os KPIs/nota de divergência). Verificado no `?demo` (Dashboard ligado temporariamente): fev 50% →
  mar/mai 100%.
- **OPÇÃO da definição (2026-08-04):** toggle no cabeçalho do painel "Só CPV" ↔ "CPV + comerciais" (só
  `podeEditar`). Persistido em `EstadoDre.mcIncluirComerciais` (aplica no painel E no DRE, consistente).
  `serieMargemContribuicao(..., incluirComerciais)` subtrai também `despesas_comerciais` quando ligado.
  Subtítulo reflete a definição. Verificado: mai 200k/100% (só CPV) ↔ 150k/75% (CPV+comerciais, −50k comissão),
  persistindo. **90 testes.**

## 22. Nota de divergência vs planilha de origem no DRE (sessão 2026-08-04, pedido do usuário GP)

Abaixo dos KPIs do DRE, um card âmbar (info) aparece **só quando** o resultado somado das contas diverge
do total INFORMADO na origem (`EstadoDre.resultadoDeclarado`) em algum mês do acumulado do ano. Calculado
junto do `acumuladoAno` (`difDeclarado` + `mesesComDif`, tolerância R$ 1). Texto explica que é proposital
(soma das contas × ajuste manual nos subtotais da planilha) e aponta a aba Confiabilidade. Na produção
(jan–jun), em jun a nota mostra **R$ 28.970,57 (mar/2026, jun/2026)** — exatamente os dois resíduos que a
auditoria (§17) já pegava. Dinâmica: some se não houver `resultadoDeclarado` ou divergência. Verificado no
`?demo` (com `resultadoDeclarado` injetado). Confirmação do acumulado real: **jun/2026 = −R$ 11.349,97**
(semestre levemente negativo, puxado pelo prejuízo de abril).

## 21. KPI "Resultado líquido acumulado no ano" no DRE (sessão 2026-08-04, pedido do usuário GP)

Ao lado da caixa "Resultado líquido" (do mês), no topo do DRE, uma caixa **"Acum. no ano (AAAA)"** com o
resultado líquido ACUMULADO (YTD): soma de `resultadoLiquido` de todos os meses do mesmo ano até o
selecionado (mês corrente entra parcial via `ateData`), subtítulo "até <mês>/<ano>". Grid dos KPIs foi de
`lg:grid-cols-4` p/ `lg:grid-cols-5`; `StatCard` ganhou prop `sub` (subtítulo livre). Cálculo `acumuladoAno`
em `DrePage` (reusa `montarDre` por mês). Verificado no `?demo`: mai/2026 = R$ 200k no mês, R$ 900k no ano
(fev 300k + mar 400k + mai 200k).

## 20. Rotina de lançar sacas por cereal (grade mês × grão) (sessão 2026-08-04)

Antes as sacas eram lançadas UM MÊS por vez, embutido no card "Resultado por cereal" do DRE. Agora há um
botão **"⊞ Lançar sacas (todos os meses)"** nesse card (só `podeEditar` = admin/sócio) que abre
`SacasModal` — uma **grade competências × grãos** (soja/milho/sorgo/café + totais) para lançar tudo de uma
vez. Estado local; grava só ao clicar "Salvar sacas" via novo `DreContext.salvarSacasLote(Record<comp,
Partial<Record<Grao,number>>>)` (merge por competência). Os meses da grade = `competenciasDisponiveis`.
O card inline por mês continua existindo. Verificado no `?demo`: editar → salvar → persistir (localStorage)
→ recarregar. **85 testes.** As sacas alimentam o R$/saca e o "meta × realizado" do DRE (`EstadoDre.sacas`).

## 19. Linha "Investimentos" abaixo do resultado (sessão 2026-08-04)

Decisão do cliente: os **investimentos (capex — veículos, terrenos, consórcios, imobilizado) DEVEM ser
classificados**, numa **linha própria ABAIXO do resultado**, com um subtotal **"Resultado após
investimentos"** — igual à planilha dele (`LUCRO/PREJUÍZO` e, separado, `RESULTADO (−) INVESTIMENTOS`).
- **`LINHAS_DRE` ganhou `'investimentos'`** (no fim; sinal −1; `META_LINHAS.investimentos`). Como
  `calcularSubtotais` referencia cada linha pelo nome, investimentos **NÃO entra** em receita líquida/
  lucro bruto/EBIT/EBITDA/antes do IR/resultado líquido — só no novo subtotal
  **`Subtotais.resultadoAposInvestimentos` = resultadoLiquido − investimentos** (`dre.ts`). Assim o
  resultado operacional/líquido continua batendo com o `resultadoDeclarado` (linha 79 da planilha) e a
  reconciliação da auditoria (§17) segue válida.
- **DrePage:** `SUBTOTAIS_APOS.investimentos` renderiza "Resultado após investimentos" (forte) depois da
  linha. Verificado no `?demo`: líquido R$ 300k intacto, (−) Investimentos R$ 57k (veículo+terreno),
  após investimentos R$ 243k.
- **Caixa:** `TRATAMENTO_CAIXA` (Record exaustivo por linha) ganhou `investimentos: {fluxo:'saida',
  prazo:'pagamento'}` — capex É saída de caixa real, então agora reduz o fluxo projetado.
- **IA de importação** (`api/classificar-dre.ts`): enum ganhou `investimentos`; guia manda rotear
  veículos/terrenos/consórcios/máquinas/imobilizado para `investimentos` (antes ia p/ `ignorar`).
  `ignorar` agora é SÓ subtotal/percentual/cabeçalho.
- ⚠️ **Reimportar em produção** para os investimentos aparecerem (o estado atual foi importado quando a
  IA ainda os ignorava, então VEICULOS/TERRENO/CONSÓRCIOS não têm lançamento). **85 testes.**

## 18. Rotina de IMPORTAR DRE de planilha no app (sessão 2026-08-04)

Botão **"⬆ Importar planilha (DRE)"** na página **Lançamentos** (admin) abre `ImportarDreModal` — automatiza
o que antes era feito na mão (§16). Decisões do Luciano: **upload .xlsx** + **IA que memoriza** + **substituir tudo**.
Fluxo: upload → parse determinístico → IA classifica só as contas NOVAS → revisão editável → grava.
- **Dep nova:** `xlsx` (SheetJS 0.18.5) — **carregada por `import('xlsx')` dinâmico** no modal, então vira
  chunk separado (~425KB), FORA do bundle principal. (Input trusted = arquivo do próprio admin; CVEs do
  SheetJS antigo são de baixo risco aqui.) Aceita .xlsx/.xls/.csv.
- **Parser determinístico** `src/lib/importarDre.ts` (`analisarMatriz`, `parseCompetenciaCabecalho`,
  `ultimoDiaDoMes`, `chaveConta`; 11 testes). Acha a linha de cabeçalho (a que reconhece mais meses),
  detecta competências ('YYYY-MM'), extrai contas (rótulo + valor/mês) e SINALIZA subtotais
  (`ehSubtotal`: receita líquida/custo total/lucro bruto/margem/ROE/acumulado/investimento/===) e a linha
  de resultado (`ehResultado`: lucro/prejuízo). ⚠️ **Mês SEM ano no rótulo é ignorado** — por isso a
  planilha do cliente (out–dez/2025 vinham sem ano, "OUTUBRO") importa exatamente jan–jun/2026.
- **IA** `api/classificar-dre.ts` (Opus 4.8, tool use, enum inclui **`ignorar`** p/ subtotal/percentual/
  capex): recebe só as descrições NÃO memorizadas; devolve linha do DRE por descrição. Memorização = a
  classificação aprovada fica em `EstadoDre.classificacoes` (chave = rótulo normalizado), então na próxima
  importação a mesma conta já vem pronta (badge "memória"; "IA" = veio do modelo; "auto" = subtotal).
- **Gravação:** `DreContext.importarDreGerencial({lancamentos, classificacoes, resultadoDeclarado})` —
  SUBSTITUI os lançamentos, MESCLA classificações, grava `resultadoDeclarado` (da linha de resultado
  escolhida no modal → alimenta a reconciliação da auditoria §17). Lançamento por conta×mês, `valor=abs`,
  zeros descartados, data = último dia do mês; `contaSafragold` = rótulo da planilha (por isso aparece no
  DRE analítico). **84 testes** no total. Verificado: parser rodado sobre o xlsx real (6 meses, 70 linhas,
  subtotais/resultado corretos) + modal renderiza (upload) via `?demo`. A tabela de revisão não foi dirigida
  no browser (seletor de arquivo nativo não é automatizável), mas o parse que a alimenta está coberto.
- **Substitui o fluxo manual** do `scripts/seed-real.mjs` para o cliente (o script segue útil p/ carga
  fora do app). ⚠️ Importar all-months da planilha: se quiser recortar meses, hoje edita-se a planilha.

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

## 27. VALIDAÇÃO: DRE por competência A PARTIR da API financeira (sessão 2026-08-21)

**Decisão (brainstorm, consenso): caminho D — DRE de competência-aproximado via API + reconciliação
com a planilha (auditoria §17); balancete do Safra (se vier) só troca a fonte.** A conclusão de §26
("API financeira → não dá DRE de competência") estava INCOMPLETA: os títulos têm **`dataLancamento`**
(data da NF/fato gerador ≈ competência) além de `dataQuitacao` (caixa), e **`NfSaida` dá a receita
bruta por emissão** (produto, kg, CFOP, contrato). Validado com extração real jan–jul/2026, 5 empresas
(4.914 receber / 7.154 pagar / 8.035 NFs; scripts no scratchpad da sessão, dados NÃO commitados).

**A API cobre BEM (trading):** receita por grão via NF (R$260,9M fora do grupo: soja 146M, milho 87M,
café 40M, sorgo 6M — ordem de grandeza bate com a planilha ~R$40M/mês mar–mai); **sacas automáticas**
dos itens (⚠️ soja/milho/sorgo em kg ÷60; **CAFÉ já em sacas** — mapa de unidade por produto!); CPV
compras R$189M ("COMPRA {GRÃO}" por dataLancamento) + FRETE R$16,4M + armazenagem/secagem; deduções
parciais (265 NFs devolução, estornos "RECEITA X" no a pagar — estorno R$910k/mai ≈ âncora da
inadimplência de abr → item de reconciliação).

**A API NÃO cobre (estrutura):** folha/pró-labore (só "FÉRIAS R$12k"), despesa financeira de
empréstimos, depreciação, IRPJ/CSLL; despesas administrativas somam só centenas de mil. **Perguntar ao
Juliano/Daiane se a estrutura é paga fora do módulo financeiro ou se falta na homologação.**

**Engenharia (para o build):** (1) eliminar intra-grupo — R$18,2M de NF com destinatário CNPJ raiz do
grupo (`30798330`, `22271113`, `47591700`); (2) normalizar produto (typos "SORGO EM GÃOS", "MILHO EM
GRAOS"); (3) gap NF 260,9M × títulos a receber 223,7M ≈ R$37M a investigar (vira achado de auditoria);
(4) ~20k registros/7 meses + rate limit agressivo (429) → sync INCREMENTAL por `desdeId` com throttling
(~1 req/s), não janela cheia por load; (5) NfSaida exige dataInicio/dataFim.

**Backlog executável: `ROADMAP.md` na raiz do repo** (fases 0–4 com critérios de aceite, riscos e
sequência de sessões — seguir de lá; este resumo é só o registro da decisão).

**Fases:** F1 `api/enoki-dre.ts` — NF+títulos → `LancamentoCanonico` (data=dataLancamento/dataEmissao),
mapa determinístico centroCusto→conta + IA só p/ "SEM CC" (padrão classificar.ts); motor `dre.ts`
intocado (REGRA DE OURO). F2 — estrutura (folha/depreciação/financeiras) segue da planilha (§18) ou
lançamento manual, com ORIGEM marcada por lançamento (api×manual). F3 — painel de reconciliação
API×planilha na auditoria + custo médio móvel por grão (CPV vendido ≠ comprado) + eliminação intra-grupo.

## 28. DRE por competência da Enoki — Fases 1 a 3 CONSTRUÍDAS (sessão 2026-08-21)

Execução do `ROADMAP.md` (§27). **Fases 1, 2 e 3 concluídas + item 4.2.** 241 testes.
Verificação visual toda em `?demo` (que agora tem abas DRE / Orçamento / Lançamentos /
Confiabilidade e uma fatia Enoki semeada). **Nada foi para produção nesta sessão** — falta a
chave de produção (item 0.2) e `CRON_SECRET`.

### O que mudou nos NÚMEROS (e por quê) — leia isto primeiro

A validação da §27 dizia receita de R$ 261,2M. **Está desatualizada.** Duas correções feitas
durante a construção mudaram o quadro, ambas para melhor:

| | §27 (validação) | Agora (construído) |
|---|---|---|
| Receita bruta jan–jul | R$ 261,2M | **R$ 240,1M** |
| Deduções | R$ 5,4M | **R$ 20,4M** |
| Margem bruta | 20,9% | **8,1%** |

1. **CFOP (§2.3):** "nota de saída, finalidade Normal" NÃO é venda. Dentro do que eu contava como
   faturamento havia **R$ 21,1M de remessa para armazém geral** (5905/5934 — o grão sai do pátio
   mas continua sendo da empresa) e **R$ 18,3M de transferência entre estabelecimentos**
   (5152/6152). Este último bate quase exato com o intragrupo que eu já detectava por CNPJ: duas
   medições independentes concordando. E, do outro lado, **R$ 20,4M de devolução de venda**
   (1202/2202/1504/2504) estavam sendo descartados em vez de reduzir a receita.
2. A margem de 8,1% é plausível para trading de grãos e coerente com o semestre perto do
   breakeven da planilha do cliente (a de 20,9% nunca foi).

### O achado grande, AINDA EM ABERTO: o gap de 9,1% (§3.3)

Notas de venda R$ 239,8M × títulos a receber de receita R$ 217,9M = **R$ 21,9M (9,1%)**, estável
em todo mês (5–12%). Confrontando contrato a contrato (232 contratos com as duas pontas): razão
mediana **0,960**, dispersão grande (p10 = 0,755), 30% batendo exato. Alíquota daria razão
constante → a assinatura é de **desconto de classificação** (umidade/impureza/avariados).

⚠ **NÃO foi reclassificado.** Se for abatimento, a receita bruta está 9% superavaliada e o valor
pertence às deduções — o que **virava o resultado do semestre de positivo para negativo**. Grande
demais para entrar por hipótese (regra de ouro). Está quantificado num card da Confiabilidade.
**É a pergunta nº 1 para o contador.**

### Arquitetura construída

```
API Enoki → api/enoki-dre.ts (TRANSPORTE puro) → src/lib/enokiDre.ts (REGRA, testada) → montarDre
```
Deliberadamente diferente do `enoki-caixa.ts`: o endpoint só faz HTTP/paginação/janelas/throttling
e enxuga campos; toda a regra de negócio fica no front, onde é testada. Duplicar 400 linhas seria
pedir para as cópias divergirem.

- **`src/lib/centroCusto.ts`** — mapa determinístico centro de custo → conta, cobrindo os 43 CCs
  reais. A DIREÇÃO importa: armazenagem paga é custo (4.1.11), recebida é receita (3.1.09); fluxo
  na contramão sem conta própria vira ESTORNO (sinal −1). Receita de grão recebida é IGNORADA (o
  fato gerador é a NF).
- **`src/lib/enokiDre.ts`** — NF/título → `LancamentoCanonico` por competência. Armadilhas:
  unidade por produto (**soja/milho/sorgo em kg ÷60; CAFÉ já em sacas**), intragrupo por raiz de
  CNPJ, typos ("SORGO EM GÃOS"), canceladas/ajustes, CFOP. **CFOP desconhecido vira 'outro' e é
  excluído com registro — nunca vira receita por omissão.**
- **`src/lib/cfop.ts`** — natureza fiscal por SUFIXO do CFOP (o 1º dígito é só o âmbito).
  ⚠ **A confirmar com o contador:** 5501/5502/6501/6502 ("remessa com fim específico de
  exportação") estão como VENDA — formalmente são remessa, mas é assim que a venda ao exportador
  é documentada aqui, e os recebíveis confirmam.
- **`src/lib/fusao.ts`** (2.1) — cada LINHA do DRE lê de UMA fonte (padrão: trading da Enoki,
  estrutura da planilha). Somar as duas seria dupla contagem. `linhasOrfas` denuncia quando a
  fonte escolhida não tem lançamento nenhum.
- **`src/lib/reconciliacao.ts`** (3.1) — Enoki × planilha linha a linha, mês a mês, só o material.
  ⚠ Lição: exigir materialidade em R$ **E** em % descartava R$ 600k numa linha de R$ 40M (1,5%) —
  justamente o que o sócio quer ver. Agora o piso em R$ corta o ruído sempre e o % baixo só
  descarta quando o valor absoluto também é pequeno.
- **`src/lib/custoMedio.ts`** (3.2) — média ponderada móvel por grão → CPV do que foi VENDIDO.
- **`src/lib/gapContratos.ts`** (3.3) — confronto nota × título por contrato.
- **`api/classificar-enoki.ts`** (1.4) — IA classifica só o resíduo "SEM CC" (R$ 2,5M de R$ 437M),
  agrupado por PARCEIRO (agrupar por "SEM CC" daria um balde único inclassificável). Regra
  confirmada à mão nunca é sobrescrita pela IA.

### ⚠ CORREÇÃO CRÍTICA (2026-08-22): a unidade NÃO é fixa por produto

A §28 dizia "soja/milho/sorgo em kg ÷60; CAFÉ já em sacas". **Estava errado.** A
mesma base mistura as três unidades no mesmo produto: em jan–jul/2026 a soja
aparecia em **TONELADAS em 1.544 itens (R$ 113,0M)** e em **QUILOS em 507
(R$ 31,3M)**. Tratar tudo como quilo subcontava ~858 mil sacas e inflava o preço
para **R$ 908/saca**, seis vezes o mercado.

A regra agora infere a unidade item a item pelo **preço unitário**: testa kg,
saca e tonelada e fica com a que dá um preço por saca plausível para aquele grão
(`FAIXA_PRECO_SACA` em `enokiDre.ts`; as faixas não se sobrepõem, então é
determinístico). Sem preço unitário, cai no padrão histórico.

Depois da correção os quatro grãos batem com o mercado: soja R$ 143,54/sc,
milho R$ 74,77, sorgo R$ 60,71, café R$ 1.827,90. Volume de soja: 1.005.292 sc.
**Como achar erro assim de novo:** cruzar o preço implícito por saca com o preço
de mercado. É o teste de plausibilidade mais barato e mais revelador que existe
neste domínio.

### BLOQUEIO DE DADO (item 3.2) — pergunta para o Safra

**A API não informa QUANTIDADE COMPRADA.** Os títulos de "COMPRA {GRÃO}" têm valor mas não sacas,
e `Contratos` devolve **só "Contrato de Venda"** — testei inclusive consultando pelo `idContrato`
que um título de compra referencia: volta vazio. Sem volume não há custo médio. Por isso o volume
comprado e o estoque de abertura são **declarados** numa tela própria (`EstoqueModal`). Se produção
expuser contrato de compra, troca-se só o alimentador.

### Estado / campos novos em `EstadoDre`

`lancamentosEnoki`, `sacasEnoki`, `enokiSync` (com diagnóstico e resumo do gap), `fonteDre`
('planilha'|'enoki'|'fundido'), `configFusao`, `regrasEnoki`, `lancamentosManuais`,
`sacasCompradas`, `estoqueAbertura`. Tudo retrocompatível (ausente = comportamento antigo).
`LancamentoCanonico.origem` ('enoki'|'planilha'|'manual'; ausente = 'planilha').
⚠ **`valor` pode ser NEGATIVO** agora — só em estorno vindo do ERP. `montarDre` soma, então reduz
a linha corretamente.

⚠ **Contexto passa a expor `lancamentos`/`sacas` JÁ FILTRADOS pela fonte.** Toda tela lê de lá, não
de `estado.lancamentos` — senão trocar a fonte ficaria inconsistente entre abas.

### Armadilhas novas (para a §12)

- **Modal dentro de cabeçalho animado:** `animate-rise` usa transform; um ancestral com transform
  vira o bloco de contenção de `position: fixed` e o modal aparece recortado. **Usar `createPortal`
  para o `document.body`** (ModalFusao, LancamentosManuaisModal, EstoqueModal fazem isso).
- **`?? []` inline em dependência de `useMemo`** cria referência nova a cada render e invalida o
  memo — com 11 mil lançamentos isso é caro. Memoizar o fallback.
- **Sync incremental DEVE mesclar por janela**, nunca substituir: uma janela curta apagaria a carga
  histórica. O período sincronizado é autoritário sobre si mesmo; o resto é preservado.
- **`describe.skipIf` ainda EXECUTA o corpo** para coletar os testes — leitura de fixture precisa
  ser preguiçosa.
- `@types/node` já existe transitivamente; usar `/// <reference types="node" />` no arquivo em vez
  de afrouxar o `tsconfig.app.json`.

### Pendências para o cliente / Luciano (nada disso é código)

1. **Folha e estrutura passam pelo financeiro da Enoki?** Na homologação quase não aparecem.
2. **URL e chave de PRODUÇÃO** (item 0.2) — nada foi ao ar; o buraco de estrutura pode mudar.
3. **Contador:** o gap de 9,1% é desconto de classificação? Se sim, vira dedução e o semestre
   fecha negativo. E os CFOPs 5501/5502/6501/6502 são venda mesmo?
4. **Safra:** produção expõe contrato de COMPRA (para o volume do custo médio)?
5. **Setar `CRON_SECRET`** na Vercel para o cron diário sair do 401.

---

## §29 — O CPV vem da NOTA DE ENTRADA (2026-08-26)

O DRE de julho raspado do ERP de produção dava **receita certa e CPV a um quinto
do real** (R$ 4,6M contra R$ 22,7M da planilha, margem bruta de 81%). Passei uma
rodada inteira procurando o erro nos títulos financeiros. Não estava lá.

**A receita nasce da NF de saída; o custo tem de nascer da NF de entrada.** A
tela `Doc. Fiscais > Docs. Fiscais Entrada` simplesmente nunca era aberta. O que
sobrava de CPV vinha dos títulos — e título só enxerga a fatia que **vence**
dentro da janela: das 610 parcelas lidas, **610 venciam em agosto**. Daí a
proporção de ~20%, igual nas compras e nas vendas.

### Como o diagnóstico saiu

Duas contagens resolveram, e nenhuma delas era no código:

1. `dataVencimento` de 610/610 títulos caindo no mesmo mês — distribuição
   impossível para dado natural, portanto era o filtro, não o negócio.
2. A soma por CFOP das 1015 notas da tela de saída: **nenhuma era compra**. As
   323 de CFOP 1949 ("ENTRADA | Ajuste") somam **R$ 0,00** — ajuste de estoque.

Quando uma linha está proporcionalmente errada em vez de pontualmente errada,
o problema é de FONTE, não de classificação. Vale para a próxima.

### O que mudou

- `cfop.ts`: sufixo de venda **com entrada** passou de `'outro'` para `'compra'`.
  1102 é a contrapartida exata do 5102 — a tabela por sufixo já sabia disso.
- `enokiDre.ts`: nota de compra vira CPV; contraparte é o **emitente**; não soma
  sacas (o volume vendido é o da nota de saída); conta 4.1.18 quando a grade não
  abre os itens (espelho do 3.1.15 na receita).
- A grade de entrada traz **CNPJ/CPF**, que a de saída não traz: para as compras
  a eliminação intragrupo volta a ser por raiz de CNPJ, que é exata.

### Armadilhas do ERP descobertas nesta rodada (somam-se às da §28)

- **O combo "Pag/Rec" da tela de Lançamentos NÃO filtra.** Duas varreduras, uma
  por direção, trouxeram os mesmos 1840 ids. A direção sai do centro de custo.
- **O critério padrão é "Não Quitados"** e esconde as compras já pagas. A opção
  certa chama-se "Quitados/Não Quitados" — não "Todos", que não existe. Conferir
  pelo total de páginas (34 → 92), nunca pelo clique ter dado certo.
- **Campo de data perde o último dígito do ano** ("2026" → "202"). Escrever no
  DOM e disparar `input`/`change`/`keyup`; conferir o valor depois.

### O elo que faltava entre o robô e o site

`/api/enoki-ingerir` guardava o material cru em `enoki-scrape` e **nada convertia
isso no `estado-enoki` que o app lê**. O robô respondia "enviado ao app" e o site
seguia mostrando a carga velha de homologação, sem erro em lugar nenhum. Quem
publica é `robot/enviar-para-o-site.mjs`, e ele agora **compila a normalização
toda vez** — um `.build` defasado aplicaria as regras antigas em silêncio.

---

## §30 — Onde estão os itens de produto (2026-09-09)

O DRE computa as compras (agosto/2026: R$ 18,34M), mas TUDO cai em contas
genéricas — `4.1.18` "Aquisição de grãos (produto não detalhado)" e `3.1.15` no
lado da receita. Sem produto não há quebra por cereal, não há sacas, e não há
custo médio móvel — que é o que faria o CPV descrever a VENDA em vez da COMPRA.

A causa conhecida: as grades de NF (saída e entrada) não expõem os itens.

**ACHADO: o relatório existe e tem tudo.**
`Relatórios > Estoque e Movimentação > Movimentação de Produtos por CFOP`
(há dois com nomes quase iguais — um para ENTRADA, outro para SAÍDA).

Colunas: `Emissão · Mod · Nº NFe · CFOP · Cod.Prod · Descrição do produto ·
Contrato · Qtd. Entr. · Unit. · Desc. · Total`. Ou seja: produto, quantidade,
preço unitário e **número do contrato**, nota a nota.

Isso destrava de uma vez: compra por grão, sacas, custo médio móvel e o
confronto por contrato (o gap de 9%).

### Como chegar lá (já mapeado)

1. `Relatórios` → `Estoque e Movimentação` → `Movimentação de Produtos por CFOP`.
2. O combo de período abre em **"Todos"** e isso deixa os campos de data
   `disabled`. Escolher **"Intervalo"** habilita (opções: Todos, Dia atual,
   Últimos 7/30 dias, Mês Atual, Intervalo).
3. Campos de data `VWG285_*` (de) e `VWG286_*` (à), no trio dd/mm/aaaa.
4. Botão **GERAR**.

### Os dois obstáculos que restam

- **A data não chega ao servidor.** O relatório saiu com 09/09/2026 mesmo com os
  campos exibindo 01/08–31/08. São `readonly` com handler de `onblur`
  (`s248.sbh24(...)`); disparar input/change/keyup não bastou, e o blur sintético
  também não. Provavelmente exige a sequência de clique real do WebGUI.
- **O visor não entrega texto.** É um Crystal Reports em iframe
  (`crystalreportviewers13`) que renderiza a página como imagem: `innerText` do
  frame devolve 79 caracteres, e não há `<table>` para ler.

**Caminho recomendado: não raspar o visor — usar o EXPORTAR da barra dele.**
O Crystal exporta PDF/Excel, e um arquivo é infinitamente mais estável que um
visor renderizado. O robô já tem `acceptDownloads` no contexto.

---

## §31 — A API de produção, e o erro que travava tudo (2026-09-10)

### A API de produção mudou o desenho

`https://api.parceirodograo.safracloud.com.br` · header `X-Api-Key` ·
namespace `/api/Customizados/v1/ParceiroDoGrao`.

O que ela dá e a raspagem não dava:

- **ITENS da nota de saída** — produto, quantidade, valorUnitario. Com eles a
  receita abre por grão (milho, soja, sorgo, café) e as sacas aparecem. Antes
  tudo caía em `3.1.15` "produto não detalhado".
- **`destinatarioCpfCnpj`** — eliminação intragrupo volta a ser por raiz de CNPJ.
- **As CINCO empresas** (`/Empresas`), contra a única que o robô lê por sessão.
- **`/Produtos` com `unidade` (KG/SC) e `fatorSaca`** — a resposta EXATA para a
  conversão que hoje é inferida por faixa de preço.
- `/Contratos`, `/Parceiros`.

**O que ela NÃO dá: nota fiscal de ENTRADA.** Testadas e todas 404: NfEntrada,
NfsEntrada, DocumentosEntrada, NotaEntrada, NfCompra, Compras, Entradas,
NfEntradas, NfeEntrada, DocFiscalEntrada, MovimentacaoProdutos, EstoqueProdutos,
Inventario, ItensNf, OrdensCompra, Romaneios, Pesagens. Swagger devolve 403.

E **contratos de COMPRA não existem na API**: 723 de 723 são "Contrato de Venda".
O título de compra cita `idContrato: 2131`, e 2131 simplesmente não está na
listagem — a sequência pula de 2130 para 2134.

⚠ **ARMADILHA CARA:** puxar as cinco empresas com o CPV de uma só dá receita de
R$ 23,1M e lucro bruto de +R$ 2,27M em agosto — bonito e falso, quando o número
honesto é NEGATIVO. `scripts/puxar-producao.mjs` só inclui empresa com nota de
entrada coberta, e nomeia as que ficam de fora.

✅ Validação forte: MG pela API bate com a raspagem **no centavo**
(R$ 18.387.746,37 contra ,42).

### O erro que travava tudo há meses

**ESCREVER NO DOM NUNCA FUNCIONOU — em tela nenhuma.**

No WebGUI o estado vive no SERVIDOR. `elemento.value = x` mais eventos
sintéticos (input/change/keyup/blur) muda o que APARECE e não o que o servidor
SABE. Consequências que eu tinha diagnosticado errado:

- O relatório saía sempre com a data de hoje, mesmo com os campos exibindo o
  período pedido.
- **O filtro de vencimento dos títulos NUNCA filtrou.** Alargar a janela de
  [mês, mês+6] para [mês−1, mês+12] devolveu 1.812 linhas contra 1.840 — eu
  registrei como "o filtro não restringe" quando a verdade é que ele nunca
  recebeu data nenhuma. A §30 e o comentário no robô diziam isso errado.

**A saída:** teclar de verdade. `page.keyboard.press("Digit0")`, dígito a
dígito, ~150ms entre um e outro. E:

1. A data é um TRIO de inputs (`_1` dia, `_3` mês, `_5` ano). Teclar os 8
   dígitos num campo só faz a máscara pular: "01082026" virou 26/09/2026.
   É um campo por vez, com clique triplo antes para selecionar.
2. O servidor NORMALIZA o "à" quando o "de" muda. Preencher uma vez não basta —
   preenche, confere, repete (até 5 vezes).
3. **Os ids mudam a cada sessão** (VWG285 hoje, outro amanhã). Localizar os dois
   trios pela POSIÇÃO, nunca por id fixo.

### Como ler o visor Crystal

O relatório certo é `Relatórios > Estoque e Movimentação > Movimentação de
Produtos por CFOP` — o de ENTRADA (há outro de saída com nome quase igual).
Antes dele, o combo de período precisa sair de "Todos" para **"Intervalo"**,
senão os campos de data nascem `disabled`.

O conteúdo NÃO está no iframe do host (devolve 79 caracteres). Está num frame
**`about:blank`** aninhado, com cada célula em elemento absoluto: agrupar por Y
reconstrói a linha, ordenar por X reconstrói as colunas.

**Paginação: não clicar na barra do visor.** Ela vive num iframe cujo id troca a
cada sessão. O rodapé diz "Página 1 de N" — quando N > 1, PARTIR O INTERVALO AO
MEIO e rodar de novo. Um dia nunca passa de uma página, então a recursão sempre
termina, e cada leitura é de uma página só.

Colunas: `Emissão · Mod · Nº NFe · CFOP · Cod.Prod · Descrição do produto ·
Contrato · Qtd. Entr. · Unit. · Desc. · Total`.

Cruza com a API no registro: a primeira linha de agosto é NFe 5217, contrato
159/26M, R$ 38.960,25 — e o título da API traz `documento: "5217"`,
`valor: "38960.2500"`, `descricao: "Fat. NFe entrada | Cont: 159/26M"`.

## §32 — Por que a planilha do cliente ficava em 87-91% (2026-09-14)

A pergunta que consumiu semanas: a razão custo/receita da planilha do cliente
fica presa entre 87% e 91% TODO mês, e a nossa ia de 84% a 153%. A hipótese
perseguida era a de que eles casavam custo com venda lote a lote e nós não.
Foram testadas e descartadas cinco variações dela: combinações de CFOP,
`valorTotalProdutos` vs `valorTotalNf`, `dataEntrada` vs `dataEmissao`,
subconjuntos de empresa/grão, eliminação intragrupo.

A hipótese estava errada. Eram três coisas, nenhuma delas o método.

### 1. CFOP 1907 é ENTRADA DE ESTOQUE

Eu o excluía com um raciocínio que soava certo: "o grão já era nosso, contá-lo
dobraria o volume". O volume desmentiu. Em 20 meses (empresa 1):

| grão  | compras 1102+1117 | +retorno 1907 | vendas    | saldo s/ret | saldo c/ret |
|-------|-------------------|---------------|-----------|-------------|-------------|
| soja  | 2.203.640         | 2.343.689     | 2.348.549 | **-144.909**| **-4.860**  |
| milho | 1.998.709         | 2.077.584     | 1.636.880 | 361.829     | 440.704     |
| sorgo | 308.187           | 308.187       | 280.531   | 27.656      | 27.656      |

Um furo de 6,2% vira 0,2%. A simetria é a explicação: a REMESSA para o armazém
(5905/5934) não é contada como saída de estoque, então o retorno não pode ser
ignorado como entrada. Ignorar os dois lados fecharia; ignorar só um deixa o
furo. Em valor o 1907 é 0,9% a 3,8% das entradas — não há risco de dobrar custo.

**A lição**: quando um argumento contábil ("o grão já era nosso") colide com uma
conferência de volume, a conferência ganha. O argumento descrevia a titularidade;
a pergunta era de fluxo físico.

### 2. Estoque de abertura — `aberturaMinima` em `custoMedio.ts`

A API começa em janeiro/2025; a empresa não. A soja vendida naquele mês veio da
safra de 2024. Sem esse saldo a média móvel divide por um estoque inexistente —
o café chegou a -R$ 13.759/saca e agosto/2026 a -155% de margem.

Não dá para inventar o inventário, mas dá para limitá-lo por baixo: se o saldo
acumulado afunda a -38.706 sacas, havia ao menos 38.706 na abertura. É o piso
que as próprias notas denunciam. Precificado pela PRIMEIRA COMPRA observada —
usar o custo médio do primeiro mês seria circular, porque ele já está
contaminado pelo buraco que se quer tapar.

### 3. A planilha é de UMA empresa e NÃO APROPRIA ESTOQUE

"DRE ACUMULADO _CEREAIS" é a empresa 1. Somávamos as cinco; em agosto/2026 as
empresas 2 e 3 punham R$ 4,7M a mais de receita — outra linha de negócio, com
DRE separado. Isso sozinho inflava a receita em 24%.

E a "COMPRA" da planilha é a nota de entrada CFOP 1102 do mês, mais nada:

|            | nosso (empresa 1) | planilha      | Δ     |
|------------|-------------------|---------------|-------|
| receita 8m | R$ 220,72M        | R$ 218,51M    | +1,0% |
| compra 8m  | R$ 192,46M        | R$ 196,53M    | -2,1% |

**Os dados já batiam.** A estabilidade 87-91% não vem de casar lote com lote:
vem de a planilha lançar a compra no mês da venda do mesmo lote (controle de
carregamento) e não apropriar estoque. O que oscila mês a mês — de -27% em
janeiro a +10% em junho — é a DATA em que cada nota cai, e o acumulado fecha.

Outro sinal de que a leitura está certa: `custoTotal - compra` da planilha em
agosto é R$ 1.900.883 e nosso frete sobre compras é R$ 1.903.507 — 0,14%.

### O que mudou em `conferir-planilha.mjs`

Ele media a compra do mês — o número que a publicação já tinha parado de usar —
e por isso reprovava 8 de 8 meses. Uma conferência que não mede o que a
publicação produz não confere nada. Agora as duas entram pela mesma porta
(`scripts/_apuracao.mjs`) e o teste separa duas perguntas:

- **ACUMULADO**: a leitura da API está certa? Tolerância 5%. Passa em 1,0% e 2,1%.
- **MÊS A MÊS**: não é para fechar. É a divergência de corte de competência, e o
  número de cada mês é o tamanho dela.

Com tudo isso a cadeia de 20 meses roda sem recusa e **agosto/2026 fecha em
3,24% de margem bruta** — dentro dos 3% a 4% que a diretoria informou, obtido
por um caminho independente dessa informação.

## §33 — O café era outro CNPJ (2026-09-14, mesma sessão)

§32 ficou com um erro que a diretoria apontou no mesmo dia: o café não devia
estar ali. Os três estabelecimentos carregados dividem a razão social PARCEIRO
DO GRAO COMERCIO IMP. E EXP. DE CAFE E CEREAIS LTDA (raiz 30798330), mas têm
CNPJ próprio — filial MG 0002-16, MATRIZ 0001-35, filial SP 0004-88 — e a
matriz é a operação de CAFÉ: 97,1% dos R$ 394,7 milhões que movimentou em 20
meses. As filiais não têm um grão de café sequer.

O efeito de tirá-la: o estoque de abertura que é preciso SUPOR cai de 38.706
sacas de soja mais 2.866 de café para **1.506 sacas de soja**. A cadeia quase se
sustenta só com o que a API entrega. Agosto/2026 vai de 3,24% para 4,68% de
margem bruta.

**A lição vale mais do que a correção.** A recusa de publicar ajuste com estoque
negativo, que eu tratei como um obstáculo a contornar (foi por isso que fui
buscar 2025 inteiro, e depois inventei `aberturaMinima`), estava na verdade
apontando para o erro. O café ficava negativo em janeiro/2025 e o custo médio
chegava a -R$ 13.759/saca: aquilo não era falta de histórico, era mistura de
duas empresas. Ir mais para trás no tempo é a resposta certa para "falta
histórico" e a resposta errada para "os dados são de outra entidade" — e as duas
se parecem na tela.

Junto veio um erro de classificação: "FILTRO P/CAFE ALIS 103", "XICARA SOFIA
ALTA CAFE BRANCA - 70ML" e "CAFE BOM DIA TRADICIONAL ALMOFADA 500G" casavam com
/CAFE/ e entravam no estoque como sacas. A inferência por preço não pega isto, e
o porquê importa: 500 g a R$ 33 dá R$ 66/kg, que vezes 60 são R$ 3.960/saca,
dentro da faixa plausível do café. Torrado de varejo e verde a granel custam a
mesma ordem de grandeza por quilo — só a descrição separa.

### E as contas 4.1.18 e 4.1.19 são minhas

O plano de contas do cliente (`Plano_de_Contas_Grupo_Parceiro.pdf`) vai de
4.1.01 a 4.1.17. Não existe conta de variação de estoque. Eu criei as duas, e
isso ficou meses só em comentário de código — agora está na tela de
divergências, onde o contador possa ver e decidir. A mais próxima que existe,
4.1.14 "Quebra técnica e perda de estoque", é outra coisa: perda física, não
diferimento de custo.

### A 4.1.19 foi removida (mesma sessão)

A diretoria mandou tirar, e a decisão está certa: inventar linha no plano de
contas de um cliente não é decisão de quem escreve o código.

A apropriação continua — o que mudou foi onde ela pousa. Agora entra na conta de
aquisição do próprio grão (4.1.01 soja, 4.1.02 milho, 4.1.03 sorgo, 4.1.05
café), um lançamento por grão por competência, negativo quando o mês forma
estoque. O resultado é idêntico ao centavo: agosto/2026 fecha em 4,68% de margem
e R$ 888.641,57 de lucro bruto nos dois desenhos.

E faz mais sentido assim do que o desenho anterior: a conta "Aquisição de milho"
passa a mostrar o custo do milho que foi VENDIDO, que é o que uma conta de CPV
deveria significar, em vez do que foi comprado.

**O custo é real e vale registrar**: no DRE sintético some a linha que deixava a
apropriação visível de longe. Ela continua no analítico da conta, com o
`historico` de cada lançamento dizendo o que é, e continua conferível contra o
armazém — só não salta mais aos olhos de quem abre o sintético.

A 4.1.18 ("Aquisição de grãos não detalhado"), também criada por nós, ficou de
pé. Está com saldo ZERO nos 20 meses desde que a rota NfEntrada passou a
entregar os itens de todas as notas de compra: existe só como rede de segurança
para nota sem item, e o script avisa em voz alta se ela voltar a ter valor —
porque aí seria custo sem grão a que pertencer, e o ajuste por grão o deixaria
sem apropriação.

## §34 — Onde o DRE da API diverge da planilha, linha a linha (2026-09-14)

`conferir-planilha.mjs` comparava dois totais — receita e compra — e dizia "ok,
1,0% e 2,1%". Estava certo e era insuficiente: **dois totais podem fechar com
todas as linhas erradas**, e era o caso. Abrindo o detalhe no desenho da própria
planilha (`conferir-linhas.mjs`), agosto/2026 na filial MG:

| linha | API | planilha | Δ |
|---|---|---|---|
| RECEITA BRUTA | 18.387.746 | 19.103.526 | -3,7% |
| IMPOSTOS | 134.101 | 0 | a planilha não deduz |
| DEVOLUÇÃO | 393.818 | 0 | a planilha não deduz |
| COMPRA DE CEREAIS | 15.147.414 | 16.695.193 | -9,3% |
| FRETE | 1.871.418 | 1.822.630 | +2,7% |
| COMISSÃO | **0** | 68.275 | -100% |
| CLASSIFICAÇÃO | 32.089 | 4.496 | +614% |
| QUEBRAS | **0** | 5.482 | -100% |
| **DESPESA TOTAL** | **21.593** | **505.543** | **-95,7%** |
| LUCRO BRUTO | 808.906 (4,53%) | 507.450 (2,66%) | |
| RESULTADO | 787.314 | 1.907 | |

**A despesa é a divergência dominante, e não é erro de cálculo: o dado não
existe.** Procurei em agosto por centro de custo E por descrição, nas três
empresas: não há UM título de salário, pró-labore, aluguel, contabilidade, juros
ou IOF. O que o ERP traz de despesa é material de escritório, refeições,
uniformes, brindes e combustível. Nos 8 meses de 2026 são R$ 162,6 mil contra
R$ 3,48 milhões da planilha — 4,7% dela, com a diferença entre -89% e -97% TODO
mês. Comissão idem: zero contra R$ 792 mil.

Consequência prática, que precisa estar dita em qualquer reunião: **o lucro
bruto do DRE da API é defensável; o resultado final não é.** Ele aparece
otimista por construção, e nenhum cálculo nosso conserta dado que não foi
registrado.

### Dois erros meus que isto expôs

**1. A receita estava sendo medida errada na conferência.** Eu somava todas as
contas 3.*, então ICMS (R$ 134 mil) e devolução (R$ 394 mil) ENTRAVAM na receita
em vez de sair. Agosto aparecia como R$ 18,92M, "-1,0% da planilha"; a bruta é
R$ 18,39M (-3,7%) e a líquida R$ 17,86M (-6,5%). Um erro de sinal que fazia o
número parecer melhor do que é.

**2. A conferência de linhas nasceu sem a apropriação de estoque** e mostrava a
COMPRA 9,8% ACIMA da planilha, quando com o ajuste ela fica 9,3% abaixo. É a
terceira vez neste projeto que uma ferramenta de conferência mede algo diferente
do que a publicação produz. Agora `ajustesDeEstoque` mora em `_apuracao.mjs` e
as duas chamam a mesma função.

### E um bug de classificação

O ERP escreve "COMPRA DE MILHO" (a regra dizia "COMPRA MILHO") e "FRETES - CMV"
(a regra dizia `/^FRETE\b/`, e o plural quebra a fronteira de palavra). R$ 17,0
milhões de compra e R$ 1,02 milhão de frete estavam na fila de resíduo. Não
movia o DRE — resíduo não entra — mas apagava o sinal: quem olhasse a fila veria
R$ 19,5 milhões "não classificados" e poderia "consertar" classificando, o que
dobraria o custo, já que ele vem da nota. Os prefixos de família agora aceitam o
"DE" opcional e o plural. **Preferir a regra tolerante à regra bonita.**

## §35 — "ICMS crédito presumido" não era imposto (2026-09-14)

Pergunta do Matheus sobre a conferência de linhas: "esse impostos e devolução
você tirou de onde?". As duas linhas tinham origens opostas.

**DEVOLUÇÃO (R$ 393.817,56 em agosto) é real.** 34 notas de devolução de venda,
com número, grão e destinatário: NF 14298 de soja da AGROFEL (R$ 105.213,00),
NF 15068 de milho da SEARA (R$ 60.891,71), NF 14746 da SEARA (R$ 58.783,96),
NF 14538 da MANTIQUEIRA (R$ 42.750,00). Deduzir é o correto; a planilha zera a
linha todo mês. Divergência legítima, do contador.

**IMPOSTOS (R$ 134.101,21) era erro meu.** Existe um centro de custo "ICMS
CRÉDITO PRESUMIDO" no ERP e eu o mapeei para 3.2.01 ("ICMS sobre vendas"), pelo
nome. São dois erros empilhados:

1. Crédito presumido é BENEFÍCIO fiscal. Benefício não reduz receita bruta —
   nem que fosse imposto de verdade, o sinal estaria errado.
2. Não é imposto nenhum: são títulos de COMPRA DE GRÃO com o centro de custo
   errado no ERP.

A prova, e vale o método: ligando título e nota pelo `idContrato` (não pelo
texto do contrato, que tem formato diferente dos dois lados), **18 dos 19
títulos assim rotulados em 20 meses casam com uma nota CFOP 1102 a menos de 2%
de distância**. Em agosto o contrato 169/26M tem três títulos — dois "COMPRA DE
MILHO" de R$ 34.005,89 e R$ 40.799,08, e um "ICMS CRÉDITO PRESUMIDO" de
R$ 45.074,79 — contra exatamente três notas de compra: NF 88 (R$ 34.074,04),
NF 89 (R$ 40.880,84) e NF 90 (R$ 45.165,12). Um para cada.

São R$ 985.625,60 em 20 meses saindo indevidamente da receita. Corrigido para
`VEM_DA_NF`: o custo já vem da nota. A linha IMPOSTOS agora bate com a planilha
(zero) em todos os meses e a receita líquida de agosto foi de -6,5% para -5,8%.

**Dois testes meus fixavam a suposição errada no lugar.** Um afirmava
literalmente "crédito presumido de ICMS recebido REDUZ a dedução" — eu tinha
escrito o teste a partir do nome do centro de custo, não de um documento. Um
teste que codifica uma suposição não a verifica: ele a protege. O outro prendia
a ordenação da tela a um id específico e quebrou quando uma divergência nova
ganhou valor medido; agora afirma a regra (ordem decrescente), não o resultado.

**A lição transferível**: rótulo de centro de custo no ERP é texto que alguém
digitou, não classificação contábil. "COMPRA DE MILHO" virou "COMPRA MILHO" na
minha regra, "FRETES - CMV" não casou com /^FRETE\b/, e "ICMS CRÉDITO
PRESUMIDO" não tinha nada de ICMS. Todas as três vezes o documento vinculado —
a nota — tinha a resposta certa.

## §36 — O que falta para bater com a planilha, e de quem é cada parte (2026-09-14)

"Ainda tá ficando muito diferente, como eu faço? tem q estar igual."

A resposta só ficou útil quando a diferença foi separada em três naturezas.

### 1. Buraco real de receita: CFOP 5934 = R$ 9,11 milhões

"Remessa **simbólica** de mercadoria depositada em armazém geral". Eu o tinha
junto com o 5905 em REMESSA, pelo nome. Mas *simbólica* quer dizer o contrário
do que parece: o grão NÃO se move — quem muda é o dono. É como se vende grão que
já está armazenado.

Testei dupla contagem antes de mexer: cruzando o `idContrato` das 110 notas 5934
da filial MG em 20 meses contra TODAS as notas de venda, **zero** compartilham
contrato. Os destinatários confirmam: ELGRANO, PORTO MINEIRO DE GRÃOS, UNISAFRA,
R L GRÃOS — cerealistas e tradings. O 5905 continua em REMESSA: ali o grão sai e
volta e o dono é o mesmo.

Efeito colateral que confirma de outro ângulo: essas vendas equilibraram o
volume da cadeia de estoque. A apropriação de agosto caiu de -R$ 2,19M para
+R$ 146 mil.

### 2. Imposto nenhum deduz receita de grão

A venda de grão em MG é **ICMS diferido** — a linha IMPOSTOS da planilha é ZERO
em todos os meses. Eu mandava três centros de custo para 3.2.01 porque tinham
"ICMS" no nome:

- `ICMS CRÉDITO PRESUMIDO` → era compra de grão mal rotulada (§35);
- `ICMS - DIFAL` → R$ 11.780,75 de OTTIMA VEÍCULOS, PNEUMASTER PNEUS, HL PNEUS,
  MAIOLINI AUTOMOTIVAS. Pneu e veículo: custo da compra, não dedução de venda;
- `PARCELAMENTO ICMS` → a planilha lança em DESPESAS, e está certa.

Zero deduções de imposto em 20 meses agora, igual à planilha.

### 3. As três naturezas da diferença — é isto que responde "como eu faço"

Com as convenções do cliente (sem apropriação, sem deduzir devolução, filial
MG), 8 meses de 2026:

| linha | API | planilha | Δ |
|---|---|---|---|
| RECEITA BRUTA | 217.225.944 | 218.512.208 | **-0,6%** |
| COMPRA | 195.226.709 | 196.526.907 | **-0,7%** |
| COMISSÃO | 0 | 791.992 | falta |
| QUEBRAS | 0 | 124.144 | falta |
| DESPESA TOTAL | 162.582 | 3.475.952 | falta |

- **ESCOLHA DE MÉTODO** (apropriação, devolução): reversível, é decisão da
  diretoria. A tela mostra as duas colunas.
- **DADO QUE NÃO EXISTE** (R$ 4,4M): não há UM título de folha, aluguel,
  contabilidade, juros, IOF, comissão ou quebra no ERP. Nenhum cálculo cria.
- **CORTE DE COMPETÊNCIA**: no acumulado fecha em menos de 1%; mês a mês vai de
  -32% (janeiro) a +22% (julho). A planilha lança compra e venda do mesmo lote
  no mesmo mês, pelo carregamento; a API só tem data de emissão. Para igualar
  mês a mês seria preciso o vínculo lote-a-lote na API.

### A lição, que já é padrão

**Pela terceira vez na semana um teste meu protegeu a suposição em vez de
verificá-la** — e o do DIFAL eu escrevi na MESMA HORA em que corrigia o crédito
presumido. O mecanismo é sempre o mesmo: escrevo a regra a partir do RÓTULO
(centro de custo, nome do CFOP) e escrevo o teste a partir da minha regra. Um
teste derivado da suposição não a testa; ele a congela.

O antídoto que funcionou nas três vezes foi o mesmo: **abrir o documento**. O
título tinha uma nota vinculada, a nota tinha um destinatário, o destinatário
dizia se era grão ou pneu.


## §37 — Por que a API divergia da planilha: era CFOP, não data (2026-09-14)

Matheus pediu para investigar, e o §36 estava errado num ponto central: o 5934
NÃO é receita da planilha. Fechava o acumulado de 8 meses em -0,1% por
coincidência de magnitude (R$ 9,1M de 5934 ≈ R$ 17,9M de transferência menos
R$ 5,9M de devolução). Estender o teste para 11 meses (out/2025 a ago/2026)
desmontou: base+5934 dá 23,7 pontos de erro médio mensal e explode em nov/dez
(-71%, -78%).

### O método que decidiu

Para cada hipótese, erro médio absoluto mensal em 11 meses E acumulado de 2026.
O acumulado sozinho aceita qualquer termo livre; o mensal em 11 meses não.

**Receita, filial MG (5106/6106/6502/5102/5502 = base):**

| hipótese | erro mensal | acum. 2026 |
|---|---|---|
| base | 21,3 pts | -4,3% |
| base + 5934 | 23,7 | -0,1% |
| base + 6152 | 5,4 | +3,9% |
| **base + 6152 − devolução** | **4,0** | **+1,2%** |
| MG+SP consolidado (sem transferência) | 9,8 | +6,0% |

**Compra:** 1102 + 1117 + 1907 = 6,4 pts, -0,2% — o retorno de armazém está
dentro de COMPRA DE CEREAIS, como a tela de divergências já dizia.

**Datas testadas e descartadas:** título por lançamento (21,8), vencimento
(31,9), quitação (261); corte do mês em outro dia (piora monotonicamente); um
deslocamento uniforme de -5 dias que "ajudava" em 8 meses e some em 11.

### A explicação

A planilha "CEREAIS" é a **filial MG** e registra a **transferência para a
filial SP (CFOP 6152) como venda**. 100% dessas notas vão para o CNPJ
30798330/0004; SP recebe por 2152 (R$ 17,9M em 2026) e revende por 5106/6106
(R$ 22,6M). É o espelho exato da regra que já existia para o 1907 — na visão
da filial, o grão que sai para a irmã saiu dela. E a devolução é abatida dentro
da receita bruta (carga negativa no carregamento), não ignorada.

O que sobra — janeiro -9%, julho +13% na receita; janeiro +17%, abril -9% na
compra — é data: emissão da nota aqui, carregamento lá. `/Contratos` existe
(exige `idEmpresa` e `tipoNegociacao`) e traz o vínculo compra↔venda em
`infoAdicional` como texto livre. É o caminho para casar lote a lote, se
alguém quiser esse corte.

### As duas lições

1. **Testar contra 8 meses aceitava um termo livre que 11 rejeitaram.** O 5934
   não era evidência, era grau de liberdade. Sempre que um ajuste fecha um
   TOTAL, perguntar se ele fecha os MESES.
2. **"Deslocamento de 5 dias" era um sintoma modelado como causa.** A planilha
   parecia adiantada porque tinha R$ 5M/mês de 6152 que eu não tinha. Antes de
   modelar um efeito, procurar o que falta.

## §38 — Estudando a planilha até o fim: a O.C. (2026-09-14)

Matheus pediu para continuar estudando a planilha até conseguir gerá-la só
pela API. Fui atrás da última fonte de data que faltava testar: a **O.C.
(ordem de carregamento)**, que aparece na descrição dos títulos dos dois lados
("Fat. NFe saída | Cont: 14714 | O.C.: 16759"; "Fat. NFe entrada | Cont:
169/26M | O.C.: 16909"). Se o mês da planilha fosse o da O.C., estaria ali.

**Resultado, medido em 20 meses da filial MG:**

- 416 de 417 títulos de venda de agosto trazem O.C.; `documento` = "Nº <NF>".
  Mas a `dataLancamento` do título é a da emissão da nota em 8.217 de 8.363
  casos (0 antes, 138 depois). **A data da O.C. não está na API** — o título
  nasce junto com a nota, não com o carregamento.
- 1.686 O.C. aparecem nos dois lados. Do lado da compra são grão (soja 21,7M,
  milho 15,7M) e frete. Só **18% dos títulos de compra de grão** têm O.C. com
  venda (765 pares, R$ 38,5M); nesses, a razão compra/venda mediana é
  **0,865**, a defasagem venda−compra é **−1 dia** e só 2% mudam de mês.
  Ou seja: são vendas diretas (caminhão sai do produtor e entrega no
  comprador no mesmo dia). Não explicam o resíduo mensal — o resíduo vem dos
  outros 82%, grão que entra em estoque e sai depois.
- Bucketar a compra pelo mês da venda da mesma O.C. não muda nada (cobertura
  0% pelo vínculo de documento, que na compra é só o número da NF, ambíguo
  entre fornecedores).

**Fontes de data agora testadas e esgotadas:** emissão da NF; lançamento,
vencimento e quitação do título; corte de mês em outro dia; deslocamento
uniforme; O.C. Nenhuma reproduz o mês da planilha melhor que a emissão (4,0
pts). `/Contratos` traz `previsaoEntregaInicio/Fim` e parcelas, mas contrato é
plurimensal — prior baixa, não testado.

**Conclusão honesta:** a planilha ensina REGRAS, e todas as regras que ela
tinha para ensinar já estão no código (filial MG, 6152 como venda, 1907 na
compra, devolução líquida, sem imposto, sem apropriação, estrutura do custo
total). Ela não ensina DADOS: nem a data de carregamento (que não existe na
API) nem os R$ 3,4M de despesa que ninguém digitou no ERP. O limite do que a
API permite é 4 pontos por mês e <1% no acumulado — e esse limite é do dado,
não do método.

O que a O.C. deu de útil e fica: um vínculo lote-a-lote derivável para as
vendas diretas (18% do volume), com custo casado a 0,865 da venda. Serve para
a cadeia de custo médio, não para o mês.
