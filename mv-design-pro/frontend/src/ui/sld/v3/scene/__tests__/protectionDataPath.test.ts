// @vitest-environment node
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

import type { Bay, ProtectionAssignment } from '../../../../../types/enm';
import { aparatySterownika, nastawyFunkcji, sterownikPola } from '../../../../shared/sterownikZabezpieczen';
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
    // Kontrola odwrotna — dowód, że 52s faktycznie mierzyła pustkę: bez przekładników,
    // a sterowniki pól szablonu (ADR-022: każde pole szablonu z funkcjami ma sterownik) bez
    // przekładnika na wejściu i bez macierzy wyzwoleń — nie ma czego rysować torem ani linią.
    expect((KONWENCJA_52S.measurements ?? []).length).toBe(0);
    for (const s of (KONWENCJA_52S.protection_assignments ?? []) as ProtectionAssignment[]) {
      expect(s.wejscia.ct_ref ?? null).toBeNull();
      expect(s.macierz_wyzwolen).toEqual([]);
    }
  });

  it('scena z tej fixtury niesie WIĘCEJ przekładników i adnotacji z przypisań zabezpieczeń niż z 52s', () => {
    const dane = buildSceneV3(SCIEZKA_DANYCH, 2);
    const konwencja = buildSceneV3(KONWENCJA_52S, 2);
    const ct = (s: typeof dane) => s.symbols.filter((x) => x.symbolId === 'currentTransformer').length;
    // Karta JEDNA NOTACJA BLOKU ZABEZPIECZEŃ: pola stacji 52s niosą kody funkcji, więc obie sceny
    // niosą bloki z wierszami kodów (dawne porównanie liczby etykiet `protection` przestało
    // rozróżniać fikstury). Adnotacja, której 52s nie może mieć, to ta z PRZYPISANIA
    // zabezpieczenia (`breaker_ref` → linia wyłączania) — 52s nie niesie żadnego przypisania.
    const linieWylaczania = (s: typeof dane) => s.segments.filter((g) => g.meta?.kind === 'protectionTrip').length;
    expect(ct(dane)).toBeGreaterThan(ct(konwencja));
    expect(linieWylaczania(dane)).toBeGreaterThan(0);
    expect(linieWylaczania(konwencja)).toBe(0);
  });

  // TO JEST SEDNO Z7: cztery bramki (§17.5, §18.3, §20.1, §20.4) mierzyły dotąd
  // pustkę na KAŻDEJ fixturze. Ten test jest pierwszym dowodem, że warstwa
  // adnotacji zabezpieczeń w ogóle powstaje — i zarazem strażnikiem, że nie
  // wróci do stanu, w którym bramki przechodzą przy zerowej treści.
  // Karta JEDNA NOTACJA BLOKU ZABEZPIECZEŃ (UX04 §11.20): pola tej fixtury nie niosą powiązań
  // obwodów wtórnych (`funkcje_eaz_zasilane`/`_wylaczajace` aparatów), więc blok zabezpieczeń
  // jest ramką z kodami i linią wyłączania do wyłącznika z `breaker_ref`, BEZ linii pomiarowych
  // CT/VT — linie pomiarowe z powiązań modelu dowodzi fixtura Z.10 (`poleLinioweGpz.test.tsx`).
  it('warstwa adnotacji zabezpieczeń POWSTAJE: bloki zabezpieczeń (ramka z kodami), tory wyzwalania; bez powiązań obwodów wtórnych — zero linii pomiarowych', () => {
    const dane = buildSceneV3(SCIEZKA_DANYCH, 2);
    const konwencja = buildSceneV3(KONWENCJA_52S, 2);
    const liniePomiarowe = (s: typeof dane) =>
      s.segments.filter((g) => g.meta?.kind === 'measurementLink').length;
    const toryWyzwalania = (s: typeof dane) =>
      s.segments.filter((g) => g.meta?.kind === 'protectionTrip').length;
    const bloki = dane.symbols.filter((x) => x.symbolId === 'protectionRelay');
    // Na ścieżce danych bloki (każdy z ramką i wierszami kodów) i tory wyzwalania istnieją…
    expect(bloki.length).toBeGreaterThan(0);
    for (const blok of bloki) {
      expect(blok.meta?.ramkaBlokuPrzekaznika, blok.meta?.ownerRef).toBeDefined();
      expect((blok.meta?.wierszeBlokuPrzekaznika ?? []).length, blok.meta?.ownerRef).toBeGreaterThan(0);
    }
    expect(dane.labels.filter((l) => l.ownerKind === 'protection').length).toBeGreaterThan(0);
    expect(liniePomiarowe(dane)).toBe(0);
    expect(toryWyzwalania(dane)).toBeGreaterThan(0);
    // …a na sieci wzorcowej NIE — to właśnie dlatego bramki przechodziły trywialnie.
    expect(liniePomiarowe(konwencja)).toBe(0);
    expect(toryWyzwalania(konwencja)).toBe(0);
  });

  // Łańcuch danych, bez którego warstwa milczy — każde ogniwo osobno, bo każde
  // z nich w trakcie budowy fixtury okazało się brakujące i dawało ciche zero:
  //   `primary_devices` w kolejności szablonu → `switch_state` jako OBIEKT z
  //   polskim literałem → `linked_ref` CT na Measurement → sterownik pola (ADR-022:
  //   `bay_ref` sterownika, wejście prądów fazowych = przekładnik pola, macierz wyzwoleń na
  //   wyłącznik pola).
  it('ogniwa łańcucha danych są kompletne (każde brakujące dawało ciche zero)', () => {
    // Karta W5-B: `bays` niesie WSZYSTKIE pola modelu (także pola stacji i pola GPZ bez
    // aparatów pierwotnych). Ścieżka danych = pola z aparatami pierwotnymi; każde ogniwo
    // sprawdzamy na każdym z nich.
    const pola = (SCIEZKA_DANYCH.bays as Bay[]).filter((pole) => (pole.primary_devices ?? []).length > 0);
    expect(pola.length).toBeGreaterThanOrEqual(3);
    for (const pole of pola) {
      const sterownik = sterownikPola(SCIEZKA_DANYCH, pole.ref_id);
      expect(sterownik, pole.ref_id).toBeTruthy();
      const aparaty = pole.primary_devices ?? [];
      const laczniki = aparaty.filter((d) => ['CB', 'DS', 'ES'].includes(d.kind));
      for (const l of laczniki) expect(l.switch_state?.actual_state).toBeTruthy();
      for (const ct of aparaty.filter((d) => d.kind === 'CT')) {
        expect(ct.linked_ref).toBeTruthy();
        expect(sterownik!.wejscia.ct_ref).toBe(ct.linked_ref);
      }
      const wylacznik = aparaty.find((d) => d.kind === 'CB')!;
      expect(aparatySterownika(sterownik)).toEqual([wylacznik.linked_ref ?? wylacznik.device_ref]);
    }
  });

  it('aparaty pól GPZ niosą STANY z modelu: łączniki toru zamknięte, uziemniki otwarte', () => {
    const sc = buildSceneV3(SCIEZKA_DANYCH, 2);
    const wPolach = sc.symbols.filter((s) => String(s.meta?.testId ?? '').includes('gpz-canonical-bay'));
    const stan = (id: string, st: string) =>
      wPolach.filter((s) => s.symbolId === id && s.state === st).length;
    expect(stan('breaker', 'closed')).toBeGreaterThan(0);
    expect(stan('disconnector', 'closed')).toBeGreaterThan(0);
    // Uziemnik w ruchu normalnym jest OTWARTY — inaczej pole byłoby zwarte do ziemi.
    expect(stan('earthSwitch', 'open')).toBeGreaterThan(0);
    expect(stan('earthSwitch', 'closed')).toBe(0);
  });

  it('koordynacja jest selektywna czasowo i czuła na doziemienie (dobór fizyczny)', () => {
    const zSterownikow = (kod: string) =>
      (SCIEZKA_DANYCH.protection_assignments as ProtectionAssignment[]).flatMap((p) =>
        p.funkcje.filter((f) => f.kod === kod).map((f) => nastawyFunkcji(p, f.ref)),
      ).filter((n) => Object.keys(n).length > 0);
    const tms = zSterownikow('51').map((n) => Number(n.tms));
    expect(tms.length).toBeGreaterThanOrEqual(2);
    // Pole liniowe MUSI mieć mniejszy mnożnik czasowy niż pole transformatorowe,
    // inaczej zwarcie na odpływie wyłączyłoby całą sekcję zamiast jednego pola.
    expect(Math.min(...tms)).toBeLessThan(Math.max(...tms));
    const i0 = zSterownikow('51N').map((n) => Number(n.prog));
    expect(i0.length).toBeGreaterThan(0);
    // Próg ziemnozwarciowy po stronie pierwotnej przekładnika (jednostka zapisana w nastawie).
    for (const n of zSterownikow('51N')) expect(n.jednostka_progu).toBe('A_PIERWOTNY');
    // Czułość: nastawa poniżej prądu doziemnego 150 A z zapasem ≥ 1,5-krotnym…
    for (const v of i0) expect(150 / v).toBeGreaterThanOrEqual(1.5);
    // …i powyżej prądu pojemnościowego własnego odpływu (rząd 2 A).
    for (const v of i0) expect(v).toBeGreaterThan(2);
  });
});
