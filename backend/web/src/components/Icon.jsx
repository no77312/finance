// 内联 SVG 图标。采用 Apple/Google 风格的细线条（stroke）设计，统一 1.6 描边、圆角端点。
// 每个图标返回一组 <path>/<circle> 等子元素。
const ICONS = {
  // 总览：四宫格仪表盘
  overview: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </>
  ),
  // 成员：两个人
  'member-group': (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5c0-3 2.6-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.9" />
      <path d="M17.5 14.7c2 .7 3.5 2.4 3.5 4.8" />
    </>
  ),
  // 我的：单个人
  profile: (
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c0-3.3 3-5.6 7-5.6s7 2.3 7 5.6" />
    </>
  ),
  // 群组/切换：堆叠层
  layers: (
    <>
      <path d="M12 3.5 20.5 8 12 12.5 3.5 8 12 3.5Z" />
      <path d="m4 12 8 4.3L20 12" />
      <path d="m4 16 8 4.3L20 16" />
    </>
  ),
  // AI 洞察：星芒
  sparkles: (
    <>
      <path d="M12 3.5c.4 3.2 1.8 4.6 5 5-3.2.4-4.6 1.8-5 5-.4-3.2-1.8-4.6-5-5 3.2-.4 4.6-1.8 5-5Z" />
      <path d="M18.5 13.5c.2 1.6.9 2.3 2.5 2.5-1.6.2-2.3.9-2.5 2.5-.2-1.6-.9-2.3-2.5-2.5 1.6-.2 2.3-.9 2.5-2.5Z" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  'arrow-up': (
    <>
      <path d="M12 19V6" />
      <path d="m6 11 6-6 6 6" />
    </>
  ),
  'arrow-down': (
    <>
      <path d="M12 5v13" />
      <path d="m6 13 6 6 6-6" />
    </>
  ),
  // 编辑：铅笔
  adjust: (
    <>
      <path d="M4 16.5 15.5 5l3.5 3.5L7.5 20 4 20.5l.5-4Z" />
      <path d="M13.5 7 17 10.5" />
    </>
  ),
  chevron: <path d="m9 6 6 6-6 6" />,
  close: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
}

export default function Icon({ name, size = 20 }) {
  const node = ICONS[name]
  if (!node) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {node}
    </svg>
  )
}
