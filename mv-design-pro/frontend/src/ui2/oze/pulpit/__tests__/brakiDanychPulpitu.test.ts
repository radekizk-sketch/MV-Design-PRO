// @vitest-environment node
/**
 * Braki danych i werdykty sekcji pulpitu OZE — parytet z KODEM backendu (karta #145).
 *
 * Sekcje „Siła sieci" i „Adekwatność mocy biernej" pokazywały kody braków danych
 * (`s_sc_mva`, `q_min_mvar`…) i werdykt maszynowy bez polskich znaków. Ekran nazywa je
 * teraz z map typowanych zamkniętymi uniami; typ nie widzi backendu, więc ten test czyta
 * źródła analiz i wymaga RÓWNOŚCI zbiorów w obie strony (martwa etykieta też jest defektem).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import * as PULPIT from '../strings';
import { BRAKI_DANYCH_Q, BRAKI_DANYCH_SILY } from '../strings';

const ANALIZY = join(process.cwd(), '..', 'backend', 'src', 'analysis');

function zrodlo(...segmenty: string[]): string {
  return readFileSync(join(ANALIZY, ...segmenty), 'utf-8');
}

/** Kody braków: `missing.append("<kod>")` oraz `missing_data=("<kod>",)`. */
function kodyBrakow(tekst: string): string[] {
  return [
    ...[...tekst.matchAll(/missing\.append\("([a-z_]+)"\)/g)].map((m) => m[1]),
    ...[...tekst.matchAll(/missing_data=\("([a-z_]+)",\)/g)].map((m) => m[1]),
  ];
}

describe('pulpit OZE — braki danych i werdykty po polsku, parytet z backendem', () => {
  it('siła sieci: każdy kod braku ma polską nazwę i każda nazwa ma kod', () => {
    const zBackendu = new Set(kodyBrakow(zrodlo('grid_strength', 'builder.py')));
    expect(zBackendu.size).toBeGreaterThan(0);
    expect([...zBackendu].sort()).toEqual(Object.keys(BRAKI_DANYCH_SILY).sort());
  });

  it('adekwatność Q: każdy kod braku ma polską nazwę i każda nazwa ma kod', () => {
    const zBackendu = new Set(kodyBrakow(zrodlo('reactive_adequacy', 'builder.py')));
    expect(zBackendu.size).toBeGreaterThan(0);
    expect([...zBackendu].sort()).toEqual(Object.keys(BRAKI_DANYCH_Q).sort());
  });

  it('adekwatność Q i siła sieci: ekran nie mapuje kodu werdyktu — etykieta z rekordu', () => {
    // Kontrakt werdyktu wyjaśnialnego §9 (karta WERDYKT-MIGRACJA-190): status pokazuje
    // EtykietaWerdyktu/KartaWerdyktu z rekordu `wymaganie`/`ocena`; własne słowniki
    // kodów `verdict` są zakazane, więc moduł napisów ich nie eksportuje.
    expect(PULPIT).not.toHaveProperty('WERDYKTY_ADEKWATNOSCI_Q');
    expect(PULPIT).not.toHaveProperty('klasaWerdyktuQ');
    expect(PULPIT).not.toHaveProperty('klasaWerdyktuSily');
  });

  it('żadna etykieta nie jest kodem (snake_case) ani pustym napisem', () => {
    [
      ...Object.values(BRAKI_DANYCH_SILY),
      ...Object.values(BRAKI_DANYCH_Q),
    ].forEach((etykieta) => {
      expect(etykieta.trim()).not.toBe('');
      expect(etykieta).not.toMatch(/\b[a-z]+_[a-z0-9_]+\b/);
    });
  });
});
