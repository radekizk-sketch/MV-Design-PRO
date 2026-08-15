import { useEffect, useMemo, useState } from 'react';

import {
  fetchNcRfgTestCatalog,
  runNcRfgPtpireeTests,
  type NcRfgCertificateStatus,
  type NcRfgModuleInput,
  type NcRfgRunResult,
  type NcRfgTestCatalogResponse,
  type NcRfgVerdict,
} from '../../ncrfg-tests/api';
import { useAppStateStore } from '../../app-state';
import { notify } from '../../notifications/store';
import {
  selectAllDers,
  useStationDerStore,
  type StationDerConnection,
} from '../../network-build/station-der';
import { navigateToCatalog, navigateToNetworkBuild } from '../../navigation/routes';

const FLOW_STEPS = [
  'Wybierz stację SN/nN na schemacie jednokreskowym.',
  'Dodaj PV, BESS albo farmę wiatrową z katalogu urządzeń.',
  'Przypisz falownik, moc znamionową, PCC i wariant przyłączenia.',
  'Wybierz profil operatora, krzywe LVRT/HVRT i regulację Q(U)/P(f).',
  'Wróć do tej zakładki i wykonaj pakiet testów NC RfG/PTPiREE.',
] as const;

const EMPTY_BLOCKER_ROWS = [
  {
    area: 'Źródło DER',
    missing: 'brak układu PV/BESS/FW w modelu stacji',
    action: 'Dodaj źródło z katalogu w karcie stacji',
  },
  {
    area: 'Falownik / PCS',
    missing: 'brak pozycji katalogowej urządzenia',
    action: 'Wybierz producenta, model i certyfikat PTPiREE',
  },
  {
    area: 'Moc znamionowa',
    missing: 'brak katalogowej mocy Pn',
    action: 'Uzupełnij moc z danych katalogowych, nie ręcznie zgadywaną',
  },
  {
    area: 'PCC',
    missing: 'brak punktu przyłączenia do stacji lub ciągu SN',
    action: 'Przypisz port/pole i wariant przyłączenia',
  },
  {
    area: 'Profile NC RfG',
    missing: 'brak profilu operatora oraz krzywych LVRT/HVRT',
    action: 'Wybierz profil OSD, FRT/HVRT i regulacje Q(U)/P(f)',
  },
] as const;

const AUDIT_ROLES = [
  {
    role: 'Profesor sieci SN',
    check: 'Topologia, PCC, poziom napięcia i brak symboli pozornych.',
  },
  {
    role: 'Projektant OSD',
    check: 'Czy użytkownik przechodzi od katalogu do raportu bez ręcznego zgadywania danych.',
  },
  {
    role: 'Specjalista DER/NC RfG',
    check: 'Falownik, certyfikat PTPiREE, FRT, P(f), Q(U), SCADA i rejestrator zakłóceń.',
  },
  {
    role: 'Zabezpieczeniowiec',
    check: 'Czy dane DER wystarczają do późniejszej selektywności i raportu.',
  },
  {
    role: 'UX lead',
    check: 'Czytelność kroków, tabel wyników, CTA i brak niejawnych blokad.',
  },
  {
    role: 'QA lead',
    check: 'Każda blokada musi mieć test, zrzut ekranu albo jawny wpis ryzyka.',
  },
] as const;

type NumericField =
  | 'pMinKw'
  | 'droopPercent'
  | 'deadBandHz'
  | 'rampPctPerMin'
  | 'cosPhiMin'
  | 'qMin'
  | 'qMax'
  | 'reactiveCurrentGain'
  | 'pRecoveryTimeS'
  | 'thduPercent';

const DEFAULT_NUMERIC: Record<NumericField, string> = {
  pMinKw: '',
  droopPercent: '5',
  deadBandHz: '0.2',
  rampPctPerMin: '10',
  cosPhiMin: '0.95',
  qMin: '-0.33',
  qMax: '0.33',
  reactiveCurrentGain: '2',
  pRecoveryTimeS: '1',
  thduPercent: '',
};

