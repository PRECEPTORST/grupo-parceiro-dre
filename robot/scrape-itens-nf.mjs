// Itens das notas de COMPRA, lidos NOTA A NOTA na tela de detalhe.
//
// POR QUE ESTE CAMINHO EXISTE
// ---------------------------
// A quantidade comprada é a peça que falta para o CPV virar "custo do que foi
// vendido" em vez de "compra do mês". Ela NÃO está:
//   • na API de produção — não há rota de nota de entrada (20+ nomes testados);
//   • na grade de notas de entrada — que só traz o total em R$;
//   • nos contratos da API — que são todos de venda.
//
// Estava no relatório "Movimentação de Produtos por CFOP", e o robô que o lia
// funcionou. Depois o relatório passou a devolver "Oops!!! 404" — falha do
// servidor do ERP, que persiste mesmo com os parâmetros padrão.
//
// Este arquivo é o caminho que NÃO depende dele: cada nota tem uma janela de
// detalhe com a aba PRODUTOS, e ali está a grade de itens (SEQ, PRODUTO, QTD.,
// VLR. UN., VLR. TOTAL). Grade comum, lida pelo mesmo extrator de sempre.
//
// O CUSTO: uma nota por vez. Agosto tem ~900 notas de entrada, o que dá cerca de
// uma hora por mês. É lento e é confiável — e confiável ganha, porque o relatório
// rápido é justamente o que está fora do ar.
//
// Uso: node robot/scrape-itens-nf.mjs --meses=2026-08

import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import {
  loadDotEnv, makeLogger, ensureLoggedIn, clickSpan,
  findGridId, extractGrid, readPager, nextPage, setPacing, pause,
} from "./lib/erp-ui.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(here, ".env"));
const log = makeLogger("nf-itens");
const statePath = path.join(here, ".state", "session.json");
const outDir = path.join(here, "out");
mkdirSync(path.dirname(statePath), { recursive: true });
mkdirSync(outDir, { recursive: true });
setPacing({ minDelayMs: 300, maxDelayMs: 700 });

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const limite = Number(arg("limite") ?? 0) || Infinity;
const meses = (arg("meses") ?? "").split(",").map((m) => m.trim()).filter((m) => /^\d{4}-\d{2}$/.test(m));

/**
 * --de/--ate lê um INTERVALO qualquer, e não o mês inteiro.
 *
 * Serve para tapar o buraco que o relatório não alcança: quando um único dia tem
 * mais de uma página, a leitura por recursão não pode partir mais e devolve o
 * dia pela metade. Aí este leitor cobre só aquele dia — lento, mas são dezenas
 * de notas, não novecentas.
 */
const de = arg("de"), ate = arg("ate");
const intervalos = de && ate
  ? [{ rotulo: `${de}_${ate}`, de, ate }]
  : meses.map((m) => ({ rotulo: m, de: `${m}-01`, ate: `${m}-${ultimoDiaDoMes(m)}` }));
if (!intervalos.length) {
  console.error("uso: node robot/scrape-itens-nf.mjs --meses=2026-08");
  console.error("     node robot/scrape-itens-nf.mjs --de=2026-08-14 --ate=2026-08-14");
  process.exit(1);
}

