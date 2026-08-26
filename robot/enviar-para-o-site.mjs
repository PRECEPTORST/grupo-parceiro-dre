// Leva o que o robô leu do ERP para o app — direto no Blob de produção.
//
// Existe porque a rota `/api/enoki-ingerir` precisa de INGEST_KEY configurada na
// Vercel. Enquanto isso não estiver feito, este script escreve no mesmo
// documento que o app lê (`estado-enoki`), usando o token do Blob.
//
// Uso: node robot/enviar-para-o-site.mjs out/enoki-dre-*.json
import { readFileSync } from "node:fs";
import { list, get, put, del } from "@vercel/blob";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(here, "..");
const token = readFileSync(path.join(raiz, ".env.local"), "utf8")
  .match(/BLOB_READ_WRITE_TOKEN="?([^"\n]+)"?/)?.[1];
if (!token) throw new Error("BLOB_READ_WRITE_TOKEN não encontrado em .env.local");

const arquivos = process.argv.slice(2);
if (!arquivos.length) { console.error("uso: node robot/enviar-para-o-site.mjs <arquivos.json>"); process.exit(1); }

const PREFIXO = "estado-enoki";

async function lerDoc(prefixo) {
  const { blobs } = await list({ prefix: `${prefixo}/`, token });
  if (!blobs.length) return null;
  const m = blobs.reduce((a, b) => (+new Date(a.uploadedAt) >= +new Date(b.uploadedAt) ? a : b));
  const r = await get(m.pathname, { access: "private", token });
  if (!r || r.statusCode !== 200) return null;
  const t = await new Response(r.stream).text();
  return t ? JSON.parse(t) : null;
}

async function gravarDoc(prefixo, valor) {
  const criado = await put(`${prefixo}/v.json`, JSON.stringify(valor), {
    access: "private", addRandomSuffix: true, contentType: "application/json", token,
  });
  try {
    const { blobs } = await list({ prefix: `${prefixo}/`, token });
    const antigas = blobs.filter((b) => b.url !== criado.url).map((b) => b.url);
    if (antigas.length) await del(antigas, { token });
  } catch { /* limpeza best-effort */ }
}

// Junta as janelas lidas pelo robô no formato que a normalização espera.
const janelas = arquivos.map((f) => JSON.parse(readFileSync(f, "utf8")));
const entrada = { nfs: [], pagar: [], receber: [] };
for (const j of janelas) {
  entrada.nfs.push(...(j.nfs ?? []));
  entrada.pagar.push(...(j.pagar ?? []));
  entrada.receber.push(...(j.receber ?? []));
}
console.log(`entrada: nfs=${entrada.nfs.length} pagar=${entrada.pagar.length} receber=${entrada.receber.length}`);

// A normalização vive em TypeScript. Compilar AQUI, toda vez, não é zelo: um
// `.build` velho publicaria com as regras antigas — sem erro, sem aviso, só com
// o número errado no site. Foi assim que o CPV ficou uma rodada inteira errado.
const saida = path.join(raiz, "robot", ".build", "enokiDre.js");
execFileSync("npx", ["esbuild", path.join(raiz, "src", "lib", "enokiDre.ts"),
  "--bundle", "--format=esm", "--platform=node", `--outfile=${saida}`],
  { cwd: raiz, stdio: "inherit" });
const { normalizarEnokiDre } = await import(`${pathToFileURL(saida).href}?v=${Date.now()}`);
const r = normalizarEnokiDre(entrada);
console.log(`lançamentos: ${r.lancamentos.length}`);

const de = janelas.map((j) => j.de).sort()[0];
const ate = janelas.map((j) => j.ate).sort().at(-1);
const anterior = (await lerDoc(PREFIXO)) ?? {};
const dentro = (d) => d >= de && d <= ate;
const foraDaJanela = (anterior.lancamentosEnoki ?? []).filter((l) => !dentro(l.data));

const fatia = {
  lancamentosEnoki: [...foraDaJanela, ...r.lancamentos],
  sacasEnoki: { ...(anterior.sacasEnoki ?? {}), ...r.sacas },
  enokiSync: {
    atualizadoEm: new Date().toISOString(),
    de, ate,
    registros: entrada.nfs.length + entrada.pagar.length + entrada.receber.length,
    lancamentos: r.lancamentos.length,
    homologacao: false,           // veio do ERP de PRODUÇÃO
    completo: !janelas.some((j) => j.parcial),
    residuos: r.residuos,
    descartes: r.descartes,
    gapContratos: {
      totalNf: r.gapContratos.totalNf, totalTitulo: r.gapContratos.totalTitulo,
      gapTotal: r.gapContratos.gapTotal, gapPct: r.gapContratos.gapPct,
      razaoMediana: r.gapContratos.razaoMediana, contratos: r.gapContratos.contratos.length,
      distribuicao: r.gapContratos.distribuicao, estrutural: false,
      porCompetencia: r.gapContratos.gapPorCompetencia,
    },
  },
};

await gravarDoc(PREFIXO, fatia);
console.log(`gravado em produção: ${fatia.lancamentosEnoki.length} lançamentos (${de} a ${ate})`);
