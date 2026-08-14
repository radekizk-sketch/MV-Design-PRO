/**
 * NnCircuitProofPanel — pobieranie pakietu dowodowego LV_CIRCUIT_VERIFICATION
 * dla obwodu nN (karta P0.10, G-21).
 *
 * Osobny, w pełni funkcjonalny panel — NIE rozszerza `ProofPacksPanel`
 * (8 kanonicznych pakietów V12.xx, `CANONICAL_PROOF_PACKS` jest zamrożoną
 * listą). `ProofPacksPanel` zmierzony jako ZAMONTOWANY (nie martwy), ale bez
 * callbacków generate/show/export dla WSZYSTKICH ośmiu pakietów — naprawa
 * tego dla ośmiu istniejących pakietów wymaga osobnej, per-pack integracji
 * (poza zakresem karty P0.10, patrz meldunek). Ten panel jest kompletną,
 * przetestowaną ścieżką WYŁĄCZNIE dla nowego pakietu nN — zero fabrykacji:
 * przycisk pobierania woła realny `POST /api/nn-proof/circuit/pack`.
 *
 * Stan: idle → loading → success | error (żadnego cichego niepowodzenia —
 * błąd z backendu (`detail`, powód po polsku) pokazany wprost).
 */

import { useCallback, useState } from 'react';
import { useAppStateStore } from '../../../app-state';
import { downloadLvCircuitVerificationPack, type NnCircuitProofRequest } from './nnCircuitProofApi';

type Stan = 'idle' | 'loading' | 'success' | 'error';

interface FormularzWejscia {
  stationRef: string;
  busRef: string;
  breakerRef: string;
  segmentRef: string;
  pMw: string;
  qMvar: string;
  uLlKv: string;
  izKatalogoweA: string;
  srodowisko: 'powietrze' | 'grunt';
  izolacja: 'PVC' | 'XLPE';
  temperaturaC: string;
  liczbaObwodow: string;
  ikMaxKa: string;
  ithA: string;
  faultDurationS: string;
  ith1sA: string;
  jth1sAPerMm2: string;
  crossSectionMm2: string;
  vdropUSourceKv: string;
  vdropDeltaUTotalKv: string;
}

const PUSTY_FORMULARZ: FormularzWejscia = {
  stationRef: '',
  busRef: '',
  breakerRef: '',
  segmentRef: '',
  pMw: '',
  qMvar: '',
  uLlKv: '0.4',
  izKatalogoweA: '',
  srodowisko: 'powietrze',
  izolacja: 'PVC',
  temperaturaC: '30',
  liczbaObwodow: '1',
  ikMaxKa: '',
  ithA: '',
  faultDurationS: '',
  ith1sA: '',
  jth1sAPerMm2: '',
  crossSectionMm2: '',
  vdropUSourceKv: '0.4',
  vdropDeltaUTotalKv: '',
};

