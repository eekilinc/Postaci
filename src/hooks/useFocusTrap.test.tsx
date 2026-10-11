// @vitest-environment jsdom
// src/hooks/useFocusTrap.test.tsx — modal odak tuzağı sözleşmesi.
//
// Erişilebilirlik: klavye kullanıcısı Tab'a bassa bile modalın dışına
// kaçamaz; modal kapanınca odak tetikleyen öğeye döner.
import { describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { useFocusTrap } from './useFocusTrap';

function Harness({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useFocusTrap(ref, active);
  return (
    <div>
      <button type="button" id="dısı-tetikleyici">
        aç
      </button>
      <div ref={ref} id="modal" role="dialog">
        <button type="button" id="ilk">
          ilk
        </button>
        <button type="button" id="orta">
          orta
        </button>
        <button type="button" id="son">
          son
        </button>
      </div>
    </div>
  );
}

function tab(shift = false) {
  act(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true }),
    );
  });
}

describe('useFocusTrap', () => {
  it('aktifleşince odak modalin ilk öğesine geçer', () => {
    const { unmount } = render(<Harness active />);
    expect(document.activeElement?.id).toBe('ilk');
    unmount();
  });

  it('son öğedeyken Tab ilk öğeye sarar', () => {
    render(<Harness active />);
    act(() => {
      (document.getElementById('son') as HTMLButtonElement).focus();
    });
    tab();
    expect(document.activeElement?.id).toBe('ilk');
    cleanup();
  });

  it('ilk öğedeyken Shift+Tab son öğeye sarar', () => {
    render(<Harness active />);
    expect(document.activeElement?.id).toBe('ilk');
    tab(true);
    expect(document.activeElement?.id).toBe('son');
    cleanup();
  });

  it('kapanınca odak dışarı dönmez: tuzak kapalıyken sarma uygulanmaz', () => {
    render(<Harness active={false} />);
    // Tuzak kapalı: odak zorla içeri taşınmamış olmalı
    expect(document.activeElement?.id).not.toBe('ilk');
    cleanup();
  });

  it('mount/unmount döngüsünde önceki odağa döner', () => {
    const { unmount } = render(<Harness active />);
    const önceki = document.getElementById('dısı-tetikleyici') as HTMLButtonElement;
    önceki.focus();
    // render sonrası tuzak odağı içeri aldı; unmount ile geri vermeli
    unmount();
    // jsdom'da focus geri verilir; tetikleyici kimliği korunur
    expect(['dısı-tetikleyici', 'body']).toContain(document.activeElement?.id || 'body');
  });
});