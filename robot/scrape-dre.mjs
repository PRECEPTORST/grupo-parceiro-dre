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

/** Lupa do bloco PESQUISAR, localizada pelo rótulo "Valor" ao lado dela. */
async function clicarLupaDoValor(page) {
  const p = await page.evaluate(() => {
    const rot = [...document.querySelectorAll("span")]
      .find((e) => e.textContent.trim() === "Valor" && e.getBoundingClientRect().x > 1000);
    if (!rot) return null;
    const rr = rot.getBoundingClientRect();
    const busca = [...document.querySelectorAll("input")]
      .map((i) => ({ i, r: i.getBoundingClientRect() }))
      .filter(({ i, r }) => i.type !== "hidden" && r.width > 40 &&
                            Math.abs(r.x - rr.x) < 40 && r.y > rr.y && r.y < rr.y + 34)
      .sort((a, b) => a.r.y - b.r.y)[0];
    if (!busca) return null;
    const alvo = [...document.querySelectorAll("div,span,img,a,td")]
      .map((e) => ({ e, r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.width >= 14 && r.width <= 60 && r.height >= 14 && r.height <= 46 &&
                         r.left >= busca.r.right - 4 && r.left <= busca.r.right + 80 &&
                         Math.abs(r.top - busca.r.top) < 28)
      .sort((a, b) => a.r.left - b.r.left)[0];
    return alvo ? { x: Math.round(alvo.r.x + alvo.r.width / 2), y: Math.round(alvo.r.y + alvo.r.height / 2) } : null;
  });
  if (!p) return false;
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(7000);
  return true;
}

/**
 * Abre uma tela sem depender do menu estar fechado.
 *
 * `openScreen` clica no menu e depois no submenu. Isso só funciona com o menu
 * FECHADO: vindo de outra tela do MESMO menu, ele já está aberto e o clique o
 * fecha — o submenu some e a varredura morre com timeout. Foi o que derrubou a
 * primeira leitura de NF de entrada, logo depois da de saída.
 *
 * Aqui a ordem se inverte: tenta o submenu direto (menu aberto, caso comum
 * quando se encadeiam telas) e só mexe no menu se ele não estiver à vista.
 */
async function abrirTela(page, menu, submenu, ancora) {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const visivel = await page.locator(`span:text-is("${submenu}")`).first()
      .isVisible().catch(() => false);
    if (!visivel) {
      await clickSpan(page, menu).catch(() => {});
      await page.waitForTimeout(1800);
    }
    try {
      await clickSpan(page, submenu);
      await page.waitForSelector(`span:text-is('${ancora}')`, { timeout: 45_000 });
      log(`Tela "${submenu}" aberta.`);
      await page.waitForTimeout(1200);
      return;
    } catch {
      // Menu no estado errado: um clique o inverte para a próxima tentativa.
      await page.waitForTimeout(1500);
    }
  }
  throw new Error(`Não consegui abrir a tela "${submenu}".`);
}

/**
 * Docs. Fiscais Entrada — as NOTAS DE COMPRA. É daqui que sai o CPV.
 *
 * POR QUE ESTA TELA EXISTE NO ROBÔ (custou uma rodada inteira descobrir)
 * ---------------------------------------------------------------------
 * O CPV vinha por um quinto do real (R$ 4,6M contra R$ 22,7M da planilha) e eu
 * procurava o erro no lugar errado: nos títulos financeiros. Não estava lá.
 * A receita nasce da NF de SAÍDA; o custo tinha de nascer da NF de ENTRADA, e
 * essa tela simplesmente nunca era aberta. Os títulos só traziam a fatia das
 * compras cujo vencimento caía na janela — daí a proporção de ~20%.
 *
 * Conferido na leitura da tela de saída: nenhuma das 1015 notas era compra. As
 * 323 notas de CFOP 1949 ("ENTRADA | Ajuste") somam R$ 0,00 — são ajuste de
 * estoque, não aquisição.
 *
 * BÔNUS: esta grade traz CNPJ/CPF, que a de saída não traz. Para as compras a
 * eliminação intragrupo volta a ser por raiz de CNPJ, que é exata.
 *
 * Mesma armadilha da tela de saída: o filtro de período não é confiável, então
 * o recorte fino é feito em código sobre a data de emissão.
 */
async function lerNfsEntrada(page, de, ate) {
  await abrirTela(page, "Doc. Fiscais", "Docs. Fiscais Entrada", "FORNECEDOR");
  await page.waitForTimeout(2500);

  // O PERÍODO desta tela é DOIS campos mascarados de input único (dd/mm/aaaa
  // inteiro num campo só), diferente do trio dd|mm|aaaa das outras. Os ids são
  // dinâmicos (TRG_272/TRG_271) e vêm INVERTIDOS — o "De" tem número maior —,
  // então a localização é pela posição do rótulo, nunca pelo id.
  const preenchido = await page.evaluate(({ de, ate }) => {
    const br = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
    const rotulo = (txt) => [...document.querySelectorAll("span")]
      .find((e) => e.textContent.trim() === txt && e.getBoundingClientRect().x > 1000);
    const campoDe = (rot) => {
      if (!rot) return null;
      const r = rot.getBoundingClientRect();
      return [...document.querySelectorAll("input")]
        .map((i) => ({ i, b: i.getBoundingClientRect() }))
        .filter(({ i, b }) => i.type !== "hidden" && b.width > 40 &&
                              Math.abs(b.x - r.x) < 40 && b.y > r.y && b.y < r.y + 34)
        .sort((a, b) => a.b.y - b.b.y)[0]?.i ?? null;
    };
    const alvos = [[campoDe(rotulo("De")), br(de)], [campoDe(rotulo("a")), br(ate)]];
    if (alvos.some(([el]) => !el)) return null;
    for (const [el, valor] of alvos) {
      el.value = valor;
      for (const ev of ["input", "change", "keyup", "blur"]) el.dispatchEvent(new Event(ev, { bubbles: true }));
    }
    return alvos.map(([el]) => el.value);
  }, { de, ate });

  if (preenchido) {
    log(`  período de entrada: ${preenchido.join(" a ")}`);
    // A busca é a LUPA VERDE do bloco PESQUISAR. O "Ok" ao lado da grade é ação
    // em lote sobre a seleção — clicá-lo não recarrega nada.
    //
    // `clicarLupa` NÃO serve aqui: ela elege o input mais largo do topo, e nesta
    // tela isso é um auxiliar invisível do WebGUI em x=300. A âncora confiável é
    // o rótulo "Valor" do próprio bloco PESQUISAR.
    if (!(await clicarLupaDoValor(page))) {
      log("  ATENCAO: nao achei a lupa — o periodo pode nao ter sido aplicado");
    }
  } else {
    log("  ATENCAO: campos de periodo nao encontrados — vou paginar do mais recente");
  }

  const dentro = [];
  let travou = false;
  let paginasAlem = 0;
  let pagina = 1;

  for (let i = 0; i < MAX_PAGINAS_NF; i++) {
    const gridId = await findGridId(page, "FORNECEDOR");
    const linhas = await extractGrid(page, gridId);
    const isos = linhas.map((r) => (dataIso(r["EMISSÃO"]) ?? "").slice(0, 10)).filter(Boolean);

    dentro.push(...linhas.filter((r) => {
      const d = (dataIso(r["EMISSÃO"]) ?? "").slice(0, 10);
      return d && d >= de && d <= ate;
    }));

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
    if (pagina % 20 === 0) log(`  …NF entrada página ${pagina} (${dentro.length} na janela)`);
  }

  log(`  NF entrada: ${dentro.length} na janela${travou ? " (PARCIAL)" : ""}`);
  return { linhas: dentro, travou };
}

/**
 * Preenche um campo de data dividido em dd/mm/aaaa (ids `<pref>_1/_3/_5`).
 *
 * Digitar perde o último dígito do ano ("2026" vira "202") — a máscara do
 * WebGUI engole um caractere. Escrever o valor direto no DOM resolve, mas só
 * funciona se os eventos forem disparados: o servidor só fica sabendo do campo
 * quando o `change` sobe. Confere no fim e avisa se não fixou.
 */
async function preencherData(page, pref, dd, mm, aaaa) {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    for (const [suf, val] of [["1", dd], ["3", mm], ["5", aaaa]]) {
      const el = page.locator(`#${pref}_${suf}`);
      if (!(await el.count().catch(() => 0))) return false;
      await el.click();
      await el.evaluate((n, v) => {
        n.value = v;
        n.dispatchEvent(new Event("input", { bubbles: true }));
        n.dispatchEvent(new Event("change", { bubbles: true }));
        n.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
      }, val);
      await page.waitForTimeout(200);
    }
    const lido = await page.evaluate(
      (pr) => ["1", "3", "5"].map((s) => document.getElementById(`${pr}_${s}`)?.value),
      pref,
    );
    if (lido[0] === dd && lido[1] === mm && lido[2] === aaaa) return true;
  }
  log(`  ATENCAO: nao consegui fixar a data em ${pref} — o filtro pode sair errado`);
  return false;
}

