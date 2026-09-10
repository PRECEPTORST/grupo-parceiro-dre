// Itens das notas de COMPRA — produto, quantidade e preço unitário.
//
// POR QUE ESTE ARQUIVO É O QUE DESTRAVA O DRE
// -------------------------------------------
// O CPV vinha sendo a COMPRA DO MÊS, não o custo do que foi vendido. Num mês em
// que a empresa estoca, isso vira prejuízo contábil sem prejuízo econômico:
// agosto/2026 fechou com -13% de margem porque comprou quase tanto quanto
// vendeu. Corrigir exige apropriação de estoque, que exige QUANTIDADE comprada.
//
// A quantidade não está em lugar nenhum do que já usávamos:
//   • a grade de NF de entrada tem só o total em R$;
//   • a API de produção NÃO tem rota de nota de entrada (testadas NfEntrada,
//     NfsEntrada, DocumentosEntrada, NotaEntrada, NfCompra, Compras, Entradas,
//     NfEntradas — todas 404);
//   • os contratos de COMPRA não são expostos pela API (só os de venda: 723 de
//     723), embora o título de compra cite `idContrato`.
//
// Ela está NESTE relatório: Relatórios > Estoque e Movimentação >
// "Movimentação de Produtos por CFOP" (o de ENTRADA — há outro de saída com
// nome quase igual).
//
// TRÊS COISAS QUE CUSTARAM CARO ATÉ FUNCIONAR
// -------------------------------------------
// 1. ESCREVER NO DOM NUNCA FUNCIONOU — em tela nenhuma. No WebGUI o estado vive
//    no SERVIDOR; `.value = x` mais eventos sintéticos muda o que aparece e não
//    o que o servidor sabe. O relatório saía com a data de hoje, e o filtro de
//    vencimento dos títulos nunca filtrou de verdade (alargar a janela em um ano
//    devolvia MENOS linhas — era ruído, não filtro). A saída é TECLAR de verdade,
//    dígito a dígito, com pausa para a máscara acompanhar.
// 2. A data é um trio de inputs (_1 dia, _3 mês, _5 ano). Teclar os 8 dígitos
//    num campo só faz a máscara pular e embaralhar: "01082026" virou 26/09/2026.
// 3. O servidor NORMALIZA o "à" quando o "de" muda. Preencher uma vez não basta;
//    é preciso conferir e repetir até fixar.
//
// E o visor é um Crystal Reports que não entrega texto pelo caminho óbvio: o
// iframe do host devolve 79 caracteres. O conteúdo vive num frame `about:blank`
// aninhado, com cada célula em elemento absoluto — agrupar por Y reconstrói a
// linha, ordenar por X reconstrói as colunas.
//
// Uso: node robot/scrape-itens-compra.mjs --meses=2026-07,2026-08

import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { loadDotEnv, makeLogger, ensureLoggedIn, clickSpan, setPacing } from "./lib/erp-ui.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(here, ".env"));
const log = makeLogger("itens");
const statePath = path.join(here, ".state", "session.json");
const outDir = path.join(here, "out");
mkdirSync(path.dirname(statePath), { recursive: true });
mkdirSync(outDir, { recursive: true });
setPacing({ minDelayMs: 500, maxDelayMs: 1200 });

const arg = (n, d = null) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const meses = (arg("meses") ?? "").split(",").map((m) => m.trim()).filter((m) => /^\d{4}-\d{2}$/.test(m));
if (!meses.length) { console.error("uso: node robot/scrape-itens-compra.mjs --meses=2026-07,2026-08"); process.exit(1); }

