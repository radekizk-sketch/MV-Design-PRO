/**
 * POKRYCIE WARSTWY ZABEZPIECZENIOWEJ (Z7 audytu, V12K-220).
 *
 * DLACZEGO TEN PLIK ISTNIEJE. Cztery bramki warstwy adnotacji zabezpieczeń
 * (§17.5, §18.3, §20.1, §20.4) raportowały na sieci wzorcowej „okręgi=0
 * mierniki=0 tory=0 luki=0" i przechodziły TRYWIALNIE — bo sieć 52-stacyjna ma
 * `measurements: 0` i `protection_assignments: 0`. Bramka, która nie ma czego
 * mierzyć, nie chroni niczego.
 *
 * Pomiar pokazał przy tym coś szerszego: ŻADNA fixtura SLD nie miała pól z
 * aparatami (`bays[].primary_devices`), więc ścieżka DANYCH (§12.1 — ta z
 * PRYMATEM nad konwencją §12.4) nie była sprawdzona na żadnej sieci. Wszystkie
 * fixtury ćwiczyły wyłącznie fallback.
 *
 * `gpzProtectionDataPath.enm.json` jest pierwszą fixturą ze ścieżką danych.
 * Koordynacja zabezpieczeń jest w niej dobrana FIZYCZNIE, nie wpisana na oko:
 *
 *  • pole transformatorowe: I_n = 25 MVA/(√3·15 kV) = 962 A → CT 1000/5;
 *    51 nastawione na 1,15·I_n = 1100 A, TMS 0,25 (rezerwa),
 *  • pola liniowe: kabel 3×240 Al, I_dop ≈ 400 A → CT 400/5; 51 na 1,2·I_obc =
 *    360 A, TMS 0,15 — MNIEJSZY niż w polu TR, więc pole liniowe działa
 *    pierwsze (selektywność czasowa),
 *  • 51N na 20 A: przy uziemieniu przez rezystor 57,7 Ω prąd doziemny wynosi
 *    U_f/R = 8660 V/57,7 Ω ≈ 150 A, więc współczynnik czułości k = 150/20 = 7,5
 *    (norma wymaga ≥ 1,5), a jednocześnie 20 A leży POWYŻEJ prądu
 *    pojemnościowego własnego odpływu (~2 A) — brak zbędnych zadziałań.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildSceneV3 } from '../buildScene';

const HERE = dirname(fileURLToPath(import.meta.url));
const wczytaj = (p: string) => {
  const d = JSON.parse(readFileSync(p, 'utf8'));
  return d.enm ?? d;
};
const SCIEZKA_DANYCH = wczytaj(resolve(HERE, 'fixtures', 'gpzProtectionDataPath.enm.json'));
const KONWENCJA_52S = wczytaj(
  resolve(HERE, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json'),
);

describe('warstwa zabezpieczeniowa — fixtura ścieżki danych (Z7, V12K-220)', () => {
  it('model niesie pola, przekładniki i przypisania zabezpieczeń (czego 52s nie ma)', () => {
    expect(SCIEZKA_DANYCH.bays.length).toBeGreaterThan(0);
    expect(SCIEZKA_DANYCH.measurements.length).toBeGreaterThan(0);
    expect(SCIEZKA_DANYCH.protection_assignments.length).toBeGreaterThan(0);
    // Kontrola odwrotna — dowód, że 52s faktycznie mierzyła pustkę.
    expect((KONWENCJA_52S.measurements ?? []).length).toBe(0);
    expect((KONWENCJA_52S.protection_assignments ?? []).length).toBe(0);
  });

  it('scena z tej fixtury niesie WIĘCEJ przekładników i adnotacji niż z 52s', () => {
    const dane = buildSceneV3(SCIEZKA_DANYCH, 2);
    const konwencja = buildSceneV3(KONWENCJA_52S, 2);
    const ct = (s: typeof dane) => s.symbols.filter((x) => x.symbolId === 'currentTransformer').length;
    const adnotacje = (s: typeof dane) => s.labels.filter((l) => l.ownerKind === 'protection').length;
    expect(ct(dane)).toBeGreaterThan(ct(konwencja));
    expect(adnotacje(dane)).toBeGreaterThan(adnotacje(konwencja));
  });

  it('koordynacja jest selektywna czasowo i czuła na doziemienie (dobór fizyczny)', () => {
    const nastawy = (kod: string) =>
      SCIEZKA_DANYCH.protection_assignments
        .flatMap((p: { settings: { function_type: string; threshold_a?: number; time_multiplier?: number }[] }) => p.settings)
        .filter((s: { function_type: string }) => s.function_type === kod);
    const tms = nastawy('overcurrent_51').map((s: { time_multiplier?: number }) => s.time_multiplier);
    // Pole liniowe MUSI mieć mniejszy mnożnik czasowy niż pole transformatorowe,
    // inaczej zwarcie na odpływie wyłączyłoby całą sekcję zamiast jednego pola.
    expect(Math.min(...tms)).toBeLessThan(Math.max(...tms));
    const i0 = nastawy('earth_fault_51N').map((s: { threshold_a?: number }) => s.threshold_a ?? 0);
    // Czułość: nastawa poniżej prądu doziemnego 150 A z zapasem ≥ 1,5-krotnym…
    for (const v of i0) expect(150 / v).toBeGreaterThanOrEqual(1.5);
    // …i powyżej prądu pojemnościowego własnego odpływu (rząd 2 A).
    for (const v of i0) expect(v).toBeGreaterThan(2);
  });
});
