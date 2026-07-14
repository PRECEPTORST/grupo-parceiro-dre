/** Logo "P!" da Preceptor — um P pesado + exclamação com bolinha. */
export function LogoP({ size = 32, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Preceptor"
    >
      {/* P pesado */}
      <path
        d="M10 58 V6 h20 c11 0 19 7 19 17.5 S41 41 30 41 h-9 v17 z M21 16.5 v14 h8 c4.5 0 7.5-2.8 7.5-7 s-3-7-7.5-7 z"
        fill={color}
      />
      {/* Exclamação */}
      <rect x="50" y="6" width="9" height="34" rx="4.5" fill={color} />
      <circle cx="54.5" cy="53" r="5.5" fill={color} />
    </svg>
  )
}

export function Wordmark({ size = 18, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <span
      style={{
        fontWeight: 800,
        letterSpacing: '0.08em',
        fontSize: size,
        color,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      PRECEPTOR!
    </span>
  )
}
