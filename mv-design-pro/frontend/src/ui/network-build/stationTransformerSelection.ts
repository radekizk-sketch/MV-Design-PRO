import type { EnergyNetworkModel, Substation, Transformer } from '../../types/enm';

const BLOCK_TRANSFORMER_TOKEN_RE = /(^|[\s_/.-])(block|blokowy|blok|dedicated|dedykowany)([\s_/.-]|$)/u;

function nonEmptyRef(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function transformerRefs(transformer: Transformer): string[] {
  return [transformer.ref_id, transformer.id].filter(nonEmptyRef);
}

function stationRefs(station: Substation): Set<string> {
  return new Set([station.ref_id, station.id].filter(nonEmptyRef));
}

function collectStationBusRefs(
  snapshot: EnergyNetworkModel,
  station: Substation,
): Set<string> {
  const refs = new Set((station.bus_refs ?? []).filter(nonEmptyRef));
  const stationRefSet = stationRefs(station);

  for (const bus of snapshot.buses ?? []) {
    const record = bus as typeof bus & { readonly substation_ref?: string | null };
    if (record.substation_ref && stationRefSet.has(record.substation_ref)) {
      if (bus.ref_id) refs.add(bus.ref_id);
      if (bus.id) refs.add(bus.id);
    }
  }

  return refs;
}

export function collectDerBlockTransformerRefs(
  snapshot: EnergyNetworkModel | null | undefined,
): Set<string> {
  const refs = new Set<string>();
  for (const generator of snapshot?.generators ?? []) {
    const record = generator as typeof generator & {
      readonly blocking_transformer_ref?: string | null;
    };
    if (nonEmptyRef(record.blocking_transformer_ref)) {
      refs.add(record.blocking_transformer_ref);
    }
  }
  return refs;
}

export function isStationDistributionTransformer(
  transformer: Transformer,
  blockTransformerRefs: ReadonlySet<string>,
): boolean {
  if (transformerRefs(transformer).some((ref) => blockTransformerRefs.has(ref))) {
    return false;
  }

  const record = transformer as unknown as Record<string, unknown>;
  const catalogBinding = record.catalog_binding as Record<string, unknown> | undefined;
  const meta = record.meta as Record<string, unknown> | undefined;
  const tokens = [
    transformer.name,
    record.role,
    record.transformer_role,
    record.connection_variant,
    catalogBinding?.catalog_namespace,
    catalogBinding?.catalog_item_id,
    meta?.role,
    meta?.transformer_role,
    meta?.connection_variant,
    meta?.solution_kind,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();

  return !BLOCK_TRANSFORMER_TOKEN_RE.test(tokens);
}

export function selectStationDistributionTransformers(
  snapshot: EnergyNetworkModel | null | undefined,
  station: Substation | null | undefined,
): Transformer[] {
  if (!snapshot || !station) return [];

  const explicitRefs = new Set((station.transformer_refs ?? []).filter(nonEmptyRef));
  const busRefs = collectStationBusRefs(snapshot, station);
  const blockTransformerRefs = collectDerBlockTransformerRefs(snapshot);

  return (snapshot.transformers ?? []).filter((transformer) => {
    const refs = transformerRefs(transformer);
    // KOMPLETNOSC-POLA-TR: DEKLARACJA STACJI JEST MOCNIEJSZA od wskazania po
    // stronie źródła. Do tej karty kolejność była odwrotna i gubiła
    // transformator KAŻDEJ stacji, na której szynie nN stoi PV/BESS:
    // `add_converter_source` w wariancie `block_transformer` ustawia
    // `Generator.blocking_transformer_ref` na JEDYNY transformator stacji
    // (`domain_operations_v2.py` — auto-resolve V12K-022), więc
    // `collectDerBlockTransformerRefs` wykluczał go jako „blokowy DER".
    // Skutek: stacja z fotowoltaiką za transformatorem rysowała się BEZ
    // transformatora, a bramka gotowości (backend, `enm/pole_transformatorowe.py`)
    // widziała go dalej — dokładnie ten rozjazd predykatów, którego zakazuje
    // reguła KLASA §3. Transformator, który stacja DEKLARUJE jako swój, jest
    // jej transformatorem rozdzielczym niezależnie od tego, że dodatkowo pełni
    // rolę transformatora blokowego dla źródła na jego szynie nN.
    if (refs.some((ref) => explicitRefs.has(ref))) {
      return true;
    }

    if (explicitRefs.size > 0) {
      return false;
    }

    if (!isStationDistributionTransformer(transformer, blockTransformerRefs)) {
      return false;
    }

    return busRefs.has(transformer.hv_bus_ref) || busRefs.has(transformer.lv_bus_ref);
  });
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
  readonly lvBusRef: string | null;
  /**
   * KOMPLETNOSC-POLA-TR (parytet marker ↔ ostrzeżenie): napięcie znamionowe
   * szyny, na której leży strona GÓRNA transformatora. Reguła bramki gotowości
   * brzmi „strona górna przyłączona do szyny SN" (`enm/pole_transformatorowe.py`),
   * więc marker rysunku musi znać dokładnie tę samą daną — inaczej dla
   * transformatora 110/15 kV (strona górna WN) rysunek pokazywałby brak pola
   * SN, o którym bramka słusznie milczy.
   *
   * `null` = migawka nie niesie napięcia tej szyny. Brak NIE dyskwalifikuje
   * (ta sama tolerancja po stronie backendu): gdyby dyskwalifikował, marker
   * gasłby dokładnie tam, gdzie danych jest najmniej.
   */
  readonly hvVoltageKv: number | null;
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
): StationTransformerUnit[] {
  const voltageByBusRef = new Map<string, number>();
  for (const bus of snapshot?.buses ?? []) {
    if (typeof bus.voltage_kv !== 'number') continue;
    for (const ref of [bus.ref_id, bus.id]) {
      if (nonEmptyRef(ref)) voltageByBusRef.set(ref, bus.voltage_kv);
    }
  }

  const selected = selectStationDistributionTransformers(snapshot, station)
    .map((transformer): StationTransformerUnit | null => {
      const ref = transformer.ref_id ?? transformer.id;
      if (!nonEmptyRef(ref)) return null;
      const hvBusRef = nonEmptyRef(transformer.hv_bus_ref) ? transformer.hv_bus_ref : null;
      return {
        ref,
        hvBusRef,
        lvBusRef: nonEmptyRef(transformer.lv_bus_ref) ? transformer.lv_bus_ref : null,
        hvVoltageKv: (hvBusRef !== null ? voltageByBusRef.get(hvBusRef) : undefined) ?? null,
      };
    })
    .filter((unit): unit is StationTransformerUnit => unit != null)
    .sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));
  if (selected.length > 0 || !station) {
    return selected;
  }

  // Ścieżka awaryjna: stacja deklaruje `transformer_refs`, ale migawka nie
  // niesie odpowiadających rekordów `Transformer` — refy bez terminali.
  const blockTransformerRefs = collectDerBlockTransformerRefs(snapshot);
  return (station.transformer_refs ?? [])
    .filter(nonEmptyRef)
    .filter((ref) => !blockTransformerRefs.has(ref))
    .filter((ref) => !BLOCK_TRANSFORMER_TOKEN_RE.test(ref.toLowerCase()))
    .sort()
    .map((ref) => ({ ref, hvBusRef: null, lvBusRef: null, hvVoltageKv: null }));
}

export function selectStationDistributionTransformerRefs(
  snapshot: EnergyNetworkModel | null | undefined,
  station: Substation | null | undefined,
): string[] {
  return selectStationTransformerUnits(snapshot, station).map((unit) => unit.ref);
}