const ultimoDia = (m) => {
  const [a, mm] = m.split("-").map(Number);
  return String(new Date(Date.UTC(a, mm, 0)).getUTCDate()).padStart(2, "0");
};
const num = (br) => {
  const n = Number(String(br ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const dataIso = (br) => {
  const m = String(br ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

/**
 * (não usada) Fechar o visor pelo X deixa resíduo — ver `rodarIntervalo`, que
 * recarrega a página em vez disso. Mantida porque documenta uma tentativa que
 * PARECE resolver e não resolve.
 */
// eslint-disable-next-line no-unused-vars
async function fecharVisor(page) {
  // Só age se o visor EXISTE. Sem esta guarda a busca pela barra de título casa
  // com o próprio item de menu "Relatórios" numa tela limpa, e o robô sai
  // clicando em coisa aleatória — o sintoma era um timeout no primeiro clique.
  const existe = () => page.evaluate(() =>
    [...document.querySelectorAll("iframe")].some((f) => /ASPXhost/.test(f.src ?? "")));
  if (!(await existe())) return true;

  for (let t = 0; t < 3; t++) {
    const fechou = await page.evaluate(() => {
      // O X fica na barra de título da janela, no canto superior direito.
      const barra = [...document.querySelectorAll("span,div")]
        .map((e) => ({ e, r: e.getBoundingClientRect() }))
        .find((o) => /RELAT[ÓO]RIO/i.test(o.e.textContent ?? "") && o.r.y < 60 && o.r.width > 200);
      if (!barra) return false;
      const alvo = [...document.querySelectorAll("div,span,img,a")]
        .map((e) => ({ e, r: e.getBoundingClientRect() }))
        .filter(({ r }) => Math.abs(r.top - barra.r.top) < 26 && r.width > 6 && r.width < 30 &&
                           r.left > barra.r.right - 120)
        .sort((a, b) => b.r.left - a.r.left)[0];
      if (!alvo) return false;
      alvo.e.click();
      return true;
    });
    await page.waitForTimeout(1800);
    if (!(await existe())) return true;
    if (!fechou) await page.keyboard.press("Escape");
    await page.waitForTimeout(1200);
  }
  return false;
}

/**
 * Acha os DOIS grupos de campos de data (de / à) pela POSIÇÃO.
 *
 * Os ids do WebGUI (VWG285, VWG286…) mudam a cada sessão — fixá-los faz o robô
 * funcionar hoje e quebrar amanhã, com a mensagem inútil "não fixei o período".
 * O que não muda é o desenho: dois trios lado a lado, na mesma linha, à direita.
 */
async function acharCamposDeData(page) {
  return page.evaluate(() => {
    // Âncora SEMÂNTICA: o rótulo "Período" do bloco de filtro. Chutar por
    // coordenada pegou, numa segunda leitura, um campo que nem era data.
    const rotulo = [...document.querySelectorAll("span")]
      .map((e) => ({ e, r: e.getBoundingClientRect() }))
      .filter((o) => o.e.textContent.trim() === "Período" && o.r.width > 0)
      .sort((a, b) => a.r.y - b.r.y)[0];
    if (!rotulo) return [];

    const grupos = [];
    for (const i of document.querySelectorAll("input")) {
      const m = i.id.match(/^(.+)_1$/);
      if (!m || !document.getElementById(`${m[1]}_5`)) continue; // precisa ter o ano
      const r = i.getBoundingClientRect();
      if (!r.width || r.height === 0) continue;
      // Mesma faixa vertical do rótulo, e à direita dele.
      if (Math.abs(r.y - rotulo.r.y) > 90 || r.x < rotulo.r.x) continue;
      grupos.push({ pref: m[1], x: r.x });
    }
    return grupos.sort((a, b) => a.x - b.x).slice(0, 2).map((g) => g.pref);
  });
}

/** Digita uma data no trio de inputs, teclando de verdade. */
async function digitarData(page, pref, dd, mm, aaaa) {
  for (const [suf, txt] of [["1", dd], ["3", mm], ["5", aaaa]]) {
    const el = page.locator(`#${pref}_${suf}`);
    if (!(await el.count().catch(() => 0))) return "";
    await el.click({ clickCount: 3 });
    await page.waitForTimeout(220);
    for (const ch of txt) { await page.keyboard.press(`Digit${ch}`); await page.waitForTimeout(150); }
    await page.waitForTimeout(320);
  }
  await page.keyboard.press("Tab");
  await page.waitForTimeout(800);
  return page.evaluate((p) => ["1", "3", "5"].map((s) => document.getElementById(`${p}_${s}`)?.value).join("/"), pref);
}

/** Preenche e CONFERE — o servidor normaliza o "à" quando o "de" muda. */
async function fixarData(page, pref, dd, mm, aaaa) {
  for (let t = 0; t < 5; t++) {
    const lido = await digitarData(page, pref, dd, mm, aaaa);
    if (lido === `${dd}/${mm}/${aaaa}`) return true;
    await page.waitForTimeout(1000);
  }
  return false;
}

/** Linhas da página corrente do visor, reconstruídas por posição. */
async function lerPaginaDoVisor(page) {
  const frame = page.frames().find((f) => f.url() === "about:blank");
  if (!frame) return [];
  return frame.evaluate(() => {
    const cels = [...document.querySelectorAll("span,div,td")]
      .filter((e) => e.children.length === 0 && e.textContent.trim())
      .map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent.trim(), x: r.x, y: Math.round(r.y / 3) * 3 }; });
    const porY = {};
    for (const c of cels) (porY[c.y] ??= []).push(c);
    return Object.entries(porY).sort((a, b) => +a[0] - +b[0])
      .map(([, cs]) => cs.sort((a, b) => a.x - b.x).map((c) => c.t));
  }).catch(() => []);
}

/** Uma linha de dado tem data, CFOP e 11 colunas; cabeçalho e rodapé não têm. */
function linhaDeItem(cols) {
  if (cols.length < 10) return null;
  const data = dataIso(cols[0]);
  if (!data) return null;
  const cfop = String(cols[3] ?? "").replace(/\D/g, "");
  if (cfop.length !== 4) return null;
  return {
    dataEmissao: data,
    modelo: cols[1],
    numeroNf: cols[2],
    cfop,
    idProduto: Number(cols[4]) || null,
    produto: cols[5],
    contrato: cols[6],
    quantidade: num(cols[7]),
    valorUnitario: num(cols[8]),
    valorDesconto: num(cols[9]),
    valorTotal: num(cols[10] ?? cols[9]),
  };
}

const browser = await chromium.launch({ headless: process.env.ROBOT_HEADLESS !== "false" });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1400 },
  storageState: existsSync(statePath) ? statePath : undefined,
  acceptDownloads: true,
});
const page = await context.newPage();

