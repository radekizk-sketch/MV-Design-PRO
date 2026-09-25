/**
 * Opis kroku śladu rekordu werdyktu (karta #145) — parytet z KODEM silnika prób NC RfG
 * i iloczyn cech {pochodzenie odnośnika: silnik NC RfG / inny} × {klucz: w mapie / spoza}.
 *
 * Silnik (`network_model/solvers/ncrfg_ptpiree/engine.py`, rdzeń zamrożony) opisuje krok
 * zdaniem z kluczem technicznym, więc ekran składa opis z mapy `NAZWY_KROKOW_NCRFG`. Mapa
 * jest typowana unią, ale typ nie widzi silnika — ten test czyta źródło silnika i wymaga,
 * żeby zbiór kluczy `trace.add(<test>, "<klucz>", …)` był RÓWNY zbiorowi nazwanemu.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { NAZWY_KROKOW_NCRFG, opisOdnosnikaSladu } from '../opisKrokuSladu';

const SILNIK = join(
  process.cwd(),
  '..',
  'backend',
  'src',
  'network_model',
  'solvers',
  'ncrfg_ptpiree',
  'engine.py',
);

function odnosnik(krok: string, opis_pl: string) {
  return { krok, opis_pl, run_id: null, wersja_silnika: null };
}

describe('opisOdnosnikaSladu — kroki silnika prób NC RfG', () => {
  it('każdy klucz kroku silnika ma polską nazwę i każda nazwa ma klucz (parytet z kodem)', () => {
    const zrodlo = readFileSync(SILNIK, 'utf-8');
    const zSilnika = new Set(
      [...zrodlo.matchAll(/\.add\(\s*[a-z_.]+,\s*"([a-z0-9_]+)"/g)].map((m) => m[1]),
    );
    expect(zSilnika.size).toBeGreaterThan(0);
    expect([...zSilnika].sort()).toEqual(Object.keys(NAZWY_KROKOW_NCRFG).sort());
  });

  it('krok silnika z kluczem w mapie → numer testu i nazwa kroku, bez klucza technicznego', () => {
    const opis = opisOdnosnikaSladu(
      odnosnik(
        'proof:ncrfg-ptpiree:T05:czas_regulacji_p:7',
        'krok śladu testu T05 (czas_regulacji_p)',
      ),
    );
    expect(opis).toBe('krok śladu testu T05: czas ustalenia regulacji mocy czynnej');
    expect(opis).not.toContain('czas_regulacji_p');
  });

  it('krok silnika z kluczem spoza mapy → opis bez klucza (nigdy klucz na ekranie)', () => {
    const opis = opisOdnosnikaSladu(
      odnosnik('proof:ncrfg-ptpiree:T99:nowy_krok:1', 'krok śladu testu T99 (nowy_krok)'),
    );
    expect(opis).toBe('krok śladu testu T99');
  });

  it('odnośnik innego pochodzenia → opis_pl bez zmian', () => {
    expect(opisOdnosnikaSladu(odnosnik('lom:bay-1:81R', 'Nastawa df/dt pola'))).toBe(
      'Nastawa df/dt pola',
    );
  });

  it('żadna nazwa kroku nie jest kluczem technicznym', () => {
    Object.values(NAZWY_KROKOW_NCRFG).forEach((nazwa) => {
      expect(nazwa).not.toMatch(/\b[a-z]{2,}_[a-z0-9_]+\b/);
    });
  });
});
