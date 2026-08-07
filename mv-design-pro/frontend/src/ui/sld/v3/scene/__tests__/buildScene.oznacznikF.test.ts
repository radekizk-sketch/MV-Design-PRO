/**
 * Ogranicznik przepięć na realnej scenie — oznacznik rodziny „F"
 * (decyzja właściciela 2026-08-07; rejestr V12K-335 pkt 3, karta S9-12).
 *
 * KONTEKST (audyt jakości SLD 2026-08 / rejestr V12K-329): przekładnik
 * napięciowy dostał konwencję TV, a ogranicznik przepięć pozostał DŁUGIEM
 * NAZWANYM — „kandydat F wg PN-EN 81346-2 koliduje wizualnie z oznaczeniami
 * bezpieczników producenckich; wymaga decyzji produktowej". Decyzja właściciela
 * 2026-08-07 (V12K-335 pkt 3) rozstrzygnęła: rodzina F (F1, F2… per pole,
 * spójnie z Q/QE/T/TV); kolizję z producenckim „F1" bezpiecznika rozstrzyga
 * mechanizm disambiguacji Z3 §0.3 (sufiks „·k"), a dana producencka i tak
 * wygrywa nad konwencją (§12.1).
 *
 * Fixtury — obie strony iloczynu cech {źródło oznacznika} × {LOD}:
 *  - KONWENCJA: `buildDerSnFixture` (`w2cDerSnFixtures.ts`) — pole źródłowe SN
 *    z SA BEZ `designation` (dokładne lustro kontraktu backendu, przypadek 2
 *    W2c) ⇒ SA dostaje konwencyjne „F1";
 *  - DANE: `buildW1MatrixFixture` (wariant `linia-cb-ct-sa`) — SA z
 *    `designation:'F2'` (dana producencka) ⇒ tekst danej wygrywa.
 *
 * GRANICA KLASY (ta sama co dla Q/QE/T/TV, nie nowa dziura F): aparaty GPZ
 * (`compose/gpz.ts`) noszą WŁASNE oznaczniki pól sprzed F10.2 i są POZA
 * mechanizmem `apparatusIdentifiers` — wyrocznia `apparatusIdentifierGaps`
 * filtruje po `apparatusSource`, ustawianym wyłącznie przez
 * `compose/station.ts`.
 *
 * Wycięcie gałęzi `surgeArrester` z `apparatusIdentifiers` ⇒ wyrocznia
 * `apparatusIdentifierGaps` zgłasza lukę (aparat uprawniony bez etykiety)
 * i test jest CZERWONY — deklaracja przypięta, nie deklarowana.
 */
import { describe, expect, it } from 'vitest';

import { apparatusIdentifierGaps, buildSceneV3, type SceneLod } from '../buildScene';
import { buildDerSnFixture } from './fixtures/w2cDerSnFixtures';
import { buildW1MatrixFixture } from './fixtures/w1MatrixVariants';

/** SA bez `designation` (ścieżka KONWENCJI) — pole źródłowe SN z SA. */
const konwencja = buildDerSnFixture([{ technology: 'PV', withSa: true }]);
/** SA z `designation:'F2'` (ścieżka DANYCH) — wariant `linia-cb-ct-sa`. */
const dane = buildW1MatrixFixture();

