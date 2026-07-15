// Ícones de traço minimalistas (herdam a cor via currentColor).
type P = { size?: number }
const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export function IconInicio({ size = 20 }: P) {
  return (
    <svg {...base(size)}>
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M9.5 20v-5h5v5" />
    </svg>
  )
}
export function IconDre({ size = 20 }: P) {
  return (
    <svg {...base(size)}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  )
}
export function IconOrcamento({ size = 20 }: P) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14.5" r="1.4" />
    </svg>
  )
}
export function IconCaixa({ size = 20 }: P) {
  return (
    <svg {...base(size)}>
      <path d="M3 17.5 9 11l4 4 8-8.5" />
      <path d="M15 6.5h6v6" />
    </svg>
  )
}
export function IconLancamentos({ size = 20 }: P) {
  return (
    <svg {...base(size)}>
      <path d="M5 4h14v16l-3-2-2 2-2-2-2 2-2-2-3 2z" />
      <path d="M9 9h6M9 13h4" />
    </svg>
  )
}
export function IconUsuarios({ size = 20 }: P) {
  return (
    <svg {...base(size)}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6M18 20a5.5 5.5 0 0 0-3-4.9" />
    </svg>
  )
}
export function IconSair({ size = 18 }: P) {
  return (
    <svg {...base(size)}>
      <path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3" />
      <path d="M10 12H3M6 8l-4 4 4 4" />
    </svg>
  )
}
