// Primitivas de navegação do ERP Enoki (WebGUI) compartilhadas pelos robôs.
//
// Extraído de robot/index.mjs para ser reaproveitado por scrape-renegociacoes.mjs
// sem duplicar código. Mesmos princípios anti-bloqueio do robô original:
// uma sessão, navegação sequencial, pausas com jitter, somente leitura.
//
// Dois parsers de grid convivem aqui:
//   * extractPage()  — clusterização por coordenada (o parser histórico do index.mjs).
//   * extractGrid()  — parser por ID do DataGridView do WebGUI (VWG_<id>_CHC<n> para
//     cabeçalho, VWGROW2_<id>_R<n> para linha, VWG_<id>_D<n> para célula). É o único
//     confiável quando há um MODAL sobre o grid de fundo (a clusterização por
//     coordenada mistura as duas grades) e traz também as colunas fora da viewport.
import { existsSync, readFileSync } from "node:fs";

let pacing = { minDelayMs: 900, maxDelayMs: 2100 };

export function setPacing(next) {
  pacing = { ...pacing, ...next };
}

export const pause = () => new Promise((resolve) => setTimeout(resolve, pacing.minDelayMs + Math.random() * Math.max(0, pacing.maxDelayMs - pacing.minDelayMs)));

export function makeLogger(tag) {
  return (message) => console.log(`[${tag} ${new Date().toISOString()}] ${message}`);
}

export function loadDotEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
  }
}

// O WebGUI sobrepõe containers transparentes que bloqueiam o clique "actionable"
// do Playwright; clicamos por coordenada, como um usuário faria.
export async function clickSpan(page, text, nth = 0) {
  const element = page.locator(`span:text-is("${text}")`).nth(nth);
  await element.scrollIntoViewIfNeeded().catch(() => {});
  const box = await element.boundingBox({ timeout: 15_000 });
  if (!box) throw new Error(`Elemento "${text}" não encontrado na tela.`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

export async function typeInto(page, locator, value) {
  const box = await locator.boundingBox({ timeout: 15_000 });
  if (!box) throw new Error("Campo não encontrado.");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.type(value, { delay: 60 });
}

export async function ensureLoggedIn(page, context, { user, password, statePath, log = () => {} }) {
  await page.waitForSelector("input[type=password]:visible, span:text-is('Início')", { timeout: 45_000 });
  await page.waitForTimeout(1_500);
  if (await page.locator("span:text-is('Início')").first().isVisible().catch(() => false)) {
    log("Sessão existente reaproveitada — sem novo login.");
    return;
  }
  log("Efetuando login...");
  await typeInto(page, page.locator("input[type=text]:visible").first(), user);
  await pause();
  await typeInto(page, page.locator("input[type=password]:visible").first(), password);
  await pause();
  await clickSpan(page, "Entrar");
  await page.waitForSelector("span:text-is('Início')", { timeout: 45_000 });
  if (statePath) await context.storageState({ path: statePath });
  log("Login concluído e sessão persistida.");
  await pause();
}

export async function openScreen(page, menu, submenu, anchorHeader, { log = () => {} } = {}) {
  await pause();
  await clickSpan(page, menu);
  await pause();
  await clickSpan(page, submenu);
  await page.waitForSelector(`span:text-is('${anchorHeader}')`, { timeout: 45_000 });
  log(`Tela "${submenu}" aberta.`);
  await pause();
}

// ── Grid por coordenada (parser histórico) ───────────────────────────────────────
export async function extractPage(page, anchorHeader) {
  return page.evaluate((anchor) => {
    const headerSpan = [...document.querySelectorAll("span")].find((el) => el.textContent.trim() === anchor);
    if (!headerSpan) return [];
    const hr = headerSpan.getBoundingClientRect();
    const headers = [...document.querySelectorAll("span")]
      .filter((el) => Math.abs(el.getBoundingClientRect().top - hr.top) < 5 && el.textContent.trim())
      .map((el) => ({ x: el.getBoundingClientRect().left, name: el.textContent.trim() }))
      .sort((a, b) => a.x - b.x);
    if (!headers.length) return [];
    const bounds = headers.map((h, i) => ({ name: h.name, from: h.x - 8, to: (headers[i + 1]?.x ?? Number.MAX_SAFE_INTEGER) - 8 }));
    const gridLeft = headers[0].x - 20;
    const cells = [...document.querySelectorAll("span")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.top > hr.bottom + 2 && r.left >= gridLeft && r.width > 0 && el.textContent.trim();
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, text: el.textContent.trim() };
      })
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const clusters = [];
    for (const cell of cells) {
      const cluster = clusters.find((c) => Math.abs(c.y - cell.y) <= 6);
      if (cluster) cluster.cells.push(cell);
      else clusters.push({ y: cell.y, cells: [cell] });
    }
    return clusters
      .map(({ cells: rowCells }) => {
        const record = {};
        for (const cell of rowCells) {
          const center = cell.x + Math.min(cell.w, 40) / 2;
          const column = bounds.find((b) => center >= b.from && center < b.to);
          if (column && !(column.name in record)) record[column.name] = cell.text;
        }
        return record;
      })
      .filter((record) => Object.keys(record).length >= 3);
  }, anchorHeader);
}

// ── Grid por ID do DataGridView (WebGUI) ─────────────────────────────────────────
// Descobre o id numérico do grid a partir de um cabeçalho conhecido. Cada grid tem
// cabeçalhos VWG_<id>_CHC<n>; o mesmo cabeçalho pode existir em mais de um grid
// (ex.: um modal sobre a listagem), então `preferirVisivel` escolhe o de maior z.
export async function findGridId(page, headerText) {
  return page.evaluate((texto) => {
    const heads = [...document.querySelectorAll('[id*="_CHC"]')]
      .filter((el) => /^VWG_\d+_CHC\d+$/.test(el.id) && el.textContent.trim() === texto);
    if (!heads.length) return null;
    // O último no DOM é o mais recentemente renderizado (modal sobre a listagem).
    return heads[heads.length - 1].id.match(/^VWG_(\d+)_/)[1];
  }, headerText);
}