describe('ogranicznik przepięć — oznacznik rodziny F (V12K-335 pkt 3)', () => {
  for (const lod of [1, 2] as SceneLod[]) {
    it(`L${lod}: scena niesie symbol ogranicznika przepięć`, () => {
      const scene = buildSceneV3(konwencja.enm, lod);
      const sa = scene.symbols.filter((s) => s.symbolId === 'surgeArrester');
      expect(sa.length).toBeGreaterThan(0);
    });
  }

  // Oznaczniki aparatów żyją WYŁĄCZNIE na pełnym szczególe (kontrakt LOD §6 —
  // TA SAMA reguła co Q/QE/T/TV; filtr `#apparatus-id-` w `buildSceneV3`).
  it('L2: SA bez danych ma oznacznik konwencji „F1" (etykieta aparatu na scenie)', () => {
    const scene = buildSceneV3(konwencja.enm, 2);
    const saLabels = scene.labels.filter(
      (l) => l.ownerKind === 'apparatus' && l.ownerRef.includes('#apparatus-id-surgeArrester'),
    );
    expect(saLabels.length).toBeGreaterThan(0);
    expect(saLabels.every((l) => /^F\d+(·\d+)?$/.test(l.text))).toBe(true);
    expect(saLabels.some((l) => l.text === 'F1')).toBe(true);
    // Znacznik źródła: konwencja (SA bez `designation` w fixturze).
    expect(saLabels.every((l) => l.designationSource === 'konwencja')).toBe(true);
  });

  it('L0/L1: zero etykiet identyfikatora SA (kontrakt LOD — pełny detal, spójnie z Q/QE/T/TV)', () => {
    for (const lod of [0, 1] as SceneLod[]) {
      const scene = buildSceneV3(konwencja.enm, lod);
      const saLabels = scene.labels.filter(
        (l) => l.ownerKind === 'apparatus' && l.ownerRef.includes('#apparatus-id-surgeArrester'),
      );
      expect(saLabels).toHaveLength(0);
    }
  });

  it('L2: wyrocznia identyfikatorów nie zgłasza luk (SA jest aparatem uprawnionym, wzorzec łapie F\\d+)', () => {
    const scene = buildSceneV3(konwencja.enm, 2);
    expect(apparatusIdentifierGaps(scene)).toEqual([]);
  });

  it('L2: dana per-aparat („F2" z wariantu producenckiego) wygrywa nad konwencją — prymat danych §12.1', () => {
    const scene = buildSceneV3(dane.enm, 2);
    const target = dane.targets.find((t) => t.variant.id === 'linia-cb-ct-sa')!;
    const saLabels = scene.labels.filter(
      (l) =>
        l.ownerKind === 'apparatus'
        && l.ownerRef.startsWith(target.fieldRef)
        && l.ownerRef.includes('#apparatus-id-surgeArrester'),
    );
    expect(saLabels).toHaveLength(1);
    expect(saLabels[0].text).toBe('F2');
    expect(saLabels[0].designationSource).toBe('dane');
    // Wyrocznia na fixturze w1: DOKŁADNIE jedna luka PRE-EXISTING, niezwiązana
    // z F — etykieta „T2" przekładnika lateralnego wariantu `linia-ct-vt`
    // przegrywa w declutterze SCENY z symbolem ES stojącym bezpośrednio pod
    // nim (kolizja meldowana uczciwie w `meta.stopNotes`: `label.declutter …
    // #apparatus-id-voltageTransformer-lateral-0`). To dług geometrii kolumny
    // lateralnej (laterale RÓŻNYCH kotwic w tej samej kolumnie X stykają się
    // pionowo i nie zostawiają pasa na etykietę górnego) — nazwany w rejestrze
    // przy wierszu S9-12 (pomiar na czystym HEAD 683745a4: ta sama luka bez
    // zmian F). Pin liczbowy 405/406 celowo DOSŁOWNY: regres etykiet F zmienia
    // różnicę licznika i test robi się czerwony.
    expect(apparatusIdentifierGaps(scene)).toEqual([
      {
        ownerRef: undefined,
        symbolId: 'apparatus-label',
        reason: 'liczba etykiet identyfikatora (405) != liczba aparatów uprawnionych (406)',
      },
    ]);
  });

  it('determinizm: dwa wywołania ⇒ identyczny JSON sceny (L2)', () => {
    const a = JSON.stringify(buildSceneV3(konwencja.enm, 2));
    const b = JSON.stringify(buildSceneV3(konwencja.enm, 2));
    expect(a).toBe(b);
  });
});
