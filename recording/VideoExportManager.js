// ./recording/VideoExportManager.js
import { RENDER_PRESETS, pickSupportedMime } from './presets.js';
import { drawWatermark } from './WatermarkRenderer.js';

/**
 * Usage (you wire buttons):
 *   const mgr = new VideoExportManager(window.vvavy);
 *   await mgr.start({ presetId: 'vertical1080x1920', maxDurationMs: 30000, watermark: true });
 *   // later...
 *   const file = await mgr.stop(); // returns { blob, url, mimeType, width, height, durationMs }
 *
 * This composites your visualizer canvas → offscreen recorderCanvas
 * and taps audio from AudioManager into a MediaRecorder stream.
 */
export class VideoExportManager {
  /**
   * @param {VvavyApp} vvavyApp - access to current visualizer + AudioManager
   */
  constructor(vvavyApp) {
    this.app = vvavyApp;
    this.recorder = null;
    this._chunks = [];
    this._startedAt = 0;
    this._timeoutId = null;
    this._compositeRAF = null;

    this.presetId = 'vertical1080x1920';
    this.preset = { ...RENDER_PRESETS.vertical1080x1920 };
    this.maxDurationMs = 30000;
    this.addWatermark = true;
    this.activeFileName = null;
    this._lastStartMeta = null;

    // Offscreen compositor canvas (not in DOM)
    this.recorderCanvas = document.createElement('canvas');
    this.recCtx = this.recorderCanvas.getContext('2d', { alpha: false });
  }

  configure({ presetId, maxDurationMs, watermark, fps, fileName } = {}) {
    if (presetId && RENDER_PRESETS[presetId]) {
      this.presetId = presetId;
      this.preset = { ...RENDER_PRESETS[presetId] };
    } else if (!this.preset || !this.preset.id) {
      this.presetId = this.preset?.id || 'vertical1080x1920';
      this.preset = { ...(RENDER_PRESETS[this.presetId] || RENDER_PRESETS.vertical1080x1920) };
    } else {
      this.preset = { ...this.preset };
    }

    if (Number.isFinite(fps)) {
      const fpsClamped = Math.min(120, Math.max(10, Math.round(fps)));
      this.preset.fps = fpsClamped;
    }

    if (Number.isFinite(maxDurationMs)) {
      this.maxDurationMs = Math.max(1000, maxDurationMs);
    }
    if (typeof watermark === 'boolean') this.addWatermark = watermark;
    if (typeof fileName === 'string') {
      const trimmed = fileName.trim();
      this.activeFileName = trimmed.length ? trimmed : null;
    }
  }

