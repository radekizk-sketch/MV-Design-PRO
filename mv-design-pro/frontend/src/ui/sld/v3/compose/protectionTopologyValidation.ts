/**
 * SLD V3 F10.5/F10.6 — walidacja topologiczna funkcji zabezpieczeń
 * (SLD_CAD_SPEC_V3 §20.2, D2-7). Warstwa ANALIZY/diagnostyki (NIE solver, NIE
 * render) — czysta funkcja interpretacji danych ENM już obecnych na scenie
 * (`Bay.protection_codes`, `Bay.primary_devices`, `Bay.zrodlo_u0_ref` rozstrzygnięty
 * regułą źródła 3U₀, F10.6: `ProtectionAssignment.ct_refs_secondary`), zero fizyki,
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
 *  - `67N` (ziemnozwarciowe kierunkowe) wymaga źródła napięcia zerowego 3U₀ POTWIERDZONEGO
 *    w modelu i kryterium prądowego I0 z przekładnika Ferrantiego pola (decyzja właściciela
 *    2026-10-29, karta UX-04/POLE-LINIOWE-WZORZEC). Reguła jest JEDNA z backendem
 *    (`enm/zrodlo_napiecia_zerowego.py::zrodlo_u0_pola`, lustro
 *    `v2/model/zrodloNapieciaZerowego.ts`, parytet `tests/ci/test_parytet_zrodla_u0.py`):
 *    pole liniowe GPZ samo napięcia zerowego nie mierzy — według ENEA Z.10 (s.89) i Z.11.1
 *    (s.91) blok ziemnozwarciowy dostaje U0 obwodem okrężnym „Z, Zz" z uzwojenia otwartego
 *    trójkąta przekładnika pola pomiaru napięcia Z.17 (s.97). Dawna reguła „67N ⇒ VT w polu"
 *    (F10.5) i jej rozszerzenie o układ VT z `Measurement.vt_arrangement` (F10.6, dana nigdy
 *    niedostarczana przez adapter) ZNIESIONE: ostrzegały o braku VT tam, gdzie standard VT
 *    w polu nie przewiduje, i milczały przy braku powiązania ze źródłem. Gap
 *    `missing_core_balance_ct` — brak Ferrantiego; `missing_u0_source` — brak potwierdzonego
 *    źródła 3U₀ (brak powiązania, źródło nieobecne, bez otwartego trójkąta, w innej sekcji).
 *    Brak rozstrzygnięcia źródła w kontekście = źródło niepotwierdzone (brak danych ≠ spełnia).
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
 * (`MiniBlockBayDescriptor.primaryDevices`, kind ENM `CORE_BALANCE_CT`/`CT`/
 * `TRANSFORMER_DEVICE`) — WYŁĄCZNIE gdy `primary_devices` NIEPUSTE (pola
 * konwencji, §12.4, `primaryDevices` nieobecne/puste) NIE są walidowane:
 * brak danych o aparatach ≠ brak aparatów (zero zgadywania w OBIE strony,
 * WHITE BOX — fabrykowanie ostrzeżeń bez realnej listy aparatów pola
 * byłoby dokładnie tą heurystyką, której spec zakazuje). Kontekst domenowy
 * (`ProtectionTopologyDomainContext`) buduje z deskryptora pola JEDNA funkcja
 * `brakiTopologiiFunkcjiPola` — kompozycja stacji, kompozycja GPZ i nota arkusza wołają ją,
 * nie składają kontekstu każda po swojemu. Bez rozstrzygnięcia źródła 3U₀ funkcja 67N ma
 * źródło niepotwierdzone (brak danych ≠ spełnia).
 */

import type { BayPrimaryDeviceKind } from '../../../../types/enm';
import {
  FUNKCJE_WYMAGAJACE_ZRODLA_U0,
  type ZrodloU0PolaView,
} from '../../v2/model/zrodloNapieciaZerowego';

export type ProtectionTopologyGapReason =
  | 'missing_u0_source'
  | 'missing_core_balance_ct'
  | 'missing_transformer'
  | 'missing_i0'
  | 'missing_second_ct';

export interface ProtectionTopologyGap {
  readonly code: string;
  readonly reason: ProtectionTopologyGapReason;
}

