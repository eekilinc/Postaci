// @vitest-environment jsdom
// src/hooks/useComposeDraft.test.tsx — yazma penceresi taslak durumu.
//
// App.tsx bu durumu 10 ayrı useState olarak tutuyordu ve ComposeModal bunu
// props olarak alıyordu. Hook'a taşındı; bu test, taşıma SONRASI davranışın
// aynı kaldığını sabitler: alan güncelleme, temizleme (gönderim sonrası) ve
// yarım taslağın geri yüklenmesi.
import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useComposeDraft } from './useComposeDraft';

describe('useComposeDraft', () => {
  beforeEach(() => localStorage.clear());

  it('boş bir taslakla başlar', () => {
    const { result } = renderHook(() => useComposeDraft());
    expect(result.current.draft.to).toBe('');
    expect(result.current.draft.subject).toBe('');
    expect(result.current.draft.text).toBe('');
    expect(result.current.draft.files).toEqual([]);
    expect(result.current.draft.inReplyTo).toBeUndefined();
  });

  it('setField tek alanı günceller', () => {
    const { result } = renderHook(() => useComposeDraft());
    act(() => result.current.setField('subject', 'Toplantı'));
    expect(result.current.draft.subject).toBe('Toplantı');
    act(() => result.current.setField('to', 'ali@x.com'));
    expect(result.current.draft.to).toBe('ali@x.com');
    // İlgisiz alanlar bozulmamalı
    expect(result.current.draft.subject).toBe('Toplantı');
  });

  it('clear gönderim sonrası alanları sıfırlar', () => {
    const { result } = renderHook(() => useComposeDraft());
    act(() => result.current.setField('to', 'ali@x.com'));
    act(() => result.current.setField('subject', 'Test'));
    act(() => result.current.setField('text', 'Merhaba'));
    act(() => result.current.setField('inReplyTo', 'msg-1'));

    act(() => result.current.clear());

    expect(result.current.draft.to).toBe('');
    expect(result.current.draft.subject).toBe('');
    expect(result.current.draft.text).toBe('');
    expect(result.current.draft.files).toEqual([]);
    expect(result.current.draft.inReplyTo).toBeUndefined();
    expect(result.current.draft.references).toBeUndefined();
  });

  it('from alanı clear sonrası da korunur (gönderen seçili kalır)', () => {
    // Gönderimde fromEmail: cFrom || activeAccount — yani from temizlenmez,
    // aksi halde ikinci e-posta farklı hesaptan giderdi.
    const { result } = renderHook(() => useComposeDraft());
    act(() => result.current.setField('from', 'ben@x.com'));
    act(() => result.current.clear());
    expect(result.current.draft.from).toBe('ben@x.com');
  });

  it('replace ile tüm taslak birden yüklenir (yanıt/ileri şablonu)', () => {
    const { result } = renderHook(() => useComposeDraft());
    act(() =>
      result.current.replace({
        to: 'bob@y.com',
        subject: 'Re: Konu',
        text: 'Merhaba Bob',
        inReplyTo: 'orig-1',
        references: ['ref-1'],
      })
    );
    expect(result.current.draft.to).toBe('bob@y.com');
    expect(result.current.draft.subject).toBe('Re: Konu');
    expect(result.current.draft.inReplyTo).toBe('orig-1');
    expect(result.current.draft.references).toEqual(['ref-1']);
  });

  it('yarım taslak localStoragea yazılır', () => {
    const { result } = renderHook(() => useComposeDraft());
    act(() => result.current.setField('subject', 'Yarım kaldı'));
    act(() => result.current.setField('text', 'Devam edeceğim'));

    const raw = localStorage.getItem('postaci_active_draft');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).subject).toBe('Yarım kaldı');
    expect(JSON.parse(raw!).text).toBe('Devam edeceğim');
  });

  it('restoreSaved yalnızca dolu taslak varsa geri yükler', () => {
    // Gerçek davranış: taslak uygulama açılışında değil, compose penceresi
    // açılırken geri yüklenir. Hook bu yüzden otomatik yüklemez.
    const { result } = renderHook(() => useComposeDraft());
    act(() => result.current.setField('subject', 'Yarım kaldı'));
    act(() => result.current.setField('text', 'Devam edeceğim'));

    const { result: fresh } = renderHook(() => useComposeDraft());
    expect(fresh.current.draft.subject).toBe('');
    act(() => {
      fresh.current.restoreSaved();
    });
    expect(fresh.current.draft.subject).toBe('Yarım kaldı');
    expect(fresh.current.draft.text).toBe('Devam edeceğim');
  });

  it('restoreSaved boş şablonda hiçbir şey yapmaz', () => {
    const { result } = renderHook(() => useComposeDraft());
    act(() => {
      expect(result.current.restoreSaved()).toBe(false);
    });
    expect(result.current.draft.subject).toBe('');
  });

  it('clear yarım taslağı da temizler', () => {
    const { result } = renderHook(() => useComposeDraft());
    act(() => result.current.setField('subject', 'Silinecek'));
    act(() => result.current.clear());
    expect(localStorage.getItem('postaci_active_draft')).toBeNull();
  });

  it('bozuk localStorage verisi çökertmez', () => {
    localStorage.setItem('postaci_active_draft', '{bozuk json');
    expect(() => renderHook(() => useComposeDraft())).not.toThrow();
    const { result } = renderHook(() => useComposeDraft());
    expect(result.current.draft.subject).toBe('');
  });
});