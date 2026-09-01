/** Budowniczy wyłącznie dla testów i deterministycznego harnessu L2.
 *  Produkcja otrzymuje ten sam kształt z endpointu `/projection/v1`. */
import type { RawOverlayPayload } from '../../../../sld-overlay/rawResultOverlayStore';
import type { SwzOverlayEntry } from '../../canvas/overlay';
import type {
  LvDomainGraphView,
  LvDomainProjectionV1,
  LvDomainVoltageProfileRow,
  UpstreamEquivalentSnapshot,
} from '../types';

interface FixtureProjectionOptions {
  readonly graph: LvDomainGraphView;
  readonly upstreamEquivalents?: readonly UpstreamEquivalentSnapshot[];
  readonly scenarioId?: 'MAX' | 'MIN';
  readonly resultOverlayPayload?: RawOverlayPayload | null;
  readonly voltageProfileByBusRef?: Readonly<Record<string, LvDomainVoltageProfileRow>>;
  readonly swzByFeederRef?: Readonly<Record<string, SwzOverlayEntry>>;
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
  } = options;
  const modelHash = upstreamEquivalents[0]?.model_hash ?? 'fixture-model-hash';
  const operatingStateId =
    upstreamEquivalents[0]?.operating_state_id ?? 'fixture-operating-state';
  const runId = resultOverlayPayload?.run_id ?? null;
  const hasResult = resultOverlayPayload !== null;

  return {
    contract: 'LvDomainProjectionV1',
    contract_version: '1.0.0',
    case_id: upstreamEquivalents[0]?.case_id ?? 'fixture-case',
    station_ref: graph.station_ref,
    scenario_id: scenarioId,
    status: graph.status,
    completeness: graph.status === 'OK' ? 'COMPLETE' : 'UNAVAILABLE',
    missing_data: graph.missing_data,
    model_snapshot: {
      revision: upstreamEquivalents[0]?.model_revision ?? 1,
      model_hash: modelHash,
      operating_state_id: operatingStateId,
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
      feeders: Object.values(swzByFeederRef).map((entry) => ({
        feeder_root_branch_ref: entry.ownerRef,
        worst_point_bus_ref: null,
        points: [],
        swz: {
          status: 'OK',
          breaker_ref: entry.ownerRef,
          swz: {
            status: entry.status,
            przyczyna_pl: entry.przyczynaPl,
            ik1_min_a: entry.ik1MinA,
            ia_wymagane_a: entry.iaWymaganeA,
            t_wymagany_s: entry.tWymaganyS,
            margines: entry.margines,
          },
        },
      })),
    },
    projection_hash: `fixture:${graph.station_ref}:${scenarioId}:${runId ?? 'none'}`,
  };
}
