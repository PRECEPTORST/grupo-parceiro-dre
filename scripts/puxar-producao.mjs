/**
 * Puxa o DRE direto da API de PRODUÇÃO da Safra Cloud e publica no site.
 *
 * POR QUE ISTO SUBSTITUI PARTE DO ROBÔ
 * ------------------------------------
 * Até 09/09/2026 a API só existia em homologação (recorte de teste que para em
 * 05/08), e por isso o robô raspava o ERP pela tela. A API de produção mudou a
 * conta em três pontos:
 *   • traz os ITENS da nota (produto, quantidade, valor unitário) — que a grade
 *     nunca deu, e sem os quais não há receita por grão, sacas nem custo médio;
 *   • traz `destinatarioCpfCnpj`, então a eliminação intragrupo volta a ser por
 *     raiz de CNPJ em vez de por nome;
 *   • cobre as CINCO empresas, e não só a que está ativa na sessão do ERP.
 *
 * A NOTA DE ENTRADA CHEGOU (2026-09-11). Era a peça que faltava e o motivo de
 * todo o trabalho de raspagem: `NfEntrada` traz os mesmos itens (produto,
 * quantidade, valorUnitario), o `emitenteCpfCnpj` e — de brinde — o
 * `contratosVinculados` com o contrato de COMPRA, que a rota `Contratos` não
 * devolvia. Com ela o DRE passa a ser 100% API, e o robô vira histórico.
 *
 *   node scripts/puxar-producao.mjs 2026-07 2026-08
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
const env = readFileSync(path.join(raiz, ".env.local"), "utf8");
const leia = (k) => env.match(new RegExp(`${k}="?([^"\\n]+)"?`))?.[1];

const BASE = process.env.ENOKI_BASE_URL ?? leia("ENOKI_BASE_URL") ?? "https://api.parceirodograo.safracloud.com.br";
const KEY = process.env.ENOKI_API_KEY ?? leia("ENOKI_API_KEY");
const NS = "/api/Customizados/v1/ParceiroDoGrao";
const TOP = 200;
if (!KEY) throw new Error("ENOKI_API_KEY não configurada (.env.local)");
if (/homologacao/.test(BASE)) throw new Error(`BASE aponta para homologação: ${BASE}`);

const meses = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}$/.test(a));
if (!meses.length) { console.error("uso: node scripts/puxar-producao.mjs 2026-07 2026-08"); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(caminho, tent = 0) {
  const r = await fetch(`${BASE}${NS}${caminho}`, { headers: { "X-Api-Key": KEY, accept: "application/json" } });
  if (r.status === 429 && tent < 6) { await sleep(1500 * (tent + 1)); return api(caminho, tent + 1); }
  if (!r.ok) throw new Error(`${caminho} → ${r.status} ${(await r.text()).slice(0, 160)}`);
  return r.json();
}

/** Paginação por cursor de id — a API devolve `top` registros por vez. */
async function todos(rota, filtros, campoId) {
  const out = [];
  let cursor = 0;
  for (let i = 0; i < 200; i++) {
    const lote = await api(`/${rota}?${filtros}&desdeId=${cursor}&top=${TOP}`);
    if (!lote.length) break;
    out.push(...lote);
    const ultimo = lote[lote.length - 1]?.[campoId];
    if (ultimo == null || ultimo === cursor) break;
    cursor = ultimo;
    await sleep(180);
    if (lote.length < TOP) break;
  }
  return out;
}

const ultimoDia = (m) => {
  const [a, mm] = m.split("-").map(Number);
  return `${m}-${String(new Date(Date.UTC(a, mm, 0)).getUTCDate()).padStart(2, "0")}`;
};

const empresas = await api("/Empresas?top=50");
console.log(`empresas: ${empresas.map((e) => `${e.idEmpresa}:${e.nomeFantasia}`).join(" · ")}`);

