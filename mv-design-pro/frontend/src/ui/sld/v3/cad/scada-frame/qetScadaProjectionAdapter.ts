/**
 * Adapter WYŁĄCZNIE ODCZYTU: atomowa LvDomainProjectionV1 → QET-SCADA Frame.
 * Nie tworzy ENM, nie wymyśla położeń; brak stanu to błąd walidacji.
 * Korzysta wyłącznie z oryginalnej odpowiedzi backendu (bez BFS i solvera UI).
 */
import type { LvDomainProjectionV1 } from '../../lv-domain/types';
import type { ScadaFrameInput, KontraktWersjiSld, RodzajAparatu } from './scadaFrameState';

export function kontraktWersjiRamki(projection: LvDomainProjectionV1): KontraktWersjiSld {
  const model = projection.model_snapshot;
  const result = projection.result_snapshot;
  const scenarioId = [projection.case_id, projection.scenario_id, model.operating_state_id].join('/');
  const fresh = result.status === 'FRESH' && Boolean(result.run_id) &&
    result.run_model_hash === model.model_hash && model.model_hash.length > 0;
  return {
    scenarioId,
    enmVersion: `${model.revision}`,
    topologyHash: model.model_hash,
    resultSnapshotId: fresh ? result.run_id : null,
    resultTopologyHash: fresh ? result.run_model_hash : null,
    resultEnmVersion: fresh ? `${model.revision}` : null,
    resultScenarioId: fresh ? scenarioId : null,
  };
}

export function daneRamkiZProjekcji(
  projection: LvDomainProjectionV1,
  deviceRef: string,
): ScadaFrameInput | null {
  const device = projection.graph.devices.find(d=>d.ref_id === deviceRef);
  if(!device) return null;
  const kind: RodzajAparatu = device.device_type === 'fuse'
    ? 'BEZPIECZNIK'
    : device.device_type === 'line_overhead' || device.device_type === 'cable'
      ? 'ELEMENT_STALY' : 'LACZNIK';
  const polozenie = device.device_state === 'CLOSED'
    ? 'ZAMKNIETY' as const
    : device.device_state === 'OPEN' ? 'OTWARTY' as const : null;
  const version = kontraktWersjiRamki(projection);
  return {
    elementRef: deviceRef,
    rodzaj: kind,
    polozenie,
    eksploatacja: 'NORMALNY',
    jakosc: projection.status === 'OK' && projection.completeness === 'COMPLETE'
      ? 'PRAWIDLOWE' : 'BRAK',
    zrodlo: 'ENM',
    // Mechaniczny stan urządzenia ≠ napięcie na obydwu jego zaciskach.
    zasilenie: 'NIEUSTALONY',
    wersjaStanu: version,
    wersjaWidoku: version,
  };
}