  /**
   * Begin recording. Returns true if started.
   */
  async start({ presetId, maxDurationMs = 30000, watermark = true, fps, fileName } = {}) {
    if (this.recorder) return false;
    this.configure({ presetId, maxDurationMs, watermark, fps, fileName });

    const sources = this._collectVisualizerCanvases();
    if (!sources.length) throw new Error('No visualizer canvas to record.');
    const audioManager = this._getAudioManager();
    if (!audioManager?.audioContext) throw new Error('AudioManager is not initialized.');

    // Size recorder canvas to target preset
    this.recorderCanvas.width  = this.preset.width;
    this.recorderCanvas.height = this.preset.height;

    // 1) Build video track from recorderCanvas via captureStream
    const canvasStream = this.recorderCanvas.captureStream(this.preset.fps);

    // 2) Create an Audio tap from the existing WebAudio graph
    // We connect in parallel (non-invasive) to your existing node chain.
    // AudioManager exposes its highPassFilter & routing (see code) which we can tap safely. :contentReference[oaicite:2]{index=2}
    const shouldIncludeAudio = this._shouldIncludeAudioTrack();
    let audioStream = null;
    let audioIncluded = false;
    const compositeTracks = [...canvasStream.getVideoTracks()];

    if (shouldIncludeAudio) {
      audioStream = this._createAudioTapStream(audioManager);
      const audioTracks = audioStream?.getAudioTracks?.() || [];
      if (audioTracks.length > 0) {
        audioIncluded = true;
        compositeTracks.push(...audioTracks);
      }
    }

    // 3) Merge into one MediaStream
    const mixed = new MediaStream(compositeTracks);

    // 4) Choose best supported mime
    const mimeType = pickSupportedMime(this.preset.mimeTypes)
      || (MediaRecorder.isTypeSupported?.('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm');

    // 5) Create recorder
    this._chunks = [];
    const recorderOptions = {
      mimeType,
      videoBitsPerSecond: this.preset.videoBitsPerSecond
    };
    if (audioIncluded && this.preset.audioBitsPerSecond) {
      recorderOptions.audioBitsPerSecond = this.preset.audioBitsPerSecond;
    }
    this.recorder = new MediaRecorder(mixed, recorderOptions);

    // Handlers
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this._chunks.push(e.data);
    };
    this.recorder.onstop = () => {
      // cleanup streams
      canvasStream.getTracks().forEach(t => t.stop());
      if (audioStream) {
        audioStream.getTracks().forEach(t => t.stop());
      }
    };

    // 6) Kick compositor -> copies your visualizer canvas into recorderCanvas at target FPS
    this._startedAt = performance.now();
    this._startCompositeLoop();

    this._lastStartMeta = {
      presetId: this.presetId,
      preset: { ...this.preset },
      maxDurationMs: this.maxDurationMs,
      watermark: this.addWatermark,
      fileName: this.activeFileName,
      mimeType,
      audioIncluded
    };

    // 7) Start recorder
    this.recorder.start(1000); // gather chunks each second
    this._notifyRecordingState(true);

    // 8) Auto-stop at max duration
    this._timeoutId = setTimeout(() => this.stop(), Math.max(1000, this.maxDurationMs));
    return true;
  }

  /**
   * Stop recording and resolve to file info.
   * @returns {Promise<{blob: Blob, url: string, mimeType: string, width: number, height: number, durationMs: number}>}
   */
  async stop() {
    if (!this.recorder) return null;
    const rec = this.recorder;
    const started = this._startedAt;
    this._clearCompositeLoop();
    if (this._timeoutId) { clearTimeout(this._timeoutId); this._timeoutId = null; }

    const stopP = new Promise(resolve => {
      rec.onstop = () => {
        const blob = new Blob(this._chunks, { type: rec.mimeType || 'video/webm' });
        const url = URL.createObjectURL(blob);
        const results = {
          blob,
          url,
          mimeType: rec.mimeType || 'video/webm',
          width: this.recorderCanvas.width,
          height: this.recorderCanvas.height,
          durationMs: Math.max(0, performance.now() - started),
          presetId: this._lastStartMeta?.presetId || this.presetId,
          preset: { ...(this._lastStartMeta?.preset || this.preset) },
          fileName: this._resolveFileName(rec.mimeType || 'video/webm'),
          audioIncluded: this._lastStartMeta?.audioIncluded === true
        };
        console.log(results);
        resolve(results);
      };
    });

    rec.stop();
    this.recorder = null;
    this._notifyRecordingState(false);
    return stopP;
  }

  isRecording() {
    return !!this.recorder && this.recorder.state === 'recording';
  }

  getActiveRecordingMeta() {
    if (!this.recorder) return null;
    return {
      presetId: this._lastStartMeta?.presetId || this.presetId,
      preset: { ...(this._lastStartMeta?.preset || this.preset) },
      maxDurationMs: this._lastStartMeta?.maxDurationMs || this.maxDurationMs,
      startedAt: this._startedAt || performance.now(),
      fileName: this._lastStartMeta?.fileName || this.activeFileName || null
    };
  }

  // ------------ internals ------------

  _getSourceCanvas() {
    const canvases = this._collectVisualizerCanvases();
    return canvases.length ? canvases[0].canvas : null;
  }

  _getAudioManager() {
    return this.app?.audioManager || window.vvavy?.audioManager || null;
  }