/** O botão de busca é uma lupa à direita do maior campo do topo. */
async function clicarLupa(page) {
  const p = await page.evaluate(() => {
    const ins = [...document.querySelectorAll("input")].filter((i) => i.type !== "hidden");
    const busca = ins.map((i) => ({ i, r: i.getBoundingClientRect() }))
      .filter(({ r }) => r.y < 210 && r.width > 110).sort((a, b) => b.r.width - a.r.width)[0];
    if (!busca) return null;
    const alvo = [...document.querySelectorAll("div,span,img,a,td")]
      .map((e) => ({ e, r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.width >= 14 && r.width <= 60 && r.height >= 14 && r.height <= 46 &&
                         r.left >= busca.r.right - 4 && r.left <= busca.r.right + 80 &&
                         Math.abs(r.top - busca.r.top) < 28)
      .sort((a, b) => a.r.left - b.r.left)[0];
    return alvo ? { x: Math.round(alvo.r.x + alvo.r.width / 2), y: Math.round(alvo.r.y + alvo.r.height / 2) } : null;
  });
  if (!p) return false;
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(6000);
  return true;
}

/**
 * Lançamentos Financeiros — títulos com centro de custo e data de lançamento.
 *
 * TRÊS COISAS QUE CUSTARAM CARO ATÉ ACERTAR (todas contra o ERP real)
 * ------------------------------------------------------------------
 * 1. O critério padrão é "Não Quitados". Lendo só ele, as COMPRAS do mês (que já
 *    foram pagas) somem e o CPV sai por um quinto do real. A opção que traz tudo
 *    chama-se "Quitados/Não Quitados" — não "Todos", que não existe.
 * 2. As opções do combo de direção são "CONTAS A PAGAR"/"CONTAS A RECEBER".
 *    Clicar em "Pagar" falha silenciosamente e a leitura mistura as direções.
 * 3. Sem filtrar no servidor, a tela lista o histórico inteiro a partir do mais
 *    ANTIGO — 400 páginas depois ainda não se chegou no mês pedido. O filtro de
 *    vencimento desta tela FUNCIONA (o da NF não), então é ele que limita a
 *    varredura. Uma janela de vencimento generosa cobre os lançamentos do mês;
 *    o recorte fino por competência é feito depois, em código.
 */
async function lerTitulos(page, de, ate) {
  await openScreen(page, "Financeiro", "Lançamentos Financeiros", "PARCEIRO", { log });
  await page.waitForTimeout(2000);

  // Critério: precisa incluir os QUITADOS, senão o CPV desaparece. Confirma pelo
  // total de páginas — se não cresceu, o clique não pegou e é melhor saber.
  const paginasAntes = (await readPager(page).catch(() => null))?.total ?? 0;
  for (let t = 0; t < 2; t++) {
    try {
      await page.locator("span:text-is('Não Quitados')").first().click({ timeout: 8000 });
      await page.waitForTimeout(1200);
      await page.locator("span:text-is('Quitados/Não Quitados')").first().click({ timeout: 8000 });
      await page.waitForTimeout(3500);
      break;
    } catch { await page.waitForTimeout(1500); }
  }
  const paginasDepois = (await readPager(page).catch(() => null))?.total ?? 0;
  if (paginasDepois > paginasAntes) log(`  criterio: Quitados/Nao Quitados (${paginasAntes} -> ${paginasDepois} paginas)`);
  else log(`  ATENCAO: criterio nao mudou o resultado (${paginasAntes} paginas) — titulos pagos podem faltar`);

  // NÃO existe filtro de direção utilizável: o combo "Pag/Rec" aceita o clique e
  // devolve exatamente as mesmas linhas (comprovado — duas varreduras trouxeram
  // os mesmos 1840 ids). A direção sai do CENTRO DE CUSTO, em `separarPorNatureza`.

  // Janela de VENCIMENTO larga o bastante para conter os lançamentos do mês:
  // do início do mês pedido até seis meses depois.
  const [aa, mm] = de.split("-");
  const fim = new Date(Date.UTC(Number(aa), Number(mm) - 1 + 6, 0));
  const grupos = await page.evaluate(() => [...new Set([...document.querySelectorAll("input")]
    .map((i) => i.id.match(/^(VWG\d+)_1$/)?.[1]).filter(Boolean))]);
  if (grupos.length >= 2) {
    // O grupo da ESQUERDA é o "de"; o da direita, o "até".
    const ordenados = await page.evaluate((g) => g
      .map((p) => ({ p, x: document.getElementById(`${p}_1`)?.getBoundingClientRect().x ?? 0 }))
      .sort((a, b) => a.x - b.x).map((o) => o.p), grupos);
    await preencherData(page, ordenados[0], de.slice(8, 10), de.slice(5, 7), de.slice(0, 4));
    await preencherData(page, ordenados[1],
      String(fim.getUTCDate()).padStart(2, "0"),
      String(fim.getUTCMonth() + 1).padStart(2, "0"),
      String(fim.getUTCFullYear()));
    await clicarLupa(page);
    log(`  vencimento entre ${de} e ${fim.toISOString().slice(0, 10)}`);
  } else {
    log("  ATENCAO: campos de vencimento nao encontrados — a varredura sera longa");
  }

  const { linhas, travou } = await varrerPaginas(page, "PARCEIRO");
  log(`  titulos: ${linhas.length} linha(s)${travou ? " (PARCIAL)" : ""}`);
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

/** NF de compra na mesma língua da API — `entrada: true` é o que `cfop.ts` usa. */
function nfEntradaParaApi(row, i) {
  const numero = soDigitos(row["NÚMERO"] ?? row["NUMERO"]);
  // O NÚMERO da NF NÃO identifica a nota: fornecedores diferentes emitem o mesmo
  // número, e em julho isso fez 953 notas terem só 941 ids distintos — 12 compras,
  // R$ 785 mil, desapareceram na deduplicação do normalizador sem deixar rastro.
  // A coluna ID é a chave interna do ERP, essa sim única. O prefixo "e" separa da
  // numeração da tela de saída, que é outro espaço de ids.
  const id = soDigitos(row["ID"]);
  return {
    idNf: id ? `e${id}` : `e-${numero || i}-${i}`,
    numeroNf: Number(numero) || null,
    dataEmissao: dataIso(row["EMISSÃO"]),
    dataEntrada: dataIso(row["ENTRADA"]),
    status: row["STATUS"] ?? "",
    statusNfe: row["STATUS"] ?? "",
    cfop: row["CFOP"] ?? "",
    entrada: true,
    tipoOperacao: "ENTRADA",
    finalidade: row["FINALIDADE"] ?? "",
    valorTotalNf: valorApi(row["TOTAL DOC."] ?? row["TOTAL PROD."]),
    emitenteNome: row["FORNECEDOR"] ?? "",
    emitenteCpfCnpj: soDigitos(row["CNPJ/CPF"]),
    contratosVinculados: [],
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

/**
 * Direção do título a partir do CENTRO DE CUSTO.
 *
 * O ERP tem um combo "Pag/Rec" que parece resolver isto — mas ele não filtra:
 * duas varreduras, uma por direção, trouxeram os mesmos 1840 ids. O centro de
 * custo, esse sim, carrega a natureza ("RECEITA MILHO", "COMPRA SOJA") e está
 * preenchido na maioria dos títulos.
 *
 * Sem centro de custo, a descrição ainda distingue ("Fat. NFe saída/entrada").
 * O resto vai para `indefinidos` — são majoritariamente transferências entre
 * contas do próprio grupo, que legitimamente não são DRE, e seguem no payload
 * para poderem ser conferidas.
 */
function separarPorNatureza(titulos) {
  const receber = [];
  const pagar = [];
  const indefinidos = [];
  for (const t of titulos) {
    const cc = String(t.centroCusto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const desc = String(t.descricao ?? "").toLowerCase();
    if (cc) (/RECEITA|DEVOLU/.test(cc) ? receber : pagar).push(t);
    else if (/nfe?\s*sa[ií]da/.test(desc)) receber.push(t);
    else if (/nfe?\s*entrada/.test(desc)) pagar.push(t);
    else indefinidos.push(t);
  }
  return { receber, pagar, indefinidos };
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

  for (const [de, ate] of janelas()) {
    log(`=== janela ${de} a ${ate}`);

    // Os títulos são lidos POR JANELA: o filtro de vencimento da tela é o que
    // impede a varredura de percorrer o histórico inteiro.
    const bruto = await lerTitulos(page, de, ate);
    const titulosTravaram = bruto.travou;
    const todos = bruto.linhas.map(tituloParaApi).filter((t) => t.dataLancamento);

    const nf = await lerNfs(page, de, ate);
    const nfe = await lerNfsEntrada(page, de, ate);
    const nfs = [
      ...nf.linhas.map(nfParaApi),
      ...nfe.linhas.map(nfEntradaParaApi),
    ].filter((n) => n.dataEmissao);

    const naJanela = (lista) => lista.filter((t) => {
      const dt = t.dataLancamento.slice(0, 10);
      return dt >= de && dt <= ate;
    });
    const { pagar, receber, indefinidos } = separarPorNatureza(naJanela(todos));

    const payload = {
      fonte: "scraper-enoki",
      empresa,
      de,
      ate,
      geradoEm: new Date().toISOString(),
      parcial: nf.travou || nfe.travou || titulosTravaram,
      nfs,
      pagar,
      receber,
      // Vão no payload de propósito: são majoritariamente transferências entre
      // contas do grupo (não são DRE), e sumir com eles em silêncio impediria
      // qualquer conferência.
      indefinidos,
      diagnostico: {
        nfsLidas: nf.linhas.length,
        nfsEntradaLidas: nfe.linhas.length,
        titulosLidos: bruto.linhas.length,
        indefinidos: indefinidos.length,
        semCentroCusto: [...pagar, ...receber].filter((t) => !String(t.centroCusto ?? "").trim()).length,
      },
    };

    const arquivo = path.join(outDir, `enoki-dre-${de}_${ate}.json`);
    writeFileSync(arquivo, JSON.stringify(payload, null, 1), "utf8");
    log(`  gravado: ${arquivo}`);
    log(`  nfs=${nf.linhas.length}+${nfe.linhas.length}ent pagar=${pagar.length} receber=${receber.length} indefinidos=${indefinidos.length}`);

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
