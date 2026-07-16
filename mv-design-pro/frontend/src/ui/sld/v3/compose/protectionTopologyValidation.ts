/**
 * SLD V3 F10.5 — walidacja topologiczna funkcji zabezpieczeń (SLD_CAD_SPEC_V3
 * §20.2, D2-7). Warstwa ANALIZY/diagnostyki (NIE solver, NIE render) — czysta
 * funkcja interpretacji danych ENM już obecnych na scenie (`Bay.
 * protection_codes`, `Bay.primary_devices`), zero fizyki, zero heurystyk
 * niedokumentowanych. Wynik = OSTRZEŻENIE (`ProtectionTopologyGap`), NIGDY
 * blokada (§20.2 dosłownie, kontrakt koordynacyjny `SLD_PROTECTION_MARKING_
 * COORDINATION_2026-07.md` §6 pkt 6: „OSTRZEŻENIE / diagnostyka ... NIE błąd
 * blokujący"). Wołający (`compose/station.ts`) rzutuje wynik na:
 *  - `StationComposition.missingData` (prefiks `protection.topology.`) →
 *    `scene.meta.stopNotes` (`scene/buildScene.ts`, wzorzec
 *    `bay.protection.trip_link_unresolved`);
 *  - adnotację „!" przy okręgu przekaźnika (`ComposedSymbolInstance.
 *    protectionTopologyGaps` → `PreviewElementMeta.topologyGaps` →
 *    `GlyphProps.hasTopologyWarning`, `symbols/glyphs.tsx`
 *    `ProtectionRelayGlyph`).
 *
 * Zakres F10.5 (Opcja B, §A3-DEC-4, rozstrzygnięcie architekta — na
 * ISTNIEJĄCYCH polach, BEZ nowych pól DOMAIN):
 *  - `67N` (ziemnozwarciowe kierunkowe) wymaga OBECNOŚCI VT w polu — pełny
 *    warunek (układ otwartego trójkąta, 3U0) to NOWE pole DOMAIN, D4/F10.6.
 *  - `87T` (różnicowe transformatora) wymaga OBECNOŚCI `Transformer` w polu —
 *    pełna strefa różnicowa (2×CT po obu stronach) to NOWE pole DOMAIN,
 *    D5/F10.6 (execplan F10.5: „walidacja 67N⇒VT i 87T⇒TR realizowana TERAZ
 *    na ISTNIEJĄCYCH polach ... pełna strefa różnicowa 87T (2×CT) ...
 *    kolejna runda DOMAIN").
 *  - `51N` (ziemnozwarciowe zwłoczne) wymaga źródła I0 — UPROSZCZENIE
 *    udokumentowane: obecność JAKIEGOKOLWIEK CT w polu (rozróżnienie
 *    3×CT-fazowe vs przekładnik sumujący/Ferranti to D3/F10.6, patrz też
 *    ZNALEZISKO F10.4 o heurystyce `zero_sequence_current_source="suma_ct"`
 *    w `field_read_model.py:581`, do wyczyszczenia razem z tą rundą).
 *
 * Źródło danych: `Bay.protection_codes` (kody z adaptera —
 * `MiniBlockBayDescriptor.protectionMarking.codes`) + `Bay.primary_devices`
 * (`MiniBlockBayDescriptor.primaryDevices`, kind ENM `VT`/`CT`/
 * `TRANSFORMER_DEVICE`) — WYŁĄCZNIE gdy `primary_devices` NIEPUSTE (pola
 * konwencji, §12.4, `primaryDevices` nieobecne/puste) NIE są walidowane:
 * brak danych o aparatach ≠ brak aparatów (zero zgadywania w OBIE strony,
 * WHITE BOX — fabrykowanie ostrzeżeń bez realnej listy aparatów pola
 * byłoby dokładnie tą heurystyką, której spec zakazuje).
 */

import type { BayPrimaryDeviceKind } from '../../../../types/enm';

export type ProtectionTopologyGapReason = 'missing_vt' | 'missing_transformer' | 'missing_i0';

export interface ProtectionTopologyGap {
  readonly code: string;
  readonly reason: ProtectionTopologyGapReason;
}

const REASON_LABEL_PL: Readonly<Record<ProtectionTopologyGapReason, string>> = {
  missing_vt: 'brak VT',
  missing_transformer: 'brak transformatora',
  missing_i0: 'brak I0',
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
): readonly ProtectionTopologyGap[] {
  if (!primaryDevices || primaryDevices.length === 0) return [];

  const hasVt = primaryDevices.some((d) => d.kind === 'VT');
  const hasTransformer = primaryDevices.some((d) => d.kind === 'TRANSFORMER_DEVICE');
  const hasI0Source = primaryDevices.some((d) => d.kind === 'CT');

  const gaps: ProtectionTopologyGap[] = [];
  if (codes.includes('67N') && !hasVt) gaps.push({ code: '67N', reason: 'missing_vt' });
  if (codes.includes('87T') && !hasTransformer) gaps.push({ code: '87T', reason: 'missing_transformer' });
  if (codes.includes('51N') && !hasI0Source) gaps.push({ code: '51N', reason: 'missing_i0' });
  return gaps;
}
