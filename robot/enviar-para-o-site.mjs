// Leva o que o robô leu do ERP para o app — direto no Blob de produção.
//
// Existe porque a rota `/api/enoki-ingerir` precisa de INGEST_KEY configurada na
// Vercel. Enquanto isso não estiver feito, este script escreve no mesmo
// documento que o app lê (`estado-enoki`), usando o token do Blob.
//
// Uso: node robot/enviar-para-o-site.mjs out/enoki-dre-*.json
import { readFileSync, existsSync } from "node:fs";
import { list, get, put, del } from "@vercel/blob";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(here, "..");
const token = readFileSync(path.join(raiz, ".env.local"), "utf8")
  .match(/BLOB_READ_WRITE_TOKEN="?([^"\n]+)"?/)?.[1];
if (!token) throw new Error("BLOB_READ_WRITE_TOKEN não encontrado em .env.local");

// --substituir-tudo: esta carga passa a ser a ÚNICA. Existe para a troca de
// ambiente que o flag automático não pega — quando o `enokiSync` anterior já foi
// sobrescrito e só os lançamentos velhos sobraram, sem nada que os identifique.
const substituirTudo = process.argv.includes("--substituir-tudo");
const arquivos = process.argv.slice(2).filter((a) => !a.startsWith("--"));
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

// A MATRIZ NÃO ENTRA: é a operação de CAFÉ, com CNPJ próprio (30798330/0001-35
// contra 0002-16 da filial MG). Em 20 meses ela movimentou R$ 394,7 milhões em
// itens, 97,1% dos quais café, e as filiais de cereais não têm nenhum. Somados,
// o café entrava na cadeia de estoque dos cereais, ficava negativo já em
// janeiro/2025 e derrubava o custo médio. Ver src/lib/empresas.ts.
const EMPRESAS_DO_DRE = new Set([1, 3]);
const noDre = (x) => EMPRESAS_DO_DRE.has(Number(x?.idEmpresa));

// Junta as janelas lidas pelo robô no formato que a normalização espera.
const janelas = arquivos.map((f) => JSON.parse(readFileSync(f, "utf8")));
const entrada = { nfs: [], pagar: [], receber: [] };
let fora = 0;
for (const j of janelas) {
  for (const chave of ["nfs", "pagar", "receber"]) {
    for (const r of j[chave] ?? []) {
      if (noDre(r)) entrada[chave].push(r); else fora++;
    }
  }
}
if (fora) console.log(`fora do DRE (matriz/café): ${fora} registro(s)`);
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

// Lançamentos de VARIAÇÃO DE ESTOQUE, se o custo médio já foi calculado.
// Sem eles o CPV é a compra do mês, e um mês que estoca aparece no vermelho.
const arqEstoque = path.join(raiz, "robot", "out", "lancamentos-estoque.json");
const ajustesEstoque = existsSync(arqEstoque)
  ? JSON.parse(readFileSync(arqEstoque, "utf8")).ajustes ?? []
  : [];
if (ajustesEstoque.length) console.log(`+ ${ajustesEstoque.length} ajuste(s) de estoque no arquivo`);

const de = janelas.map((j) => j.de).sort()[0];
const ate = janelas.map((j) => j.ate).sort().at(-1);
const anterior = (await lerDoc(PREFIXO)) ?? {};

// TROCA DE AMBIENTE APAGA TUDO.
//
// O normal é preservar o que está fora da janela — é o que permite carregar mês
// a mês. Mas quando o que está gravado veio de HOMOLOGAÇÃO e o que chega vem de
// produção, preservar significa misturar dado de teste com dado real no mesmo
// DRE, sem nada na tela dizendo qual é qual. Aconteceu: o site ficou exibindo
// 11.828 lançamentos de homologação enquanto eu achava que mostrava produção.
const trocouDeAmbiente = substituirTudo || anterior.enokiSync?.homologacao === true;
if (trocouDeAmbiente) {
  const motivo = substituirTudo ? "--substituir-tudo" : "homologação → produção";
  console.log(`${motivo}: descartando ${(anterior.lancamentosEnoki ?? []).length} lançamento(s) antigos`);
}
const dentro = (d) => d >= de && d <= ate;

// O AJUSTE SEGUE A MESMA JANELA DOS LANÇAMENTOS.
//
// O arquivo de estoque cobre toda a cadeia (20 meses), porque o custo médio só
// existe encadeado. Mas publicar uma janela de 8 meses e despejar os 20 ajustes
// põe variação de estoque em mês que não tem lançamento nenhum — e, pior, na
// republicação seguinte os ajustes de fora da janela entram DE NOVO, somados aos
// que `foraDaJanela` preservou. Cada rodada dobraria o CPV daqueles meses.
const ajustesDaJanela = ajustesEstoque.filter((a) => dentro(a.data));
if (ajustesDaJanela.length !== ajustesEstoque.length) {
  console.log(`  ${ajustesDaJanela.length} dentro da janela ${de}..${ate} (o resto fica de fora)`);
}
const foraDaJanela = trocouDeAmbiente
  ? []
  : (anterior.lancamentosEnoki ?? []).filter((l) => !dentro(l.data));

const fatia = {
  lancamentosEnoki: [...foraDaJanela, ...r.lancamentos, ...ajustesDaJanela],
  sacasEnoki: trocouDeAmbiente ? r.sacas : { ...(anterior.sacasEnoki ?? {}), ...r.sacas },
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