const VERDICT_LABELS: Record<NcRfgVerdict, string> = {
  pass: 'spełniony',
  fail: 'niespełniony',
  no_data: 'brak danych',
  not_required: 'niewymagany',
};

const VERDICT_CLASS: Record<NcRfgVerdict, string> = {
  pass: 'border-emerald-400/50 bg-emerald-500/10 text-emerald-700',
  fail: 'border-rose-400/50 bg-rose-500/10 text-rose-700',
  no_data: 'border-amber-400/50 bg-amber-500/10 text-amber-700',
  not_required: 'border-slate-200 bg-slate-100 text-slate-600',
};

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim().replace(',', '.');
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferVoltageKv(der: StationDerConnection): number {
  if (der.connection_side === 'nN' || der.voltage_level_ref?.includes('0.4')) return 0.4;
  return 15;
}

function inferCertificateStatus(der: StationDerConnection): NcRfgCertificateStatus {
  return der.catalogs.ptpiree_certificate_ref || der.catalogs.device_catalog_ref?.includes('ptpiree')
    ? 'ptpiree_verified'
    : 'unknown';
}

function buildModuleInput(args: {
  der: StationDerConnection;
  operatorId: string;
  certificateStatus: NcRfgCertificateStatus;
  numeric: Record<NumericField, string>;
  capabilities: Record<string, boolean>;
}): NcRfgModuleInput | null {
  if (typeof args.der.nominal_power_kw !== 'number' || args.der.nominal_power_kw <= 0) {
    return null;
  }
  return {
    der_ref: args.der.id,
    der_name: args.der.name,
    der_kind: args.der.der_kind === 'FW' ? 'FW' : args.der.der_kind,
    module_family: 'PPM',
    operator_id: args.operatorId,
    p_max_kw: args.der.nominal_power_kw,
    p_min_kw: parseOptionalNumber(args.numeric.pMinKw),
    voltage_kv: inferVoltageKv(args.der),
    certificate_status: args.certificateStatus,
    has_lvrt_curve: args.capabilities.hasLvrtCurve,
    has_hvrt_curve: args.capabilities.hasHvrtCurve,
    has_pf_droop: args.capabilities.hasPfDroop,
    has_qu_curve: args.capabilities.hasQuCurve,
    has_dynamic_model: args.capabilities.hasDynamicModel,
    has_scada_communication: args.capabilities.hasScadaCommunication,
    has_disturbance_recorder: args.capabilities.hasDisturbanceRecorder,
    active_power_control_enabled: args.capabilities.activePowerControlEnabled,
    stop_generation_enabled: args.capabilities.stopGenerationEnabled,
    reduction_generation_enabled: args.capabilities.reductionGenerationEnabled,
    island_operation_required: args.capabilities.islandOperationRequired,
    island_operation_capable: args.capabilities.islandOperationCapable,
    black_start_required: args.capabilities.blackStartRequired,
    black_start_capable: args.capabilities.blackStartCapable,
    power_oscillation_damping_required: args.capabilities.powerOscillationDampingRequired,
    power_oscillation_damping_enabled: args.capabilities.powerOscillationDampingEnabled,
    droop_percent: parseOptionalNumber(args.numeric.droopPercent),
    dead_band_hz: parseOptionalNumber(args.numeric.deadBandHz),
    ramp_rate_pct_per_min: parseOptionalNumber(args.numeric.rampPctPerMin),
    cos_phi_min: parseOptionalNumber(args.numeric.cosPhiMin),
    q_range_pct_pn_min: parseOptionalNumber(args.numeric.qMin),
    q_range_pct_pn_max: parseOptionalNumber(args.numeric.qMax),
    reactive_current_gain: parseOptionalNumber(args.numeric.reactiveCurrentGain),
    p_recovery_time_s: parseOptionalNumber(args.numeric.pRecoveryTimeS),
    harmonic_thdu_percent: parseOptionalNumber(args.numeric.thduPercent),
  };
}

