import type { EnergyNetworkModel, Substation } from '../../types/enm';
import { extractTransformerDesignation } from '../sld/v2/canvas/enmToCanonicalGpzAdapter';
import { szynaGlownaStacji } from '../shared/szynyStacji';
import {
  kontekstTransformatorowStacji,
  selectStationDistributionTransformers,
  type KontekstTransformatorowStacji,
} from '../shared/transformatoryStacji';

function nonEmptyRef(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Dane wyboru jednostek transformatorowych stacji, które zależą WYŁĄCZNIE od migawki (nie od
 * stacji): kontekst jedynej reguły transformatorów stacji (`ui/shared/transformatoryStacji.ts`
 * — indeks gałęzi pól nN, transformatory blokowe DER) i napięcia szyn. Wołający, który wybiera
 * transformatory dla wielu stacji tej samej migawki (adapter SLD), liczy go RAZ — bez tego każda
 * stacja przeglądała wszystkie gałęzie, generatory i szyny (koszt O(stacje × migawka)). Wynik
 * wyboru z kontekstem i bez jest identyczny.
 */
export interface KontekstWyboruTransformatorow {
  readonly snapshot: EnergyNetworkModel;
  readonly regula: KontekstTransformatorowStacji;
  readonly voltageByBusRef: ReadonlyMap<string, number>;
}

export function kontekstWyboruTransformatorow(snapshot: EnergyNetworkModel): KontekstWyboruTransformatorow {
  const voltageByBusRef = new Map<string, number>();
  for (const bus of snapshot.buses ?? []) {
    if (typeof bus.voltage_kv !== 'number') continue;
    for (const ref of [bus.ref_id, bus.id]) {
      if (nonEmptyRef(ref)) voltageByBusRef.set(ref, bus.voltage_kv);
    }
  }
  return { snapshot, regula: kontekstTransformatorowStacji(snapshot), voltageByBusRef };
}

function kontekstDla(
  snapshot: EnergyNetworkModel,
  kontekst: KontekstWyboruTransformatorow | undefined,
): KontekstWyboruTransformatorow {
  if (!kontekst) return kontekstWyboruTransformatorow(snapshot);
  if (kontekst.snapshot !== snapshot) {
    throw new Error('Kontekst wyboru transformatorów zbudowany dla innej migawki');
  }
  return kontekst;
}

/**
 * TR2W-BEZ-POLA (§0.C.2 „kotwica topologiczna"): JEDNA jednostka
 * transformatorowa stacji — ref + OBA końce topologiczne (`Transformer.
 * hv_bus_ref`/`lv_bus_ref`). Terminal WN jest jedyną prawdą o tym, DO KTÓREJ
 * SEKCJI szyn SN transformator jest przyłączony; rysunek SLD wyprowadza z
 * niego miejsce kolumny (`layout/measure.ts` `stationSnColumnLayout`), a NIE
 * z pozycji ostatniego pola w tablicy (reguła pozycyjna była zakazana wprost
 * w recenzji właściciela — „ZAKAZ reguły `transformer_slot = last_field + 1`
 * jako reguły elektrycznej").
 *
 * `hvBusRef`/`lvBusRef` = `null` WYŁĄCZNIE dla ścieżki awaryjnej niżej
 * (`Substation.transformer_refs` wskazuje ref, którego rekordu `Transformer`
 * w migawce NIE MA) — dana niekompletna, NIE domysł: kompozycja degraduje
 * wtedy jawnie (`station.transformer.sectionUnresolved`), zamiast zgadywać
 * sekcję.
 */
export interface StationTransformerUnit {
  readonly ref: string;
  readonly hvBusRef: string | null;
  /**
   * SZYNY-STACJI-LUSTRO (commit 2): szyna GŁÓWNA sekcji, na której stoi pole prowadzące do
   * strony górnej (`szynaGlownaStacji`) — strona górna leży zwykle na ZACISKU pola, który nie
   * jest sekcją rozdzielnicy. `hvBusRef`, gdy lustro nie przypisuje szyny głównej (szyna
   * spoza stacji albo dane bez pól); `null` na ścieżce awaryjnej.
   */
  readonly hvSekcjaBusRef: string | null;
  readonly lvBusRef: string | null;
  /**
   * KOMPLETNOSC-POLA-TR (parytet marker ↔ ostrzeżenie): napięcie znamionowe
   * szyny, na której leży strona GÓRNA transformatora. Reguła bramki gotowości
   * brzmi „strona górna przyłączona do szyny SN" (`enm/pole_transformatorowe.py`, pasmo z
   * `network_model/pochodne/pasma_napieciowe.py`),
   * więc marker rysunku musi znać dokładnie tę samą daną — inaczej dla
   * transformatora 110/15 kV (strona górna WN) rysunek pokazywałby brak pola
   * SN, o którym bramka słusznie milczy.
   *
   * `null` = migawka nie niesie napięcia tej szyny. Brak NIE dyskwalifikuje
   * (ta sama tolerancja po stronie backendu): gdyby dyskwalifikował, marker
   * gasłby dokładnie tam, gdzie danych jest najmniej.
   */
  readonly hvVoltageKv: number | null;
  /**
   * T3 (SLD-nN-TOPOLOGIA §„layout i wygląd" — BINDING: „dane TR przy symbolu
   * T1 … dane WYŁĄCZNIE z ENM/grafu"): tabliczka transformatora — pola
   * czytane WPROST z rekordu ENM `Transformer` (`sn_mva`/`uhv_kv`/`ulv_kv`/
   * `uk_percent`/`vector_group`), zero fizyki/wyliczeń w UI. `designation`
   * wyprowadzone TĄ SAMĄ funkcją co tabliczka transformatora GPZ
   * (`extractTransformerDesignation`, `v2/canvas/enmToCanonicalGpzAdapter.ts`
   * — reużycie zamiast duplikacji), więc oznaczenie „T1"/„TR1" jest spójne
   * między stroną SN (GPZ) i stroną nN (stacja) tego samego systemu.
   *
   * `null` WYŁĄCZNIE na ścieżce awaryjnej (migawka nie niesie rekordu
   * `Transformer` dla refu — patrz `selected.length===0` niżej): brak NIE
   * jest fabrykowany, tabliczka po prostu nie rysuje wiersza bez danych
   * (ta sama tolerancja co `hvVoltageKv` wyżej).
   */
  readonly designation: string | null;
  readonly snMva: number | null;
  readonly uhvKv: number | null;
  readonly ulvKv: number | null;
  readonly ukPercent: number | null;
  readonly vectorGroup: string | null;
}

/**
 * TR2W-BEZ-POLA: jednostki transformatorowe stacji — JEDNO źródło prawdy dla
 * listy refów (`selectStationDistributionTransformerRefs` niżej wyprowadza z
 * TEJ funkcji) i dla kotwicy topologicznej rysunku. Dwie niezależne selekcje
 * — jedna „które refy", druga „jakie terminale" — rozjechałyby się przy
 * pierwszej zmianie reguły wyboru (reguła KLASA §3 „predykaty parami z
 * jednego źródła").
 */
export function selectStationTransformerUnits(
  snapshot: EnergyNetworkModel | null | undefined,
  station: Substation | null | undefined,
  kontekst?: KontekstWyboruTransformatorow,
): StationTransformerUnit[] {
  const pelnyKontekst = snapshot ? kontekstDla(snapshot, kontekst) : null;
  const voltageByBusRef: ReadonlyMap<string, number> = pelnyKontekst?.voltageByBusRef ?? new Map();

  const distributionTransformers = selectStationDistributionTransformers(
    snapshot,
    station,
    pelnyKontekst?.regula,
  );
  const selected = distributionTransformers
    .map((transformer, idx): StationTransformerUnit | null => {
      const ref = transformer.ref_id ?? transformer.id;
      if (!nonEmptyRef(ref)) return null;
      const hvBusRef = nonEmptyRef(transformer.hv_bus_ref) ? transformer.hv_bus_ref : null;
      return {
        ref,
        hvBusRef,
        hvSekcjaBusRef: hvBusRef !== null && station
          ? szynaGlownaStacji(
              station,
              snapshot?.branches ?? [],
              hvBusRef,
              pelnyKontekst?.regula.indeksPolNn,
            ) ?? hvBusRef
          : hvBusRef,
        lvBusRef: nonEmptyRef(transformer.lv_bus_ref) ? transformer.lv_bus_ref : null,
        hvVoltageKv: (hvBusRef !== null ? voltageByBusRef.get(hvBusRef) : undefined) ?? null,
        // T3 (tabliczka TR przy symbolu T1) — pola WPROST z rekordu ENM.
        designation: extractTransformerDesignation(transformer.name, idx),
        snMva: typeof transformer.sn_mva === 'number' ? transformer.sn_mva : null,
        uhvKv: typeof transformer.uhv_kv === 'number' ? transformer.uhv_kv : null,
        ulvKv: typeof transformer.ulv_kv === 'number' ? transformer.ulv_kv : null,
        ukPercent: typeof transformer.uk_percent === 'number' ? transformer.uk_percent : null,
        vectorGroup: typeof transformer.vector_group === 'string' ? transformer.vector_group : null,
      };
    })
    .filter((unit): unit is StationTransformerUnit => unit != null)
    .sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));
  if (selected.length > 0 || !station) {
    return selected;
  }

  // Ścieżka awaryjna: stacja deklaruje `transformer_refs`, ale migawka nie
  // niesie odpowiadających rekordów `Transformer` — refy bez terminali.
  // Rekordu brak, więc roli katalogowej nie ma skąd przeczytać — wyklucza wyłącznie
  // wskazanie źródła (ten sam filtr, pierwszy kanał).
  const refyBlokowe = pelnyKontekst?.regula.refyBlokowe ?? new Set<string>();
  return (station.transformer_refs ?? [])
    .filter(nonEmptyRef)
    .filter((ref) => !refyBlokowe.has(ref))
    .sort()
    .map((ref) => ({
      ref,
      hvBusRef: null,
      hvSekcjaBusRef: null,
      lvBusRef: null,
      hvVoltageKv: null,
      // Ścieżka awaryjna: brak rekordu `Transformer` w migawce ⇒ brak
      // danych tabliczki (uczciwy brak, zero fabrykacji — ten sam wzorzec
      // co pozostałe pola `null` tej ścieżki wyżej).
      designation: null,
      snMva: null,
      uhvKv: null,
      ulvKv: null,
      ukPercent: null,
      vectorGroup: null,
    }));
}

export function selectStationDistributionTransformerRefs(
  snapshot: EnergyNetworkModel | null | undefined,
  station: Substation | null | undefined,
): string[] {
  return selectStationTransformerUnits(snapshot, station).map((unit) => unit.ref);
}
