/**
 * SLD V3 F10.5/F10.6 — walidacja topologiczna funkcji zabezpieczeń
 * (SLD_CAD_SPEC_V3 §20.2, D2-7). Warstwa ANALIZY/diagnostyki (NIE solver, NIE
 * render) — czysta funkcja interpretacji danych ENM już obecnych na scenie
 * (`Bay.protection_codes`, `Bay.primary_devices`, F10.6: `Measurement.
 * vt_arrangement`, `ProtectionAssignment.ct_refs_secondary`), zero fizyki,
 * zero heurystyk niedokumentowanych. Wynik = OSTRZEŻENIE
 * (`ProtectionTopologyGap`), NIGDY blokada (§20.2 dosłownie, kontrakt
 * koordynacyjny `SLD_PROTECTION_MARKING_COORDINATION_2026-07.md` §6 pkt 6:
 * „OSTRZEŻENIE / diagnostyka ... NIE błąd blokujący"). Wołający
 * (`compose/station.ts`) rzutuje wynik na:
 *  - `StationComposition.missingData` (prefiks `protection.topology.`) →
 *    `scene.meta.stopNotes` (`scene/buildScene.ts`, wzorzec
 *    `bay.protection.trip_link_unresolved`);
 *  - adnotację „!" przy okręgu przekaźnika (`ComposedSymbolInstance.
 *    protectionTopologyGaps` → `PreviewElementMeta.topologyGaps` →
 *    `GlyphProps.hasTopologyWarning`, `symbols/glyphs.tsx`
 *    `ProtectionRelayGlyph`).
 *
 * Zakres (Opcja B, §A3-DEC-4, rozstrzygnięcie architekta — dwustopniowo):
 *  - `67N` (ziemnozwarciowe kierunkowe) wymaga OBECNOŚCI VT w polu (F10.5).
 *    F10.6 (D4, DOMAIN): gdy `domainContext.vtArrangements` niesie CHOĆ
 *    JEDNĄ wartość (dana układu VT obecna dla ≥1 VT tego pola) i ŻADNA nie
 *    jest `'open_delta'` — DODATKOWY gap `vt_not_open_delta` (67N wymaga VT
 *    W UKŁADZIE otwartego trójkąta, warunek konieczny dla pomiaru 3U0). Gdy
 *    `vtArrangements` puste/`undefined` (dana niedostarczona) — POZOSTAJE
 *    dotychczasowe uproszczenie F10.5 (sama obecność VT wystarcza, zero
 *    fałszywych alarmów na danych bez układu).
 *  - `87T` (różnicowe transformatora) wymaga OBECNOŚCI `Transformer` w polu
 *    (F10.5). F10.6 (D5, DOMAIN): gdy `domainContext.ctZoneRefs` obecne
 *    (protection assignment tego pola niesie `ct_ref` i/lub
 *    `ct_refs_secondary` — realna dana strefy) i liczba UNIKALNYCH CT < 2 —
 *    DODATKOWY gap `missing_second_ct` (87T wymaga CT po OBU stronach
 *    transformatora). Gdy `ctZoneRefs` `undefined` (dana strefy
 *    niedostarczona) — POZOSTAJE dotychczasowe uproszczenie F10.5 (sama
 *    obecność transformatora wystarcza).
 *  - `51N` (ziemnozwarciowe zwłoczne) wymaga źródła I0 — UPROSZCZENIE
 *    udokumentowane: obecność JAKIEGOKOLWIEK CT w polu. Pełne rozróżnienie
 *    3×CT-fazowe vs przekładnik sumujący/Ferranti (`Measurement.
 *    ct_arrangement`, D3/F10.6) zasila WYŁĄCZNIE adnotację CT (§18.3,
 *    `compose/protectionMarking.ts` `ctRatingLabelText`) i wyczyszczenie
 *    heurystyki `zero_sequence_current_source` w
 *    `backend/src/application/field_read_model.py` — NIE tę walidację (51N
 *    pyta „czy JEST I0", nie „jakim układem" — obecny warunek już
 *    wystarczający, rozszerzenie byłoby nadmiarowe).
 *
 * Źródło danych: `Bay.protection_codes` (kody z adaptera —
 * `MiniBlockBayDescriptor.protectionMarking.codes`) + `Bay.primary_devices`
 * (`MiniBlockBayDescriptor.primaryDevices`, kind ENM `VT`/`CT`/
 * `TRANSFORMER_DEVICE`) — WYŁĄCZNIE gdy `primary_devices` NIEPUSTE (pola
 * konwencji, §12.4, `primaryDevices` nieobecne/puste) NIE są walidowane:
 * brak danych o aparatach ≠ brak aparatów (zero zgadywania w OBIE strony,
 * WHITE BOX — fabrykowanie ostrzeżeń bez realnej listy aparatów pola
 * byłoby dokładnie tą heurystyką, której spec zakazuje). `domainContext`
 * (F10.6) jest OPCJONALNY — wywołanie bez niego zachowuje DOKŁADNIE
 * zachowanie F10.5 (100% uproszczenie, zero regresji istniejących testów).
 */

