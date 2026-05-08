/**
 * GpzConfiguratorSimple — wariant uproszczony E-03A (R42).
 *
 * Wariant inspirowany atrapą HTML user'a: accordion sections, krótkie pola,
 * Sk''+RX→Ik3+Ik1+Ip+Ith obliczane live, Save/Cancel footer.
 *
 * Sekcje:
 *   1. Identyfikacja GPZ (4 pola)
 *   2. Parametry zwarciowe na szynach SN (3 pola + 2 obliczane)
 *   3. Parametry normowe (4 pola — IEC 60909, c-max/min, freq)
 *   4. Sekcje szyn GPZ (liczba sekcji + pola odpływowe + sprzęgło + pomiar)
 *   5. Podsumowanie obliczeniowe (Ik3, Ik1, Ip, Ith, Z1, Z0)
 *   6. Gotowość (checklist 7 pkt)
 *
 * Wszystkie wartości:
 *   - Ekstraktowane z ENM snapshot (single source of truth)
 *   - Save→ patchSnapshot/executeDomainOperation z fallback
 *   - Inv 4 invalidate downstream
 *
 * Switch do Advanced mode na pasku narzędzi.
 */

import { useCallback, useMemo, useState } from 'react';

import { MISSING_DASH } from '../../shared/formatPolishValue';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useAppStateStore } from '../../app-state';
import { notify } from '../../notifications/store';
import type { Substation, Transformer, Bus, Bay } from '../../../types/enm';

/* =============================================================================
   Engineering data (live from ENM)
   ============================================================================= */

interface GpzSimpleEngData {
  readonly substation: Substation | null;
  readonly transformers: readonly Transformer[];
  readonly hvBuses: readonly Bus[];
  readonly lvBuses: readonly Bus[];
  readonly bays: readonly Bay[];
}

function extractGpzSimpleData(
  snapshot: ReturnType<typeof useSnapshotStore.getState>['snapshot'],
  gpzRef: string | null,
): GpzSimpleEngData {
  if (!snapshot || !gpzRef) {
    return { substation: null, transformers: [], hvBuses: [], lvBuses: [], bays: [] };
  }
  const substation = (snapshot.substations ?? []).find((s) => s.ref_id === gpzRef) ?? null;
  if (!substation) {
    return { substation: null, transformers: [], hvBuses: [], lvBuses: [], bays: [] };
  }
  const transformers = (snapshot.transformers ?? []).filter((t) =>
    substation.transformer_refs?.includes(t.ref_id),
  );
  const hvBuses = (snapshot.buses ?? []).filter((b) => substation.bus_refs?.includes(b.ref_id) && b.voltage_kv > 60);
  const lvBuses = (snapshot.buses ?? []).filter((b) => substation.bus_refs?.includes(b.ref_id) && b.voltage_kv < 60);
  const bays = (snapshot.bays ?? []).filter((b) => b.substation_ref === gpzRef);
  return { substation, transformers, hvBuses, lvBuses, bays };
}

/* =============================================================================
   Computed metrics (IEC 60909 simplified)
   ============================================================================= */

interface SimpleCalc {
  readonly ik3MaxKa: number | null;
  readonly ik1MaxKa: number | null;
  readonly ipMaxKa: number | null; // peak current (impulse)
  readonly ithKa: number | null;   // thermal current 1s
  readonly z1Ohm: { readonly r: number; readonly x: number } | null;
  readonly z0Ohm: { readonly r: number; readonly x: number } | null;
}

/**
 * Oblicza parametry zwarciowe per IEC 60909 z S''k + R/X + Z0/Z1 + napięcie.
 * Wzory:
 *   Ik''3F = c · Un / (√3 · Z1)
 *   Z1 = Un² / Sk''
 *   ip = κ · √2 · Ik''3F
 *   Ith = Ik''3F · √(m+n) (uproszczenie: m+n = 1 dla 1s)
 */
