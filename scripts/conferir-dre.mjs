/**
 * Confere o DRE de uma janela raspada contra o que a planilha do cliente diz.
 *
 * Roda o MESMO normalizador que o site usa (`src/lib/enokiDre.ts`), então o que
 * sai aqui é exatamente o que o app vai mostrar — a conferência não vale nada se
 * for feita por um caminho paralelo.
 *
 *   node scripts/conferir-dre.mjs robot/out/enoki-dre-2026-07-01_2026-07-31.json
 */
import { readFileSync } from "node:fs";
import { normalizarEnokiDre } from "../src/lib/enokiDre.ts";
import { MAPA_PLANO } from "../src/lib/planoContas.ts";

const arquivo = process.argv[2];
if (!arquivo) { console.error("uso: node scripts/conferir-dre.mjs <payload.json>"); process.exit(1); }
const p = JSON.parse(readFileSync(arquivo, "utf8"));
const { lancamentos, descartes } = normalizarEnokiDre(p);

const brl = (v) => `R$ ${(v / 1e6).toFixed(2)}M`;
const porLinha = {};
for (const l of lancamentos) {
  const linha = MAPA_PLANO[l.contaSafragold] ?? "(conta fora do plano)";
  (porLinha[linha] ??= { total: 0, n: 0 }).total += l.valor;
  porLinha[linha].n++;
}

console.log(`\n${p.empresa} — ${p.de} a ${p.ate}${p.parcial ? "  ⚠ PARCIAL" : ""}`);
console.log(`notas: ${p.nfs.length} · títulos: ${(p.pagar?.length ?? 0) + (p.receber?.length ?? 0)}\n`);
for (const [linha, v] of Object.entries(porLinha).sort((a, b) => Math.abs(b[1].total) - Math.abs(a[1].total)))
  console.log(`  ${linha.padEnd(22)} ${brl(v.total).padStart(12)}  (${v.n})`);

const soma = (f) => Object.entries(porLinha).filter(([k]) => f(k)).reduce((s, [, v]) => s + v.total, 0);
const receita = soma((k) => k === "receita_bruta");
const deducoes = soma((k) => k === "deducoes");
const cpv = soma((k) => k === "custo_produto");
const bruto = receita - deducoes - cpv;
console.log(`\n  receita bruta ${brl(receita).padStart(12)}   (planilha jul: R$ 23,20M)`);
console.log(`  deduções      ${brl(deducoes).padStart(12)}`);
console.log(`  CPV           ${brl(cpv).padStart(12)}   (planilha jul: R$ 22,70M)`);
console.log(`  = lucro bruto ${brl(bruto).padStart(12)}   margem ${receita ? ((bruto / receita) * 100).toFixed(1) : "—"}%`);

const desc = [...(descartes ?? [])].sort((a, b) => b.valor - a.valor);
if (desc.length) {
  console.log("\n  descartado pelo caminho:");
  for (const d of desc.slice(0, 12))
    console.log(`    ${d.motivo.padEnd(26)} ${brl(d.valor).padStart(12)}  (${d.quantidade})`);
}