function ultimoDiaDoMes(m) {
  const [a, mm] = m.split("-").map(Number);
  return String(new Date(Date.UTC(a, mm, 0)).getUTCDate()).padStart(2, "0");
}
const num = (br) => {
  const n = Number(String(br ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const dataIso = (br) => {
  const m = String(br ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

/**
 * Preenche uma data TECLANDO — escrever no DOM não avisa o servidor (o estado do
 * WebGUI vive lá).
 *
 * ⚠ AS TELAS NÃO CONCORDAM NO FORMATO. A de relatório usa um TRIO de inputs
 * (`_1` dia, `_3` mês, `_5` ano); esta usa UM campo mascarado com a data
 * inteira. Assumir um formato só faz a outra tela falhar com "não achei o
 * período", que não diz nada sobre a causa.
 */
async function digitarData(page, id, dd, mm, aaaa) {
  const el = page.locator(`#${id}`);
  if (!(await el.count().catch(() => 0))) return "";
  await el.click({ clickCount: 3 });
  await page.waitForTimeout(200);
  for (const ch of `${dd}${mm}${aaaa}`) { await page.keyboard.press(`Digit${ch}`); await page.waitForTimeout(130); }
  await page.keyboard.press("Tab");
  await page.waitForTimeout(700);
  return page.evaluate((i) => document.getElementById(i)?.value?.trim() ?? "", id);
}

/**
 * Os dois campos de data desta tela.
 *
 * Localizados pela CARA DA MÁSCARA (`  /  /    ` ou `dd/mm/aaaa`), não por
 * proximidade de rótulo: a busca por rótulo falhou aqui de forma silenciosa e
 * custou meia hora. O formato do campo é inequívoco e não depende de layout.
 * O de cima é o "de", o de baixo é o "à".
 */
async function camposDePeriodo(page) {
  return page.evaluate(() => {
    const ehData = (v) => /^\s*\d{0,2}\s*\/\s*\d{0,2}\s*\/\s*\d{0,4}\s*$/.test(v ?? "");
    return [...document.querySelectorAll("input")]
      .map((i) => ({ i, r: i.getBoundingClientRect() }))
      .filter(({ i, r }) => i.type !== "hidden" && r.width > 40 && r.width < 140 && r.y < 320 && ehData(i.value))
      .sort((a, b) => a.r.y - b.r.y)
      .slice(0, 2)
      .map(({ i }) => i.id);
  });
}

/** Lupa do bloco PESQUISAR, ancorada no rótulo "Valor". */
async function clicarLupa(page) {
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
  await page.waitForTimeout(6000);
  return true;
}

/**
 * Seleciona a linha da grade clicando no PRÓPRIO NÚMERO da nota.
 *
 * Calcular a posição da linha por deslocamento não funcionou: a lista de Ys
 * inclui elementos que não são linha, e o ERP acabava abrindo sempre a nota
 * anterior. O número da NF é único na página e é o alvo mais direto que existe.
 */
async function selecionarNota(page, numero) {
  const alvo = String(numero ?? "").trim();
  if (!alvo) return false;
  const p = await page.evaluate((n) => {
    const cab = [...document.querySelectorAll("span")]
      .map((e) => ({ e, r: e.getBoundingClientRect() }))
      .find((o) => o.e.textContent.trim() === "FORNECEDOR");
    if (!cab) return null;
    const cel = [...document.querySelectorAll("span")]
      .map((e) => ({ e, r: e.getBoundingClientRect() }))
      .find((o) => o.e.textContent.trim() === n && o.r.y > cab.r.y + 6 && o.r.width > 0);
    return cel ? { x: Math.round(cel.r.x + cel.r.width / 2), y: Math.round(cel.r.y + cel.r.height / 2) } : null;
  }, alvo);
  if (!p) return false;
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(700);
  return true;
}

/**
 * Lê a grade de itens da aba PRODUTOS da janela de detalhe.
 *
 * Uma linha de item começa com o número de sequência e traz o nome do produto na
 * terceira coluna — é o que a distingue dos cabeçalhos e dos rótulos da tela.
 */
async function lerItensDaNota(page) {
  await clickSpan(page, "PRODUTOS");
  await page.waitForTimeout(2200);
  return page.evaluate(() => {
    const cels = [...document.querySelectorAll("span,div,td")]
      .filter((e) => e.children.length === 0 && e.textContent.trim())
      .map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent.trim(), x: r.x, y: Math.round(r.y / 4) * 4 }; })
      .filter((c) => c.x > 480);
    const porY = {};
    for (const c of cels) (porY[c.y] ??= []).push(c);
    return Object.entries(porY).sort((a, b) => +a[0] - +b[0])
      .map(([, cs]) => cs.sort((a, b) => a.x - b.x).map((c) => c.t))
      .filter((l) => l.length >= 10 && /^\d+$/.test(l[0]) && /[A-Z]{3}/.test(l[2] ?? ""));
  });
}

/**
 * O NÚMERO da nota aberta na janela de detalhe.
 *
 * É a defesa contra dado velho, e ela já pagou: sem esta conferência, oito notas
 * diferentes saíram todas com R$ 45.936,00 porque a janela não trocava e eu lia
 * a primeira repetidamente — sem erro nenhum. Dado velho e dado certo têm
 * exatamente a mesma cara.
 */
async function numeroDoDetalhe(page) {
  return page.evaluate(() => {
    const rot = [...document.querySelectorAll("span")]
      .map((e) => ({ e, r: e.getBoundingClientRect() }))
      .find((o) => o.e.textContent.trim() === "Número" && o.r.width > 0);
    if (!rot) return null;
    const campo = [...document.querySelectorAll("input")]
      .map((i) => ({ i, r: i.getBoundingClientRect() }))
      .filter(({ i, r }) => i.type !== "hidden" && r.width > 40 &&
                            Math.abs(r.x - rot.r.x) < 60 && r.y > rot.r.y && r.y < rot.r.y + 40)
      .sort((a, b) => a.r.y - b.r.y)[0];
    return campo ? String(campo.i.value ?? "").trim() : null;
  });
}

/** true quando a janela de detalhe está aberta. */
async function detalheAberto(page) {
  return page.evaluate(() => [...document.querySelectorAll("span,div")]
    .some((e) => /Documento Fiscal de Entrada/i.test(e.textContent ?? "") &&
                 e.getBoundingClientRect().width > 150));
}

/**
 * Fecha a janela de detalhe pelo botão de título `title="Fechar"`.
 *
 * "Voltar" só recua uma etapa do assistente e a janela continua aberta —
 * e aí "Alterar" na nota seguinte reexibe a MESMA nota. O sintoma foi silencioso
 * e quase entrou no DRE: oito notas diferentes saíram todas com R$ 45.936,00,
 * porque eu lia a primeira repetidamente.
 *
 * Procurar o X por posição também não serviu: ao lado dele moram "Minimizar" e
 * "Maximizar", do mesmo tamanho. O atributo `title` distingue sem ambiguidade.
 */
async function fecharDetalhe(page) {
  for (let t = 0; t < 5; t++) {
    if (!(await detalheAberto(page))) return true;
    const clicou = await page.evaluate(() => {
      const btn = [...document.querySelectorAll("div[title='Fechar']")]
        .map((e) => ({ e, r: e.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0)
        .sort((a, b) => b.r.top - a.r.top)[0];
      if (!btn) return false;
      btn.e.click();
      return true;
    });
    await page.waitForTimeout(1300);
    if (!(await detalheAberto(page))) return true;
    if (!clicou) await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);
  }
  return !(await detalheAberto(page));
}

const browser = await chromium.launch({ headless: process.env.ROBOT_HEADLESS !== "false" });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1400 },
  storageState: existsSync(statePath) ? statePath : undefined,
});
const page = await context.newPage();

