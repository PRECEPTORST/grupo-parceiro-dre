# Roadmap — DRE por competência a partir da API Enoki (Safra Cloud)

> Backlog executável da decisão da §27 do `context.md` (2026-08-21): **caminho D** — DRE de
> trading automático via API (competência = `dataLancamento`/`dataEmissao`) + estrutura vinda da
> planilha/manual com origem marcada + reconciliação como auditoria.
> **Como usar:** seguir as fases em ordem; dentro da fase, os itens já estão priorizados.
> Marcar `[x]` ao concluir e anotar a data. Critério de aceite (CA) define "pronto".
> Tamanhos: **P** (≤meio dia) · **M** (~1 dia) · **G** (2+ dias).

---

## Fase 0 — Destravas externas (não bloqueiam a Fase 1; rodar em paralelo)

- [ ] **0.1 Perguntar ao Juliano/Daiane: folha e despesas de estrutura passam pelo financeiro da Enoki?** (P)
  Na homologação quase não aparecem (só "FÉRIAS R$12k"). Se são pagas por fora → Fase 2 usa
  planilha/manual em definitivo; se estão só faltando na homolog → produção pode cobrir.
  _CA: resposta registrada no `context.md`._
- [ ] **0.2 URL de PRODUÇÃO da API + chave** (P) — pendente desde §26 (Luciano). Homologação pode
  estar incompleta/defasada. _CA: envs `ENOKI_*` de produção na Vercel._
- [ ] **0.3 Resposta do Safra sobre export de balancete/razão** (P) — se existir, vira a fonte da
  Fase 2+ (troca só o adapter; o desenho não muda). _CA: sim/não registrado._
- [ ] **0.4 Validar com o cliente as regras de negócio da §27** (P): eliminação intra-grupo
  (CNPJs raiz `30798330`, `22271113`, `47591700`), café cotado por saca, tratamento de devoluções.
  _CA: ok do Luciano/cliente na reunião._

## Fase 1 — DRE de trading automático (o coração) ✅ concluída em 2026-08-21

> Meta: abrir o app e ver o DRE jan–hoje montado sozinho a partir da API, nas linhas de
> receita/deduções/CPV, com a REGRA DE OURO intacta (motor `dre.ts` não muda).

- [x] **1.1 Normalização determinística Enoki→DRE** — `src/lib/enokiDre.ts` (G)
  Título/NF → `LancamentoCanonico` com `data = dataLancamento` (títulos) / `dataEmissao` (NFs).
  Inclui: filtros (canceladas, ajustes, `ENTRADA`, lote de migração), typos de produto
  ("SORGO EM GÃOS"), **unidade por produto** (kg÷60; café já em sacas), **eliminação intra-grupo**
  por CNPJ raiz, estornos ("RECEITA X" no a pagar reduz receita). Sem IA, tudo testado.
  _CA: testes com fixtures reais das 3 armadilhas (intra-grupo, café, typo); soma bate com a
  extração validada em 2026-08-21 (receita fora do grupo R$260,9M jan–jul)._
- [x] **1.2 Mapa determinístico `centroCusto → conta do plano`** (M)
  "COMPRA SOJA"→4.1.0x, "RECEITA MILHO"→3.1.0x, "FRETE"/"SECAGEM"/"ARMAZENAGEM"→CPV,
  administrativas etc. Cobrir os ~40 CCs observados. IA **não** participa aqui.
  _CA: 100% dos CCs da extração de validação mapeados; teste exaustivo do Record._
- [x] **1.3 Endpoint de sincronização incremental** — `api/enoki-dre.ts` (G)
  Puxa NfSaida + títulos (pagar/receber) por `desdeId`, throttling ~1 req/s + backoff 429,
  janelas obrigatórias do NfSaida, **cache/estado incremental no Blob** (nunca repuxar 20k
  registros por load; `maxDuration` respeitado). Reusa padrões do `api/enoki-caixa.ts`.
  _CA: 1ª carga completa jan–hoje em ≤120s por invocação (continuável); cargas seguintes só
  trazem o delta; 5 empresas._
- [x] **1.4 Classificação IA só do resíduo "SEM CC"** (M)
  `descricao + parceiroNome` → conta, padrão `api/classificar.ts` (tool use, confiança,
  memorização em `classificacoes`). "SEM CC" = R$1,7M receber + R$0,8M pagar na validação.
  _CA: fila de revisão para confiança <0,8; reclassificação manual vence sempre._
- [x] **1.5 Origem por lançamento** — `LancamentoCanonico.origem: 'enoki'|'planilha'|'manual'` (P)
  Campo novo em `tipos.ts` (retrocompatível: ausente = 'planilha').
  _CA: tela Lançamentos exibe a origem; testes de retrocompatibilidade._
- [x] **1.6 DRE automático na UI** (M)
  Botão/rotina "Sincronizar Enoki (competência)" + badge de fonte no DRE (como o badge do Caixa).
  Nesta fase, modo **lado a lado**: DRE Enoki × DRE planilha (sem fusão ainda — evita dupla contagem).
  _CA: DRE jan–hoje renderiza só com dados da API; verificação visual `?demo` + prod._

## Fase 2 — Estrutura + fusão de fontes ✅ concluída em 2026-08-21

> Meta: um DRE só, completo (trading da API + estrutura da planilha/manual), sem dupla contagem.

- [x] **2.1 Regra de fusão por linha do DRE** (G)
  Config explícita: quais linhas vêm da API (receita, deduções, CPV) e quais da planilha/manual
  (folha→administrativas, depreciação, financeiras, IRPJ/CSLL). Determinística e visível na UI.
  _CA: nenhuma conta somada em dobro; teste de fusão; nota de fonte por linha no DRE analítico._
