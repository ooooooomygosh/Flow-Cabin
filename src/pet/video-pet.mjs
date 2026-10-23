// The PNG atlas remains available on surfaces without transparent VP8/VP9.
export function startVideoPet({ src, context, size, mirror, baseline, reduced, onFrame, onFallback }) {
  const video = document.createElement('video'); video.crossOrigin = 'anonymous'; video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'auto';
  let disposed = false, timer, frameId, checked = false, failed = false;
  const fallback = (reason = 'decode-error') => { if (disposed || failed) return; failed = true; video.pause(); clearTimeout(timer); onFallback(reason); };
  const draw = () => {
    if (disposed || failed) return;
    try {
      context.clearRect(0, 0, size, size); context.save(); context.imageSmoothingEnabled = true;
      if (mirror) { context.translate(size, 0); context.scale(-1, 1); }
      context.drawImage(video, 0, -(baseline || 0) * size, size, size); context.restore();
      if (!checked) {
        // Test the decoded source, before baseline/mirror placement. Otherwise
        // moving an opaque frame upward could look like a transparent decoder.
        const probe=document.createElement('canvas');probe.width=probe.height=64;
        const pixels=probe.getContext('2d',{willReadFrequently:true});pixels.drawImage(video,0,0,64,64);
        const alpha = pixels.getImageData(0, 0, 64, 64).data;
        let transparent = 0, opaque = 0; for (let i = 3; i < alpha.length; i += 4) { if (alpha[i] < 20) transparent++; if (alpha[i] > 20) opaque++; }
        // Do not display an opaque black rectangle when the decoder discards alpha.
        if (transparent < 8 || !opaque) return fallback(opaque ? 'alpha-missing' : 'empty-frame');
        checked = true;
      }
      onFrame();
      if (!reduced) { if (video.requestVideoFrameCallback) frameId = video.requestVideoFrameCallback(draw); else timer = setTimeout(draw, 1000 / 30); }
    } catch { fallback(); }
  };
  video.onloadeddata = () => { clearTimeout(timer); draw(); if (!reduced && !failed) video.play().catch(() => fallback('play-rejected')); };
  video.onerror = () => fallback('media-error-' + (video.error?.code || 0)); video.src = src; timer = setTimeout(() => fallback('load-timeout'), 10000); video.load();
  return () => { disposed = true; clearTimeout(timer); if (frameId) video.cancelVideoFrameCallback?.(frameId); video.onloadeddata = video.onerror = null; video.pause(); video.removeAttribute('src'); video.load(); };
}