function computeSimpleCalc(
  unKv: number | null,
  skMva: number | null,
  rxRatio: number | null,
  z0z1Ratio: number | null,
  cMax: number,
): SimpleCalc {
  if (!unKv || !skMva || skMva <= 0 || unKv <= 0) {
    return { ik3MaxKa: null, ik1MaxKa: null, ipMaxKa: null, ithKa: null, z1Ohm: null, z0Ohm: null };
  }
  /* Ik''3F = c·Un / (√3·Z1), gdzie Z1 = Un²/Sk */
  const z1Magnitude = (unKv * unKv) / skMva; // Ω
  const ik3Ka = (cMax * unKv * 1000) / (Math.sqrt(3) * z1Magnitude * 1000); // kA
  /* Z1 jako (R, X) z R/X */
  const rx = rxRatio ?? 0.1;
  const z1X = z1Magnitude / Math.sqrt(1 + rx * rx);
  const z1R = rx * z1X;
  /* Z0 z Z0/Z1 */
  const z0Z1 = z0z1Ratio ?? 3.0;
  const z0R = z1R * z0Z1;
  const z0X = z1X * z0Z1;
  /* Ik''1F = 3·c·Un / (√3·(2·Z1+Z0)) */
  const z1z0Sum = 2 * Math.sqrt(z1R * z1R + z1X * z1X) + Math.sqrt(z0R * z0R + z0X * z0X);
  const ik1Ka = (3 * cMax * unKv * 1000) / (Math.sqrt(3) * z1z0Sum * 1000); // kA
  /* ip = κ·√2·Ik''3F. Dla typowych GPZ-ów κ ≈ 1.83 (X/R = 10) */
  const xrRatio = z1X > 0 ? z1X / z1R : 10;
  const kappa = 1.02 + 0.98 * Math.exp(-3 / xrRatio);
  const ipKa = kappa * Math.sqrt(2) * ik3Ka;
  /* Ith = Ik · √(m+n). Dla t=1s typowo m+n ≈ 1.0-1.4 */
  const ithKa = ik3Ka * Math.sqrt(1.2);
  return {
    ik3MaxKa: ik3Ka,
    ik1MaxKa: ik1Ka,
    ipMaxKa: ipKa,
    ithKa: ithKa,
    z1Ohm: { r: z1R, x: z1X },
    z0Ohm: { r: z0R, x: z0X },
  };
}

/* =============================================================================
   Public Surface
   ============================================================================= */

export interface GpzConfiguratorSimpleProps {
  readonly gpzRef: string | null;
  readonly onSwitchToAdvanced: () => void;
}