try {
  await page.goto(process.env.ENOKI_URL, { waitUntil: "domcontentloaded" });
  await ensureLoggedIn(page, context, { user: process.env.ENOKI_USER, password: process.env.ENOKI_PASSWORD, statePath, log });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("span:text-is('Doc. Fiscais')", { timeout: 45_000 });
  await page.waitForTimeout(2000);

  for (const { rotulo, de: dIni, ate: dFim } of intervalos) {
    log(`=== ${rotulo}`);
    await clickSpan(page, "Doc. Fiscais");
    await page.waitForSelector("span:text-is('Docs. Fiscais Entrada')", { timeout: 30_000 });
    await clickSpan(page, "Docs. Fiscais Entrada");
    await page.waitForSelector("span:text-is('FORNECEDOR')", { timeout: 45_000 });
    await page.waitForTimeout(3000);

    // Insistir até os campos aparecerem: o cabeçalho da grade renderiza ANTES do
    // painel de filtro, então olhar uma vez só pega a tela pela metade.
    let pDe = null, pAte = null;
    for (let t = 0; t < 20; t++) {
      [pDe, pAte] = await camposDePeriodo(page);
      if (pDe && pAte) break;
      await page.waitForTimeout(1000);
    }
    if (!pDe || !pAte) {
      const dbg = await page.evaluate(() => {
        const rot = [...document.querySelectorAll("span")]
          .map((e) => ({ t: e.textContent.trim(), r: e.getBoundingClientRect() }))
          .filter((o) => ["De", "a", "PERÍODO", "Valor"].includes(o.t) && o.r.width > 0)
          .map((o) => `rot "${o.t}" x=${Math.round(o.r.x)} y=${Math.round(o.r.y)}`);
        const ins = [...document.querySelectorAll("input")]
          .map((i) => ({ i, r: i.getBoundingClientRect() }))
          .filter(({ i, r }) => i.type !== "hidden" && r.width > 0 && r.y < 300)
          .map(({ i, r }) => `in ${i.id} x=${Math.round(r.x)} y=${Math.round(r.y)} w=${Math.round(r.width)} val="${i.value}"`);
        return [...rot, ...ins];
      });
      log("  ATENCAO: nao achei o periodo. Tela:\n    " + dbg.join("\n    "));
      continue;
    }
    const [a1, m1, d1] = dIni.split("-");
    const [a2, m2, d2] = dFim.split("-");
    let lidoDe = "", lidoAte = "";
    for (let t = 0; t < 4; t++) { lidoDe = await digitarData(page, pDe, d1, m1, a1); if (lidoDe === `${d1}/${m1}/${a1}`) break; }
    for (let t = 0; t < 4; t++) { lidoAte = await digitarData(page, pAte, d2, m2, a2); if (lidoAte === `${d2}/${m2}/${a2}`) break; }
    log(`  periodo: ${lidoDe} a ${lidoAte}`);
    await clicarLupa(page);

    const itens = [];
    const falhas = [];
    let lidas = 0;
    let pagina = 1;
    for (let p = 0; p < 60; p++) {
      const gid = await findGridId(page, "FORNECEDOR");
      const linhas = await extractGrid(page, gid);
      for (const [i, row] of linhas.entries()) {
        const emissao = dataIso(row["EMISSÃO"]);
        if (!emissao || emissao < dIni || emissao > dFim) continue;
        try {
          if (!(await selecionarNota(page, row["NÚMERO"] ?? row["NUMERO"]))) {
            throw new Error(`nao achei a linha da NF ${row["NÚMERO"]} na grade`);
          }
          await clickSpan(page, "Alterar");
          await page.waitForSelector("span:text-is('PRODUTOS')", { timeout: 20_000 });
          // ESPERAR A JANELA SER DESTA NOTA — e recusar se não der.
          //
          // A versão anterior só conferia QUANDO conseguia ler o número; nulo
          // pulava a checagem, e era exatamente aí que o dado velho entrava.
          // Sem confirmação não há leitura: 14/08 saiu com R$ 3,13M contra
          // R$ 2,39M reais porque 32 notas foram lidas duas vezes.
          const numLinha = String(row["NÚMERO"] ?? row["NUMERO"] ?? "").trim();
          let numAberto = null;
          for (let t = 0; t < 12; t++) {
            numAberto = await numeroDoDetalhe(page);
            if (numAberto === numLinha) break;
            await page.waitForTimeout(700);
          }
          if (numAberto !== numLinha) {
            throw new Error(`detalhe ficou em ${numAberto ?? "(ilegivel)"}, esperava ${numLinha}`);
          }
          const prods = await lerItensDaNota(page);
          if (!prods.length) throw new Error("aba PRODUTOS sem linhas");
          for (const c of prods) {
            itens.push({
              dataEmissao: emissao,
              numeroNf: row["NÚMERO"] ?? row["NUMERO"],
              cfop: String(row["CFOP"] ?? "").replace(/\D/g, ""),
              idProduto: Number(c[1]) || null,
              produto: c[2],
              quantidade: num(c[3]),
              valorUnitario: num(c[4]),
              valorTotal: num(c[9]),
            });
          }
          // Não é erro fatal: o item JÁ foi lido, e o texto do título às vezes
          // persiste no DOM depois de a janela fechar. Registrar como falha aqui
          // marcaria o mês inteiro como parcial sem nada estar faltando.
          // Fechar é OBRIGATÓRIO: janela aberta faz a próxima nota reexibir esta.
          if (!(await fecharDetalhe(page))) throw new Error("nao consegui fechar o detalhe");
        } catch (e) {
          falhas.push({ nf: row["NÚMERO"], erro: e.message.slice(0, 120) });
          await fecharDetalhe(page).catch(() => {});
        }
        lidas++;
        // Log por NOTA no começo: rodar 900 notas sem saber se a primeira
        // funcionou é como depurar de olhos fechados.
        if (lidas <= 5 || lidas % 25 === 0) {
          log(`  nota ${lidas} (NF ${row["NÚMERO"]}): ${itens.length} item(ns) acumulados${falhas.length ? ` · ${falhas.length} falha(s)` : ""}`);
        }
        if (lidas >= limite) break;
        await pause();
      }
      if (lidas >= limite) break;
      const pager = await readPager(page).catch(() => null);
      if (!pager || pager.current >= pager.total) break;
      if (!(await nextPage(page, pager.current + 1).catch(() => false))) {
        log(`  paginacao travou em ${pager.current}/${pager.total}`);
        break;
      }
      pagina = pager.current + 1;
      log(`  …pagina ${pagina} (${itens.length} itens)`);
      await page.waitForTimeout(2500);
    }

    const arquivo = path.join(outDir, `itens-nf-${rotulo}.json`);
    writeFileSync(arquivo, JSON.stringify({
      fonte: "nf-entrada-detalhe",
      intervalo: { de: dIni, ate: dFim },
      geradoEm: new Date().toISOString(),
      parcial: falhas.length > 0,
      falhas,
      itens,
    }, null, 1), "utf8");
    const porProduto = {};
    for (const i of itens) porProduto[i.produto] = (porProduto[i.produto] ?? 0) + i.quantidade;
    log(`  gravado: ${arquivo} — ${itens.length} itens${falhas.length ? `, ${falhas.length} falha(s)` : ""}`);
    for (const [pr, q] of Object.entries(porProduto)) log(`     ${pr}: ${q.toLocaleString("pt-BR")}`);
  }
} finally {
  await context.storageState({ path: statePath }).catch(() => {});
  await browser.close();
}
