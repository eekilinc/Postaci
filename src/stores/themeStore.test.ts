// src/stores/themeStore.test.ts — store geçişleri (DOM'suz)
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useThemeStore } from './themeStore';

function mockStorage(initial: Record<string, string> = {}) {
  let data = { ...initial };
  const stub = {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
    clear: () => {
      data = {};
    },
    get __data() {
      return data;
    },
  };
  vi.stubGlobal('localStorage', stub);
  return stub;
}

describe('themeStore', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mockStorage();
    useThemeStore.setState({
      theme: 'system',
      accent: 'blue',
      oledMode: false,
    });
  });

  it('varsayılanlar system/blue/kapalı', () => {
    const s = useThemeStore.getState();
    expect(s.theme).toBe('system');
    expect(s.accent).toBe('blue');
    expect(s.oledMode).toBe(false);
  });

  it('setTheme/accent/oledMode durumu günceller', () => {
    useThemeStore.getState().setTheme('dark');
    useThemeStore.getState().setAccent('green');
    useThemeStore.getState().setOledMode(true);
    const s = useThemeStore.getState();
    expect(s.theme).toBe('dark');
    expect(s.accent).toBe('green');
    expect(s.oledMode).toBe(true);
  });
});
