/**
 * WSKAZANIE OPERACJI DOMENOWEJ — jedno źródło reguły „na co patrzy projektant
 * po zapisie" (karta B-2, audyt `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md` §4.3).
 *
 * ---------------------------------------------------------------------------
 * PO CO OSOBNY MODUŁ (predykaty parami — CLAUDE.md „KLASA, NIE INSTANCJA" pkt 3)
 * ---------------------------------------------------------------------------
 * Po udanej operacji domenowej DWA mechanizmy muszą wskazać TEN SAM obiekt:
 *  1. SELEKCJA (inspektor / drzewo / property-grid) — `ui2/kreatory/rama/
 *     selekcjaPoOperacji.ts`,
 *  2. KAMERA schematu (kotwica widoku po zmianie modelu) — `ui/sld/v3/canvas/
 *     viewAnchor.ts`.
 * Gdyby każdy z nich liczył wskazanie własną regułą, projektant dostawałby
 * inspektor jednego obiektu i kadr drugiego. Reguła pierwszeństwa mieszka więc
 * TU, a oba mechanizmy ją WOŁAJĄ (zamiast powielać).
 *
 * ---------------------------------------------------------------------------
 * REGUŁA (zmierzona na żywym backendzie 2026-08-07, port 8037)
 * ---------------------------------------------------------------------------
 * Kandydaci w kolejności malejącej pewności: `selection_hint.element_id`
 * (jawne wskazanie operacji), potem `changes.created_element_ids` w kolejności
 * zwróconej przez backend. Kolejność ma znaczenie i jest częścią kontraktu —
 * pomiar pięciu operacji budowy pokazał, że wskazanie jawne bywa refem, którego
 * rysunek nie nosi:
 *
 * | operacja                     | `selection_hint`                | rozwiązywalny na rysunku |
 * |------------------------------|---------------------------------|--------------------------|
 * | add_grid_source_sn           | `gpz/…/substation`              | TAK (kandydat 0)         |
 * | continue_trunk_segment_sn    | `bus/…/downstream`              | NIE → `seg/…/segment` (kandydat 2) |
 * | insert_station_on_segment_sn | `stn/…/station`                 | TAK (kandydat 0)         |
 * | start_branch_segment_sn      | `seg/…/branch_segment`          | TAK (kandydat 0)         |
 * | add_sn_bay                   | `sn/…/bay`                      | TAK (kandydat 0)         |
 *
 * Dlatego moduł zwraca CAŁĄ listę kandydatów — wybór należy do konsumenta,
 * który potrafi sprawdzić rozwiązywalność w SWOIM świecie (selekcja: migawka
 * modelu, kamera: scena rysunku). Zero zgadywania po nazwie refu.
 *
 * `zoom_to === false` (pole kontraktu `SelectionHint`, `enm/domain_ops_models.py`)
 * znaczy „nie przenoś widoku" — przenoszone jako `przenosKadr`, honorowane
 * jednakowo przez selekcję i kamerę.
 */
import type { ChangesInfo, SelectionHint } from '../../types/enm';

export interface WskazanieOperacji {
  /** Kandydaci na obiekt wskazany, malejąco wg pewności (patrz nagłówek). */
  readonly kandydaci: readonly string[];
  /** `selection_hint.zoom_to` — `false` znaczy „nie przenoś widoku". */
  readonly przenosKadr: boolean;
  /** Typ elementu ze wskazania backendu (słownik domenowy) — `null` gdy brak. */
  readonly typWskazania: string | null;
  /** Ref ze wskazania JAWNEGO (nie z listy utworzonych) — `null` gdy brak. */
  readonly refWskazania: string | null;
}

function niepusty(ref: unknown): ref is string {
  return typeof ref === 'string' && ref.trim().length > 0;
}

/**
 * Wskazanie operacji z pary (`selection_hint`, `changes`) — obu pól odpowiedzi
 * domenowej, przechowywanych razem w `useSnapshotStore` (jeden `set`, więc
 * zawsze spójnych z migawką). Brak kandydatów ⇒ `null` (uczciwie: operacja nie
 * wskazała niczego, np. `delete_element` — usunięty element nie istnieje).
 */
export function wskazanieOperacji(
  selectionHint: SelectionHint | null | undefined,
  changes: Pick<ChangesInfo, 'created_element_ids'> | null | undefined,
): WskazanieOperacji | null {
  const refWskazania = niepusty(selectionHint?.element_id) ? selectionHint!.element_id.trim() : null;
  const kandydaci: string[] = [];
  const dopisz = (ref: unknown): void => {
    if (!niepusty(ref)) return;
    const przyciety = ref.trim();
    if (!kandydaci.includes(przyciety)) kandydaci.push(przyciety);
  };
  dopisz(refWskazania);
  for (const ref of changes?.created_element_ids ?? []) dopisz(ref);
  if (kandydaci.length === 0) return null;
  return {
    kandydaci,
    // Domyślnie kadr wędruje za zmianą; `false` wyłącznie na jawne żądanie
    // operacji (kontrakt `SelectionHint.zoom_to`).
    przenosKadr: selectionHint?.zoom_to !== false,
    typWskazania: niepusty(selectionHint?.element_type) ? selectionHint!.element_type : null,
    refWskazania,
  };
}
