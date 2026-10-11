// src/hooks/useFocusTrap.ts — modal odak tuzağı (erişilebilirlik).
//
// Ekran okuyucular ve klavye kullanıcıları için: modal açıkken Tab/Shift+Tab
// modalin DIŞINA kaçmaz; açılışta odak modalin ilk odaklanabilir öğesine
// geçer, kapanınca tetikleyen öğeye geri döner. Esc davranışı çağıranlara aittir
// (mevcut modaller zaten kapatma işlemini Esc ile yapıyor).
//
// Not: görünürlük filtresi yok — display:none öğeler querySelector'da yer alsa
// da focus() onlara atlanamaz ve tuzak yine doğru sarmalanır (jsdom testlerinde
// offsetParent zaten her zaman null olduğu için filtre test edilemezdi).
import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap<T extends HTMLElement>(
  ref: RefObject<T | null>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // İlk odak: varsa ilk odaklanabilir öğe, yoksa konteyner
    const focusables = el.querySelectorAll<HTMLElement>(FOCUSABLE);
    (focusables[0] ?? el).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      const inside = current instanceof Node && el.contains(current);
      if (e.shiftKey) {
        // Geri sarma: ilk öğedeyken Shift+Tab -> son öğeye
        if (!inside || current === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // İleri sarma: son öğedeyken Tab -> ilk öğeye
        if (!inside || current === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    el.addEventListener('keydown', onKeyDown);
    return () => {
      el.removeEventListener('keydown', onKeyDown);
      // Kapanınca tetikleyen öğeye dön
      previouslyFocused?.focus?.();
    };
  }, [active, ref]);
}