- [x] **2.2 Sacas automáticas das NFs** (M)
  `EstadoDre.sacas` alimentado pela API (substitui digitação da §20; override manual continua vencendo).
  _CA: sacas por grão/mês da API = validação (milho 90–288k/mês); R$/saca e meta×realizado funcionam._
- [x] **2.3 Deduções completas** (M)
  NFs de devolução (265 na validação) + motor de alíquotas (§6) por CFOP onde faltar título de
  tributo. _CA: linha deduções > 0 e coerente com o motor de impostos._
- [x] **2.4 Lançamento manual de estrutura** (M)
  Rotina mensal simples (admin) para folha/depreciação/financeiras quando não vierem de planilha —
  grade conta × mês, origem='manual'. _CA: entra no DRE fundido e na auditoria._

## Fase 3 — Reconciliação, estoque e auditoria ✅ concluída em 2026-08-21

> Meta: transformar a diferença API × planilha em ferramenta de auditoria (o que o cliente pediu, §15).

- [x] **3.1 Painel de reconciliação API × planilha** (G)
  Motor §17 ganha comparação por linha/mês entre origens; divergência = achado com severidade.
  _CA: reproduz como achados os já conhecidos: estorno R$910k (mai API × abr planilha) e gap de timing._
- [x] **3.2 Custo médio móvel por grão → CPV vendido** (G)
  Motor `src/lib/custoMedio.ts` + painel no DRE + entrada de volume/estoque. Determinístico, testado.
  ⚠ **BLOQUEIO DE DADO descoberto em 2026-08-21:** a API NÃO informa quantidade comprada — os
  títulos de "COMPRA {GRÃO}" só têm valor, e `Contratos` devolve apenas "Contrato de Venda"
  (testado inclusive por `idContrato` de um título de compra: vazio). Por isso o volume comprado
  e o estoque de abertura são INFORMADOS na tela. **Perguntar ao Safra se produção expõe contrato
  de compra** (vira item de Fase 0); se sim, troca-se só o alimentador.
  _CA: ✅ CPV mensal ≠ compras do mês quando há formação de estoque; alertas de estoque negativo e
  de volume-sem-valor._
- [x] **3.3 Investigar o gap NF × títulos** (M) — **DECOMPOSTO**
  O gap caiu de ~R$ 37M para **R$ 21,9M (9,1%)** só com o CFOP (item 2.3): remessa e
  transferência respondiam pela maior parte. O que sobra foi confrontado contrato a contrato
  (`src/lib/gapContratos.ts`): em 232 contratos com nota E título, razão mediana **0,960** com
  dispersão grande (p10 = 0,755) e 30% batendo exato. Alíquota daria razão constante → a
  assinatura é de **desconto de classificação** (umidade/impureza/avariados). O gap se repete em
  todo mês (5–12%) → estrutural, não pontual.
  ⚠ **NÃO reclassificado automaticamente:** se for abatimento, a receita bruta está superavaliada
  em 9% e o valor pertence às deduções — o que viraria o resultado do semestre. Grande demais
  para entrar por hipótese. Vira achado quantificado; a decisão é do contador.
  _CA: ✅ gap decomposto, com card na reconciliação e registro no `context.md`._
- [x] **3.4 Resultado por grão por COMPETÊNCIA** (M)
  Hoje só existe em regime de caixa (§26). Com 1.1+3.2, montar por competência no DRE.
  _CA: card por grão em competência; soma reconcilia com o DRE._

## Fase 4 — Operação e produção

- [ ] **4.1 Apontar para a API de PRODUÇÃO** (P) — depende de 0.2. Re-rodar a validação da §27
  contra prod (o buraco de estrutura pode mudar de tamanho). _CA: números de prod validados._
- [x] **4.2 Sync agendado** (M) — `api/enoki-cron.ts` (cron diário 06:00 UTC, protegido por
  `CRON_SECRET`) grava o delta cru dos últimos 21 dias no Blob; auto-sync incremental na abertura
  do app quando a última carga tem +12h. A mesclagem é por JANELA (o período sincronizado é
  autoritário, o resto é preservado) — substituir tudo apagaria a carga histórica.
  ⚠ **Falta setar `CRON_SECRET` na Vercel** para o cron sair do 401.
  _CA: ✅ DRE atualiza sem clique._
- [ ] **4.3 Alertas WhatsApp (Sprint 3 da proposta)** (G) — a confiabilidade + reconciliação
  (3.1) rankeiam por materialidade; falta provedor (Twilio × Meta API + custo).
  _CA: alerta de divergência material chega no WhatsApp do sócio._

---

## Riscos vivos (monitorar a cada fase)

| Risco | Mitigação |
|---|---|
| Homologação incompleta (estrutura ausente) | 0.1/0.2 primeiro; Fase 2 assume planilha/manual como fonte de estrutura |
| Rate limit 429 agressivo | Sync incremental + throttling (1.3); nunca janela cheia |
| `dataLancamento` = data de digitação em alguns títulos | Reconciliação 3.1 detecta desvios de timing |
| Balancete do Safra sair no meio do caminho | Desenho em camadas: só troca o adapter da fonte (1.1 intacto) |
| Dupla contagem na fusão | 2.1 é config explícita por linha, com teste dedicado |

## Sequência recomendada de sessões

1. **Sessão A:** 1.1 + 1.2 (núcleo determinístico, só testes — sem rede)
2. **Sessão B:** 1.3 (sync incremental) + 1.5
3. **Sessão C:** 1.4 + 1.6 → **demo do DRE automático para o cliente**
4. **Sessão D:** 2.1 + 2.2 → DRE único fundido
5. **Sessão E:** 2.3 + 2.4 → DRE completo
6. **Sessões F+:** Fase 3 (auditoria/estoque), depois Fase 4
