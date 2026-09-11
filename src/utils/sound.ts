// src/utils/sound.ts — Web Audio API bildirim sesleri
export function playNotificationSound(choice: string = 'chirp') {
  if (!choice || choice === 'none') return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (choice === 'chirp') {
      // Modern tatlı kuş cıvıltısı
      osc.type = 'sine';
      osc.frequency.setValueAtTime(900, now);
      osc.frequency.exponentialRampToValueAtTime(1500, now + 0.08);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (choice === 'ding') {
      // Klasik kristal çınlama (Crystal Chime)
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1174.66, now); // D6
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc.start(now);
      osc.stop(now + 0.6);
    } else if (choice === 'bell') {
      // İki tonlu nazik zil (Two-tone Bell)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now); // E5
      osc.frequency.setValueAtTime(880, now + 0.12); // A5
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
      osc.start(now);
      osc.stop(now + 0.5);
    }
  } catch (err) {
    console.warn('[sound] Bildirim sesi çalınamadı:', err);
  }
}