function CapabilityToggle({
  label,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-cyan-400"
      />
      <span>{label}</span>
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs text-slate-600">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-cyan-400"
      />
    </label>
  );
}

function ResultBadge({ verdict }: { readonly verdict: NcRfgVerdict }) {
  return (
    <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${VERDICT_CLASS[verdict]}`}>
      {VERDICT_LABELS[verdict]}
    </span>
  );
}

function AuditMatrix() {
  return (
    <section
      data-testid="ncrfg-audit-matrix"
      className="rounded border border-slate-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-cyan-700">
            Matryca audytu specjalistycznego
          </div>
          <h4 className="mt-1 text-sm font-semibold">Kontrola każdego kroku flow</h4>
        </div>
        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
          6 ról / zero ukrytych wyjątków
        </div>
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
        {AUDIT_ROLES.map((entry) => (
          <div key={entry.role} className="rounded border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-900">{entry.role}</div>
            <div className="mt-1 text-[11px] leading-5 text-slate-500">{entry.check}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MissingDerState() {
  return (
    <section
      data-testid="ncrfg-empty-state"
      className="rounded border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-700"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            Brak układów DER do testów
          </div>
          <h4 className="mt-1 text-base font-semibold text-amber-800">
            Najpierw dodaj źródło z katalogu i przypisz profil NC RfG
          </h4>
          <p className="mt-2 text-xs leading-5 text-amber-700">
            Pakiet PTPiREE jest zablokowany bez katalogowej mocy, falownika, PCC i profilu operatora.
            To nie jest błąd solvera, tylko brak danych wejściowych wymaganych do audytu zgodności.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="ncrfg-open-sld"
            onClick={navigateToNetworkBuild}
            className="rounded border border-amber-300 bg-amber-300 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-200"
          >
            Przejdź do schematu
          </button>
          <button
            type="button"
            data-testid="ncrfg-open-catalog"
            onClick={() => navigateToCatalog()}
            className="rounded border border-amber-300/60 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-300/10"
          >
            Otwórz katalog falowników
          </button>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto rounded border border-amber-300/20 bg-white">
        <table data-testid="ncrfg-blocker-table" className="min-w-full border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-amber-700">
            <tr>
              <th className="border-b border-amber-300/20 px-3 py-2">Obszar</th>
              <th className="border-b border-amber-300/20 px-3 py-2">Status braków</th>
              <th className="border-b border-amber-300/20 px-3 py-2">Działanie naprawcze</th>
            </tr>
          </thead>
          <tbody>
            {EMPTY_BLOCKER_ROWS.map((row) => (
              <tr key={row.area} className="border-t border-amber-300/10">
                <td className="px-3 py-2 font-semibold text-amber-800">{row.area}</td>
                <td className="px-3 py-2 text-amber-700">{row.missing}</td>
                <td className="px-3 py-2 text-amber-800">{row.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ol data-testid="ncrfg-flow-checklist" className="mt-4 grid gap-2 lg:grid-cols-5">
        {FLOW_STEPS.map((step, index) => (
          <li key={step} className="rounded border border-amber-300/20 bg-white p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
              Krok {index + 1}
            </div>
            <div className="mt-1 text-xs leading-5 text-amber-800">{step}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function NcRfgTestsTab(): JSX.Element {
  const ders = useStationDerStore((state) => selectAllDers(state));
  const [catalog, setCatalog] = useState<NcRfgTestCatalogResponse | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedDerId, setSelectedDerId] = useState<string>(ders[0]?.id ?? '');
  const [operatorId, setOperatorId] = useState('enea');
  const [certificateStatus, setCertificateStatus] = useState<NcRfgCertificateStatus>('unknown');
  const [numeric, setNumeric] = useState<Record<NumericField, string>>(DEFAULT_NUMERIC);
  const [capabilities, setCapabilities] = useState<Record<string, boolean>>({
    hasLvrtCurve: true,
    hasHvrtCurve: true,
    hasPfDroop: true,
    hasQuCurve: true,
    hasDynamicModel: true,
    hasScadaCommunication: true,
    hasDisturbanceRecorder: true,
    activePowerControlEnabled: true,
    stopGenerationEnabled: true,
    reductionGenerationEnabled: true,
    islandOperationRequired: false,
    islandOperationCapable: false,
    blackStartRequired: false,
    blackStartCapable: false,
    powerOscillationDampingRequired: false,
    powerOscillationDampingEnabled: false,
  });
  const [status, setStatus] = useState<'idle' | 'running' | 'ready' | 'error'>('idle');
  const [result, setResult] = useState<NcRfgRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchNcRfgTestCatalog()
      .then((payload) => {
        if (cancelled) return;
        setCatalog(payload);
        setCatalogError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCatalogError(err instanceof Error ? err.message : 'Nie udało się pobrać katalogu testów.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedDerId && ders[0]) {
      setSelectedDerId(ders[0].id);
    }
  }, [ders, selectedDerId]);

  const selectedDer = useMemo(
    () => ders.find((der) => der.id === selectedDerId) ?? ders[0] ?? null,
    [ders, selectedDerId],
  );

  useEffect(() => {
    if (!selectedDer) return;
    setCertificateStatus(inferCertificateStatus(selectedDer));
    setCapabilities((current) => ({
      ...current,
      hasLvrtCurve: Boolean(selectedDer.profiles.lvrt_curve_ref) || current.hasLvrtCurve,
      hasHvrtCurve: Boolean(selectedDer.profiles.hvrt_curve_ref) || current.hasHvrtCurve,
      hasPfDroop: Boolean(selectedDer.profiles.pf_curve_ref || selectedDer.profiles.regulation_profile_ref) || current.hasPfDroop,
      hasQuCurve: Boolean(selectedDer.profiles.regulation_profile_ref) || current.hasQuCurve,
      hasDynamicModel: Boolean(selectedDer.catalogs.dynamic_model_ref) || current.hasDynamicModel,
    }));
  }, [selectedDer]);

  const modulePreview = useMemo(
    () =>
      selectedDer
        ? buildModuleInput({
            der: selectedDer,
            operatorId,
            certificateStatus,
            numeric,
            capabilities,
          })
        : null,
    [capabilities, certificateStatus, numeric, operatorId, selectedDer],
  );

  const runDisabledReason = !selectedDer
    ? 'Dodaj układ PV/BESS/FW z katalogu, a następnie przypisz moc, PCC, falownik i profil NC RfG.'
    : status === 'running'
      ? 'Testy NC RfG są w toku.'
      : null;

  const runTests = async (): Promise<void> => {
    if (!selectedDer) {
      notify('Dodaj układ PV/BESS/FW z katalogu przed wykonaniem testów NC RfG.', 'warning');
      return;
    }
    if (!modulePreview) {
      notify('Wybrany układ DER nie ma katalogowej mocy znamionowej. Wybierz urządzenie z katalogu PTPiREE/DER.', 'error');
      return;
    }
    setStatus('running');
    setError(null);
    try {
      // Aktywny przypadek → backend dopina dowód certyfikatu PTPiREE z tabliczek
      // urządzeń modelu (bez niego certificate_evidence wraca z pustymi polami).
      const payload = await runNcRfgPtpireeTests(
        {
          modules: [modulePreview],
          procedure_version: catalog?.procedure_version ?? 'PTPiREE Procedura testowania v3.0',
        },
        useAppStateStore.getState().activeCaseId,
      );
      setResult(payload);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się wykonać testów NC RfG.');
      setStatus('error');
    }
  };

  const moduleResult = result?.modules[0] ?? null;

  return (
    <div data-testid="ncrfg-tests-tab" className="space-y-4 text-slate-900">
      <section className="rounded border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Testy NC RfG</div>
            <h3 className="mt-1 text-base font-semibold">Pakiet symulacji zgodności PTPiREE</h3>
            <p className="mt-1 max-w-3xl text-xs text-slate-600">
              Zakładka wykonuje pełny pakiet testów wymaganych procedurą PTPiREE v3.0 dla modułu PV/BESS/FW:
              częstotliwość, regulacje P/Q/cosφ/U, PMAX/PMIN, FRT/HVRT, odbudowę P, prąd bierny,
              komendy redukcji generacji i zdolności dodatkowe.
            </p>
          </div>
          <button
            type="button"
            data-testid="ncrfg-run-tests"
            onClick={() => void runTests()}
            disabled={Boolean(runDisabledReason)}
            title={runDisabledReason ?? 'Wykonaj pakiet testów zgodności NC RfG/PTPiREE dla wybranego DER.'}
            aria-label={runDisabledReason ?? 'Wykonaj testy NC RfG'}
            className="rounded border border-cyan-400 bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'running' ? 'Trwają testy...' : 'Wykonaj testy NC RfG'}
          </button>
        </div>
        {runDisabledReason ? (
          <div
            data-testid="ncrfg-run-disabled-reason"
            className="mt-3 rounded border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700"
          >
            {runDisabledReason}
          </div>
        ) : null}
        {catalogError ? (
          <div className="mt-3 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700">
            Katalog testów nie został pobrany: {catalogError}
          </div>
        ) : null}
      </section>

      <AuditMatrix />

      {ders.length === 0 ? (
        <MissingDerState />
      ) : (
        <section className="grid gap-4 xl:grid-cols-[420px_1fr]">
          <div className="rounded border border-slate-200 bg-white p-4">
            <h4 className="text-sm font-semibold">Wejście testu</h4>
            <div className="mt-3 space-y-3">
              <label className="block text-xs text-slate-600">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">Układ DER</span>
                <select
                  value={selectedDer?.id ?? ''}
                  onChange={(event) => setSelectedDerId(event.target.value)}
                  className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900"
                >
                  {ders.map((der) => (
                    <option key={der.id} value={der.id}>
                      {der.name} · {der.der_kind} · {der.nominal_power_kw ?? 'brak mocy'} kW
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block text-xs text-slate-600">
                  <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">Operator</span>
                  <select
                    value={operatorId}
                    onChange={(event) => setOperatorId(event.target.value)}
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900"
                  >
                    {(catalog?.operators ?? [{ operator_id: 'enea', operator_name_pl: 'Enea Operator' }]).map((operator) => (
                      <option key={operator.operator_id} value={operator.operator_id}>
                        {operator.operator_name_pl}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-slate-600">
                  <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">Certyfikat</span>
                  <select
                    value={certificateStatus}
                    onChange={(event) => setCertificateStatus(event.target.value as NcRfgCertificateStatus)}
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900"
                  >
                    <option value="ptpiree_verified">PTPiREE zweryfikowany</option>
                    <option value="none">Brak certyfikatu</option>
                    <option value="expired">Certyfikat nieważny</option>
                    <option value="unknown">Nieustalony</option>
                  </select>
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {(Object.keys(DEFAULT_NUMERIC) as NumericField[]).map((field) => (
                  <NumberInput
                    key={field}
                    label={{
                      pMinKw: 'PMIN [kW]',
                      droopPercent: 'Droop P(f) [%]',
                      deadBandHz: 'Martwa strefa [Hz]',
                      rampPctPerMin: 'Rampa P [%/min]',
                      cosPhiMin: 'cosφ min',
                      qMin: 'Qmin/Pn [p.u.]',
                      qMax: 'Qmax/Pn [p.u.]',
                      reactiveCurrentGain: 'K_FRT [-]',
                      pRecoveryTimeS: 'Odbudowa P [s]',
                      thduPercent: 'THD_U [%]',
                    }[field]}
                    value={numeric[field]}
                    onChange={(value) => setNumeric((current) => ({ ...current, [field]: value }))}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-white p-4">
            <h4 className="text-sm font-semibold">Zdolności techniczne</h4>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {[
                ['hasLvrtCurve', 'Krzywa LVRT'],
                ['hasHvrtCurve', 'Krzywa HVRT'],
                ['hasPfDroop', 'Droop P(f)'],
                ['hasQuCurve', 'Krzywa Q(U)'],
                ['hasDynamicModel', 'Model dynamiczny'],
                ['hasScadaCommunication', 'SCADA operatora'],
                ['hasDisturbanceRecorder', 'Rejestrator zakłóceń'],
                ['activePowerControlEnabled', 'Regulacja P'],
                ['stopGenerationEnabled', 'Zaprzestanie generacji'],
                ['reductionGenerationEnabled', 'Zmniejszenie generacji'],
                ['islandOperationRequired', 'Wymagana praca wyspowa'],
                ['islandOperationCapable', 'Zdolność pracy wyspowej'],
                ['blackStartRequired', 'Wymagany black start'],
                ['blackStartCapable', 'Zdolność black start'],
                ['powerOscillationDampingRequired', 'Wymagane tłumienie oscylacji'],
                ['powerOscillationDampingEnabled', 'Tłumienie oscylacji aktywne'],
              ].map(([key, label]) => (
                <CapabilityToggle
                  key={key}
                  label={label}
                  checked={Boolean(capabilities[key])}
                  onChange={(checked) => setCapabilities((current) => ({ ...current, [key]: checked }))}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {error ? (
        <section className="rounded border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-100">
          {error}
        </section>
      ) : null}

      {moduleResult ? (
        <section className="rounded border border-slate-200 bg-white p-4" data-testid="ncrfg-result">
          <div className="grid gap-3 md:grid-cols-5">
            <div>
              <div className="text-[11px] uppercase text-slate-500">Status</div>
              <div className="text-sm font-semibold text-slate-900">{moduleResult.overall_status}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-slate-500">Typ PGM</div>
              <div className="text-sm font-semibold text-slate-900">{moduleResult.module_type}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-slate-500">Wymagane</div>
              <div className="text-sm font-semibold text-slate-900">{moduleResult.required_count}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-slate-500">PASS / FAIL</div>
              <div className="text-sm font-semibold text-slate-900">{moduleResult.pass_count} / {moduleResult.fail_count}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-slate-500">Hash</div>
              <div className="break-all text-[11px] text-slate-600">{result?.deterministic_hash}</div>
            </div>
          </div>
          <div className="mt-4 grid gap-2 xl:grid-cols-2">
            {moduleResult.tests.map((test) => (
              <div key={test.test_id} className="rounded border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-900">
                    {test.test_id} · {test.ability_pl}
                  </div>
                  <ResultBadge verdict={test.verdict} />
                </div>
                <div className="mt-1 text-[11px] text-slate-500">{test.required_reason_pl}</div>
                <div className="mt-2 text-xs text-slate-600">{test.summary_pl}</div>
                {test.fix_actions.length > 0 ? (
                  <div className="mt-2 text-[11px] text-amber-700">
                    {test.fix_actions.join(' ')}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {result ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded border border-slate-200 bg-white p-4">
            <h4 className="text-sm font-semibold">Pełna jawność obliczeń</h4>
            <div className="mt-3 max-h-[360px] space-y-2 overflow-auto">
              {result.white_box_trace.slice(0, 20).map((step) => (
                <div key={step.proof_ref} className="rounded border border-slate-200 bg-slate-50 p-2">
                  <div className="text-xs font-semibold text-cyan-700">{step.test_id} · {step.key}</div>
                  <div className="mt-1 text-[11px] text-slate-600">{step.formula}</div>
                  <div className="mt-1 text-[11px] text-slate-500">{step.substitution}</div>
                  <div className="mt-1 text-[11px] text-slate-500">{step.unit_check}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded border border-slate-200 bg-white p-4">
            <h4 className="text-sm font-semibold">Raport PL</h4>
            <pre className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-[11px] text-slate-700">
              {result.report_pl}
            </pre>
          </div>
        </section>
      ) : null}
    </div>
  );
}
