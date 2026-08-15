/**
 * S9-8 (audyt `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md`) — STOPNIOWANIE GRUBOŚCI
 * LINII WG RANGI TORU, mierzone TAM, GDZIE rysunek jest oglądany: NA EKRANIE.
 *
 * CO ORZEKA. Hierarchia §22.4 (szyny > magistrala > odgałęzienie > obwód nN >
 * kreski pomocnicze) jest poprawna w jednostkach ŚWIATA, ale rysunek widzi się
 * przez kamerę: przy wpasowaniu sieci dużej (skala ≈0,13) magistrala miała na
 * ekranie 0,31 px, odgałęzienie 0,21 px, nN 0,16 px — przeglądarka rysuje je
 * wszystkie jako ten sam włos i CAŁA hierarchia znika dokładnie tam, gdzie jest
 * najpotrzebniejsza (przegląd sieci: „gdzie biegnie magistrala").
 *
 * ILOCZYN CECH: {klasa kreski} × {skala kamery od dolnego po górny kraniec}.
 * Sam przykład „skala 0,13" nie wystarcza — błąd typu „wzmacniamy tylko
 * magistralę" albo „wzmocnienie nie gaśnie przy 1:1" schowałby się w nim.
 */
import { describe, expect, it } from 'vitest';

import { MAX_SCALE, MIN_SCALE } from '../../canvas/camera';
import {
  MIN_TRUNK_STROKE_SCREEN_PX,
  SEGMENT_STROKE_WIDTH,
  segmentStrokeWidthForScale,
  strokeScaleFactor,
  type PreviewSegmentKind,
} from '../preview';

/** Rangi toru w kolejności MALEJĄCEJ wagi (kanon §6/§22.4). */
const RANGI: readonly PreviewSegmentKind[] = ['busGpz', 'bus', 'snTrunk', 'sn', 'lv', 'leader'];
const SKALE = [MIN_SCALE, 0.13, 0.25, 0.51, 0.63, 1, 2, MAX_SCALE];

describe('S9-8 — hierarchia wag kresek przetrwa KAŻDĄ skalę kamery', () => {
  it('kanon świata: rangi ściśle malejące (zapadka na regresję samych stałych)', () => {
    for (let i = 1; i < RANGI.length; i++) {
      expect(SEGMENT_STROKE_WIDTH[RANGI[i]], `${RANGI[i]} vs ${RANGI[i - 1]}`).toBeLessThan(
        SEGMENT_STROKE_WIDTH[RANGI[i - 1]],
      );
    }
  });

  it('ILOCZYN {ranga} × {skala}: porządek wag NA EKRANIE zachowany na każdej skali', () => {
    for (const scale of SKALE) {
      const naEkranie = RANGI.map((k) => segmentStrokeWidthForScale(k, scale) * scale);
      for (let i = 1; i < naEkranie.length; i++) {
        expect(naEkranie[i], `${RANGI[i]} @${scale}`).toBeLessThan(naEkranie[i - 1]);
      }
    }
  });

  it('magistrala nie schodzi poniżej progu czytelności wagi na ŻADNEJ skali', () => {
    for (const scale of SKALE) {
      expect(segmentStrokeWidthForScale('snTrunk', scale) * scale, `@${scale}`).toBeGreaterThanOrEqual(
        MIN_TRUNK_STROKE_SCREEN_PX - 1e-9,
      );
    }
  });

  it('wzmocnienie JEDNORODNE: proporcje między rangami identyczne co do ilorazu (nie „mniej więcej")', () => {
    for (const scale of SKALE) {
      for (const kind of RANGI) {
        expect(segmentStrokeWidthForScale(kind, scale), `${kind} @${scale}`).toBeCloseTo(
          SEGMENT_STROKE_WIDTH[kind] * strokeScaleFactor(scale),
          9,
        );
      }
    }
  });

  it('wzmocnienie GAŚNIE przy pracy z bliska — powyżej progu rysunek jest identyczny ze stanem sprzed karty', () => {
    const progGasniecia = MIN_TRUNK_STROKE_SCREEN_PX / SEGMENT_STROKE_WIDTH.snTrunk;
    for (const scale of [progGasniecia, 1, 2, MAX_SCALE]) {
      expect(strokeScaleFactor(scale), `@${scale}`).toBe(1);
      for (const kind of RANGI) {
        expect(segmentStrokeWidthForScale(kind, scale)).toBe(SEGMENT_STROKE_WIDTH[kind]);
      }
    }
  });

  it('znak ciągu dalszego arkusza (S9-1) pozostaje ROZRÓŻNIALNY od toru, który znaczy — na każdej skali', () => {
    for (const scale of SKALE) {
      const znak = segmentStrokeWidthForScale('sheetContinuation', scale) * scale;
      const magistrala = segmentStrokeWidthForScale('snTrunk', scale) * scale;
      expect(znak, `@${scale}`).toBeLessThan(magistrala);
      // Kreski poprzeczne znaku nie mogą też zlać się z odgałęzieniem co do
      // wagi — mają tę samą rangę co marker końca otwartego (kanon S9-1) i
      // rozróżnia je GEOMETRIA (dwie kreski w poprzek toru), nie waga.
      expect(segmentStrokeWidthForScale('sheetContinuation', scale)).toBe(
        segmentStrokeWidthForScale('openTerminal', scale),
      );
    }
  });

  it('skala niewiarygodna (0/ujemna/NaN) NIE zmienia wag — brak pomiaru nie jest powodem do zmiany rysunku', () => {
    for (const zla of [0, -1, Number.NaN]) {
      expect(strokeScaleFactor(zla)).toBe(1);
      expect(segmentStrokeWidthForScale('snTrunk', zla)).toBe(SEGMENT_STROKE_WIDTH.snTrunk);
    }
  });

  it('DOWÓD, że defekt był realny: bez wzmocnienia trzy sąsiednie rangi zlewają się poniżej piksela', () => {
    const skalaWpasowania = 0.13;
    for (const kind of ['snTrunk', 'sn', 'lv'] as const) {
      expect(SEGMENT_STROKE_WIDTH[kind] * skalaWpasowania).toBeLessThan(1);
    }
    // Po wzmocnieniu magistrala jest wyraźnie cięższa od nN (nie „o włos").
    const trunk = segmentStrokeWidthForScale('snTrunk', skalaWpasowania) * skalaWpasowania;
    const lv = segmentStrokeWidthForScale('lv', skalaWpasowania) * skalaWpasowania;
    expect(trunk / lv).toBeCloseTo(SEGMENT_STROKE_WIDTH.snTrunk / SEGMENT_STROKE_WIDTH.lv, 9);
    expect(trunk).toBeGreaterThanOrEqual(MIN_TRUNK_STROKE_SCREEN_PX);
  });
});