const outDir = path.join(raiz, "robot", "out");
mkdirSync(outDir, { recursive: true });

for (const mes of meses) {
  const de = `${mes}-01`, ate = ultimoDia(mes);
  const nfs = [], pagar = [], receber = [];
  const entradasPorEmpresa = new Map();

  for (const emp of empresas) {
    const id = emp.idEmpresa;
    const n = await todos("NfSaida", `idEmpresa=${id}&dataInicio=${de}&dataFim=${ate}`, "idNf");
    // `entrada: true` é o que faz `cfop.ts` ler 1102 como COMPRA e não como venda.
    const ne = (await todos("NfEntrada", `idEmpresa=${id}&dataInicio=${de}&dataFim=${ate}`, "idNf"))
      .map((x) => ({ ...x, entrada: true }));
    // COMPETÊNCIA: título filtrado pela data de LANÇAMENTO, não a de quitação.
    const p = await todos("LancamentosFinanceirosPagar", `idEmpresa=${id}&dataLancInicio=${de}&dataLancFim=${ate}`, "idItemLancamento");
    const r = await todos("LancamentosFinanceiros", `idEmpresa=${id}&dataLancInicio=${de}&dataLancFim=${ate}`, "idItemLancamento");
    nfs.push(...n, ...ne); pagar.push(...p); receber.push(...r);
    entradasPorEmpresa.set(id, ne.length);
    console.log(`  ${mes} empresa ${id} (${emp.nomeFantasia}): saida=${n.length} entrada=${ne.length} pagar=${p.length} receber=${r.length}`);
  }


  // ─────────────────────────────────────────────────────────────────────────
  // RECEITA DE CINCO EMPRESAS COM CUSTO DE UMA É UM LUCRO INVENTADO.
  //
  // A API cobre as cinco; o robô lê UMA por vez (a que está ativa na sessão do
  // ERP). Sem essa trava, agosto/2026 sairia com R$ 23,1M de receita contra o
  // CPV só de MG — e um lucro bruto de R$ 2,27M onde o número honesto é
  // NEGATIVO. Número bonito e errado é o pior resultado possível aqui.
  //
  // Então só entram as empresas para as quais existe nota de ENTRADA. As outras
  // ficam de fora, nomeadas, até o robô cobri-las.
  const comCompra = new Set([...entradasPorEmpresa].filter(([, n]) => n > 0).map(([id]) => id));
  const permitida = (id) => comCompra.has(id);
  const foraDoCorte = empresas.filter((e) => !permitida(e.idEmpresa) &&
    nfs.some((n) => n.idEmpresa === e.idEmpresa));
  if (foraDoCorte.length) {
    console.log(`  ${mes}: ⚠ FORA do DRE por falta de nota de entrada: ` +
      foraDoCorte.map((e) => `${e.idEmpresa}:${e.nomeFantasia}`).join(" · "));
  }
  const nfsFinal = nfs.filter((n) => permitida(n.idEmpresa));
  const pagarFinal = pagar.filter((t) => permitida(t.idEmpresa));
  const receberFinal = receber.filter((t) => permitida(t.idEmpresa));

  const arquivo = path.join(outDir, `api-producao-${mes}.json`);
  writeFileSync(arquivo, JSON.stringify({
    fonte: "api-producao",
    empresa: "produção · empresas com compra coberta",
    de, ate,
    geradoEm: new Date().toISOString(),
    parcial: false,
    empresasIncluidas: empresas.filter((e) => permitida(e.idEmpresa)).map((e) => e.nomeFantasia),
    empresasForaPorFaltaDeCompra: foraDoCorte.map((e) => e.nomeFantasia),
    nfs: nfsFinal,
    pagar: pagarFinal,
    receber: receberFinal,
  }, null, 1), "utf8");
  console.log(`  gravado: ${arquivo}  (nfs=${nfsFinal.length} pagar=${pagarFinal.length} receber=${receberFinal.length})`);
}
