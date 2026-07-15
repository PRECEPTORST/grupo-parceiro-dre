// Helpers de autenticação compartilhados pelas funções serverless (fica fora de
// /api para não virar rota). Usuários num Blob privado versionado; sessão é um
// token HMAC em cookie HttpOnly.
import crypto from 'node:crypto'
import { lerDocMaisRecente, gravarDoc } from './blobdoc.js'

const PREFIXO_USUARIOS = 'usuarios'
const COOKIE = 'preceptor_sessao'
const SESSAO_DIAS = 30

// Papéis (do mais forte ao mais fraco):
//   socio    — tudo do admin + APROVA o planejamento orçamentário (só o sócio aprova).
//   admin    — gerencia usuários e faz tudo (sync, classificar, editar orçamento) menos aprovar.
//   orcamento — consulta tudo E cria/altera o orçamento (rascunho).
//   consulta  — somente leitura.
export type Papel = 'socio' | 'admin' | 'orcamento' | 'consulta'

/** Pode criar/editar orçamento (grava a linha `orcamentos` do estado). */
export function podeEditarOrcamento(papel: Papel): boolean {
  return papel === 'socio' || papel === 'admin' || papel === 'orcamento'
}
/** Pode alterar lançamentos/classificações (sync Safragold, classificar). */
export function podeEditarDados(papel: Papel): boolean {
  return papel === 'socio' || papel === 'admin'
}
/** Poderes de administração (usuários + dados). Sócio e admin. */
export function podeAdministrar(papel: Papel): boolean {
  return papel === 'socio' || papel === 'admin'
}
/** APROVA o planejamento orçamentário — exclusivo do sócio. */
export function podeAprovarOrcamento(papel: Papel): boolean {
  return papel === 'socio'
}
export interface Usuario {
  id: string
  usuario: string
  papel: Papel
  senhaHash: string
  salt: string
  criadoEm: string
}

/** Identidade leve derivada do token de sessão (sem tocar o Blob). */
export interface SessaoUsuario {
  id: string
  usuario: string
  papel: Papel
}

function blobToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN
}
function segredo(): string {
  return process.env.AUTH_SECRET || ''
}

export function authConfigurada(): boolean {
  return !!blobToken() && !!segredo()
}

/** Versão pública do usuário (sem hash/salt), segura para enviar ao navegador. */
export function usuarioPublico(u: Usuario) {
  return { id: u.id, usuario: u.usuario, papel: u.papel, criadoEm: u.criadoEm }
}

// ---------- Hash de senha (scrypt) ----------
export function hashSenha(senha: string, salt = crypto.randomBytes(16).toString('hex')) {
  const senhaHash = crypto.scryptSync(senha, salt, 64).toString('hex')
  return { salt, senhaHash }
}
export function conferirSenha(senha: string, salt: string, senhaHash: string): boolean {
  const calc = crypto.scryptSync(senha, salt, 64).toString('hex')
  const a = Buffer.from(calc, 'hex')
  const b = Buffer.from(senhaHash, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// ---------- Store de usuários (Blob privado versionado) ----------
export async function carregarUsuarios(): Promise<Usuario[]> {
  const doc = await lerDocMaisRecente(PREFIXO_USUARIOS, blobToken() as string)
  return (doc?.usuarios as Usuario[]) ?? []
}
export async function salvarUsuarios(usuarios: Usuario[]): Promise<void> {
  await gravarDoc(PREFIXO_USUARIOS, { usuarios }, blobToken() as string)
}

// ---------- Sessão (token HMAC) ----------
export function assinarSessao(payload: object): string {
  const corpo = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', segredo()).update(corpo).digest('base64url')
  return `${corpo}.${sig}`
}
export function verificarSessao(tok: string): any | null {
  const [corpo, sig] = (tok || '').split('.')
  if (!corpo || !sig) return null
  const esperado = crypto.createHmac('sha256', segredo()).update(corpo).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(esperado)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const p = JSON.parse(Buffer.from(corpo, 'base64url').toString())
    if (p.exp && Date.now() > p.exp) return null
    return p
  } catch {
    return null
  }
}
export function expiraEm(): number {
  return Date.now() + SESSAO_DIAS * 24 * 3600 * 1000
}

// ---------- Cookies ----------
export function lerCookieSessao(req: any): string | null {
  const raw: string = req.headers?.cookie || ''
  for (const parte of raw.split(';')) {
    const idx = parte.indexOf('=')
    if (idx === -1) continue
    const k = parte.slice(0, idx).trim()
    if (k === COOKIE) return decodeURIComponent(parte.slice(idx + 1).trim())
  }
  return null
}
export function definirCookieSessao(res: any, tok: string): void {
  const maxAge = SESSAO_DIAS * 24 * 3600
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${encodeURIComponent(tok)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`,
  )
}
export function limparCookieSessao(res: any): void {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`)
}

/** Emite o cookie de sessão para um usuário autenticado. */
export function emitirSessao(res: any, u: Usuario): void {
  definirCookieSessao(
    res,
    assinarSessao({ sub: u.id, usuario: u.usuario, papel: u.papel, exp: expiraEm() }),
  )
}

/**
 * Identidade do request: valida o cookie assinado E revalida contra o store.
 * A leitura do store é consistente (doc versionado), então isso dá **revogação
 * imediata**: usuário excluído → null (401); papel usa sempre o valor atual do
 * store, então mudança de papel também vale na hora.
 */
export async function usuarioAtual(req: any): Promise<SessaoUsuario | null> {
  const tok = lerCookieSessao(req)
  if (!tok) return null
  const p = verificarSessao(tok)
  if (!p?.sub) return null
  const u = (await carregarUsuarios()).find((x) => x.id === p.sub)
  if (!u) return null
  return { id: u.id, usuario: u.usuario, papel: u.papel }
}

export function parseBody(req: any): any {
  if (!req.body) return {}
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body
}
