// Grava no Blob (produção) o estado REAL a partir de um JSON já montado
// (mesmo formato de lib/blobdoc.ts: { lancamentos, classificacoes, orcamentos }).
// Uso: node scripts/seed-real.mjs <caminho-do-estado.json>
//   - lê BLOB_READ_WRITE_TOKEN do .env.local
//   - substitui o estado atual (remove versões antigas, como o app faz)
import { readFileSync } from 'node:fs'
import { put, list, del } from '@vercel/blob'

const jsonPath = process.argv[2]
if (!jsonPath) throw new Error('informe o caminho do JSON de estado: node scripts/seed-real.mjs <arquivo.json>')

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const token = env.match(/BLOB_READ_WRITE_TOKEN="?([^"\n]+)"?/)?.[1]
if (!token) throw new Error('BLOB_READ_WRITE_TOKEN não encontrado no .env.local')

const estado = JSON.parse(readFileSync(jsonPath, 'utf8'))
const n = (estado.lancamentos ?? []).length
const c = (estado.classificacoes ?? []).length
console.log(`Gravando estado: ${n} lançamentos, ${c} contas classificadas…`)

const criado = await put('estado/v.json', JSON.stringify(estado), {
  access: 'private',
  addRandomSuffix: true,
  contentType: 'application/json',
  token,
})
console.log('put OK ->', criado.pathname)

// remove versões antigas (best-effort), como o app faz
try {
  const { blobs } = await list({ prefix: 'estado/', token })
  const antigos = blobs.filter((b) => b.url !== criado.url)
  for (const b of antigos) await del(b.url, { token })
  console.log(`versões antigas removidas: ${antigos.length}`)
} catch (e) {
  console.warn('aviso ao limpar versões antigas:', e?.message)
}
console.log('✅ estado real publicado no Blob.')