function num(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export interface NnCircuitProofPanelProps {
  readonly className?: string;
}

export function NnCircuitProofPanel({ className }: NnCircuitProofPanelProps) {
  const activeProjectId = useAppStateStore((state) => state.activeProjectId);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const activeProjectName = useAppStateStore((state) => state.activeProjectName);
  const activeCaseName = useAppStateStore((state) => state.activeCaseName);

  const [formularz, setFormularz] = useState<FormularzWejscia>(PUSTY_FORMULARZ);
  const [stan, setStan] = useState<Stan>('idle');
  const [komunikat, setKomunikat] = useState<string | null>(null);

  const pole = useCallback(
    <K extends keyof FormularzWejscia>(klucz: K) =>
      (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormularz((prev) => ({ ...prev, [klucz]: event.target.value }) as FormularzWejscia);
      },
    [],
  );

  const gotoweDoWyslania =
    formularz.stationRef.trim() !== '' &&
    formularz.busRef.trim() !== '' &&
    formularz.breakerRef.trim() !== '' &&
    formularz.segmentRef.trim() !== '' &&
    num(formularz.pMw) !== undefined &&
    num(formularz.qMvar) !== undefined &&
    num(formularz.uLlKv) !== undefined &&
    num(formularz.izKatalogoweA) !== undefined &&
    num(formularz.temperaturaC) !== undefined &&
    num(formularz.liczbaObwodow) !== undefined &&
    num(formularz.vdropUSourceKv) !== undefined &&
    num(formularz.vdropDeltaUTotalKv) !== undefined &&
    !!activeProjectId &&
    !!activeCaseId;

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!gotoweDoWyslania || !activeProjectId || !activeCaseId) return;
      setStan('loading');
      setKomunikat(null);
      const teraz = new Date().toISOString();
      const payload: NnCircuitProofRequest = {
        project_id: activeProjectId,
        case_id: activeCaseId,
        run_id: `nn-circuit-${teraz}`,
        snapshot_id: `nn-circuit-${teraz}`,
        project_name: activeProjectName || 'Projekt',
        case_name: activeCaseName || 'Przypadek',
        run_timestamp: teraz,
        station_ref: formularz.stationRef.trim(),
        bus_ref: formularz.busRef.trim(),
        breaker_ref: formularz.breakerRef.trim(),
        segment_ref: formularz.segmentRef.trim(),
        p_mw: num(formularz.pMw)!,
        q_mvar: num(formularz.qMvar)!,
        u_ll_kv: num(formularz.uLlKv)!,
        iz_katalogowe_a: num(formularz.izKatalogoweA)!,
        srodowisko: formularz.srodowisko,
        izolacja: formularz.izolacja,
        temperatura_c: num(formularz.temperaturaC)!,
        liczba_obwodow: num(formularz.liczbaObwodow)!,
        ik_max_ka: num(formularz.ikMaxKa),
        ith_a: num(formularz.ithA),
        fault_duration_s: num(formularz.faultDurationS),
        ith_1s_a: num(formularz.ith1sA),
        jth_1s_a_per_mm2: num(formularz.jth1sAPerMm2),
        cross_section_mm2: num(formularz.crossSectionMm2),
        vdrop_u_source_kv: num(formularz.vdropUSourceKv)!,
        vdrop_delta_u_total_kv: num(formularz.vdropDeltaUTotalKv)!,
      };
      try {
        await downloadLvCircuitVerificationPack(payload);
        setStan('success');
        setKomunikat('Pakiet pobrany.');
      } catch (err) {
        setStan('error');
        setKomunikat(err instanceof Error ? err.message : 'Nieznany błąd pobierania pakietu.');
      }
    },
    [activeCaseId, activeCaseName, activeProjectId, activeProjectName, formularz, gotoweDoWyslania],
  );

  return (
    <section
      className={[
        'flex flex-col gap-1.5 rounded border border-scada-border bg-scada-panel/95 p-2 text-[11px] text-scada-text shadow-lg',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Panel weryfikacji obwodu nN (pakiet dowodowy LV_CIRCUIT_VERIFICATION)"
      data-testid="nn-circuit-proof-panel"
    >
      <header className="border-b border-scada-border pb-1 font-semibold uppercase tracking-wider text-scada-muted">
        Weryfikacja obwodu nN (10 kroków)
      </header>
      <form onSubmit={handleSubmit} className="flex flex-col gap-1">
        <div className="grid grid-cols-2 gap-1">
          <label className="flex flex-col gap-0.5">
            <span>Stacja (station_ref)</span>
            <input
              value={formularz.stationRef}
              onChange={pole('stationRef')}
              data-testid="nn-circuit-proof-station-ref"
              className="rounded border border-scada-border bg-scada-bg px-1 py-0.5"
              required
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Punkt (bus_ref)</span>
            <input
              value={formularz.busRef}
              onChange={pole('busRef')}
              data-testid="nn-circuit-proof-bus-ref"
              className="rounded border border-scada-border bg-scada-bg px-1 py-0.5"
              required
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Aparat (breaker_ref)</span>
            <input
              value={formularz.breakerRef}
              onChange={pole('breakerRef')}
              data-testid="nn-circuit-proof-breaker-ref"
              className="rounded border border-scada-border bg-scada-bg px-1 py-0.5"
              required
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Odcinek (segment_ref)</span>
            <input
              value={formularz.segmentRef}
              onChange={pole('segmentRef')}
              data-testid="nn-circuit-proof-segment-ref"
              className="rounded border border-scada-border bg-scada-bg px-1 py-0.5"
              required
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>P [MW]</span>
            <input
              type="number"
              step="any"
              value={formularz.pMw}
              onChange={pole('pMw')}
              data-testid="nn-circuit-proof-p-mw"
              className="rounded border border-scada-border bg-scada-bg px-1 py-0.5"
              required
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Q [Mvar]</span>
            <input
              type="number"
              step="any"
              value={formularz.qMvar}
              onChange={pole('qMvar')}
              data-testid="nn-circuit-proof-q-mvar"
              className="rounded border border-scada-border bg-scada-bg px-1 py-0.5"
              required
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Iz katalogowe [A]</span>
            <input
              type="number"
              step="any"
              value={formularz.izKatalogoweA}
              onChange={pole('izKatalogoweA')}
              data-testid="nn-circuit-proof-iz-katalogowe"
              className="rounded border border-scada-border bg-scada-bg px-1 py-0.5"
              required
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Środowisko</span>
            <select
              value={formularz.srodowisko}
              onChange={pole('srodowisko')}
              data-testid="nn-circuit-proof-srodowisko"
              className="rounded border border-scada-border bg-scada-bg px-1 py-0.5"
            >
              <option value="powietrze">powietrze</option>
              <option value="grunt">grunt</option>
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Izolacja</span>
            <select
              value={formularz.izolacja}
              onChange={pole('izolacja')}
              data-testid="nn-circuit-proof-izolacja"
              className="rounded border border-scada-border bg-scada-bg px-1 py-0.5"
            >
              <option value="PVC">PVC</option>
              <option value="XLPE">XLPE</option>
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Ik″max [kA] (opcjonalnie)</span>
            <input
              type="number"
              step="any"
              value={formularz.ikMaxKa}
              onChange={pole('ikMaxKa')}
              data-testid="nn-circuit-proof-ik-max"
              className="rounded border border-scada-border bg-scada-bg px-1 py-0.5"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>ΔU_total [kV]</span>
            <input
              type="number"
              step="any"
              value={formularz.vdropDeltaUTotalKv}
              onChange={pole('vdropDeltaUTotalKv')}
              data-testid="nn-circuit-proof-vdrop-delta"
              className="rounded border border-scada-border bg-scada-bg px-1 py-0.5"
              required
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={!gotoweDoWyslania || stan === 'loading'}
          data-testid="nn-circuit-proof-submit"
          className="mt-1 rounded border border-emerald-500/40 px-1.5 py-1 text-emerald-300 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {stan === 'loading' ? 'Pobieranie…' : 'Pobierz pakiet ZIP'}
        </button>
        {komunikat && (
          <p
            data-testid="nn-circuit-proof-status"
            className={stan === 'error' ? 'text-red-400' : 'text-emerald-300'}
            role={stan === 'error' ? 'alert' : 'status'}
          >
            {komunikat}
          </p>
        )}
      </form>
    </section>
  );
}