export function GpzConfiguratorSimple(props: GpzConfiguratorSimpleProps): JSX.Element {
  const { gpzRef, onSwitchToAdvanced } = props;
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const patchSnapshot = useSnapshotStore((state) => state.patchSnapshot);
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);

  const eng = useMemo(() => extractGpzSimpleData(snapshot, gpzRef), [snapshot, gpzRef]);
  const meta = (eng.substation?.meta ?? {}) as Record<string, unknown>;

  /* Local form state — synchronized z meta */
  const [form, setForm] = useState({
    name: eng.substation?.name ?? '',
    designation: (meta.designation as string) ?? '',
    voltageKv: String(eng.lvBuses[0]?.voltage_kv ?? 15),
    neutralArrangement: (meta.neutral_arrangement as string) ?? 'rezystancja',
    skMva: String((meta.hv_short_circuit_mva as number) ?? ''),
    rxRatio: String((meta.hv_rx as number) ?? '0.1'),
    z0z1Ratio: String((meta.hv_z0_z1_ratio as number) ?? '3.0'),
    standard: (meta.calc_standard as string) ?? 'IEC 60909:2016',
    cMax: String((meta.calc_c_max as number) ?? '1.10'),
    cMin: String((meta.calc_c_min as number) ?? '1.00'),
    frequencyHz: String((meta.frequency_hz as number) ?? '50'),
    sectionsCount: String(eng.substation?.gpz_sections?.length ?? 2),
    fieldsA: String((meta.fields_per_section as Record<string, number>)?.['A'] ?? 4),
    fieldsB: String((meta.fields_per_section as Record<string, number>)?.['B'] ?? 4),
    hasCoupler: !!eng.bays.find((b) => b.bay_role === 'COUPLER') || !!(meta.has_coupler as boolean),
    hasMeasurement: !!eng.bays.find((b) => b.bay_role === 'MEASUREMENT') || !!(meta.has_measurement as boolean),
  });

  /* Live computed metrics */
  const calc = useMemo(() => {
    const unKv = parseFloat(form.voltageKv);
    const skMva = parseFloat(form.skMva);
    const rx = parseFloat(form.rxRatio);
    const z0z1 = parseFloat(form.z0z1Ratio);
    const cMax = parseFloat(form.cMax) || 1.10;
    return computeSimpleCalc(
      isFinite(unKv) ? unKv : null,
      isFinite(skMva) ? skMva : null,
      isFinite(rx) ? rx : null,
      isFinite(z0z1) ? z0z1 : null,
      cMax,
    );
  }, [form.voltageKv, form.skMva, form.rxRatio, form.z0z1Ratio, form.cMax]);

  /* Readiness checklist */
  const readiness = useMemo(() => [
    { label: 'Identyfikacja', done: form.name.trim().length > 0 && form.designation.trim().length > 0 },
    { label: 'Napięcie SN', done: parseFloat(form.voltageKv) > 0 },
    { label: 'Parametry zwarciowe', done: parseFloat(form.skMva) > 0 && parseFloat(form.rxRatio) > 0 },
    { label: 'Uziemienie neutralnego', done: form.neutralArrangement.length > 0 },
    { label: 'Parametry normowe', done: parseFloat(form.cMax) > 0 && parseFloat(form.frequencyHz) > 0 },
    { label: 'Sekcje i pola', done: parseInt(form.sectionsCount, 10) > 0 },
    { label: 'Składowa zerowa', done: parseFloat(form.z0z1Ratio) > 0, hasWarning: !meta.hv_z0_z1_ratio },
  ], [form, meta.hv_z0_z1_ratio]);

  const completeCount = readiness.filter((r) => r.done).length;
  const allComplete = completeCount === readiness.length && !readiness.some((r) => r.hasWarning);

  /* Save handler */
  const handleSave = useCallback(async () => {
    if (!gpzRef) return;
    const updates = {
      name: form.name,
      meta: {
        ...meta,
        designation: form.designation,
        neutral_arrangement: form.neutralArrangement,
        hv_short_circuit_mva: parseFloat(form.skMva),
        hv_rx: parseFloat(form.rxRatio),
        hv_z0_z1_ratio: parseFloat(form.z0z1Ratio),
        calc_standard: form.standard,
        calc_c_max: parseFloat(form.cMax),
        calc_c_min: parseFloat(form.cMin),
        frequency_hz: parseFloat(form.frequencyHz),
        fields_per_section: { A: parseInt(form.fieldsA, 10), B: parseInt(form.fieldsB, 10) },
        has_coupler: form.hasCoupler,
        has_measurement: form.hasMeasurement,
      },
    };
    if (activeCaseId) {
      try {
        await executeDomainOperation(activeCaseId, 'update_element_parameters', {
          element_ref: gpzRef,
          updates,
        });
        notify(`Zapisano konfigurację GPZ ${form.name}. Wyniki obliczeń SC i load flow unieważnione.`, 'success');
        return;
      } catch (e) {
        notify(`Błąd zapisu — fallback do live-edit: ${(e as Error).message}`, 'warning');
      }
    }
    /* Fallback: patchSnapshot */
    patchSnapshot(
      (snap) => ({
        ...snap,
        substations: (snap.substations ?? []).map((s) =>
          s.ref_id === gpzRef ? { ...s, name: form.name, meta: updates.meta } : s,
        ),
      }),
      [gpzRef],
    );
    notify(`Zapisano konfigurację GPZ ${form.name} (live-edit).`, 'info');
  }, [gpzRef, form, meta, activeCaseId, executeDomainOperation, patchSnapshot]);

  if (!gpzRef) {
    return (
      <div data-testid="gpz-simple-empty" className="flex h-full w-full items-center justify-center p-4 text-sm text-scada-muted">
        Wybierz GPZ z drzewa lub z kanwy SLD aby skonfigurować dane.
      </div>
    );
  }

  return (
    <div data-testid="gpz-configurator-simple" data-gpz-ref={gpzRef} className="flex h-full w-full flex-col">
      {/* Header z mode switcher */}
      <div className="border-b border-scada-border bg-scada-panel px-4 py-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-scada-muted">
              E-03A · GPZ — Wariant uproszczony · {form.voltageKv} kV
            </div>
            <h2 className="mt-1 text-base font-semibold text-scada-text">
              {form.name || gpzRef}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-scada-muted">Tryb:</span>
            <button
              data-testid="gpz-mode-simple"
              type="button"
              className="rounded border border-scada-sn bg-scada-sn/15 px-3 py-1 text-xs font-semibold text-scada-sn"
            >
              Uproszczony
            </button>
            <button
              data-testid="gpz-mode-advanced-switch"
              type="button"
              onClick={onSwitchToAdvanced}
              className="rounded border border-scada-border bg-scada-surface px-3 py-1 text-xs text-scada-muted hover:border-scada-sn hover:text-scada-text"
            >
              Zaawansowany →
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <Sec title="Identyfikacja GPZ" testId="sec-identification">
          <Field label="Nazwa GPZ" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
          <Field label="Oznaczenie" value={form.designation} onChange={(v) => setForm((f) => ({ ...f, designation: v }))} />
          <SelectField
            label="Napięcie SN"
            value={form.voltageKv}
            onChange={(v) => setForm((f) => ({ ...f, voltageKv: v }))}
            options={['6', '10', '15', '20', '30', '110']}
            unit="kV"
          />
          <SelectField
            label="Uziemienie punktu neutralnego"
            value={form.neutralArrangement}
            onChange={(v) => setForm((f) => ({ ...f, neutralArrangement: v }))}
            options={['izolowany', 'rezystancja', 'reaktancja', 'kompensacja (cewka Petersena)', 'skutecznie uziemiony']}
          />
        </Sec>

        <Sec title="Parametry zwarciowe na szynach SN" testId="sec-shortcircuit">
          <Field
            label="Moc zwarciowa Sk''"
            value={form.skMva}
            onChange={(v) => setForm((f) => ({ ...f, skMva: v }))}
            unit="MVA"
            type="number"
          />
          <Field
            label="Stosunek R/X"
            value={form.rxRatio}
            onChange={(v) => setForm((f) => ({ ...f, rxRatio: v }))}
            type="number"
          />
          <Field
            label="Stosunek Z0/Z1 (składowa zerowa)"
            value={form.z0z1Ratio}
            onChange={(v) => setForm((f) => ({ ...f, z0z1Ratio: v }))}
            type="number"
          />
          <Computed label="Prąd zwarciowy Ik'' (3-faz. maks.)" value={calc.ik3MaxKa !== null ? `${calc.ik3MaxKa.toFixed(2)} kA` : MISSING_DASH} />
          <Computed label="Prąd zwarciowy Ik'' (1-faz. maks.)" value={calc.ik1MaxKa !== null ? `${calc.ik1MaxKa.toFixed(2)} kA` : MISSING_DASH} />
        </Sec>

        <Sec title="Parametry normowe" testId="sec-normative">
          <SelectField
            label="Norma obliczeniowa"
            value={form.standard}
            onChange={(v) => setForm((f) => ({ ...f, standard: v }))}
            options={['IEC 60909:2016', 'IEC 60909:2001', 'IEC TR 60909-1', 'PN-EN 60909']}
          />
          <SelectField label="Współczynnik napięcia c (maks.)" value={form.cMax} onChange={(v) => setForm((f) => ({ ...f, cMax: v }))} options={['1.00', '1.05', '1.10']} />
          <SelectField label="Współczynnik napięcia c (min.)" value={form.cMin} onChange={(v) => setForm((f) => ({ ...f, cMin: v }))} options={['0.95', '1.00']} />
          <SelectField label="Częstotliwość" value={form.frequencyHz} onChange={(v) => setForm((f) => ({ ...f, frequencyHz: v }))} options={['50', '60']} unit="Hz" />
        </Sec>

        <Sec title="Sekcje szyn GPZ" testId="sec-sections">
          <SelectField label="Liczba sekcji szyn SN" value={form.sectionsCount} onChange={(v) => setForm((f) => ({ ...f, sectionsCount: v }))} options={['1', '2', '3', '4']} />
          <Field label="Pola odpływowe — Sekcja A" value={form.fieldsA} onChange={(v) => setForm((f) => ({ ...f, fieldsA: v }))} type="number" />
          <Field label="Pola odpływowe — Sekcja B" value={form.fieldsB} onChange={(v) => setForm((f) => ({ ...f, fieldsB: v }))} type="number" />
          <div className="flex gap-4 px-3 py-1.5">
            <CheckboxField label="Sprzęgło sekcji" checked={form.hasCoupler} onChange={(v) => setForm((f) => ({ ...f, hasCoupler: v }))} />
            <CheckboxField label="Pole pomiarowe" checked={form.hasMeasurement} onChange={(v) => setForm((f) => ({ ...f, hasMeasurement: v }))} />
          </div>
        </Sec>

        <Sec title="Podsumowanie obliczeniowe" testId="sec-calc-summary" defaultOpen>
          <div className="mx-3 my-2 rounded border border-blue-500/40 bg-blue-500/10 p-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-blue-300">
              Wynikowe parametry źródła na SN
            </div>
            <SummaryLine label="Sk'' (SN)" value={parseFloat(form.skMva) > 0 ? `${parseFloat(form.skMva).toFixed(1)} MVA` : MISSING_DASH} />
            <SummaryLine label="Ik'' (3-faz. maks.)" value={calc.ik3MaxKa !== null ? `${calc.ik3MaxKa.toFixed(2)} kA` : MISSING_DASH} />
            <SummaryLine label="Ik'' (1-faz. maks.)" value={calc.ik1MaxKa !== null ? `${calc.ik1MaxKa.toFixed(2)} kA` : MISSING_DASH} />
            <SummaryLine label="ip (3-faz. maks. impulsowy)" value={calc.ipMaxKa !== null ? `${calc.ipMaxKa.toFixed(2)} kA` : MISSING_DASH} />
            <SummaryLine label="Ith (3-faz., 1 s)" value={calc.ithKa !== null ? `${calc.ithKa.toFixed(2)} kA` : MISSING_DASH} />
            <SummaryLine label="Z1 źródła" value={calc.z1Ohm ? `${calc.z1Ohm.r.toFixed(3)} + j·${calc.z1Ohm.x.toFixed(3)} Ω` : MISSING_DASH} />
            <SummaryLine label="Z0 źródła" value={calc.z0Ohm ? `${calc.z0Ohm.r.toFixed(3)} + j·${calc.z0Ohm.x.toFixed(3)} Ω` : MISSING_DASH} />
          </div>
        </Sec>

        <Sec title="Gotowość GPZ" testId="sec-readiness">
          {readiness.map((r, idx) => (
            <ReadinessLine key={idx} label={r.label} done={r.done} hasWarning={r.hasWarning ?? false} />
          ))}
          {readiness.find((r) => r.hasWarning) && (
            <div className="mx-3 my-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[10px] text-amber-300">
              ⚠ Składowa zerowa WN nie została uzupełniona. Obliczenia zwarcia doziemnego mogą być niedokładne.
            </div>
          )}
        </Sec>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 border-t border-scada-border bg-scada-panel px-3 py-2">
        <button
          data-testid="gpz-simple-save"
          type="button"
          onClick={handleSave}
          disabled={completeCount < 5}
          className={`flex-1 rounded px-3 py-1.5 text-xs font-semibold ${
            completeCount >= 5
              ? 'bg-blue-600 text-white hover:bg-blue-500'
              : 'bg-scada-surface text-scada-muted opacity-50'
          }`}
        >
          {allComplete ? '✓ Zapisz GPZ' : `Zapisz GPZ (${completeCount}/${readiness.length} kompletnych)`}
        </button>
        <button
          data-testid="gpz-simple-cancel"
          type="button"
          onClick={() => setForm({
            name: eng.substation?.name ?? '',
            designation: (meta.designation as string) ?? '',
            voltageKv: String(eng.lvBuses[0]?.voltage_kv ?? 15),
            neutralArrangement: (meta.neutral_arrangement as string) ?? 'rezystancja',
            skMva: String((meta.hv_short_circuit_mva as number) ?? ''),
            rxRatio: String((meta.hv_rx as number) ?? '0.1'),
            z0z1Ratio: String((meta.hv_z0_z1_ratio as number) ?? '3.0'),
            standard: (meta.calc_standard as string) ?? 'IEC 60909:2016',
            cMax: String((meta.calc_c_max as number) ?? '1.10'),
            cMin: String((meta.calc_c_min as number) ?? '1.00'),
            frequencyHz: String((meta.frequency_hz as number) ?? '50'),
            sectionsCount: String(eng.substation?.gpz_sections?.length ?? 2),
            fieldsA: String((meta.fields_per_section as Record<string, number>)?.['A'] ?? 4),
            fieldsB: String((meta.fields_per_section as Record<string, number>)?.['B'] ?? 4),
            hasCoupler: !!eng.bays.find((b) => b.bay_role === 'COUPLER'),
            hasMeasurement: !!eng.bays.find((b) => b.bay_role === 'MEASUREMENT'),
          })}
          className="rounded border border-scada-border bg-scada-surface px-4 py-1.5 text-xs text-scada-muted hover:bg-scada-bg"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

/* =============================================================================
   Sub-components
   ============================================================================= */

interface SecProps {
  readonly title: string;
  readonly testId: string;
  readonly defaultOpen?: boolean;
  readonly children: React.ReactNode;
}

function Sec({ title, testId, defaultOpen = true, children }: SecProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div data-testid={testId} className="border-b border-scada-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 border-b border-scada-border bg-scada-panel px-3 py-1.5 text-left hover:bg-scada-surface"
      >
        <span className="text-[9px] text-scada-muted">{open ? '▾' : '▸'}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-scada-muted">{title}</span>
      </button>
      {open && <div className="py-1.5">{children}</div>}
    </div>
  );
}

