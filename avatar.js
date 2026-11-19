// やさしい雰囲気の人のイラスト(SVG)。性別と年代で見た目が変わる
// 年代が上がるほど:髪が白く・しわ・メガネ・杖
let n = 0;
const HAIR = { u50: '#3d302a', 60: '#6e655e', 70: '#9e9892', 80: '#cbc7c2', 90: '#ecebe8' };
const SHIRT = { m: '#7f9cc0', f: '#d79aa4' };
const BG = { m: '#e3ecf6', f: '#f8e6ea', x: '#eceff3' };

export function avatarSvg(gender, age, size = 56) {
  const id = 'av' + ++n;
  const g = gender === 'm' || gender === 'f' ? gender : 'x';
  const a = HAIR[age] ? age : '';
  const hair = HAIR[a] || '#8a8178';
  const old = a === '70' || a === '80' || a === '90';
  const older = a === '80' || a === '90';
  const skin = '#f6d7bd';
  const parts = [];
  // 背景と体
  parts.push(`<circle cx="50" cy="50" r="50" fill="${BG[g]}"/>`);
  parts.push(`<path d="M18 104 Q20 74 50 72 Q80 74 82 104 Z" fill="${SHIRT[g] || '#9aa8b8'}"/>`);
  parts.push(`<rect x="44" y="58" width="12" height="14" rx="5" fill="${skin}"/>`);
  // うしろ髪(女性)
  if (g === 'f') {
    if (old) parts.push(`<circle cx="50" cy="38" r="25" fill="${hair}"/>`);
    else parts.push(`<path d="M24 44 Q22 16 50 15 Q78 16 76 44 L77 66 Q66 70 62 62 L38 62 Q34 70 23 66 Z" fill="${hair}"/>`);
  }
  // 顔
  parts.push(`<ellipse cx="50" cy="42" rx="20" ry="22" fill="${skin}"/>`);
  parts.push(`<circle cx="29.5" cy="45" r="4" fill="${skin}"/><circle cx="70.5" cy="45" r="4" fill="${skin}"/>`);
  // 前髪
  if (g === 'm') {
    if (a === '90') parts.push(`<path d="M30 38 Q30 30 34 28 L34 40 Z M70 38 Q70 30 66 28 L66 40 Z" fill="${hair}"/>`);
    else if (a === '80') parts.push(`<path d="M29 40 Q28 22 42 20 Q38 26 36 34 L31 42 Z M71 40 Q72 22 58 20 Q62 26 64 34 L69 42 Z" fill="${hair}"/>`);
    else parts.push(`<path d="M29 40 Q27 17 50 17 Q73 17 71 40 Q66 28 56 27 Q46 31 36 28 Q31 32 29 40 Z" fill="${hair}"/>`);
  } else if (g === 'f') {
    if (old) {
      // 短いパーマ
      for (const [x, y] of [[32, 26], [41, 20], [50, 18], [59, 20], [68, 26], [29, 35], [71, 35]]) parts.push(`<circle cx="${x}" cy="${y}" r="7" fill="${hair}"/>`);
    } else parts.push(`<path d="M28 40 Q28 18 50 18 Q72 18 72 40 Q62 26 46 28 Q36 30 28 40 Z" fill="${hair}"/>`);
  } else {
    parts.push(`<path d="M29 38 Q29 18 50 18 Q71 18 71 38 Q60 28 50 28 Q40 28 29 38 Z" fill="${hair}"/>`);
  }
  // 目・眉・口・ほお
  const brow = old ? hair : '#5a4a42';
  parts.push(`<path d="M37 37 Q41 35 45 37 M55 37 Q59 35 63 37" stroke="${brow}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`);
  parts.push(`<path d="M38 44 Q41 47 44 44 M56 44 Q59 47 62 44" stroke="#3b3330" stroke-width="2" fill="none" stroke-linecap="round"/>`);
  parts.push(`<path d="M43 54 Q50 59 57 54" stroke="#b5655a" stroke-width="2" fill="none" stroke-linecap="round"/>`);
  parts.push(`<circle cx="36" cy="51" r="3.4" fill="#f2a9a0" opacity=".55"/><circle cx="64" cy="51" r="3.4" fill="#f2a9a0" opacity=".55"/>`);
  // しわ
  if (old) parts.push(`<path d="M42 28 Q50 26 58 28" stroke="#d9ad90" stroke-width="1.3" fill="none" stroke-linecap="round"/>`);
  if (older) parts.push(`<path d="M32 44 l-3 -1 M32 47 l-3 1 M68 44 l3 -1 M68 47 l3 1 M40 56 Q42 58 41 60 M60 56 Q58 58 59 60" stroke="#d9ad90" stroke-width="1.2" fill="none" stroke-linecap="round"/>`);
  if (a === '90') parts.push(`<path d="M41 31 Q50 29 59 31" stroke="#d9ad90" stroke-width="1.2" fill="none" stroke-linecap="round"/>`);
  // メガネ(80代以上)
  if (older) parts.push(`<g stroke="#6f6a66" stroke-width="1.6" fill="none"><circle cx="41" cy="44" r="6"/><circle cx="59" cy="44" r="6"/><path d="M47 44 L53 44"/></g>`);
  // 杖(80代以上)
  if (older) parts.push(`<path d="M76 66 Q76 58 82 58 Q88 58 88 64 L88 102" stroke="#9a6a43" stroke-width="3.6" fill="none" stroke-linecap="round"/><circle cx="87" cy="70" r="4" fill="${skin}"/>`);
  return `<svg class="avatar" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="アバター"><clipPath id="${id}"><circle cx="50" cy="50" r="50"/></clipPath><g clip-path="url(#${id})">${parts.join('')}</g></svg>`;
}
