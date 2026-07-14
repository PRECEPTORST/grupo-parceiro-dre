// Permissões do cliente — espelham as regras aplicadas no servidor
// (lib/auth.ts + api/estado.ts). Aqui é só UX; a barreira real é no servidor.
import type { Papel } from '../context/AuthContext'

export const rotuloPapel: Record<Papel, string> = {
  admin: 'Administrador',
  orcamento: 'Consulta + orçamento',
  consulta: 'Somente consulta',
}

export const descricaoPapel: Record<Papel, string> = {
  admin: 'Gerencia usuários e faz tudo: sincroniza, classifica e edita orçamento.',
  orcamento: 'Vê tudo e pode criar/alterar o orçamento.',
  consulta: 'Apenas visualiza. Não altera nada.',
}

/** Só admin gerencia usuários e altera lançamentos/classificações. */
export function podeAdministrar(papel?: Papel): boolean {
  return papel === 'admin'
}

/** Admin e "orçamento" podem criar/alterar o orçamento. */
export function podeEditarOrcamento(papel?: Papel): boolean {
  return papel === 'admin' || papel === 'orcamento'
}

/** Consulta é somente leitura — o app não deve tentar gravar na nuvem. */
export function ehSomenteLeitura(papel?: Papel): boolean {
  return papel === 'consulta'
}
