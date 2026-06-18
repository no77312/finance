import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const iconDir = join(root, "public", "icons");

const segments = [
  { start: -92, sweep: 142, color: [66, 133, 244], hex: "#4285f4" },
  { start: 58, sweep: 118, color: [52, 168, 83], hex: "#34a853" },
  { start: 184, sweep: 76, color: [251, 188, 5], hex: "#fbbc05" }
];

function svgSource() {
  const paths = segments.map((segment) => {
    const end = segment.start + segment.sweep;
    return `<path d="${arcPath(512, 512, 268, segment.start, end)}" fill="none" stroke="${segment.hex}" stroke-width="126" stroke-linecap="round"/>`;
  }).join("\n      ");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="186" y1="94" x2="838" y2="930" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#f7f8fb"/>
    </linearGradient>
    <radialGradient id="centerGlow" cx="50%" cy="38%" r="66%">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#f3f6fb"/>
    </radialGradient>
    <filter id="surfaceShadow" x="-22%" y="-22%" width="144%" height="144%">
      <feDropShadow dx="0" dy="30" stdDeviation="34" flood-color="#1f2937" flood-opacity="0.12"/>
    </filter>
    <filter id="colorShadow" x="-22%" y="-22%" width="144%" height="144%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#1f2937" flood-opacity="0.10"/>
    </filter>
  </defs>
  <rect width="1024" height="1024" rx="228" fill="url(#bg)"/>
  <circle cx="512" cy="512" r="336" fill="#ffffff" filter="url(#surfaceShadow)"/>
  <circle cx="512" cy="512" r="318" fill="#f8fafc"/>
  <g filter="url(#colorShadow)">
      ${paths}
  </g>
  <circle cx="512" cy="512" r="158" fill="url(#centerGlow)"/>
  <circle cx="512" cy="512" r="158" fill="none" stroke="#e8edf5" stroke-width="10"/>
  <circle cx="512" cy="512" r="64" fill="#ffffff" opacity="0.74"/>
</svg>
`;
}

function arcPath(cx, cy, r, startDegrees, endDegrees) {
  const start = polar(cx, cy, r, startDegrees);
  const end = polar(cx, cy, r, endDegrees);
  const largeArc = Math.abs(endDegrees - startDegrees) > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function polar(cx, cy, r, degrees) {
  const radians = degrees * Math.PI / 180;
  return {
    x: cx + Math.cos(radians) * r,
    y: cy + Math.sin(radians) * r
  };
}

function renderPng(size) {
  const channels = 4;
  const pixels = Buffer.alloc(size * size * channels);
  const samples = size >= 512 ? 3 : 4;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = (x + (sx + 0.5) / samples) / size;
          const py = (y + (sy + 0.5) / samples) / size;
          const color = sampleIcon(px, py);
          r += color[0];
          g += color[1];
          b += color[2];
          a += color[3];
        }
      }

      const divisor = samples * samples;
      const index = (y * size + x) * channels;
      pixels[index] = Math.round(r / divisor);
      pixels[index + 1] = Math.round(g / divisor);
      pixels[index + 2] = Math.round(b / divisor);
      pixels[index + 3] = Math.round(a / divisor);
    }
  }

  return encodePng(size, size, pixels);
}

function sampleIcon(x, y) {
  const scale = 1024;
  const px = x * scale;
  const py = y * scale;
  const bg = mix([255, 255, 255], [245, 247, 251], Math.min(1, Math.max(0, (px + py - 180) / 1420)));
  let color = [...bg, 255];

  const dx = px - 512;
  const dy = py - 512;
  const distance = Math.hypot(dx, dy);

  if (distance < 366) {
    const shadow = Math.max(0, 1 - Math.abs(distance - 336) / 104) * 0.08;
    color = blend(color, [0, 0, 0, shadow * 255]);
  }

  if (distance < 336) {
    color = blend(color, [255, 255, 255, 255]);
  }

  if (distance < 318) {
    color = blend(color, [248, 250, 252, 255]);
  }

  const ringShadow = Math.max(0, 1 - Math.abs(distance - 268) / 92) * 0.05;
  if (ringShadow > 0) {
    color = blend(color, [31, 41, 55, ringShadow * 255]);
  }

  for (const segment of segments) {
    const ringAlpha = arcAlpha(px, py, segment);
    if (ringAlpha > 0) {
      color = blend(color, [...segment.color, Math.round(255 * ringAlpha)]);
    }
  }

  if (distance < 163) {
    color = blend(color, [232, 237, 245, 255]);
  }
  if (distance < 158) {
    const center = mix([255, 255, 255], [243, 246, 251], Math.min(1, Math.max(0, (distance - 24) / 134)));
    color = blend(color, [...center, 255]);
  }
  if (distance < 64) {
    color = blend(color, [255, 255, 255, 189]);
  }

  return color;
}

function roundedRectAlpha(x, y, width, height, radius) {
  const qx = Math.abs(x - width / 2) - (width / 2 - radius);
  const qy = Math.abs(y - height / 2) - (height / 2 - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
  return clamp(0.5 - outside, 0, 1);
}

function arcAlpha(x, y, segment) {
  const dx = x - 512;
  const dy = y - 512;
  const distance = Math.hypot(dx, dy);
  const stroke = 126;
  const radius = 268;
  const radial = clamp((stroke / 2 + 0.7 - Math.abs(distance - radius)) / 1.4, 0, 1);
  if (radial <= 0) {
    return 0;
  }

  const angle = normalizeDegrees(Math.atan2(dy, dx) * 180 / Math.PI);
  const start = normalizeDegrees(segment.start);
  const end = normalizeDegrees(segment.start + segment.sweep);
  const inside = angleInSweep(angle, start, segment.sweep);
  const capRadius = stroke / 2;
  const startPoint = polar(512, 512, radius, segment.start);
  const endPoint = polar(512, 512, radius, segment.start + segment.sweep);
  const cap = Math.max(
    clamp((capRadius + 0.7 - Math.hypot(x - startPoint.x, y - startPoint.y)) / 1.4, 0, 1),
    clamp((capRadius + 0.7 - Math.hypot(x - endPoint.x, y - endPoint.y)) / 1.4, 0, 1)
  );

  if (inside) {
    return Math.max(radial, cap);
  }

  return cap;
}

function markerColor(x, y) {
  const roundRect = roundedRectAlpha(x - 458, y - 142, 108, 58, 29);
  const circle = clamp((36.7 - Math.hypot(x - 734, y - 282)) / 1.4, 0, 1);
  const triangle = triangleAlpha(x, y, [766, 650], [820, 744], [712, 744]);
  const alpha = Math.max(roundRect, circle, triangle) * 0.92;
  return [255, 255, 255, Math.round(alpha * 255)];
}

function triangleAlpha(px, py, a, b, c) {
  const area = edge(a, b, c);
  const w0 = edge(b, c, [px, py]) / area;
  const w1 = edge(c, a, [px, py]) / area;
  const w2 = edge(a, b, [px, py]) / area;
  const inside = w0 >= 0 && w1 >= 0 && w2 >= 0;
  if (!inside) {
    return 0;
  }
  const distance = Math.min(
    pointLineDistance(px, py, a, b),
    pointLineDistance(px, py, b, c),
    pointLineDistance(px, py, c, a)
  );
  return clamp(distance / 1.4, 0, 1);
}

function edge(a, b, c) {
  return (c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0]);
}

function pointLineDistance(px, py, a, b) {
  return Math.abs((b[1] - a[1]) * px - (b[0] - a[0]) * py + b[0] * a[1] - b[1] * a[0]) / Math.hypot(b[1] - a[1], b[0] - a[0]);
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function angleInSweep(angle, start, sweep) {
  const delta = normalizeDegrees(angle - start);
  return delta <= sweep;
}

function mix(first, second, amount) {
  return first.map((value, index) => Math.round(value + (second[index] - value) * amount));
}

function blend(bottom, top) {
  const topAlpha = top[3] / 255;
  const bottomAlpha = bottom[3] / 255;
  const outAlpha = topAlpha + bottomAlpha * (1 - topAlpha);
  if (outAlpha <= 0) {
    return [0, 0, 0, 0];
  }
  return [
    Math.round((top[0] * topAlpha + bottom[0] * bottomAlpha * (1 - topAlpha)) / outAlpha),
    Math.round((top[1] * topAlpha + bottom[1] * bottomAlpha * (1 - topAlpha)) / outAlpha),
    Math.round((top[2] * topAlpha + bottom[2] * bottomAlpha * (1 - topAlpha)) / outAlpha),
    Math.round(outAlpha * 255)
  ];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function encodePng(width, height, rgba) {
  const scanlineLength = width * 4 + 1;
  const raw = Buffer.alloc(scanlineLength * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * scanlineLength] = 0;
    rgba.copy(raw, y * scanlineLength + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr(width, height)),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function ihdr(width, height) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8;
  data[9] = 6;
  data[10] = 0;
  data[11] = 0;
  data[12] = 0;
  return data;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

mkdirSync(iconDir, { recursive: true });
writeFileSync(join(iconDir, "icon.svg"), svgSource());

for (const [fileName, size] of [
  ["apple-touch-icon.png", 180],
  ["icon-192.png", 192],
  ["icon-512.png", 512]
]) {
  writeFileSync(join(iconDir, fileName), renderPng(size));
}