// Lê TODAS as linhas visíveis do grid <gridId> como objetos {COLUNA: texto}.
// Inclui colunas fora da viewport (o WebGUI mantém as células no DOM) e, por ser
// escopado no grid, não mistura com grades vizinhas.
export async function extractGrid(page, gridId) {
  return page.evaluate((gid) => {
    const cols = [...document.querySelectorAll(`[id^="VWG_${gid}_CHC"]`)]
      .map((el) => ({ x: Math.round(el.getBoundingClientRect().left), nome: el.textContent.trim() }))
      .filter((c) => c.nome);
    if (!cols.length) return [];
    return [...document.querySelectorAll(`[id^="VWGROW2_${gid}_R"]`)].map((row, indice) => {
      const record = { __row: indice };
      for (const cell of row.querySelectorAll(`[id^="VWG_${gid}_D"]`)) {
        const x = Math.round(cell.getBoundingClientRect().left);
        const col = cols.find((c) => Math.abs(c.x - x) <= 2);
        if (col && !(col.nome in record)) record[col.nome] = cell.textContent.trim();
      }
      return record;
    });
  }, gridId);
}

// Centro da célula de uma coluna numa linha do grid (para clicar/dar duplo clique).
export async function gridCellPoint(page, gridId, rowIndex, colName) {
  return page.evaluate(({ gid, rowIndex: idx, colName: nome }) => {
    const cols = [...document.querySelectorAll(`[id^="VWG_${gid}_CHC"]`)]
      .map((el) => ({ x: Math.round(el.getBoundingClientRect().left), nome: el.textContent.trim() }));
    const col = cols.find((c) => c.nome === nome);
    const rows = [...document.querySelectorAll(`[id^="VWGROW2_${gid}_R"]`)];
    const row = rows[idx];
    if (!col || !row) return null;
    for (const cell of row.querySelectorAll(`[id^="VWG_${gid}_D"]`)) {
      const r = cell.getBoundingClientRect();
      if (Math.abs(Math.round(r.left) - col.x) <= 2) return { x: r.left + Math.min(r.width, 120) / 2, y: r.top + r.height / 2 };
    }
    return null;
  }, { gid: gridId, rowIndex, colName });
}

// Fecha o diálogo modal do WebGUI pelo "X" (Escape NÃO fecha estas janelas).
export async function closeModal(page) {
  const point = await page.evaluate(() => {
    const botoes = [...document.querySelectorAll('[id^="VWGE_WinClose"]')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4; });
    if (!botoes.length) return null;
    const r = botoes[botoes.length - 1].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!point) return false;
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(1_200);
  return true;
}

// ── Paginação ────────────────────────────────────────────────────────────────────
export async function readPager(page) {
  return page.evaluate(() => {
    const input = document.querySelector("input.cbq25");
    const totalText = [...document.querySelectorAll("td")].map((td) => td.textContent?.trim() ?? "").find((t) => /^\/\s*\d+$/.test(t)) ?? "/1";
    return { current: Number(input?.value ?? 1), total: Number(totalText.replace(/\D/g, "")) || 1 };
  });
}

export async function nextPage(page, expected) {
  const clicked = await page.evaluate(() => {
    const input = document.querySelector("input.cbq25");
    if (!input) return false;
    const rect = input.getBoundingClientRect();
    const anchors = [...document.querySelectorAll("a")]
      .filter((a) => {
        const r = a.getBoundingClientRect();
        return Math.abs(r.top - rect.top) < 8 && r.left > rect.left + 40 && r.left < rect.left + 130 && r.width > 5;
      })
      .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    if (!anchors[0]) return false;
    anchors[0].click();
    return true;
  });
  if (!clicked) return false;
  try {
    await page.waitForFunction((target) => Number(document.querySelector("input.cbq25")?.value ?? 0) === target, expected, { timeout: 20_000 });
    return true;
  } catch {
    return false;
  }
}

export async function scrapeAllPages(page, anchorHeader, maxPages, { log = () => {} } = {}) {
  const rows = [];
  let failures = 0;
  const pager = await readPager(page);
  const lastPage = maxPages > 0 ? Math.min(pager.total, maxPages) : pager.total;
  log(`Paginação: ${pager.total} páginas no filtro atual; vou ler ${lastPage}.`);
  for (let current = pager.current; current <= lastPage; ) {
    try {
      const pageRows = await extractPage(page, anchorHeader);
      rows.push(...pageRows);
      log(`Página ${current}/${lastPage}: ${pageRows.length} linhas (${rows.length} acumuladas).`);
      failures = 0;
      if (current >= lastPage) break;
      await pause();
      const advanced = await nextPage(page, current + 1);
      if (!advanced) throw new Error("não consegui avançar de página");
      current += 1;
    } catch (error) {
      failures += 1;
      log(`Erro na página ${current}: ${error instanceof Error ? error.message : error}`);
      if (failures >= 3) { log("3 erros consecutivos — abortando por segurança."); break; }
      await page.waitForTimeout(5_000 * failures);
    }
  }
  return rows;
}

// ── Conversões ───────────────────────────────────────────────────────────────────
export const moneyToNumber = (value) => Number(String(value ?? "").replace(/\./g, "").replace(",", ".")) || 0;
export const brDate = (value) => {
  const match = String(value ?? "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
};
