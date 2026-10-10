// @vitest-environment jsdom
// src/components/__smoke.test.tsx — altyapı doğrulaması: jsdom + React
// Testing Library kurulumu gerçekten çalışıyor mu? Bileşen mantığı değil,
// ortamın sağlığı test edilir. Bileşen testleri eklendikçe bu dosya kaldırılabilir.
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';

function Probe({ label }: { label: string }) {
  const [n, setN] = useState(0);
  return (
    <button type="button" onClick={() => setN((v) => v + 1)}>
      {label}: {n}
    </button>
  );
}

describe('test altyapısı', () => {
  it('jsdom ortamı sağlıklı', () => {
    expect(typeof document).toBe('object');
    expect(document.createElement('div')).toBeTruthy();
  });

  it('React bileşeni render eder ve etkileşir', () => {
    render(<Probe label="Sayac" />);
    const btn = screen.getByRole('button', { name: /Sayac: 0/ });
    expect(btn).toBeTruthy();
    // React 19 olay güncellemelerini batch'ler; act() olmadan DOM güncellenmez
    act(() => {
      btn.click();
    });
    expect(screen.getByRole('button', { name: /Sayac: 1/ })).toBeTruthy();
  });

  it('localStorage erişilebilir (themeStore testleri buna bağlı)', () => {
    localStorage.setItem('probe', 'x');
    expect(localStorage.getItem('probe')).toBe('x');
    localStorage.removeItem('probe');
  });
});