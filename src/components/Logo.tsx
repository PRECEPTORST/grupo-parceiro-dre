// Marca oficial GRUPO PARCEIRO AGRONEGÓCIOS (versão colorida/dourada,
// para fundo claro). Assets em /public.

/** Logo horizontal (escudo + letreiro) — cabeçalho. */
export function LogoHorizontal({ height = 34 }: { height?: number }) {
  return (
    <img
      src="/gp-logo-horizontal.png"
      alt="Grupo Parceiro Agronegócios"
      style={{ height, width: 'auto', display: 'block' }}
    />
  )
}

/** Lockup empilhado (escudo sobre letreiro) — tela de login. */
export function LogoLockup({ width = 240 }: { width?: number }) {
  return (
    <img
      src="/gp-logo.png"
      alt="Grupo Parceiro Agronegócios"
      style={{ width, maxWidth: '100%', height: 'auto', display: 'block' }}
    />
  )
}
