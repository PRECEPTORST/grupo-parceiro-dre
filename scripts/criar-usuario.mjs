// Cria (ou atualiza) um usuário direto no Blob de produção.
//
// Serve para quando ninguém consegue entrar: o "primeiro acesso" do app só cria
// o admin quando a lista está VAZIA, então, com usuários já existentes, a única
// porta é esta ou a tela de Usuários com alguém já logado.
//
// Uso:
//   node scripts/criar-usuario.mjs <login> <senha> [papel]
//   papel: admin (padrão) | socio | orcamento | consulta
//
// O token vem do .env.local (BLOB_READ_WRITE_TOKEN) ou da variável de ambiente.
// A SENHA NUNCA É GRAVADA NO REPOSITÓRIO — só o hash scrypt vai para o Blob,
// exatamente como o app faz no login.
//
// Onde achar o token: painel da Vercel → projeto grupo-parceiro-dre →
// Storage → o Blob conectado → .env.local / "Read-write token".
import { readFileSync } from 'node:fs'
import crypto from 'node:crypto'
import { put, list, del } from '@vercel/blob'

const PREFIXO = 'usuarios'
const PAPEIS = ['admin', 'socio', 'orcamento', 'consulta']

const [login, senha, papel = 'admin'] = process.argv.slice(2)

if (!login || !senha) {
  console.error('uso: node scripts/criar-usuario.mjs <login> <senha> [papel]')
  process.exit(1)
}
if (String(senha).length < 6) {
  console.error('erro: a senha precisa ter ao menos 6 caracteres (mesma regra do app).')
  process.exit(1)
}
if (!PAPEIS.includes(papel)) {
  console.error(`erro: papel inválido "${papel}". Use um de: ${PAPEIS.join(', ')}`)
  process.exit(1)
}

function lerToken() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN
  try {
    const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    const achado = env.match(/BLOB_READ_WRITE_TOKEN="?([^"\n]+)"?/)?.[1]
    if (achado) return achado
  } catch {
    // sem .env.local — cai no erro abaixo
  }
  throw new Error(
    'BLOB_READ_WRITE_TOKEN não encontrado.\n' +
      'Rode assim:  BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..." node scripts/criar-usuario.mjs ...\n' +
      'ou crie um .env.local na raiz com essa variável.',
  )
}

/** Mesmo algoritmo do lib/auth.ts — precisa bater para o login funcionar. */
function hashSenha(texto) {
  const salt = crypto.randomBytes(16).toString('hex')
  const senhaHash = crypto.scryptSync(texto, salt, 64).toString('hex')
  return { salt, senhaHash }
}

const token = lerToken()

// Lê a lista atual (o app sempre usa a versão mais recente do prefixo).
const { blobs } = await list({ prefix: `${PREFIXO}/`, token })
let usuarios = []
if (blobs.length) {
  const maisRecente = blobs.reduce((a, b) =>
    +new Date(a.uploadedAt) >= +new Date(b.uploadedAt) ? a : b,
  )
  const resp = await fetch(maisRecente.downloadUrl ?? maisRecente.url)
  const doc = await resp.json()
  usuarios = Array.isArray(doc?.usuarios) ? doc.usuarios : []
}

const { salt, senhaHash } = hashSenha(String(senha))
const existente = usuarios.find((u) => u.usuario.toLowerCase() === login.trim().toLowerCase())

if (existente) {
  existente.senhaHash = senhaHash
  existente.salt = salt
  existente.papel = papel
  console.log(`Usuário "${login}" JÁ EXISTIA — senha e papel atualizados para "${papel}".`)
} else {
  usuarios.push({
    id: `u-${Date.now()}`,
    usuario: login.trim(),
    papel,
    senhaHash,
    salt,
    criadoEm: new Date().toISOString(),
  })
  console.log(`Usuário "${login}" criado com papel "${papel}".`)
}

const criado = await put(`${PREFIXO}/v.json`, JSON.stringify({ usuarios }), {
  access: 'private',
  addRandomSuffix: true,
  contentType: 'application/json',
  token,
})

// Remove as versões antigas (a leitura pega a mais recente, mas não deixamos lixo).
try {
  const { blobs: todas } = await list({ prefix: `${PREFIXO}/`, token })
  const antigas = todas.filter((b) => b.url !== criado.url).map((b) => b.url)
  if (antigas.length) await del(antigas, { token })
} catch {
  // limpeza é best-effort
}

console.log(`\nPronto. ${usuarios.length} usuário(s) na base:`)
for (const u of usuarios) console.log(`  · ${u.usuario} (${u.papel})`)
console.log('\nEntre em https://grupo-parceiro-dre.vercel.app/ com o login e a senha informados.')