interface FieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange?: (v: string) => void;
  readonly unit?: string;
  readonly type?: 'text' | 'number';
}

function Field({ label, value, onChange, unit, type = 'text' }: FieldProps): JSX.Element {
  return (
    <div className="flex items-center gap-2 px-3 py-0.5">
      <label className="w-40 flex-shrink-0 text-[11px] text-scada-muted">{label}</label>
      <div className="flex flex-1 items-center gap-1">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          className="flex-1 rounded border border-scada-border bg-scada-surface px-2 py-0.5 text-xs text-scada-text"
          step={type === 'number' ? 'any' : undefined}
        />
        {unit && <span className="whitespace-nowrap text-[10px] text-scada-muted">{unit}</span>}
      </div>
    </div>
  );
}

interface SelectFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange?: (v: string) => void;
  readonly options: readonly string[];
  readonly unit?: string;
}

function SelectField({ label, value, onChange, options, unit }: SelectFieldProps): JSX.Element {
  return (
    <div className="flex items-center gap-2 px-3 py-0.5">
      <label className="w-40 flex-shrink-0 text-[11px] text-scada-muted">{label}</label>
      <div className="flex flex-1 items-center gap-1">
        <select
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          className="flex-1 rounded border border-scada-border bg-scada-surface px-2 py-0.5 text-xs text-scada-text"
        >
          {options.map((o) => (<option key={o} value={o}>{o}</option>))}
        </select>
        {unit && <span className="whitespace-nowrap text-[10px] text-scada-muted">{unit}</span>}
      </div>
    </div>
  );
}

