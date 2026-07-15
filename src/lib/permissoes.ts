// Permissões do cliente — espelham as regras aplicadas no servidor
// (lib/auth.ts + api/estado.ts). Aqui é só UX; a barreira real é no servidor.
import type { Papel } from '../context/AuthContext'

export const rotuloPapel: Record<Papel, string> = {
  socio: 'Sócio',
  admin: 'Administrador',
  orcamento: 'Consulta + orçamento',
  consulta: 'Somente consulta',
}

export const descricaoPapel: Record<Papel, string> = {
  socio: 'Faz tudo do admin e é o único que APROVA o planejamento orçamentário.',
  admin: 'Gerencia usuários e faz tudo: sincroniza, classifica e edita orçamento (não aprova).',
  orcamento: 'Vê tudo e pode criar/alterar o orçamento (rascunho).',
  consulta: 'Apenas visualiza. Não altera nada.',
}

/** Sócio e admin gerenciam usuários e alteram lançamentos/classificações. */
export function podeAdministrar(papel?: Papel): boolean {
  return papel === 'socio' || papel === 'admin'
}

/** Sócio, admin e "orçamento" podem criar/alterar o orçamento. */
export function podeEditarOrcamento(papel?: Papel): boolean {
  return papel === 'socio' || papel === 'admin' || papel === 'orcamento'
}

/** Só o sócio APROVA o planejamento orçamentário. */
export function podeAprovarOrcamento(papel?: Papel): boolean {
  return papel === 'socio'
}

/** Consulta é somente leitura — o app não deve tentar gravar na nuvem. */
export function ehSomenteLeitura(papel?: Papel): boolean {
  return papel === 'consulta'
}
