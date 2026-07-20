/**
 * Creator Screenshot Harness — render żywych kreatorów ui2 do oceny wizualnej
 * (dyrektywa właściciela #8: zrzuty żywej aplikacji w obu motywach na stałej stronie
 * oceny). Renderuje REALNE komponenty kreatorów z zaszczepionym kontekstem/stanem
 * i podmienionym `fetch` (dane katalogowe), w motywie jasnym/ciemnym.
 *
 * Query: `?creator=pole|oze|transformator|kompensator|magistrala|arcflash&theme=light|dark`.
 * Używany wyłącznie przez: e2e/creator-screenshot.spec.ts (nie część bundla aplikacji).
 */

import { createRoot } from 'react-dom/client';
import './ui2/theme/tokens.css';

import { KreatorKompensatoraSn } from './ui2/kreatory/kompensator';
import { KreatorMagistralaSn } from './ui2/kreatory/magistrala';
import { KreatorPolaSn } from './ui2/kreatory/pole';
import { KreatorTransformatoraSnNn } from './ui2/kreatory/transformator';
import { KreatorZrodlaOze } from './ui2/kreatory/zrodlo-oze';
import { SekcjaArcFlash } from './ui2/wyniki/jakosc/EkranJakosci';
import { useAppStateStore } from './ui/app-state';
import { useSnapshotStore } from './ui/topology/snapshotStore';
import { useNetworkBuildStore } from './ui/network-build/networkBuildStore';
import { useExecutionRunsStore } from './ui/study-cases/runStore';
import type { ExecutionRun } from './ui/study-cases/types';

// --- Motyw ---------------------------------------------------------------
const theme = new URLSearchParams(window.location.search).get('theme') === 'light'
  ? 'light_technical'
  : 'dark_scada';
document.documentElement.setAttribute('data-theme', theme);
document.body.style.background = theme === 'light_technical' ? '#f5f7fa' : '#07111c';

// --- Podmiana fetch: dane katalogowe (bez backendu) ----------------------
const CATALOG_FIXTURES: Record<string, unknown> = {
  '/api/catalog/mv-apparatus-types': [
    { id: 'ap-1', name: 'Wyłącznik próżniowy VD4', device_kind: 'BREAKER', u_n_kv: 17.5, i_n_a: 630, breaking_capacity_ka: 25 },
    { id: 'ap-2', name: 'Rozłącznik LBS', device_kind: 'LOAD_SWITCH', u_n_kv: 17.5, i_n_a: 630, breaking_capacity_ka: 20 },
  ],
  '/api/catalog/switchgear-families': [
    { switchgear_family_ref: 'zpue_rotoblok', family_name: 'Rotoblok SVS', manufacturer_ref: 'ZPUE' },
    { switchgear_family_ref: 'abb_unigear', family_name: 'UniGear ZS1', manufacturer_ref: 'ABB' },
  ],
  '/api/catalog/lv-apparatus-types': [
    { id: 'lv-1', name: 'Wyłącznik nN 630A', u_n_kv: 0.4, i_n_a: 630 },
  ],
  '/api/catalog/pv-inverter-types': [
    { id: 'pv-1', name: 'Falownik PV 900 kVA', manufacturer: 'SMA', un_kv: 0.4, s_n_kva: 1000, p_max_kw: 900, cos_phi_min: 0.9, cos_phi_max: 1.0, ptpiree_status: 'POWIAZANY', ptpiree_certificate_ref: 'WOŚ/2024/PV-900', ptpiree_document_number: 'DOC-PV-900', ptpiree_wos_version: '2.1', ptpiree_source_url: 'https://ptpiree.pl' },
  ],
  '/api/catalog/bess-inverter-types': [
    { id: 'bess-1', name: 'Magazyn 1 MW / 2 MWh', manufacturer: 'Tesla', un_kv: 0.4, s_n_kva: 1100, p_charge_kw: 1000, p_discharge_kw: 1000, e_kwh: 2000, ptpiree_status: 'POWIAZANY', ptpiree_certificate_ref: 'WOŚ/2024/BESS-1M' },
  ],
  '/api/catalog/wind-inverter-types': [
    { id: 'fw-1', name: 'Turbina wiatrowa 2 MW', manufacturer: 'Vestas', kind: 'WIND', un_kv: 0.69, sn_mva: 2.2, pmax_mw: 2.0, qmin_mvar: -0.7, qmax_mvar: 0.7 },
  ],
};

const originalFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  for (const [key, body] of Object.entries(CATALOG_FIXTURES)) {
    if (url.includes(key)) {
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  }
  if (url.includes('/api/catalog/complete-bay-templates')) {
    return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (url.includes('/api/quality/arc-flash')) {
    return new Response(
      JSON.stringify({
        analysis_id: 'af-demo',
        context: null,
        status: 'COMPUTED_IEEE_1584_OPEN_SOURCE',
        status_label_pl: 'obliczony (IEEE 1584 open-source)',
        results: [
          {
            bus_ref: 'Szyna SN-1', status: 'COMPUTED_IEEE_1584_OPEN_SOURCE', status_label_pl: 'obliczony (IEEE 1584 open-source)',
            method: 'IEEE_1584_2018', electrode_config: 'VCB', i_bf_ka: 12.5, voltage_kv: 15.0, arc_time_s: 0.2,
            conductor_gap_mm: 152, working_distance_mm: 455, i_arc_ka: 11.8, incident_energy_cal_cm2: 8.42,
            incident_energy_joule_cm2: 35.2, arc_flash_boundary_mm: 1320, ppe_category: '2', ppe_table_provenance: null,
            provenance: 'ARC_FLASH_OPEN_SOURCE_PROVENANCE', provenance_caveat_pl: 'Wynik na współczynnikach open-source — wymaga weryfikacji z licencjonowaną normą IEEE 1584.',
            why_pl: 'Energia incydentu wyznaczona wg IEEE 1584-2018.', missing_data: [], white_box: [],
          },
          {
            bus_ref: 'Szyna SN-2', status: 'COMPUTED_IEEE_1584_OPEN_SOURCE', status_label_pl: 'obliczony (IEEE 1584 open-source)',
            method: 'IEEE_1584_2018', electrode_config: 'VCB', i_bf_ka: 8.1, voltage_kv: 15.0, arc_time_s: 0.2,
            conductor_gap_mm: 152, working_distance_mm: 455, i_arc_ka: 7.7, incident_energy_cal_cm2: 4.15,
            incident_energy_joule_cm2: 17.4, arc_flash_boundary_mm: 890, ppe_category: '1', ppe_table_provenance: null,
            provenance: 'ARC_FLASH_OPEN_SOURCE_PROVENANCE', provenance_caveat_pl: null,
            why_pl: 'Energia incydentu wyznaczona wg IEEE 1584-2018.', missing_data: [], white_box: [],
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  return originalFetch(input as RequestInfo, init);
}) as typeof window.fetch;

// --- Zaszczepienie stanu store ------------------------------------------
useAppStateStore.setState({ activeCaseId: 'case-demo' } as never);
useSnapshotStore.setState({
  snapshot: {
    header: { name: 'Projekt demonstracyjny' },
    substations: [{ ref_id: 'st-demo', name: 'Rozdzielnia GPZ-01', bus_refs: ['bus-sn-demo', 'bus-nn-demo'] }],
    transformers: [],
    buses: [
      { ref_id: 'bus-sn-demo', name: 'Szyna SN', voltage_kv: 15 },
      { ref_id: 'bus-nn-demo', name: 'Szyna nN', voltage_kv: 0.4 },
    ],
    sources: [],
    loads: [],
    bays: [],
  },
} as never);

const creator = new URLSearchParams(window.location.search).get('creator') ?? 'pole';

if (creator === 'arcflash') {
  const run: ExecutionRun = { id: 'run-sc-1', analysis_type: 'SC_3F', status: 'DONE' } as unknown as ExecutionRun;
  useExecutionRunsStore.setState({ runs: [run], activeRunId: 'run-sc-1' } as never);
} else {
  // Kontekst operacji (szyna/stacja) dla kreatorów pole/OZE/transformator.
  const op =
    creator === 'oze'
      ? 'add_converter_source'
      : creator === 'transformator'
      ? 'add_transformer_sn_nn'
      : creator === 'kompensator'
      ? 'add_shunt_compensator_sn'
      : creator === 'magistrala'
      ? 'continue_trunk_segment_sn'
      : 'add_sn_bay';
  useNetworkBuildStore.getState().openOperationForm(op as never, {
    station_ref: 'st-demo',
    bus_ref: 'bus-sn-demo',
    bus_nn_ref: 'bus-nn-demo',
    bus_name: 'Szyna SN',
    voltage_kv: 15,
    length_m: 2500,
    from_terminal_id: 'term-demo',
    terminalId: 'term-demo',
    terminal_voltage_label: '15 kV',
    station_label: 'Rozdzielnia GPZ-01',
  });
}

function Harness() {
  let node: React.ReactNode;
  if (creator === 'oze') node = <KreatorZrodlaOze />;
  else if (creator === 'transformator') node = <KreatorTransformatoraSnNn />;
  else if (creator === 'kompensator') node = <KreatorKompensatoraSn />;
  else if (creator === 'magistrala') node = <KreatorMagistralaSn />;
  else if (creator === 'arcflash') {
    node = (
      <SekcjaArcFlash
        przebieg={{ id: 'run-sc-1', analysis_type: 'SC_3F', status: 'DONE' } as unknown as ExecutionRun}
        trybZaawansowania="expert"
        onOtworzDowod={() => undefined}
      />
    );
  } else node = <KreatorPolaSn />;

  return (
    <div
      data-testid="creator-harness-root"
      data-status="ready"
      data-creator={creator}
      data-theme={theme}
      style={{
        width: creator === 'arcflash' ? 1180 : 1180,
        minHeight: 800,
        padding: 16,
        background: 'var(--mvd-bg, #07111c)',
        color: 'var(--mvd-ink, #e5eef6)',
      }}
    >
      {node}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
