// The close views have a different composition, not an enlarged overview.
// All interactive faces stay in source-image coordinates through responsive crops.
export function cornerCamera(width, height, source, focal, contentRange) {
  if (contentRange && width >= 560 && width > height && height <= 500) {
    const top = 60, bottom = height - 68;
    const scale = Math.min((width - 32) / source.width, (bottom - top) / (contentRange.bottom - contentRange.top));
    return { scale, x: (width - source.width * scale) / 2, y: top - contentRange.top * scale, landscape: true };
  }
  const scale = Math.max(width / source.width, height / source.height);
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  return { scale, x: clamp(width / 2 - focal.x * scale, width - source.width * scale, 0), y: clamp(height * .54 - focal.y * scale, height - source.height * scale, 0) };
}

export function planeStyle(quad, width = 240, height = 160) {
  const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]] = quad;
  const dx1=x1-x2, dx2=x3-x2, dx3=x0-x1+x2-x3, dy1=y1-y2, dy2=y3-y2, dy3=y0-y1+y2-y3;
  const det=dx1*dy2-dx2*dy1;
  const g=det ? (dx3*dy2-dx2*dy3)/det : 0, h=det ? (dx1*dy3-dx3*dy1)/det : 0;
  const a=x1-x0+g*x1, b=x3-x0+h*x3, d=y1-y0+g*y1, e=y3-y0+h*y3;
  return { width, height, transformOrigin:'0 0', transform:`matrix3d(${a/width},${d/width},0,${g/width},${b/height},${e/height},0,${h/height},0,0,1,0,${x0},${y0},0,1)` };
}
