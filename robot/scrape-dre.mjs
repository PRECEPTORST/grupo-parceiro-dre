// Robô que lê o ERP Enoki (PRODUÇÃO) e produz a entrada do DRE.
//
// POR QUE UM SCRAPER, SE EXISTE API
// --------------------------------
// A API Safra Cloud só está publicada em HOMOLOGAÇÃO — um recorte de teste que
// para em 05/08/2026. O ERP real vive em `parceirodograo.enoki.com.br`, e é lá
// que estão os números do cliente. Enquanto não houver API de produção, este é
// o único caminho para o dado verdadeiro.
//
// O CONTRATO QUE ESTE ARQUIVO RESPEITA
// ------------------------------------
// A saída é EXATAMENTE o formato que a API devolvia — `{ nfs, pagar, receber }`
// com os mesmos nomes de campo. Assim `src/lib/enokiDre.ts` (CFOP, unidade,
// intragrupo, estornos, autorização — tudo com teste) continua valendo sem uma
// linha de mudança. O scraper é um ADAPTADOR, não uma segunda implementação.
//
// LIMITES CONHECIDOS (ver manual-scraper-enoki.md)
//   • A sessão vale para a EMPRESA ATIVA no ERP. Outras filiais exigem trocar a
//     empresa antes — hoje o robô lê a que estiver selecionada.
//   • A grade de NF NÃO traz os itens (produto/quantidade). Sem eles não há
//     quebra por cereal nem sacas; a receita entra na conta 3.1.15 ("produto não
//     detalhado"), que é honesta e visível no DRE analítico.
//   • A paginação do WebGUI trava em varreduras longas. Por isso o padrão é
//     rodar MÊS A MÊS e gravar cada mês assim que termina.
//
// Uso:
//   node robot/scrape-dre.mjs --de=2026-07-01 --ate=2026-07-31
//   node robot/scrape-dre.mjs --meses=2026-01,2026-02   (um arquivo por mês)

import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import {
  loadDotEnv, makeLogger, ensureLoggedIn, openScreen, clickSpan,
  findGridId, extractGrid, readPager, nextPage, setPacing, pause,
} from "./lib/erp-ui.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(here, ".env"));

const log = makeLogger("dre");
const statePath = path.join(here, ".state", "session.json");
const outDir = path.join(here, "out");
/** Teto de páginas da NF: o histórico tem ~375, mas a janela é um mês. */
const MAX_PAGINAS_NF = 120;
mkdirSync(path.dirname(statePath), { recursive: true });
mkdirSync(outDir, { recursive: true });

setPacing({
  minDelayMs: Number(process.env.ROBOT_MIN_DELAY_MS ?? 700),
  maxDelayMs: Number(process.env.ROBOT_MAX_DELAY_MS ?? 1600),
});

// ---------------------------------------------------------------- argumentos

const arg = (nome, padrao = null) => {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.slice(nome.length + 3) : padrao;
};

/** Lista de [de, ate] a processar. `--meses` vira uma janela por mês. */
function janelas() {
  const meses = arg("meses");
  if (meses) {
    return meses.split(",").map((m) => {
      const [a, mm] = m.trim().split("-").map(Number);
      const ultimo = new Date(Date.UTC(a, mm, 0)).getUTCDate();
      return [`${m.trim()}-01`, `${m.trim()}-${String(ultimo).padStart(2, "0")}`];
    });
  }
  const de = arg("de");
  const ate = arg("ate");
  if (!de || !ate) {
    console.error("uso: node robot/scrape-dre.mjs --de=AAAA-MM-DD --ate=AAAA-MM-DD");
    console.error("     node robot/scrape-dre.mjs --meses=2026-01,2026-02");
    process.exit(1);
  }
  return [[de, ate]];
}

// ---------------------------------------------------------------- conversões
// O ERP escreve em pt-BR; a normalização espera o mesmo formato que a API dava.

