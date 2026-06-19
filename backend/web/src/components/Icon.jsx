// 内联 SVG 图标组件，移植自原 app.js icon()
const PATHS = {
  overview: 'M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z',
  'member-group':
    'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3Zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3Zm0 2c-2.33 0-7 1.17-7 3.5V19h8v-2.5c0-.85.33-2.34 2.37-3.47C10.5 13.1 9.66 13 8 13Zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5Z',
  profile: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z',
  layers: 'm12 2 9 5-9 5-9-5 9-5Zm0 8.5L4.21 6.2 3 7l9 5 9-5-1.21-.8L12 10.5ZM3 12l9 5 9-5 1 .55-10 5.45L2 12.55 3 12Zm0 5 9 5 9-5 1 .55-10 5.45L2 17.55 3 17Z',
  sparkles: 'M12 2l1.8 4.6L18 8l-4.2 1.4L12 14l-1.8-4.6L6 8l4.2-1.4L12 2Zm6 9 .9 2.3L21 14l-2.1.7L18 17l-.9-2.3L15 14l2.1-.7L18 11ZM6 13l.9 2.3L9 16l-2.1.7L6 19l-.9-2.3L3 16l2.1-.7L6 13Z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z',
  minus: 'M5 11h14v2H5z',
  'arrow-up': 'M12 5l7 7-1.4 1.4L13 8.8V19h-2V8.8L6.4 13.4 5 12l7-7Z',
  'arrow-down': 'M12 19l-7-7 1.4-1.4L11 15.2V5h2v10.2l4.6-4.6L19 12l-7 7Z',
  adjust: 'M3 17v2h6v-2H3ZM3 5v2h10V5H3Zm10 16v-2h8v-2h-8v-2h-2v6h2ZM7 9v2H3v2h4v2h2V9H7Zm14 4v-2H11v2h10Zm-6-4h2V7h4V5h-4V3h-2v6Z',
  chevron: 'M8.6 5.4 14.2 11l-5.6 5.6L7 15l4-4-4-4 1.6-1.6Z',
}

export default function Icon({ name, size = 20 }) {
  const d = PATHS[name]
  if (!d) return null
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}