  _collectVisualizerCanvases() {
    const canvases = [];
    const appCanvas = this.app?.canvas || null;
    const visualizer = this.app?.currentVisualizer || null;
    const baseCanvas = visualizer?.canvas || appCanvas;

    const addCanvas = (canvas) => {
      if (!canvas) return;
      const zIndex = this._parseZIndex(canvas, canvases.length === 0 ? -1 : canvases.length);
      canvases.push({ canvas, zIndex });
    };

    if (baseCanvas) addCanvas(baseCanvas);

    if (visualizer?.overlayCanvases instanceof Map) {
      for (const overlay of visualizer.overlayCanvases.values()) {
        if (overlay?.canvas) addCanvas(overlay.canvas);
      }
    }

    canvases.sort((a, b) => a.zIndex - b.zIndex);
    return canvases;
  }

  _parseZIndex(canvas, fallback = 0) {
    if (!canvas) return fallback;
    const style = canvas.style?.zIndex;
    if (style && style !== 'auto') {
      const parsed = Number(style);
      if (Number.isFinite(parsed)) return parsed;
    }
    if (typeof window !== 'undefined' && window.getComputedStyle) {
      const computed = window.getComputedStyle(canvas).zIndex;
      if (computed && computed !== 'auto') {
        const parsed = Number(computed);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return fallback;
  }

  _shouldIncludeAudioTrack() {
    const app = this.app;
    if (app && typeof app.shouldIncludeAudioInExport === 'function') {
      return app.shouldIncludeAudioInExport();
    }
    const sourceType = app?.currentSourceType;
    if (sourceType === 'soundcloud') {
      const planAllows = typeof app?.isPaidSubscriptionPlan === 'function'
        ? app.isPaidSubscriptionPlan()
        : false;
      return Boolean(planAllows);
    }
    return true;
  }

  _createAudioTapStream(audioManager) {
    const ac = audioManager.audioContext;

    // Create MediaStreamDestination as a parallel “tap”
    const tapDest = ac.createMediaStreamDestination();

    // Prefer tapping at the filter output (pre-analysers) so we get what the user hears.
    // AudioManager routes: source -> highPassFilter -> split/analyse + destination. We add another branch here. :contentReference[oaicite:5]{index=5}
    try {
      audioManager.highPassFilter?.connect(tapDest);
    } catch (_) {
      // Fallback: connect sourceNode directly if filter is absent (unlikely in your graph).
      try { audioManager.sourceNode?.connect(tapDest); } catch (e) { console.warn('Audio tap fallback failed:', e); }
    }

    return tapDest.stream;
  }

  _startCompositeLoop() {
    const targetW = this.recorderCanvas.width;
    const targetH = this.recorderCanvas.height;
    const fps = this.preset.fps;
    const frameInterval = 1000 / fps;
    let last = 0;

    const draw = (t) => {
      this._compositeRAF = requestAnimationFrame(draw);
      if (t - last < frameInterval * 0.85) return; // simple frame-throttle
      last = t;

      const ctx = this.recCtx;
      const w = targetW, h = targetH;
      ctx.fillStyle = '#000'; // letterbox background
      ctx.fillRect(0, 0, w, h);

      const sources = this._collectVisualizerCanvases();
      if (sources.length === 0) return;

      const baseCanvas = this.app?.currentVisualizer?.canvas
        || sources[0]?.canvas
        || this.app?.canvas;
      if (!baseCanvas) return;

      const srcW = baseCanvas.width, srcH = baseCanvas.height;
      const scale = Math.min(w / srcW, h / srcH);
      const drawW = Math.floor(srcW * scale);
      const drawH = Math.floor(srcH * scale);
      const dx = Math.floor((w - drawW) / 2);
      const dy = Math.floor((h - drawH) / 2);

      for (const { canvas } of sources) {
        if (!canvas) continue;
        const layerW = canvas.width;
        const layerH = canvas.height;
        if (!layerW || !layerH) continue;
        this._drawCanvasLayer(ctx, canvas, dx, dy, drawW, drawH);
      }

      // Watermark
      if (this.addWatermark) {
        drawWatermark(ctx, w, h, 'powered by vvavy.io', {
          marginRatio: this.preset.safeMargin,
          // Auto chooses TL on tall videos to avoid UI, BR on landscape
          align: 'auto',
          minFont: 14,
          maxFont: 32
        });
      }
    };

    this._compositeRAF = requestAnimationFrame(draw);
  }

  _clearCompositeLoop() {
    if (this._compositeRAF) cancelAnimationFrame(this._compositeRAF);
    this._compositeRAF = null;
  }

  /**
   * Draws a source canvas into the recorder context while honoring core CSS styling.
   * Mirrors opacity, mix-blend-mode, and filter so exports match on-screen colours.
   */
  _drawCanvasLayer(ctx, canvas, dx, dy, drawW, drawH) {
    if (!ctx || !canvas) return;

    const computed = (typeof window !== 'undefined' && window.getComputedStyle)
      ? window.getComputedStyle(canvas)
      : null;

    if (computed) {
      if (computed.display === 'none' || computed.visibility === 'hidden') {
        return;
      }
      const opacity = Number.parseFloat(computed.opacity);
      ctx.save();
      if (Number.isFinite(opacity)) {
        ctx.globalAlpha = opacity < 0 ? 0 : opacity > 1 ? 1 : opacity;
      } else {
        ctx.globalAlpha = 1;
      }

      const blendMode = computed.mixBlendMode;
      if (blendMode && blendMode !== 'normal') {
        try {
          ctx.globalCompositeOperation = blendMode;
        } catch (_) {
          ctx.globalCompositeOperation = 'source-over';
        }
      } else {
        ctx.globalCompositeOperation = 'source-over';
      }

      const filter = computed.filter;
      if (filter && filter !== 'none' && 'filter' in ctx) {
        ctx.filter = filter;
      } else if ('filter' in ctx) {
        ctx.filter = 'none';
      }

      try {
        ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, dx, dy, drawW, drawH);
      } catch (err) {
        // Ignore draw errors (e.g., context lost, cross-origin)
      }
      ctx.restore();
      return;
    }

    // Fallback when computed style unavailable
    try {
      ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, dx, dy, drawW, drawH);
    } catch (err) {
      // Ignore draw errors.
    }
  }

