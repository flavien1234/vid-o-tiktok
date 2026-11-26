/* Vid-o-TikTok — générateur de vidéos verticales (9:16) 100 % navigateur.
 * Rendu : Canvas 2D. Export : canvas.captureStream + MediaRecorder (MP4 si supporté, sinon WebM).
 */
(() => {
  'use strict';

  const W = 1080, H = 1920;
  const STORAGE_KEY = 'vidotiktok.project.v1';

  const PALETTES = [
    ['#fe2c55', '#7a00ff'], ['#25f4ee', '#0050ff'], ['#ff9a00', '#fe2c55'],
    ['#00c853', '#006064'], ['#f7971e', '#ffd200'], ['#8e2de2', '#4a00e0'],
    ['#232526', '#414345'], ['#ee0979', '#ff6a00'],
  ];
  const NUM_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

  // ---------------------------------------------------------------- État
  const defaultSettings = () => ({
    font: 'Montserrat', handle: '@moncompte', accent: '#fe2c55',
    showHandle: true, showProgress: true, transition: 0.35, fps: 30, volume: 0.8,
  });

  let uidCounter = 0;
  const uid = () => 's' + Date.now().toString(36) + (uidCounter++).toString(36);

  function newScene(p = {}) {
    return Object.assign({
      id: uid(), text: 'Ton texte ici', emoji: '', duration: 3,
      anim: 'pop', position: 'center', textStyle: 'box', textSize: 92,
      textColor: '#ffffff', boxColor: '#000000',
      bgType: 'gradient', color1: '#fe2c55', color2: '#7a00ff',
      dim: 0.3, kenBurns: true,
    }, p);
  }

  let state = { settings: defaultSettings(), scenes: [] };
  let selectedId = null;
  const media = new Map(); // sceneId -> { kind: 'image'|'video', el, name }
  const music = { buffer: null, name: '' };

  // ---------------------------------------------------------------- DOM
  const $ = (id) => document.getElementById(id);
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');

  // ---------------------------------------------------------------- Utilitaires
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
  const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  function hexToRgba(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  const totalDuration = () => state.scenes.reduce((a, s) => a + Number(s.duration || 0), 0);

  function sceneAt(t) {
    const sc = state.scenes;
    let acc = 0;
    for (let i = 0; i < sc.length; i++) {
      const d = Number(sc[i].duration);
      if (t < acc + d || i === sc.length - 1) return { i, s: sc[i], start: acc, local: t - acc };
      acc += d;
    }
    return null;
  }

  // ---------------------------------------------------------------- Rendu
  function drawCover(c, el, sw, sh, scale) {
    if (!sw || !sh) return;
    const r = Math.max(W / sw, H / sh) * scale;
    const dw = sw * r, dh = sh * r;
    c.drawImage(el, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }

  function drawBackground(c, s, local) {
    const m = media.get(s.id);
    if (s.bgType === 'media' && m) {
      c.fillStyle = '#000';
      c.fillRect(0, 0, W, H);
      const prog = clamp(local / Math.max(0.1, s.duration));
      const scale = s.kenBurns ? 1 + 0.12 * prog : 1;
      if (m.kind === 'image') drawCover(c, m.el, m.el.naturalWidth, m.el.naturalHeight, scale);
      else if (m.el.readyState >= 2) drawCover(c, m.el, m.el.videoWidth, m.el.videoHeight, scale);
      if (s.dim > 0) { c.fillStyle = `rgba(0,0,0,${s.dim})`; c.fillRect(0, 0, W, H); }
      return;
    }
    if (s.bgType === 'color') {
      c.fillStyle = s.color1;
      c.fillRect(0, 0, W, H);
      return;
    }
    // Dégradé animé + halos lumineux qui flottent
    const a = local * 0.35;
    const x0 = W / 2 + Math.cos(a) * W * 0.6, y0 = H / 2 + Math.sin(a) * H * 0.6;
    const g = c.createLinearGradient(x0, y0, W - x0, H - y0);
    g.addColorStop(0, s.color1);
    g.addColorStop(1, s.color2);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.save();
    c.globalCompositeOperation = 'soft-light';
    for (let k = 0; k < 3; k++) {
      const bx = W * (0.5 + 0.4 * Math.sin(local * 0.5 + k * 2.1));
      const by = H * (0.5 + 0.35 * Math.cos(local * 0.4 + k * 1.7));
      const rg = c.createRadialGradient(bx, by, 0, bx, by, W * 0.7);
      rg.addColorStop(0, 'rgba(255,255,255,0.55)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = rg;
      c.fillRect(0, 0, W, H);
    }
    c.restore();
  }

  function layoutText(c, text, maxW) {
    const space = c.measureText(' ').width;
    const lines = [];
    for (const para of String(text).split('\n')) {
      const words = para.split(/\s+/).filter(Boolean);
      let line = [], lw = 0;
      for (const w of words) {
        const ww = c.measureText(w).width;
        if (line.length && lw + space + ww > maxW) { lines.push({ words: line, width: lw }); line = []; lw = 0; }
        lw += (line.length ? space : 0) + ww;
        line.push({ text: w, w: ww });
      }
      lines.push({ words: line, width: lw });
    }
    return { lines, space };
  }

  function fontString(size) {
    const f = state.settings.font;
    const weight = (f === 'Anton' || f === 'Bebas Neue') ? 400 : (f === 'Playfair Display' ? 900 : 800);
    return `${weight} ${size}px "${f}", "Montserrat", system-ui, sans-serif`;
  }

  function drawText(c, s, local) {
    const text = (s.text || '').trim();
    if (!text && !s.emoji) return;
    const maxW = W * 0.82;
    let size = Number(s.textSize) || 90;
    c.font = fontString(size);
    let lay = layoutText(c, text, maxW);
    // Ajustement automatique : réduire si trop large ou trop haut
    for (let guard = 0; guard < 30; guard++) {
      const widest = Math.max(0, ...lay.lines.flatMap((l) => l.words.map((w) => w.w)));
      if (widest <= maxW && lay.lines.length * size * 1.25 <= H * 0.55) break;
      size *= 0.92;
      c.font = fontString(size);
      lay = layoutText(c, text, maxW);
    }
    if (!text) lay.lines = [];

    const lineH = size * 1.25;
    const emojiSize = s.emoji ? size * 1.7 : 0;
    const blockH = lay.lines.length * lineH + (s.emoji ? emojiSize * 1.15 : 0);
    const cy = s.position === 'top' ? H * 0.26 : s.position === 'bottom' ? H * 0.68 : H * 0.48;
    let y = cy - blockH / 2;

    // Animation d'entrée (0.55 s)
    const p = clamp(local / 0.55);
    let alpha = 1, scale = 1, dx = 0;
    switch (s.anim) {
      case 'fade': alpha = easeOutCubic(p); break;
      case 'zoom': alpha = easeOutCubic(p); scale = 1.5 - 0.5 * easeOutCubic(p); break;
      case 'slide': alpha = clamp(p * 2); dx = (1 - easeOutCubic(p)) * W * 0.7; break;
      case 'pop': scale = Math.max(0, easeOutBack(p)); alpha = clamp(p * 3); break;
      default: break;
    }
    // Révélation progressive
    const allWords = lay.lines.reduce((a, l) => a + l.words.length, 0);
    const allChars = lay.lines.reduce((a, l) => a + l.words.reduce((b, w) => b + w.text.length, 0), 0);
    let visWords = Infinity, visChars = Infinity, curWord = -1;
    if (s.anim === 'typewriter') visChars = Math.floor(allChars * clamp(local / Math.max(0.3, s.duration * 0.6)));
    if (s.anim === 'words') {
      const span = Math.max(0.3, s.duration * 0.85);
      const f = clamp(local / span) * allWords;
      visWords = Math.min(allWords, Math.floor(f) + 1);
      curWord = visWords - 1;
    }

    c.save();
    c.globalAlpha *= alpha;
    c.translate(W / 2 + dx, cy);
    c.scale(scale, scale);
    c.translate(-W / 2, -cy);
    c.textBaseline = 'middle';
    c.textAlign = 'left';

    if (s.emoji) {
      c.font = `${emojiSize}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      c.textAlign = 'center';
      const bob = Math.sin(local * 3) * 12;
      c.fillText(s.emoji, W / 2, y + emojiSize / 2 + bob);
      c.textAlign = 'left';
      y += emojiSize * 1.15;
    }

    c.font = fontString(size);
    const accent = state.settings.accent;
    let wordIdx = 0, charIdx = 0;
    for (const line of lay.lines) {
      const ly = y + lineH / 2;
      // Préparer les mots visibles de la ligne
      const items = [];
      let x = W / 2 - line.width / 2;
      for (const w of line.words) {
        let str = w.text;
        if (wordIdx >= visWords) break;
        if (charIdx >= visChars) break;
        if (charIdx + str.length > visChars) str = str.slice(0, visChars - charIdx);
        const ww = str === w.text ? w.w : c.measureText(str).width;
        items.push({ str, x, w: ww, idx: wordIdx });
        x += w.w + lay.space;
        charIdx += w.text.length;
        wordIdx++;
      }
      // Compléter le compteur pour les mots non affichés
      for (let k = items.length; k < line.words.length; k++) { charIdx += line.words[k].text.length; wordIdx++; }

      if (items.length) {
        if (s.textStyle === 'box') {
          const first = items[0], last = items[items.length - 1];
          const padX = size * 0.32, padY = size * 0.12;
          c.fillStyle = hexToRgba(s.boxColor, 0.72);
          roundRect(c, first.x - padX, ly - lineH / 2 + padY * 0.3, last.x + last.w - first.x + padX * 2, lineH - padY * 0.6, size * 0.25);
          c.fill();
        }
        for (const it of items) {
          const isCur = it.idx === curWord;
          if (isCur) {
            c.fillStyle = accent;
            roundRect(c, it.x - size * 0.14, ly - size * 0.62, it.w + size * 0.28, size * 1.24, size * 0.2);
            c.fill();
          }
          c.save();
          if (s.textStyle === 'outline') {
            c.lineWidth = size * 0.14;
            c.lineJoin = 'round';
            c.strokeStyle = '#000';
            c.strokeText(it.str, it.x, ly);
          } else if (s.textStyle === 'shadow') {
            c.shadowColor = 'rgba(0,0,0,0.75)';
            c.shadowBlur = size * 0.35;
            c.shadowOffsetY = size * 0.06;
          }
          c.fillStyle = s.textColor;
          c.fillText(it.str, it.x, ly);
          c.restore();
        }
      }
      y += lineH;
    }
    c.restore();
  }

  function drawOverlays(c, t, total) {
    const st = state.settings;
    if (st.showProgress && total > 0) {
      c.fillStyle = 'rgba(255,255,255,0.25)';
      c.fillRect(0, 0, W, 12);
      c.fillStyle = st.accent;
      c.fillRect(0, 0, W * clamp(t / total), 12);
    }
    if (st.showHandle && st.handle) {
      c.save();
      c.font = `700 46px "Montserrat", system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.shadowColor = 'rgba(0,0,0,0.6)';
      c.shadowBlur = 12;
      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.fillText(st.handle, W / 2, H - 300);
      c.restore();
    }
  }

  function drawFrame(c, t) {
    c.save();
    c.globalAlpha = 1;
    c.fillStyle = '#000';
    c.fillRect(0, 0, W, H);
    const total = totalDuration();
    const cur = sceneAt(t);
    if (!cur) {
      drawBackground(c, newScene({ id: '_' }), t);
      c.font = fontString(70);
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      c.fillText('Ajoute une scène ✨', W / 2, H / 2);
      c.restore();
      return;
    }
    const { i, s, local } = cur;
    drawBackground(c, s, local);
    // Transition : fondu vers l'arrière-plan de la scène suivante
    const next = state.scenes[i + 1];
    const tr = Math.min(Number(state.settings.transition) || 0, s.duration / 2);
    const remain = s.duration - local;
    drawText(c, s, local);
    if (next && tr > 0 && remain < tr) {
      c.save();
      c.globalAlpha = clamp(1 - remain / tr);
      drawBackground(c, next, 0);
      c.restore();
    }
    drawOverlays(c, t, total);
    c.restore();
  }

  // ---------------------------------------------------------------- Lecture
  let playing = false, startPerf = 0, current = 0, rafId = 0;
  let audioCtx = null, musicSrc = null, musicGain = null;
  let exportCtl = null; // { recorder, dest }

  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function startMusic(offset, extraDest) {
    stopMusic();
    if (!music.buffer) return;
    const ac = ensureAudio();
    musicSrc = ac.createBufferSource();
    musicSrc.buffer = music.buffer;
    musicSrc.loop = true;
    musicGain = ac.createGain();
    const vol = Number(state.settings.volume);
    const total = totalDuration();
    const now = ac.currentTime;
    musicGain.gain.setValueAtTime(vol, now);
    const fadeStart = Math.max(0, total - offset - 1.2);
    if (total - offset > 0.2) {
      musicGain.gain.setValueAtTime(vol, now + fadeStart);
      musicGain.gain.linearRampToValueAtTime(0, now + (total - offset));
    }
    musicSrc.connect(musicGain);
    musicGain.connect(ac.destination);
    if (extraDest) musicGain.connect(extraDest);
    musicSrc.start(0, offset % music.buffer.duration);
  }
  function stopMusic() {
    if (musicSrc) { try { musicSrc.stop(); } catch (e) { /* déjà arrêté */ } musicSrc.disconnect(); }
    if (musicGain) musicGain.disconnect();
    musicSrc = musicGain = null;
  }

  // Synchronise les vidéos d'arrière-plan avec le temps courant
  function syncVideos(t, isPlaying) {
    const cur = sceneAt(t);
    const activeIds = new Set();
    if (cur) {
      activeIds.add(cur.s.id);
      const next = state.scenes[cur.i + 1];
      if (next) activeIds.add(next.id);
    }
    let acc = 0;
    for (const s of state.scenes) {
      const m = media.get(s.id);
      if (m && m.kind === 'video' && s.bgType === 'media') {
        const v = m.el;
        const local = Math.max(0, t - acc);
        const dur = v.duration || 1;
        const want = local % dur;
        if (activeIds.has(s.id) && cur && cur.s.id === s.id) {
          if (isPlaying) {
            if (v.paused) { v.currentTime = want; v.play().catch(() => {}); }
            else if (Math.abs(v.currentTime - want) > 0.35) v.currentTime = want;
          } else {
            if (!v.paused) v.pause();
            if (Math.abs(v.currentTime - want) > 0.05) v.currentTime = want;
          }
        } else if (activeIds.has(s.id)) {
          if (!v.paused) v.pause();
          if (v.currentTime > 0.05) v.currentTime = 0;
        } else if (!v.paused) v.pause();
      }
      acc += Number(s.duration);
    }
  }

  function render() {
    drawFrame(ctx, current);
    updateTimeUI();
  }

  function play(extraDest) {
    const total = totalDuration();
    if (!total) return;
    if (current >= total - 0.01) current = 0;
    playing = true;
    startPerf = performance.now() - current * 1000;
    startMusic(current, extraDest);
    $('btnPlay').textContent = '❚❚';
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function pause() {
    playing = false;
    cancelAnimationFrame(rafId);
    stopMusic();
    syncVideos(current, false);
    $('btnPlay').textContent = '▶';
  }

  function tick() {
    if (!playing) return;
    const total = totalDuration();
    current = (performance.now() - startPerf) / 1000;
    if (current >= total) {
      current = total;
      syncVideos(Math.max(0, total - 0.001), true);
      drawFrame(ctx, Math.max(0, total - 0.001));
      updateTimeUI();
      pause();
      if (exportCtl) finishExport();
      else { current = previewStart(); render(); }
      return;
    }
    syncVideos(current, true);
    render();
    if (exportCtl) $('exportBar').style.width = (100 * current / total).toFixed(1) + '%';
    rafId = requestAnimationFrame(tick);
  }

  function seek(t) {
    current = clamp(t, 0, totalDuration());
    if (playing) { pause(); play(); } else { syncVideos(current, false); render(); }
  }

  function updateTimeUI() {
    const total = totalDuration();
    const seekEl = $('seek');
    seekEl.max = total || 1;
    seekEl.value = current;
    $('timeLabel').textContent = `${current.toFixed(1)} / ${total.toFixed(1)} s`;
    const cur = sceneAt(current);
    document.querySelectorAll('.scene-item').forEach((el) => {
      el.classList.toggle('playing', !!cur && el.dataset.id === cur.s.id);
    });
  }

  // ---------------------------------------------------------------- Export
  function pickMime() {
    const list = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,opus', 'video/mp4',
      'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm',
    ];
    return list.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  }

  function startExport() {
    if (exportCtl) return;
    if (!state.scenes.length) { alert('Ajoute au moins une scène avant d\'exporter.'); return; }
    if (!window.MediaRecorder || !canvas.captureStream) {
      alert('Ton navigateur ne permet pas l\'enregistrement vidéo. Utilise Chrome, Edge ou Firefox récent.');
      return;
    }
    pause();
    const fps = Number(state.settings.fps) || 30;
    const stream = canvas.captureStream(fps);
    let dest = null;
    if (music.buffer) {
      const ac = ensureAudio();
      dest = ac.createMediaStreamDestination();
      dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    }
    const mimeType = pickMime();
    let recorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: fps > 30 ? 14e6 : 9e6, audioBitsPerSecond: 192000 });
    } catch (e) {
      recorder = new MediaRecorder(stream);
    }
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      const type = recorder.mimeType || mimeType || 'video/webm';
      const blob = new Blob(chunks, { type });
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      const url = URL.createObjectURL(blob);
      const vid = $('resultVideo');
      vid.src = url; vid.hidden = false;
      const a = $('downloadLink');
      a.href = url; a.download = `tiktok-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`;
      a.textContent = `Télécharger (${ext.toUpperCase()}, ${(blob.size / 1048576).toFixed(1)} Mo)`;
      a.hidden = false;
      $('exportStatus').textContent = ext === 'webm'
        ? '✅ Vidéo prête (WebM). TikTok accepte le MP4 : convertis-la si besoin (voir README).'
        : '✅ Vidéo prête ! Tu peux la publier sur TikTok.';
      $('exportBar').style.width = '100%';
      stream.getTracks().forEach((tr) => tr.stop());
      window.__lastExport = { size: blob.size, type };
    };

    exportCtl = { recorder, dest };
    $('exportBox').hidden = false;
    $('resultVideo').hidden = true;
    $('downloadLink').hidden = true;
    $('exportBar').style.width = '0%';
    $('exportStatus').textContent = `⏺ Enregistrement en cours (${totalDuration().toFixed(1)} s)… garde cet onglet visible.`;
    $('btnExport').disabled = true;
    setControlsLocked(true);

    current = 0;
    drawFrame(ctx, 0);
    recorder.start(250);
    play(dest);
  }

  function finishExport() {
    const ctl = exportCtl;
    exportCtl = null;
    $('btnExport').disabled = false;
    setControlsLocked(false);
    $('exportStatus').textContent = 'Finalisation…';
    // Laisser passer une dernière image avant d'arrêter
    setTimeout(() => { if (ctl.recorder.state !== 'inactive') ctl.recorder.stop(); current = previewStart(); render(); }, 150);
  }

  function setControlsLocked(locked) {
    ['btnPlay', 'seek', 'btnGenerate', 'btnAddScene', 'btnNew'].forEach((id) => { $(id).disabled = locked; });
  }

  // ---------------------------------------------------------------- Générateur
  function autoDuration(text) {
    const words = String(text).split(/\s+/).filter(Boolean).length;
    return Math.round(clamp(1.6 + words * 0.38, 2, 8) * 2) / 2;
  }

  function generate() {
    const raw = $('gScript').value.trim();
    const tpl = $('gTemplate').value;
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) {
      $('gScript').value = SAMPLES[tpl];
      return generate();
    }
    const scenes = [];
    const pal = (k) => PALETTES[k % PALETTES.length];

    if (tpl === 'top') {
      const [title, ...items] = lines;
      scenes.push(newScene({ text: title, emoji: '🏆', duration: 3, anim: 'zoom', textSize: 110, textStyle: 'outline', color1: '#111111', color2: state.settings.accent }));
      const n = items.length;
      items.forEach((it, k) => {
        const rank = n - k; // compte à rebours
        const [c1, c2] = pal(k + 1);
        scenes.push(newScene({ text: `N°${rank}\n${it}`, emoji: NUM_EMOJI[rank - 1] || '⭐', duration: autoDuration(it) + 0.5, anim: k % 2 ? 'slide' : 'pop', textSize: 96, color1: c1, color2: c2 }));
      });
    } else if (tpl === 'facts') {
      scenes.push(newScene({ text: 'Le savais-tu ?', emoji: '🤯', duration: 2.5, anim: 'pop', textSize: 120, textStyle: 'outline', color1: '#0f0c29', color2: '#302b63' }));
      lines.forEach((l, k) => {
        const [c1, c2] = pal(k + 1);
        scenes.push(newScene({ text: l, emoji: ['💡', '🧠', '👀', '🔥', '⚡'][k % 5], duration: autoDuration(l), anim: 'typewriter', textSize: 84, color1: c1, color2: c2 }));
      });
    } else if (tpl === 'quote') {
      lines.forEach((l, k) => {
        const isAuthor = k === lines.length - 1 && lines.length > 1 && /^[-—–]/.test(l);
        scenes.push(newScene({ text: isAuthor ? l : `« ${l} »`, duration: isAuthor ? 2.5 : autoDuration(l) + 1, anim: 'fade', textStyle: 'shadow', textSize: isAuthor ? 70 : 88, color1: '#141e30', color2: '#243b55' }));
      });
    } else if (tpl === 'story') {
      lines.forEach((l, k) => {
        scenes.push(newScene({ text: l, duration: autoDuration(l) + 0.5, anim: 'words', textStyle: 'outline', textSize: 100, position: 'center', bgType: 'gradient', color1: k % 2 ? '#1f1c2c' : '#232526', color2: k % 2 ? '#928dab' : '#414345' }));
      });
    } else {
      lines.forEach((l, k) => {
        const [c1, c2] = pal(k);
        scenes.push(newScene({ text: l, duration: autoDuration(l), anim: ['pop', 'slide', 'zoom', 'fade'][k % 4], color1: c1, color2: c2 }));
      });
    }

    if ($('gOutro').checked) {
      scenes.push(newScene({ text: `Abonne-toi pour plus !\n${state.settings.handle || ''}`.trim(), emoji: '🔔', duration: 2.5, anim: 'pop', textSize: 90, color1: state.settings.accent, color2: '#25f4ee' }));
    }

    if ($('gReplace').checked) { state.scenes = scenes; media.clear(); }
    else state.scenes.push(...scenes);
    selectedId = scenes[0].id;
    pause();
    current = previewStart();
    refreshAll();
  }

  const SAMPLES = {
    auto: 'Tu fais encore cette erreur ?\nArrête de scroller 2 secondes\nVoici l\'astuce qui change tout\nEssaie dès aujourd\'hui !',
    top: 'Top 5 des villes à visiter en France\nBordeaux\nAnnecy\nLyon\nMarseille\nParis',
    facts: 'Les pieuvres ont trois cœurs.\nUn nuage pèse en moyenne 500 tonnes.\nLe miel ne se périme jamais.',
    quote: 'Le succès, c\'est tomber sept fois et se relever huit.\n— Proverbe japonais',
    story: 'Hier, j\'ai reçu un message bizarre…\nUn inconnu me disait de regarder par la fenêtre\nEt là, j\'ai vu quelque chose d\'incroyable\nLa suite dans la partie 2 !',
  };

  // ---------------------------------------------------------------- UI : scènes
  const selected = () => state.scenes.find((s) => s.id === selectedId) || null;

  function renderSceneList() {
    const ol = $('sceneList');
    ol.innerHTML = '';
    state.scenes.forEach((s, idx) => {
      const li = document.createElement('li');
      li.className = 'scene-item' + (s.id === selectedId ? ' active' : '');
      li.dataset.id = s.id;
      const thumb = document.createElement('div');
      thumb.className = 'scene-thumb';
      const m = media.get(s.id);
      if (s.bgType === 'media' && m && m.kind === 'image') thumb.style.backgroundImage = `url("${m.el.src}")`;
      else if (s.bgType === 'color') thumb.style.background = s.color1;
      else if (s.bgType === 'media' && m) thumb.style.background = '#222';
      else thumb.style.background = `linear-gradient(135deg, ${s.color1}, ${s.color2})`;
      thumb.textContent = s.bgType === 'media' && m && m.kind === 'video' ? '🎬' : (s.emoji || '');
      const info = document.createElement('div');
      info.className = 'scene-info';
      const tt = document.createElement('div');
      tt.className = 't';
      tt.textContent = `${idx + 1}. ${(s.text || '(sans texte)').replace(/\n/g, ' ')}`;
      const dd = document.createElement('div');
      dd.className = 'd';
      dd.textContent = `${Number(s.duration).toFixed(1)} s · ${$('sAnim').querySelector(`option[value="${s.anim}"]`)?.textContent || s.anim}`;
      info.append(tt, dd);
      const tools = document.createElement('div');
      tools.className = 'scene-tools';
      const mk = (label, title, fn) => {
        const b = document.createElement('button');
        b.textContent = label; b.title = title;
        b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
        return b;
      };
      tools.append(
        mk('▲', 'Monter', () => moveScene(idx, -1)),
        mk('▼', 'Descendre', () => moveScene(idx, 1)),
        mk('⧉', 'Dupliquer', () => duplicateScene(idx)),
        mk('✕', 'Supprimer', () => deleteScene(idx)),
      );
      li.append(thumb, info, tools);
      li.addEventListener('click', () => {
        selectedId = s.id;
        refreshSceneUI();
        // Aller au début de la scène
        let acc = 0;
        for (let k = 0; k < idx; k++) acc += Number(state.scenes[k].duration);
        seek(acc + Math.min(0.6, s.duration / 2));
      });
      ol.appendChild(li);
    });
  }

  function moveScene(idx, dir) {
    const j = idx + dir;
    if (j < 0 || j >= state.scenes.length) return;
    const arr = state.scenes;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    refreshAll();
  }
  function duplicateScene(idx) {
    const src = state.scenes[idx];
    const copy = newScene({ ...src, id: uid() });
    if (media.has(src.id)) media.set(copy.id, media.get(src.id));
    state.scenes.splice(idx + 1, 0, copy);
    selectedId = copy.id;
    refreshAll();
  }
  function deleteScene(idx) {
    const [removed] = state.scenes.splice(idx, 1);
    media.delete(removed.id);
    if (selectedId === removed.id) selectedId = state.scenes[Math.min(idx, state.scenes.length - 1)]?.id || null;
    current = Math.min(current, totalDuration());
    refreshAll();
  }

  const FIELDS = {
    sText: 'text', sEmoji: 'emoji', sDuration: 'duration', sAnim: 'anim', sPosition: 'position',
    sTextStyle: 'textStyle', sTextSize: 'textSize', sTextColor: 'textColor', sBoxColor: 'boxColor',
    sBgType: 'bgType', sColor1: 'color1', sColor2: 'color2', sDim: 'dim', sKenBurns: 'kenBurns',
  };
  const NUMERIC = new Set(['duration', 'textSize', 'dim']);

  function fillEditor() {
    const s = selected();
    $('sceneEditor').classList.toggle('disabled', !s);
    if (!s) return;
    for (const [id, key] of Object.entries(FIELDS)) {
      const el = $(id);
      if (el.type === 'checkbox') el.checked = !!s[key];
      else el.value = s[key];
    }
    const m = media.get(s.id);
    $('sMediaName').textContent = m ? m.name : (s.mediaName ? `${s.mediaName} (à recharger)` : 'Aucun fichier');
    updateEditorVisibility();
  }

  function updateEditorVisibility() {
    const s = selected();
    if (!s) return;
    const isMedia = s.bgType === 'media';
    $('mediaRow').style.display = isMedia ? '' : 'none';
    $('mediaOpts').style.display = isMedia ? '' : 'none';
    $('sColor2').style.display = s.bgType === 'gradient' ? '' : 'none';
    $('sColor1').parentElement.parentElement.style.display = isMedia ? 'none' : '';
  }

  function bindEditor() {
    for (const [id, key] of Object.entries(FIELDS)) {
      const el = $(id);
      const ev = (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'color') ? 'change' : 'input';
      const handler = () => {
        const s = selected();
        if (!s) return;
        let v = el.type === 'checkbox' ? el.checked : el.value;
        if (NUMERIC.has(key)) {
          v = parseFloat(v);
          if (!isFinite(v)) return;
          if (key === 'duration') v = clamp(v, 0.5, 60);
        }
        s[key] = v;
        if (key === 'bgType') updateEditorVisibility();
        renderSceneList();
        if (!playing) { syncVideos(current, false); render(); }
        else updateTimeUI();
        persist();
      };
      el.addEventListener(ev, handler);
      if (el.type === 'color') el.addEventListener('input', handler);
    }

    $('sMedia').addEventListener('change', (e) => {
      const file = e.target.files[0];
      const s = selected();
      e.target.value = '';
      if (!file || !s) return;
      loadMediaFile(file, s);
    });
  }

  function loadMediaFile(file, s) {
    const url = URL.createObjectURL(file);
    const done = (entry) => {
      media.set(s.id, entry);
      s.bgType = 'media';
      s.mediaName = file.name;
      // Pour une vidéo, ajuster la durée de la scène si elle est plus courte
      if (entry.kind === 'video' && entry.el.duration && isFinite(entry.el.duration) && entry.el.duration < s.duration) {
        s.duration = Math.max(0.5, Math.round(entry.el.duration * 2) / 2);
      }
      refreshAll();
    };
    if (file.type.startsWith('video/')) {
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
      v.src = url;
      v.addEventListener('loadeddata', () => done({ kind: 'video', el: v, name: file.name }), { once: true });
      v.addEventListener('seeked', () => { if (!playing) render(); });
      v.addEventListener('error', () => alert('Impossible de lire cette vidéo.'), { once: true });
    } else {
      const img = new Image();
      img.onload = () => done({ kind: 'image', el: img, name: file.name });
      img.onerror = () => alert('Impossible de lire cette image.');
      img.src = url;
    }
  }

  // ---------------------------------------------------------------- UI : réglages
  const CFG = {
    cfgFont: 'font', cfgHandle: 'handle', cfgAccent: 'accent', cfgShowHandle: 'showHandle',
    cfgShowProgress: 'showProgress', cfgTransition: 'transition', cfgFps: 'fps', cfgVolume: 'volume',
  };

  function fillSettings() {
    for (const [id, key] of Object.entries(CFG)) {
      const el = $(id);
      if (el.type === 'checkbox') el.checked = !!state.settings[key];
      else el.value = state.settings[key];
    }
    $('musicName').textContent = music.name || (state.settings.musicName ? `${state.settings.musicName} (à recharger)` : 'Aucune musique');
    $('btnRemoveMusic').hidden = !music.buffer;
  }

  function bindSettings() {
    for (const [id, key] of Object.entries(CFG)) {
      const el = $(id);
      const ev = (el.tagName === 'SELECT' || el.type === 'checkbox') ? 'change' : 'input';
      el.addEventListener(ev, () => {
        let v = el.type === 'checkbox' ? el.checked : el.value;
        if (['transition', 'fps', 'volume'].includes(key)) { v = parseFloat(v); if (!isFinite(v)) return; }
        state.settings[key] = v;
        if (key === 'volume' && musicGain && audioCtx) musicGain.gain.setValueAtTime(v, audioCtx.currentTime);
        if (key === 'font') document.fonts.load(fontString(80)).then(render, render);
        if (!playing) render();
        persist();
      });
    }

    $('cfgMusic').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const ac = ensureAudio();
        const buf = await file.arrayBuffer();
        music.buffer = await ac.decodeAudioData(buf);
        music.name = file.name;
        state.settings.musicName = file.name;
        fillSettings();
        persist();
        if (playing) { pause(); play(); }
      } catch (err) {
        alert('Impossible de lire ce fichier audio.');
      }
    });
    $('btnRemoveMusic').addEventListener('click', () => {
      stopMusic();
      music.buffer = null; music.name = '';
      delete state.settings.musicName;
      fillSettings();
      persist();
    });
  }

  // ---------------------------------------------------------------- Persistance
  let persistTimer = 0;
  function persist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* stockage indisponible */ }
    }, 300);
  }
  function loadProject(obj) {
    if (!obj || !Array.isArray(obj.scenes)) throw new Error('Projet invalide');
    state = {
      settings: Object.assign(defaultSettings(), obj.settings || {}),
      scenes: obj.scenes.map((s) => newScene({ ...s, id: s.id || uid() })),
    };
    media.clear();
    selectedId = state.scenes[0]?.id || null;
    current = 0;
  }

  // Moment d'aperçu par défaut : après l'animation d'entrée de la 1re scène
  const previewStart = () => Math.min(0.7, totalDuration() / 2);

  function refreshSceneUI() { renderSceneList(); fillEditor(); }
  function refreshAll() {
    refreshSceneUI();
    fillSettings();
    if (!playing) { syncVideos(current, false); render(); }
    persist();
  }

  // ---------------------------------------------------------------- Initialisation
  function init() {
    let restored = false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { loadProject(JSON.parse(raw)); restored = state.scenes.length > 0; }
    } catch (e) { /* ignorer */ }
    if (!restored) {
      $('gTemplate').value = 'top';
      $('gScript').value = SAMPLES.top;
      bindOnce();
      generate();
    } else bindOnce();
    current = previewStart();
    refreshAll();
    document.fonts && document.fonts.ready.then(render);
    // Recharger les polices une fois disponibles
    ['Montserrat', 'Poppins', 'Anton', 'Bebas Neue', 'Playfair Display'].forEach((f) => {
      document.fonts && document.fonts.load(`800 80px "${f}"`).then(render, () => {});
    });
  }

  let bound = false;
  function bindOnce() {
    if (bound) return;
    bound = true;
    bindEditor();
    bindSettings();

    $('btnAddScene').addEventListener('click', () => {
      const prev = selected() || state.scenes[state.scenes.length - 1];
      const [c1, c2] = PALETTES[state.scenes.length % PALETTES.length];
      const s = newScene(prev ? { ...prev, id: uid(), text: 'Nouvelle scène', emoji: '', bgType: prev.bgType === 'media' ? 'gradient' : prev.bgType, color1: c1, color2: c2 } : {});
      delete s.mediaName;
      const idx = prev ? state.scenes.indexOf(prev) + 1 : state.scenes.length;
      state.scenes.splice(idx, 0, s);
      selectedId = s.id;
      refreshAll();
      $('sText').focus();
      $('sText').select();
    });

    $('btnPlay').addEventListener('click', () => { ensureAudio(); playing ? pause() : play(); });
    $('seek').addEventListener('input', (e) => seek(parseFloat(e.target.value)));
    $('btnGenerate').addEventListener('click', generate);
    $('gTemplate').addEventListener('change', () => {
      const cur = $('gScript').value.trim();
      if (!cur || Object.values(SAMPLES).includes(cur)) $('gScript').value = SAMPLES[$('gTemplate').value];
    });
    $('btnExport').addEventListener('click', () => { ensureAudio(); startExport(); });

    $('btnCover').addEventListener('click', () => {
      canvas.toBlob((b) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = 'tiktok-cover.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }, 'image/png');
    });

    $('btnNew').addEventListener('click', () => {
      if (!confirm('Commencer un nouveau projet ? Les scènes actuelles seront effacées.')) return;
      pause();
      state = { settings: { ...state.settings }, scenes: [newScene()] };
      media.clear();
      selectedId = state.scenes[0].id;
      current = 0;
      refreshAll();
    });

    $('btnSaveJson').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'projet-tiktok.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
    $('inpLoadJson').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        pause();
        loadProject(JSON.parse(await file.text()));
        refreshAll();
      } catch (err) {
        alert('Fichier de projet invalide.');
      }
    });

    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag) || exportCtl) return;
      if (e.code === 'Space') { e.preventDefault(); ensureAudio(); playing ? pause() : play(); }
    });
  }

  // Exposé pour les tests automatisés
  window.VidoTikTok = { get state() { return state; }, drawFrame: (t) => drawFrame(ctx, t), totalDuration, startExport, generate };

  init();
})();
