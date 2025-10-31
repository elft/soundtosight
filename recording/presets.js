export const RENDER_PRESETS = {
  horizontal1920x1080: {
    label: 'Horizontal 1920x1080 (16:9 - Larger Devices)',
    width: 1920, height: 1080, fps: 45,
    mimeTypes: [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus'
    ],
    videoBitsPerSecond: 9_000_000,
    audioBitsPerSecond: 192_000,
    safeMargin: 0.05,         // % of min(w,h) for watermark padding
    id: 'horizontal1920x1080'
  },
  vertical1080x1920: {
    label: 'Vertical 1080x1920 (9:16 - Mobile Devices)',
    width: 1080, height: 1920, fps: 45,
    mimeTypes: [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus'
    ],
    videoBitsPerSecond: 8_000_000,
    audioBitsPerSecond: 192_000,
    safeMargin: 0.06,
    id: 'vertical1080x1920'
  },
  square1080x1080: {
    label: 'Square 1080x1080 (1:1 - Not sure style)',
    width: 1080, height: 1080, fps: 45,
    mimeTypes: [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus'
    ],
    videoBitsPerSecond: 7_000_000,
    audioBitsPerSecond: 192_000,
    safeMargin: 0.05,
    id: 'square1080x1080'
  }
};

// Utility: pick first supported mimeType at runtime
export function pickSupportedMime(mimeList = []) {
  const MR = window.MediaRecorder || null;
  if (!MR) return null;
  for (const m of mimeList) {
    if (MR.isTypeSupported?.(m)) return m;
  }
  return null;
}