import type { BayPrimaryDeviceKind } from '../../../../types/enm';

export type ProtectionTopologyGapReason =
  | 'missing_vt'
  | 'missing_transformer'
  | 'missing_i0'
  | 'vt_not_open_delta'
  | 'missing_second_ct';

export interface ProtectionTopologyGap {
  readonly code: string;
  readonly reason: ProtectionTopologyGapReason;
}

/** F10.6 (DOMAIN, D4/D5): dane układu VT / strefy CT tego pola — OPCJONALNE,
 *  gdy nieobecne walidacja degraduje do uproszczenia F10.5 (patrz docstring
 *  pliku). */
export interface ProtectionTopologyDomainContext {
  /** `Measurement.vt_arrangement` WSZYSTKICH VT tego pola (WYŁĄCZNIE
   *  wartości niepuste) — puste/`undefined` = dana niedostarczona dla
   *  ŻADNEGO VT pola (67N nie sprawdza układu, dotychczasowe uproszczenie). */
  readonly vtArrangements?: readonly ('open_delta' | 'star')[];
  /** `ProtectionAssignment.ct_ref` + `.ct_refs_secondary` (UNIKALNE refy) tej
   *  strefy — `undefined` = protection assignment tego pola nie niesie
   *  żadnego CT (87T nie sprawdza liczby CT, dotychczasowe uproszczenie). */
  readonly ctZoneRefs?: readonly string[];
}

const REASON_LABEL_PL: Readonly<Record<ProtectionTopologyGapReason, string>> = {
  missing_vt: 'brak VT',
  missing_transformer: 'brak transformatora',
  missing_i0: 'brak I0',
  vt_not_open_delta: 'VT nie w układzie otwartego trójkąta',
  missing_second_ct: 'brak drugiego CT strefy',
};

/** Tekst adnotacji ostrzeżenia (§20.2, np. „67N: brak VT") — zwięzły,
 *  dla etykiety/tooltipa przy okręgu przekaźnika. */
export function protectionTopologyGapLabel(gap: ProtectionTopologyGap): string {
  return `${gap.code}: ${REASON_LABEL_PL[gap.reason]}`;
}

/** Kod `missingData`/`stopNotes` (prefiks `protection.topology.`, zadanie
 *  F10.5 pkt B) — WHITE BOX, jeden kod per (funkcja, przyczyna). */
export function protectionTopologyGapCode(gap: ProtectionTopologyGap): string {
  return `protection.topology.${gap.code.toLowerCase()}_${gap.reason}`;
}

/**
 * Rozstrzyga braki topologiczne funkcji zabezpieczeń JEDNEGO pola (§20.2) —
 * `primaryDevices` `undefined`/puste ⇒ `[]` (brak danych o aparatach pola,
 * WHITE BOX „zero zgadywania" — nie fabrykujemy ostrzeżeń bez realnej listy
 * aparatów). Deterministyczna, bez efektów ubocznych.
 */
export function protectionFunctionTopologyGaps(
  codes: readonly string[],
  primaryDevices: readonly { readonly kind: BayPrimaryDeviceKind }[] | undefined,
  domainContext?: ProtectionTopologyDomainContext,
): readonly ProtectionTopologyGap[] {
  if (!primaryDevices || primaryDevices.length === 0) return [];

  const hasVt = primaryDevices.some((d) => d.kind === 'VT');
  const hasTransformer = primaryDevices.some((d) => d.kind === 'TRANSFORMER_DEVICE');
  const hasI0Source = primaryDevices.some((d) => d.kind === 'CT');

  const gaps: ProtectionTopologyGap[] = [];
  if (codes.includes('67N')) {
    if (!hasVt) {
      gaps.push({ code: '67N', reason: 'missing_vt' });
    } else {
      // F10.6 (D4): dana układu VT obecna dla ≥1 VT tego pola I żadna nie
      // jest 'open_delta' ⇒ gap dodatkowy. Puste/undefined = dana
      // niedostarczona, uproszczenie F10.5 pozostaje (sama obecność VT).
      const vtArrangements = domainContext?.vtArrangements ?? [];
      if (vtArrangements.length > 0 && !vtArrangements.includes('open_delta')) {
        gaps.push({ code: '67N', reason: 'vt_not_open_delta' });
      }
    }
  }
  if (codes.includes('87T')) {
    if (!hasTransformer) {
      gaps.push({ code: '87T', reason: 'missing_transformer' });
    } else {
      // F10.6 (D5): protection assignment niesie realną daną strefy CT
      // (`ctZoneRefs` zdefiniowane) I liczba unikalnych CT < 2 ⇒ gap
      // dodatkowy. `undefined` = dana strefy niedostarczona, uproszczenie
      // F10.5 pozostaje (sama obecność transformatora).
      const ctZoneRefs = domainContext?.ctZoneRefs;
      if (ctZoneRefs && ctZoneRefs.length < 2) {
        gaps.push({ code: '87T', reason: 'missing_second_ct' });
      }
    }
  }
  if (codes.includes('51N') && !hasI0Source) gaps.push({ code: '51N', reason: 'missing_i0' });
  return gaps;
}
