// ./recording/WatermarkRenderer.js
export function drawWatermark(ctx, w, h, text = 'powered by vvavy.io', opts = {}) {
  const {
    opacity = 0.66,
    color = '#FFFFFF',
    shadow = 'rgba(0,0,0,0.65)',
    align = 'auto',     // 'auto' chooses based on aspect; or 'br','bl','tr','tl','center'
    marginRatio = 0.05, // relative padding against min(w,h)
    minFont = 14,
    maxFont = 28
  } = opts;

  const aspect = w / h;
  const margin = Math.max(8, Math.floor(Math.min(w, h) * marginRatio));
  const isVertical = aspect < 0.9; // tall screens (9:16, etc.)

  let pos = align;
  if (align === 'auto') {
    // For vertical: keep to top-left (safe of caption UI), for landscape: bottom-right
    pos = isVertical ? 'tl' : 'br';
  }

  // Font scales with width but clamped
  const base = Math.min(w, h);
  const fontPx = Math.round(Math.max(minFont, Math.min(maxFont, base * 0.018)));

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.font = `600 ${fontPx}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell`;
  ctx.textBaseline = 'alphabetic';

  // measure
  const metrics = ctx.measureText(text);
  const textW = metrics.width;
  const textH = fontPx; // rough

  let x = 0, y = 0;
  switch (pos) {
    case 'br': x = w - margin - textW; y = h - margin; break;
    case 'bl': x = margin;             y = h - margin; break;
    case 'tr': x = w - margin - textW; y = margin + textH; break;
    case 'tl': x = margin;             y = margin + textH; break;
    default:   x = (w - textW) / 2;    y = h - margin;
  }

  // shadow
  ctx.fillStyle = shadow;
  ctx.fillText(text, x + 2, y + 2);

  // text
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);

  ctx.restore();
}