try {
  await page.goto(process.env.ENOKI_URL, { waitUntil: "domcontentloaded" });
  await ensureLoggedIn(page, context, { user: process.env.ENOKI_USER, password: process.env.ENOKI_PASSWORD, statePath, log });

  // A sessão reaproveitada volta na TELA ONDE PAROU — inclusive com o visor de
  // relatório aberto por cima de tudo. Recarregar garante um começo limpo; sem
  // isto o primeiro clique no menu morre com um timeout que não explica nada.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("span:text-is('Relatórios')", { timeout: 45_000 });
  await page.waitForTimeout(2500);

  /**
   * Roda o relatório para um intervalo e devolve {itens, paginas}.
   *
   * Não pagina: o visor Crystal guarda a barra de navegação dentro de um iframe
   * que muda de id a cada sessão, e clicar nela provou ser frágil. O rodapé diz
   * "Página 1 de N" — quando N > 1 o chamador PARTE O INTERVALO AO MEIO e roda de
   * novo. Um relatório de um dia nunca passa de uma página, então a recursão
   * sempre termina, e cada leitura é de uma página só: nada de estado entre
   * cliques para dar errado.
   */
  async function rodarIntervalo(de, ate) {
    // RECARREGAR entre leituras, em vez de fechar o visor.
    //
    // Fechar deixa resíduo: o wrapper do modal continua interceptando clique
    // mesmo depois do iframe sumir, e a leitura seguinte morre com um timeout
    // que não diz a causa. Recarregar custa uns segundos e não deixa dúvida —
    // e como a recursão roda o relatório muitas vezes, previsível vale mais que
    // rápido.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("span:text-is('Relatórios')", { timeout: 45_000 });
    await page.waitForTimeout(2500);

    // ESPERAR O ELEMENTO, NUNCA O RELÓGIO. Cada passo espera a prova de que o
    // anterior funcionou. Com `waitForTimeout` fixo, um passo lento faz o clique
    // seguinte errar o alvo e a falha aparece três funções depois, como
    // "nao achei os campos de data" — que não diz nada sobre a causa.
    const passo = async (texto, provaDoProximo) => {
      await clickSpan(page, texto);
      await page.waitForSelector(`span:text-is(${JSON.stringify(provaDoProximo)})`, { timeout: 45_000 });
      await page.waitForTimeout(900);
    };
    await passo("Relatórios", "Estoque e Movimentação");
    await passo("Estoque e Movimentação", "Movimentação de Produtos por CFOP");
    await passo("Movimentação de Produtos por CFOP", "Período");

    // Período: "Todos" mantém os campos de data DESABILITADOS. "Intervalo" libera.
    // O combo de período abre em "Todos", e com ele os campos de data nascem
    // `disabled`. "Intervalo" os libera — e a prova é o campo ficar habilitado.
    const combo = await page.evaluate(() => {
      const rot = [...document.querySelectorAll("span")].map((e) => ({ e, r: e.getBoundingClientRect() }))
        .find((o) => o.e.textContent.trim() === "Período" && o.r.width > 0);
      if (!rot) return null;
      const s = [...document.querySelectorAll("span")].map((e) => ({ e, r: e.getBoundingClientRect() }))
        .find((o) => o.e.textContent.trim() === "Todos" && o.r.width > 0 &&
                     Math.abs(o.r.y - rot.r.y) < 60 && o.r.x > rot.r.x - 60);
      return s ? { x: Math.round(s.r.x + s.r.width / 2), y: Math.round(s.r.y + s.r.height / 2) } : null;
    });
    if (combo) {
      await page.mouse.click(combo.x, combo.y);
      await page.waitForSelector("span:text-is('Intervalo')", { timeout: 20_000 });
      await page.locator("span:text-is('Intervalo')").first().click({ timeout: 8000 });
      await page.waitForTimeout(2000);
    }

    // Os campos podem demorar a habilitar depois do "Intervalo".
    let campos = [];
    for (let t = 0; t < 15; t++) {
      campos = await acharCamposDeData(page);
      if (campos.length >= 2) break;
      await page.waitForTimeout(1000);
    }
    if (campos.length < 2) throw new Error(`nao achei os campos de data em ${de}..${ate} (achei ${campos.length})`);
    const [prefDe, prefAte] = campos;
    const [a1, m1, d1] = de.split("-");
    const [a2, m2, d2] = ate.split("-");
    if (!(await fixarData(page, prefDe, d1, m1, a1)) || !(await fixarData(page, prefAte, d2, m2, a2))) {
      throw new Error(`nao fixei o periodo ${de}..${ate} (campos ${prefDe}/${prefAte})`);
    }
    await clickSpan(page, "GERAR");

    // ESPERAR O RELATÓRIO, não um relógio. Com timeout fixo o robô lia a tela
    // ainda em branco: dias vinham com "0 itens" e outros estouravam com
    // "relatorio saiu com undefined". O cabeçalho com o período pedido é o sinal
    // de que terminou E de que o servidor usou a data certa — as duas coisas que
    // precisam ser verdade antes de ler uma linha.
    const br = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
    let linhas = [];
    let pronto = false;
    for (let t = 0; t < 40; t++) {
      await page.waitForTimeout(2000);
      linhas = await lerPaginaDoVisor(page);
      const cab = linhas.find((l) => l[0]?.startsWith("Período"));
      if (cab && cab.includes(br(de)) && cab.includes(br(ate))) { pronto = true; break; }
    }
    if (!pronto) {
      const cab = linhas.find((l) => l[0]?.startsWith("Período"));
      await page.screenshot({ path: path.join(outDir, `falha-${de}.png`), fullPage: false }).catch(() => {});
      const visor = page.frames().some((f) => f.url() === "about:blank");
      const primeiras = linhas.slice(0, 6).map((l) => l.join(" | ")).join(" ⏐ ");
      throw new Error(
        `relatorio nao ficou pronto em 80s (visor=${visor}, cab=${JSON.stringify(cab)}, tela="${primeiras.slice(0, 220)}")`,
      );
    }

    const rodape = linhas.flat().join(" ").match(/P[áa]gina\s+\d+\s+de\s+(\d+)/i);
    return { itens: linhas.map(linhaDeItem).filter(Boolean), paginas: Number(rodape?.[1] ?? 1) };
  }

  /** Falhas por intervalo — a varredura continua e as reporta no fim. */
  const falhas = [];

  /**
   * Tenta o intervalo mais de uma vez antes de desistir.
   *
   * O ERP às vezes não devolve o relatório em 80s. Deixar a exceção subir
   * abortava o MÊS INTEIRO e perdia tudo que já tinha sido lido — o arquivo só é
   * gravado no fim. Uma varredura de meia hora não pode ser tudo-ou-nada por
   * causa de uma lentidão.
   */
  async function rodarComTentativas(de, ate) {
    let ultimoErro;
    for (let t = 0; t < 3; t++) {
      try {
        return await rodarIntervalo(de, ate);
      } catch (e) {
        ultimoErro = e;
        log(`  ${de}..${ate}: tentativa ${t + 1} falhou (${e.message.slice(0, 70)})`);
        await page.waitForTimeout(5000);
      }
    }
    throw ultimoErro;
  }

  /** Lê um intervalo inteiro, partindo ao meio sempre que passar de uma página. */
  async function lerRecursivo(de, ate, nivel = 0) {
    let itens, paginas;
    try {
      ({ itens, paginas } = await rodarComTentativas(de, ate));
    } catch (e) {
      // Um intervalo que não vai de jeito nenhum vira BURACO REGISTRADO, não o
      // fim da varredura. O resto do mês continua, e o que faltou fica nomeado.
      log(`  ${" ".repeat(nivel)}FALHOU ${de}..${ate}: ${e.message.slice(0, 90)}`);
      falhas.push({ de, ate, erro: e.message.slice(0, 200) });
      return [];
    }
    if (paginas <= 1) {
      log(`  ${" ".repeat(nivel)}${de}..${ate}: ${itens.length} item(ns)`);
      return itens;
    }
    if (de === ate) {
      // DIA DENSO DEMAIS: a recursão não parte mais, e a página 2 fica de fora.
      // Isso É um buraco, e tem de marcar o mês como parcial — senão o custo
      // médio roda com compra faltando e sai barato demais, sem nada denunciar.
      // Em agosto/2026 eram R$ 896 mil (5%) num único dia.
      log(`  ${" ".repeat(nivel)}ATENCAO: ${de} tem ${paginas} paginas num dia so — leitura PARCIAL (${itens.length})`);
      falhas.push({
        de, ate,
        erro: `dia com ${paginas} paginas: so a 1a foi lida. Complete com ` +
              `node robot/scrape-itens-nf.mjs --de=${de} --ate=${ate}`,
      });
      return itens;
    }
    const meio = new Date(Date.UTC(...de.split("-").map(Number).map((v, i) => (i === 1 ? v - 1 : v))));
    const fim = new Date(Date.UTC(...ate.split("-").map(Number).map((v, i) => (i === 1 ? v - 1 : v))));
    meio.setUTCDate(meio.getUTCDate() + Math.floor((fim - meio) / 86400000 / 2));
    const corte = meio.toISOString().slice(0, 10);
    const seguinte = new Date(meio.getTime() + 86400000).toISOString().slice(0, 10);
    log(`  ${" ".repeat(nivel)}${de}..${ate}: ${paginas} paginas — partindo em ${corte}`);
    return [...(await lerRecursivo(de, corte, nivel + 1)), ...(await lerRecursivo(seguinte, ate, nivel + 1))];
  }

  for (const mes of meses) {
    log(`=== ${mes}`);
    const itens = await lerRecursivo(`${mes}-01`, `${mes}-${ultimoDia(mes)}`);

    const arquivo = path.join(outDir, `itens-compra-${mes}.json`);
    writeFileSync(arquivo, JSON.stringify({
      fonte: "relatorio-cfop-entrada",
      mes,
      geradoEm: new Date().toISOString(),
      // `parcial` é o que impede o consumidor de tratar leitura incompleta como
      // se fosse o mês inteiro — o custo médio sairia barato demais.
      parcial: falhas.length > 0,
      falhas,
      itens,
    }, null, 1), "utf8");
    if (falhas.length) {
      log(`  ⚠ ${falhas.length} intervalo(s) NAO lido(s): ${falhas.map((f) => `${f.de}..${f.ate}`).join(", ")}`);
    }
    const porProduto = {};
    for (const i of itens) porProduto[i.produto] = (porProduto[i.produto] ?? 0) + i.quantidade;
    log(`  gravado: ${arquivo} — ${itens.length} itens`);
    for (const [p, q] of Object.entries(porProduto)) log(`     ${p}: ${q.toLocaleString("pt-BR")} kg`);
  }
} finally {
  await context.storageState({ path: statePath }).catch(() => {});
  await browser.close();
}
