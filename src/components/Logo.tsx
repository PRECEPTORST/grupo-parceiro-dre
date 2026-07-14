// Marca do GRUPO PARCEIRO AGRONEGÓCIOS.
// Assets em /public: escudo (parceiro-mark) e lockup completo (parceiro-lockup),
// ambos brancos, para fundo escuro.

/** Emblema (escudo + aperto de mãos em trigo) — usado no cabeçalho. */
export function LogoP({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/parceiro-mark.png"
      alt="Grupo Parceiro"
      style={{ height: size, width: 'auto', display: 'block' }}
    />
  )
}

/** Letreiro "GRUPO PARCEIRO" em serifada, na linha do logotipo da marca. */
export function Wordmark({ size = 18, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <span
      style={{
        fontFamily: "'Cinzel', 'Times New Roman', serif",
        fontWeight: 700,
        letterSpacing: '0.06em',
        fontSize: size,
        color,
        lineHeight: 1,
      }}
    >
      GRUPO PARCEIRO
    </span>
  )
}

/** Lockup completo (escudo + letreiro empilhados) — usado na tela de login. */
export function LogoLockup({ width = 220 }: { width?: number }) {
  return (
    <img
      src="/parceiro-lockup.png"
      alt="Grupo Parceiro Agronegócios"
      style={{ width, maxWidth: '100%', height: 'auto', display: 'block' }}
    />
  )
}