/** '26/08/2026' → '2026-08-26T00:00:00-03:00' (a normalização só lê os 10 primeiros). */
const dataIso = (br) => {
  const m = String(br ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}T00:00:00-03:00` : null;
};

/** 'R$ 1.234,56' | '37,1300' → '1234.56' (string, como a API devolvia). */
const valorApi = (br) => {
  const limpo = String(br ?? "").replace(/[R$\s.]/g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? String(n) : "0";
};

const soDigitos = (s) => String(s ?? "").replace(/\D/g, "");

// ---------------------------------------------------------------- paginação

/**
 * Varre todas as páginas do grid ancorado em `ancora`.
 * Para e AVISA quando a paginação trava (armadilha #4 do manual) — parar em
 * silêncio seria entregar um mês pela metade sem ninguém notar.
 */
async function varrerPaginas(page, ancora, { maxPaginas = 400 } = {}) {
  const linhas = [];
  let pagina = 1;
  let travou = false;

  for (let i = 0; i < maxPaginas; i++) {
    const gridId = await findGridId(page, ancora);
    linhas.push(...(await extractGrid(page, gridId)));

    const pager = await readPager(page).catch(() => null);
    if (!pager || pager.current >= pager.total) break;

    const avancou = await nextPage(page, pager.current + 1).catch(() => false);
    if (!avancou) {
      travou = true;
      log(`  paginação travou na página ${pager.current}/${pager.total} — salvando o parcial`);
      break;
    }
    pagina = pager.current + 1;
    await pause();
    if (pagina % 25 === 0) log(`  …página ${pagina}`);
  }
  return { linhas, travou };
}

// ---------------------------------------------------------------- telas

/**
 * NF Saída/NF-e — cabeçalho das notas (CFOP, status, total; a grade não traz itens).
 *
 * ⚠ O FILTRO DE DATA DA TELA NÃO FUNCIONA. Os campos "Emissão de/até" aceitam a
 * digitação, mostram o valor, e o descartam no blur — o servidor nunca fica
 * sabendo. Brigar com a máscara do WebGUI custaria mais do que contorná-la.
 *
 * O contorno: ORDENAR POR DATA DE EMISSÃO (isso funciona), paginar do mais
 * recente para trás e PARAR assim que a página inteira ficar mais antiga que o
 * início da janela. Filtrar em código é barato; o que importa é não varrer as
 * 375 páginas de histórico para pegar um mês.
 */
async function lerNfs(page, de, ate) {
  await openScreen(page, "Doc. Fiscais", "NF Saída/NF-e", "DESTINATÁRIO", { log });
  await page.waitForTimeout(2000);

  // Ordena por data de emissão (mais recente primeiro).
  try {
    const combo = await page.evaluate(() => {
      const s = [...document.querySelectorAll("span")].find((x) => x.textContent.trim() === "Ordenação:");
      if (!s) return null;
      const b = s.getBoundingClientRect();
      return { x: Math.round(b.x + 40), y: Math.round(b.bottom + 10) };
    });
    if (combo) {
      await page.mouse.click(combo.x, combo.y);
      await page.waitForTimeout(900);
      await page.locator("span:text-is('Data Emissão')").first().click({ timeout: 5000 });
      await page.waitForTimeout(1200);
      log("  ordenação: Data Emissão");
    }
  } catch {
    log("  ATENÇÃO: não consegui ordenar por data — a varredura pode ficar longa");
  }

  // Dispara a busca pela lupa (o botão fica à direita do campo de busca livre).
  const lupa = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll("input")].filter((i) => i.type !== "hidden");
    const busca = inputs.map((i) => ({ i, b: i.getBoundingClientRect() }))
      .filter(({ b }) => b.y < 140 && b.width > 120).sort((a, b) => b.b.width - a.b.width)[0];
    if (!busca) return null;
    const alvo = [...document.querySelectorAll("div,span,img,a,td")]
      .map((e) => ({ e, b: e.getBoundingClientRect() }))
      .filter(({ b }) => b.width >= 14 && b.width <= 60 && b.height >= 14 && b.height <= 46 &&
                         b.left >= busca.b.right - 4 && b.left <= busca.b.right + 70 &&
                         Math.abs(b.top - busca.b.top) < 26)
      .sort((a, b) => a.b.left - b.b.left)[0];
    return alvo ? { x: Math.round(alvo.b.x + alvo.b.width / 2), y: Math.round(alvo.b.y + alvo.b.height / 2) } : null;
  });
  if (lupa) { await page.mouse.click(lupa.x, lupa.y); await page.waitForTimeout(5000); }

  const dentro = [];
  let pagina = 1;
  let travou = false;
  let paginasAlem = 0;

  for (let i = 0; i < MAX_PAGINAS_NF; i++) {
    const gridId = await findGridId(page, "DESTINATÁRIO");
    const linhas = await extractGrid(page, gridId);
    const isos = linhas.map((r) => (dataIso(r["EMISSÃO"]) ?? "").slice(0, 10)).filter(Boolean);

    dentro.push(...linhas.filter((r) => {
      const d = (dataIso(r["EMISSÃO"]) ?? "").slice(0, 10);
      return d && d >= de && d <= ate;
    }));

    // Página inteira anterior ao início da janela: já passamos do alvo. Duas
    // páginas seguidas para tolerar uma ordenação imperfeita.
    if (isos.length && isos.every((d) => d < de)) {
      if (++paginasAlem >= 2) { log(`  passei da janela na página ${pagina} — parando`); break; }
    } else paginasAlem = 0;

    const pager = await readPager(page).catch(() => null);
    if (!pager || pager.current >= pager.total) break;
    if (!(await nextPage(page, pager.current + 1).catch(() => false))) {
      travou = true;
      log(`  paginação travou na página ${pager.current}/${pager.total} — salvando o parcial`);
      break;
    }
    pagina = pager.current + 1;
    await pause();
    if (pagina % 20 === 0) log(`  …NF página ${pagina} (${dentro.length} na janela)`);
  }

  log(`  NF: ${dentro.length} na janela${travou ? " (PARCIAL)" : ""}`);
  return { linhas: dentro, travou };
}

/**
 * Lançamentos Financeiros — títulos com centro de custo e data de lançamento.
 *
 * DUAS COISAS QUE CUSTARAM CARO ATÉ ACERTAR
 * -----------------------------------------
 * 1. O critério padrão da tela é "Não Quitados". Lendo só ele, as COMPRAS do mês
 *    (que já foram pagas) somem, e o CPV do DRE sai por um quinto do real. A
 *    opção que traz tudo chama-se "Quitados/Não Quitados" — não "Todos".
 * 2. A tela tem um combo Pagar/Receber. Usá-lo é infinitamente melhor do que
 *    adivinhar a direção pela descrição: o ERP já sabe a resposta. Por isso a
 *    varredura roda DUAS VEZES, uma por direção, e cada título já vem rotulado.
 */
async function lerTitulos(page, direcao) {
  await openScreen(page, "Financeiro", "Lançamentos Financeiros", "PARCEIRO", { log });
  await page.waitForTimeout(2000);

  try {
    const cx = await page.locator("span:text-is('TODOS OS PERIODOS')").first().boundingBox({ timeout: 8000 });
    if (cx) {
      await page.mouse.click(cx.x - 12, cx.y + cx.height / 2);
      await page.waitForTimeout(2500);
      log("  filtro 'TODOS OS PERIODOS' marcado");
    }
  } catch {
    log("  ATENCAO: nao achei 'TODOS OS PERIODOS' — o grid pode vir so do mes corrente");
  }

  try {
    await clickSpan(page, "Nao Quitados").catch(async () => { await clickSpan(page, "Não Quitados"); });
    await page.waitForTimeout(900);
    await page.locator("span:text-is('Quitados/Não Quitados')").first().click({ timeout: 6000 });
    await page.waitForTimeout(3000);
    log("  criterio: Quitados/Nao Quitados");
  } catch {
    log("  ATENCAO: nao consegui abrir o criterio — titulos ja pagos podem faltar");
  }

  try {
    await page.locator("#VWG_202").first().click({ timeout: 6000 });
    await page.waitForTimeout(900);
    await page.locator("span:text-is('" + direcao + "')").first().click({ timeout: 6000 });
    await page.waitForTimeout(3000);
    log("  direcao: " + direcao);
  } catch {
    log("  ATENCAO: nao consegui selecionar \"" + direcao + "\" — a leitura pode misturar direcoes");
  }

  const { linhas, travou } = await varrerPaginas(page, "PARCEIRO");
  log("  " + direcao + ": " + linhas.length + " linha(s)" + (travou ? " (PARCIAL)" : ""));
  return { linhas, travou };
}

// ---------------------------------------------------------------- adaptação
// Daqui para baixo o objetivo é UM só: falar exatamente a língua da API, para
// `src/lib/enokiDre.ts` continuar valendo sem mudança.

function nfParaApi(row, i) {
  const numero = soDigitos(row["N° NF"] ?? row["Nº NF"]);
  return {
    idNf: Number(numero) || i,
    numeroNf: Number(numero) || null,
    dataEmissao: dataIso(row["EMISSÃO"]),
    status: row["STATUS"] ?? "",
    statusNfe: row["STATUS NFE"] ?? "",
    cfop: row["CFOP"] ?? "",
    tipoOperacao: row["TIPO OP."] ?? "",
    finalidade: row["FINALIDADE"] ?? "",
    valorTotalNf: valorApi(row["TOTAL NF"]),
    destinatarioNome: row["DESTINATÁRIO"] ?? "",
    // A grade não expõe o CNPJ. A eliminação intragrupo cai para o NOME, que
    // `enokiDre.ts` trata — as empresas do grupo têm razão social distintiva.
    destinatarioCpfCnpj: "",
    contratosVinculados: [],
    // Sem itens: a receita entra sem quebra por cereal (conta 3.1.15).
    itens: [],
  };
}

function tituloParaApi(row, i) {
  return {
    idItemLancamento: `scrape-${soDigitos(row["DOCUMENTO"]) || i}-${i}`,
    idLancamento: null,
    dataLancamento: dataIso(row["LANCAMENTO"]),
    dataVencimento: dataIso(row["VENCIMENTO"]),
    valor: valorApi(row["VALOR"]),
    parceiroNome: row["PARCEIRO"] ?? "",
    descricao: row["DESCRIÇÃO"] ?? "",
    centroCusto: row["CENTRO DE CUSTO"] ?? "",
    idContrato: null,
    quitado: String(row["QUITADO"] ?? "").trim() !== "",
    dataQuitacao: dataIso(row["QUITAÇÃO"]),
    valorPago: valorApi(row["VALOR PAGO"]),
  };
}

// ---------------------------------------------------------------- principal

const browser = await chromium.launch({ headless: process.env.ROBOT_HEADLESS !== "false" });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1400 },
  storageState: existsSync(statePath) ? statePath : undefined,
});
const page = await context.newPage();

try {
  await page.goto(process.env.ENOKI_URL, { waitUntil: "domcontentloaded" });
  await ensureLoggedIn(page, context, {
    user: process.env.ENOKI_USER,
    password: process.env.ENOKI_PASSWORD,
    statePath,
    log,
  });

  const empresa = await page
    .evaluate(() => document.body.innerText.match(/PARCEIRO DO GR[ÃA]O[^\n]*/)?.[0] ?? "")
    .catch(() => "");
  log(`empresa ativa no ERP: ${empresa || "(não identificada)"}`);

  // Os títulos são lidos UMA vez (a tela não filtra por data de lançamento) e
  // recortados por competência para cada janela.
  const brutoPagar = await lerTitulos(page, "Pagar");
  const brutoReceber = await lerTitulos(page, "Receber");
  const todosPagar = brutoPagar.linhas.map(tituloParaApi).filter((t) => t.dataLancamento);
  const todosReceber = brutoReceber.linhas.map(tituloParaApi).filter((t) => t.dataLancamento);
  const titulosTravaram = brutoPagar.travou || brutoReceber.travou;

  for (const [de, ate] of janelas()) {
    log(`=== janela ${de} a ${ate}`);
    const nf = await lerNfs(page, de, ate);
    const nfs = nf.linhas.map(nfParaApi).filter((n) => n.dataEmissao);

    const naJanela = (lista) => lista.filter((t) => {
      const dt = t.dataLancamento.slice(0, 10);
      return dt >= de && dt <= ate;
    });
    const pagar = naJanela(todosPagar);
    const receber = naJanela(todosReceber);

    const payload = {
      fonte: "scraper-enoki",
      empresa,
      de,
      ate,
      geradoEm: new Date().toISOString(),
      parcial: nf.travou || titulosTravaram,
      nfs,
      pagar,
      receber,
      // Vão no payload de propósito: são majoritariamente transferências entre
      // contas do grupo (não são DRE), e sumir com eles em silêncio impediria
      // qualquer conferência.
      diagnostico: {
        nfsLidas: nf.linhas.length,
        pagarLidos: brutoPagar.linhas.length,
        receberLidos: brutoReceber.linhas.length,
        semCentroCusto: [...pagar, ...receber].filter((t) => !String(t.centroCusto ?? "").trim()).length,
      },
    };

    const arquivo = path.join(outDir, `enoki-dre-${de}_${ate}.json`);
    writeFileSync(arquivo, JSON.stringify(payload, null, 1), "utf8");
    log(`  gravado: ${arquivo}`);
    log(`  nfs=${nfs.length} pagar=${pagar.length} receber=${receber.length}`);

    if (process.env.APP_URL && process.env.INGEST_KEY) {
      const r = await fetch(`${process.env.APP_URL}/api/enoki-ingerir`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-ingest-key": process.env.INGEST_KEY },
        body: JSON.stringify(payload),
      }).catch((e) => ({ ok: false, status: String(e.message ?? e) }));
      log(r.ok ? "  enviado ao app" : `  envio falhou (${r.status}) — arquivo local preservado`);
    }
  }
} finally {
  await context.storageState({ path: statePath }).catch(() => {});
  await browser.close();
}