  _notifyRecordingState(isRecording) {
    if (typeof window === 'undefined') return;
    try {
      window.dispatchEvent(new CustomEvent('vvavy:export-recording-state', {
        detail: {
          manager: this,
          isRecording: Boolean(isRecording)
        }
      }));
    } catch (_) {
      /* ignore event dispatch issues */
    }
  }

  _resolveFileName(mimeType = 'video/webm') {
    const base =
      (this.activeFileName && this.activeFileName.trim()) ||
      (this._lastStartMeta?.fileName && this._lastStartMeta.fileName.trim()) ||
      `vvavy-export-${new Date().toISOString().slice(0, 10)}`;
    const safeBase = this._sanitizeFileName(base);
    const extension = this._extensionFromMime(mimeType);
    if (safeBase.toLowerCase().endsWith(extension)) return safeBase;
    return `${safeBase}${extension}`;
  }

  _sanitizeFileName(name) {
    return name.replace(/[^a-z0-9_\-()\[\]\s\.]+/gi, '-').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'vvavy-export';
  }

  _extensionFromMime(mime) {
    if (!mime) return '.webm';
    if (mime.includes('mp4')) return '.mp4';
    if (mime.includes('webm')) return '.webm';
    if (mime.includes('ogg')) return '.ogv';
    return '.webm';
  }
}

// Convenience global hook if you want
VideoExportManager.RENDER_PRESETS = RENDER_PRESETS;

if (typeof window !== 'undefined') {
  window['VideoExportManager'] = VideoExportManager;
}