/** Dane domenowe pola dla walidacji: źródło 3U₀ (67N) i strefa CT (87T, F10.6 D5). */
export interface ProtectionTopologyDomainContext {
  /** Rozstrzygnięcie źródła 3U₀ pola (`zrodloU0Pola`, lustro backendu) — `undefined` = pole
   *  bez rozstrzygnięcia: 67N ma wtedy źródło niepotwierdzone. */
  readonly zrodloU0?: ZrodloU0PolaView;
  /** `ProtectionAssignment.ct_ref` + `.ct_refs_secondary` (UNIKALNE refy) tej
   *  strefy — `undefined` = protection assignment tego pola nie niesie
   *  żadnego CT (87T nie sprawdza liczby CT, dotychczasowe uproszczenie). */
  readonly ctZoneRefs?: readonly string[];
}

const REASON_LABEL_PL: Readonly<Record<ProtectionTopologyGapReason, string>> = {
  missing_u0_source: 'brak potwierdzonego źródła 3U₀',
  missing_core_balance_ct: 'brak przekładnika Ferrantiego (I0)',
  missing_transformer: 'brak transformatora',
  missing_i0: 'brak I0',
  missing_second_ct: 'brak drugiego CT strefy',
};

/** Tekst adnotacji ostrzeżenia (§20.2, np. „67N: brak potwierdzonego źródła 3U₀") — zwięzły,
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

  const hasCoreBalanceCt = primaryDevices.some((d) => d.kind === 'CORE_BALANCE_CT');
  const hasTransformer = primaryDevices.some((d) => d.kind === 'TRANSFORMER_DEVICE');
  const hasI0Source = primaryDevices.some((d) => d.kind === 'CT');

  const gaps: ProtectionTopologyGap[] = [];
  for (const code of codes.filter((c) => FUNKCJE_WYMAGAJACE_ZRODLA_U0.includes(c))) {
    // Ta sama reguła co backend (`zrodlo_u0_pola`): kody braków z rozstrzygnięcia pola; bez
    // rozstrzygnięcia — Ferranti z listy aparatów, a źródło 3U₀ niepotwierdzone.
    const zrodlo = domainContext?.zrodloU0;
    if (zrodlo?.potwierdzone) continue;
    const brakFerrantiego = zrodlo ? zrodlo.kodyBrakow.includes('BRAK_FERRANTIEGO') : !hasCoreBalanceCt;
    const brakZrodla = zrodlo ? zrodlo.kodyBrakow.some((k) => k !== 'BRAK_FERRANTIEGO') : true;
    if (brakFerrantiego) gaps.push({ code, reason: 'missing_core_balance_ct' });
    if (brakZrodla) gaps.push({ code, reason: 'missing_u0_source' });
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

/** Pole na schemacie — podzbiór deskryptora czytany przez walidację (stacje i GPZ). */
export interface PoleWalidacjiTopologii {
  readonly primaryDevices?: readonly { readonly kind: BayPrimaryDeviceKind }[];
  readonly protectionMarking?: {
    readonly ctRef?: string;
    readonly ctRefsSecondary?: readonly string[];
  };
  readonly zrodloU0?: ZrodloU0PolaView;
}

/**
 * Braki topologiczne funkcji JEDNEGO pola z kontekstem domenowym zbudowanym z deskryptora —
 * JEDNA funkcja dla kompozycji stacji, kompozycji GPZ i noty arkusza (`scene/buildScene.ts`),
 * żeby adnotacja „!" przy przekaźniku i treść noty nie liczyły się z dwóch różnych kontekstów.
 * `ctZoneRefs` WYŁĄCZNIE, gdy `ctRefsSecondary` niesie realną daną strefy (`ct_ref` sam jest
 * stanem bazowym większości pól — traktowanie go jako danej strefy fabrykowałoby
 * `missing_second_ct` na każdym pojedynczym CT, §20.2(d)).
 */
export function brakiTopologiiFunkcjiPola(
  bay: PoleWalidacjiTopologii,
  codes: readonly string[],
): readonly ProtectionTopologyGap[] {
  const marking = bay.protectionMarking;
  const ctZoneRefs = (marking?.ctRefsSecondary?.length ?? 0) > 0
    ? [...new Set([...(marking?.ctRef != null ? [marking.ctRef] : []), ...(marking?.ctRefsSecondary ?? [])])]
    : undefined;
  return protectionFunctionTopologyGaps(codes, bay.primaryDevices, { zrodloU0: bay.zrodloU0, ctZoneRefs });
}