interface CheckboxFieldProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange?: (v: boolean) => void;
}

function CheckboxField({ label, checked, onChange }: CheckboxFieldProps): JSX.Element {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-scada-text">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
        className="h-3 w-3"
      />
      {label}
    </label>
  );
}

function Computed({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-baseline gap-2 px-3 py-0.5">
      <span className="w-40 flex-shrink-0 text-[11px] text-scada-muted">{label}</span>
      <span className="text-xs font-mono font-medium text-green-400">{value}</span>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex gap-2 border-b border-blue-500/20 py-1 last:border-0">
      <span className="w-40 text-[10px] text-blue-300">{label}</span>
      <span className="flex-1 font-mono text-[10px] font-medium text-scada-text">{value}</span>
    </div>
  );
}

function ReadinessLine({ label, done, hasWarning }: { label: string; done: boolean; hasWarning: boolean }): JSX.Element {
  const status = hasWarning ? 'warn' : done ? 'ok' : 'pending';
  const icon = status === 'ok' ? '✓' : status === 'warn' ? '⚠' : '○';
  const colorClass = status === 'ok' ? 'text-green-400' : status === 'warn' ? 'text-amber-400' : 'text-scada-muted';
  const text = status === 'ok' ? 'Kompletne' : status === 'warn' ? 'Wymaga uzupełnienia' : 'Brak danych';
  return (
    <div className="flex items-baseline gap-2 px-3 py-0.5">
      <span className="w-40 flex-shrink-0 text-[11px] text-scada-muted">{label}</span>
      <span className={`flex items-center gap-1 text-xs ${colorClass}`}>
        <span>{icon}</span>
        <span>{text}</span>
      </span>
    </div>
  );
}
