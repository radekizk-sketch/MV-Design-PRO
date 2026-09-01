/** Budowniczy wyłącznie dla testów i deterministycznego harnessu L2.
 *  Produkcja otrzymuje ten sam kształt z endpointu `/projection/v1`
 *  (kontrakt 2.0.0 — `docs/sld/PROJEKCJA_SN_NN_PORTAL_V1.md` §3). */
import type { RawOverlayPayload } from '../../../../sld-overlay/rawResultOverlayStore';
import type { SwzOverlayEntry } from '../../canvas/overlay';
import {
  LV_DOMAIN_PROJECTION_CONTRACT_VERSION,
  type LvDomainFeederSupply,
  type LvDomainGraphView,
  type LvDomainProjectionV1,
  type LvDomainSwzFeederV1,
  type LvDomainSwzTransformerV1,
  type LvDomainVoltageProfileRow,
  type UpstreamEquivalentSnapshot,
} from '../types';

interface FixtureProjectionOptions {
  readonly graph: LvDomainGraphView;
  readonly upstreamEquivalents?: readonly UpstreamEquivalentSnapshot[];
  readonly scenarioId?: 'MAX' | 'MIN';
  readonly caseId?: string;
  readonly resultOverlayPayload?: RawOverlayPayload | null;
  readonly voltageProfileByBusRef?: Readonly<Record<string, LvDomainVoltageProfileRow>>;
  readonly swzByFeederRef?: Readonly<Record<string, SwzOverlayEntry>>;
  /** Transformator, od którego liczono odpływ (klucz: `feeder_root_branch_ref`).
   *  Domyślnie PIERWSZY transformator grafu — jak backend dla stacji 1×TR. */
  readonly swzTransformerRefByFeederRef?: Readonly<Record<string, string>>;
  /** Zasilanie odpływu (klucz: `feeder_root_branch_ref`); domyślnie jednostronne. */
  readonly swzSupplyByFeederRef?: Readonly<Record<string, LvDomainFeederSupply>>;
}

/** Odpływ SWZ w kształcie backendu (`projection_v1._swz_feeder_rows`). */
export function buildSwzFeederFixture(
  entry: SwzOverlayEntry,
  transformerRef: string,
  supply: LvDomainFeederSupply = 'jednostronne',
): LvDomainSwzFeederV1 {
  return {
    feeder_root_branch_ref: entry.ownerRef,
    worst_point_bus_ref: null,
    points: [],
    supply,
    supply_assumption_pl:
      supply === 'wielostronne'
        ? 'pętla zwarcia liczona od transformatora własnej sekcji (założenie zachowawcze: sprzęgło otwarte / jeden transformator w pracy — mniejszy prąd zwarcia = warunek doboru SWZ)'
        : null,
    swz: {
      status: 'OK',
      breaker_ref: entry.ownerRef,
      transformer_ref: transformerRef,
      swz: {
        status: entry.status,
        przyczyna_pl: entry.przyczynaPl,
        ik1_min_a: entry.ik1MinA,
        ia_wymagane_a: entry.iaWymaganeA,
        t_wymagany_s: entry.tWymaganyS,
        margines: entry.margines,
      },
    },
  };
}

export function buildLvDomainProjectionFixture(
  options: FixtureProjectionOptions,
): LvDomainProjectionV1 {
  const {
    graph,
    upstreamEquivalents = [],
    scenarioId = 'MAX',
    resultOverlayPayload = null,
    voltageProfileByBusRef = {},
    swzByFeederRef = {},
    swzTransformerRefByFeederRef = {},
    swzSupplyByFeederRef = {},
  } = options;
  const caseId = options.caseId ?? upstreamEquivalents[0]?.case_id ?? 'fixture-case';
  const modelHash = upstreamEquivalents[0]?.model_hash ?? 'fixture-model-hash';
  const operatingStateId =
    upstreamEquivalents[0]?.operating_state_id ?? 'fixture-operating-state';
  const runId = resultOverlayPayload?.run_id ?? null;
  const hasResult = resultOverlayPayload !== null;

  // SWZ per transformator (kontrakt 2.0.0): KAŻDY transformator grafu ma wpis
  // (także bez odpływów — cicha nieobecność byłaby kłamstwem przez pominięcie);
  // odpływ trafia do transformatora wskazanego jawnie, domyślnie pierwszego.
  const transformers = [...graph.transformers].sort((a, b) => a.ref_id.localeCompare(b.ref_id));
  const defaultTransformerRef = transformers[0]?.ref_id ?? 'fixture-tr';
  const feedersByTransformer = new Map<string, LvDomainSwzFeederV1[]>();
  for (const entry of Object.values(swzByFeederRef)) {
    const transformerRef = swzTransformerRefByFeederRef[entry.ownerRef] ?? defaultTransformerRef;
    const list = feedersByTransformer.get(transformerRef) ?? [];
    list.push(buildSwzFeederFixture(entry, transformerRef, swzSupplyByFeederRef[entry.ownerRef]));
    feedersByTransformer.set(transformerRef, list);
  }
  const swzTransformers: LvDomainSwzTransformerV1[] = (
    transformers.length > 0
      ? transformers.map((t) => ({ ref: t.ref_id, nnBus: t.lv_bus_ref }))
      : [{ ref: defaultTransformerRef, nnBus: graph.root_bus_refs?.[0] ?? 'fixture-nn-bus' }]
  ).map(({ ref, nnBus }) => ({
    transformer_ref: ref,
    nn_bus_ref: nnBus,
    status: 'OK',
    missing_data: [],
    feeders: [...(feedersByTransformer.get(ref) ?? [])].sort((a, b) =>
      a.feeder_root_branch_ref.localeCompare(b.feeder_root_branch_ref),
    ),
  }));

  return {
    contract: 'LvDomainProjectionV1',
    contract_version: LV_DOMAIN_PROJECTION_CONTRACT_VERSION,
    case_id: caseId,
    station_ref: graph.station_ref,
    scenario_id: scenarioId,
    status: graph.status,
    completeness: graph.status === 'OK' ? 'COMPLETE' : 'UNAVAILABLE',
    missing_data: graph.missing_data,
    model_snapshot: {
      revision: upstreamEquivalents[0]?.model_revision ?? 1,
      model_hash: modelHash,
      operating_state_id: operatingStateId,
      case_id: caseId,
      station_ref: graph.station_ref,
      scenario_id: scenarioId,
      run_snapshot_hash: hasResult ? modelHash : null,
    },
    graph,
    upstream_equivalents: upstreamEquivalents,
    result_snapshot: {
      status: hasResult ? 'FRESH' : 'NONE',
      reason: hasResult ? 'model-niezmieniony' : 'brak-wyniku',
      reason_pl: hasResult
        ? 'Model nie zmienił się od chwili obliczenia.'
        : 'Brak zapisanego wyniku dla tego przebiegu — nie ma czego nałożyć na schemat.',
      run_id: runId,
      analysis_type: resultOverlayPayload?.analysis_type ?? null,
      run_model_hash: hasResult ? modelHash : null,
      run_finished_at: resultOverlayPayload?.run_finished_at ?? null,
      result_contract_version: hasResult ? '1.0' : null,
      result_signature: hasResult ? `fixture-result:${runId}` : null,
      overlay_payload: resultOverlayPayload
        ? {
            elements: resultOverlayPayload.elements,
            legend: { title: 'Legenda wyników', entries: [] },
            warnings: [],
          }
        : null,
      voltage_profile:
        Object.keys(voltageProfileByBusRef).length > 0
          ? { rows: Object.values(voltageProfileByBusRef) }
          : null,
    },
    swz_snapshot: {
      status: 'OK',
      missing_data: [],
      transformers: swzTransformers,
    },
    projection_hash: `fixture:${graph.station_ref}:${scenarioId}:${runId ?? 'none'}`,
  };
}
