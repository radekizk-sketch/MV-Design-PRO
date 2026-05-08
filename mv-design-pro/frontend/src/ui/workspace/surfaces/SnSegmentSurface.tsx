/**
 * SnSegmentSurface (E-12 R47) — konfigurator odcinka SN.
 *
 * R47 (Zasada 13): Domyślnie renderuje LineSegmentInline (compact editor).
 * Toggle "Widok 4-kart (legacy)" pozwala wrócić do pełnej karty.
 *
 * Etap 4 dostawy: parametry odcinka kabla SN albo linii napowietrznej SN:
 * 4 karty: Identyfikacja & rodzina / Katalog & przewód / Trasa & ułożenie /
 * Obciążalność.
 *
 * Backend: katalogi w mv_cable_line_catalog.py (KABEL_SN, LINIA_SN).
 * Pełne wpięcie do operacji domenowej continue_trunk_segment_sn /
 * insert_station_on_segment_sn — Etap 6 (insert tool).
 */

import { useCallback, useMemo, useState } from 'react';

import { useSnapshotStore } from '../../topology/snapshotStore';
import { useAppStateStore } from '../../app-state';
import { notify } from '../../notifications/store';
import { MISSING_DASH } from '../../shared/formatPolishValue';
import type { WorkspaceSurfaceDescriptor } from '../types';
import {
  LineSegmentInline,
  EMPTY_LINE_SEGMENT_DRAFT,
  type LineSegmentInlineDraft,
  computeLineSegmentParams,
} from '../components/LineSegmentInline';

type SegmentMode = 'inline' | 'legacy';

type SegmentCardId = 'identification' | 'catalog' | 'route' | 'rating';

const CARD_LABELS: Record<SegmentCardId, string> = {
  identification: 'Identyfikacja',
  catalog: 'Katalog & przewód',
  route: 'Trasa & ułożenie',
  rating: 'Obciążalność',
};

interface SegmentData {
  designation: string;
  family: 'kabel_sn' | 'linia_napowietrzna_sn';
  catalogItemId: string;
  conductorMm2: number | null;
  lengthM: number | null;
  layingType: 'ziemia' | 'kanal' | 'powietrze';
  ambientTempC: number | null;
  groundResistivity: number | null;
  ampacityA: number | null;
}

const CABLE_SN_CATALOG = [
  { id: '__missing__', label: '— wybierz —' },
  { id: 'cable-tfk-yakxs-3x70', label: 'YAKXS 3×70 mm² · 12/20 kV' },
  { id: 'cable-tfk-yakxs-3x120', label: 'YAKXS 3×120 mm² · 12/20 kV' },
  { id: 'cable-tfk-yakxs-3x240', label: 'YAKXS 3×240 mm² · 12/20 kV' },
  { id: 'cable-tfk-xrukpz-3x95', label: 'XRUKPZ 3×95 mm² · 12/20 kV' },
];

const LINE_SN_CATALOG = [
  { id: '__missing__', label: '— wybierz —' },
  { id: 'line-afl-50', label: 'AFL-6 50 mm² · żłobiona' },
  { id: 'line-afl-70', label: 'AFL-6 70 mm² · żłobiona' },
  { id: 'line-afl-95', label: 'AFL-6 95 mm² · żłobiona' },
  { id: 'line-afl-120', label: 'AFL-6 120 mm² · żłobiona' },
];

interface SnSegmentSurfaceProps {
  readonly surface: WorkspaceSurfaceDescriptor;
}

export function SnSegmentSurface(props: SnSegmentSurfaceProps): JSX.Element {
  const [mode, setMode] = useState<SegmentMode>('inline');

  if (mode === 'inline') {
    return <SnSegmentInline surface={props.surface} onSwitchToLegacy={() => setMode('legacy')} />;
  }
  return <SnSegmentLegacy surface={props.surface} onSwitchToInline={() => setMode('inline')} />;
}

interface SnSegmentInlineProps {
  readonly surface: WorkspaceSurfaceDescriptor;
  readonly onSwitchToLegacy: () => void;
}

function SnSegmentInline(props: SnSegmentInlineProps): JSX.Element {
  const { surface, onSwitchToLegacy } = props;
  const segmentRef = surface.entityRef ?? null;
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const patchSnapshot = useSnapshotStore((s) => s.patchSnapshot);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);

  const initialDraft = useMemo<LineSegmentInlineDraft>(() => {
    if (!segmentRef || !snapshot) return EMPTY_LINE_SEGMENT_DRAFT;
    const seg = ((snapshot.branches ?? []) as Array<{ ref_id: string; meta?: Record<string, unknown> }>)
      .find((b) => b.ref_id === segmentRef);
    if (!seg) return EMPTY_LINE_SEGMENT_DRAFT;
    const meta = (seg.meta ?? {}) as Record<string, unknown>;
    return {
      cableCatalogRef: (meta['cable_catalog_ref'] as string) ?? '',
      lengthM: (meta['length_m'] as number) ?? 100,
      installation: ((meta['installation'] as 'ground' | 'channel' | 'air') ?? 'ground'),
      temperatureC: (meta['temperature_c'] as number) ?? 30,
    };
  }, [segmentRef, snapshot]);

  const handleSave = useCallback(
    async (
      draft: LineSegmentInlineDraft,
      computed: ReturnType<typeof computeLineSegmentParams>,
    ) => {
      if (!segmentRef) {
        notify('Brak referencji odcinka — nie można zapisać.', 'warning');
        return;
      }
      let backendOk = false;
      if (activeCaseId) {
        try {
          const response = await executeDomainOperation(activeCaseId, 'configure_cable', {
            segment_ref: segmentRef,
            cable_catalog_ref: draft.cableCatalogRef,
            length_m: draft.lengthM,
            installation: draft.installation,
            temperature_c: draft.temperatureC,
            r_ohm: computed.rOhm,
            x_ohm: computed.xOhm,
            imax_a: computed.imaxA,
          });
          backendOk = Boolean(response);
        } catch {
          backendOk = false;
        }
      }
      if (!backendOk) {
        patchSnapshot(
          (snap) => ({
            ...snap,
            branches: (snap.branches ?? []).map((b) =>
              b.ref_id === segmentRef
                ? ({
                    ...b,
                    meta: {
                      ...((b as { meta?: Record<string, unknown> }).meta ?? {}),
                      cable_catalog_ref: draft.cableCatalogRef,
                      length_m: draft.lengthM,
                      installation: draft.installation,
                      temperature_c: draft.temperatureC,
                      r_ohm: computed.rOhm,
                      x_ohm: computed.xOhm,
                      imax_a: computed.imaxA,
                    },
                  } as typeof b)
                : b,
            ),
          }),
          [segmentRef],
        );
        notify('Zapisano odcinek (lokalnie). Backend operation będzie zsynchronizowany przy następnym refresh.', 'info');
      } else {
        notify('Zapisano odcinek. Wyniki obliczeń zostały unieważnione (Inv 4).', 'info');
      }
    },
    [activeCaseId, segmentRef, executeDomainOperation, patchSnapshot],
  );

  const handleCancel = useCallback(() => {
    notify('Anulowano edycję odcinka. Model bez zmian.', 'info');
  }, []);

  return (
    <div data-testid="sn-segment-surface" className="flex h-full w-full flex-col p-4">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-scada-muted">
            E-12 · Inline edytor odcinka SN (R47 — Zasada 13)
          </div>
          <h2 className="mt-1 text-base font-semibold text-scada-text">
            {segmentRef ?? 'Odcinek niewybrany'}
          </h2>
          {!segmentRef && (
            <p className="mt-2 rounded border border-amber-700 bg-amber-950/30 p-3 text-xs text-amber-200">
              Brak referencji do odcinka. Wybierz odcinek z lewego nawigatora lub
              kliknij odcinek w SLD i wybierz "Edytuj odcinek".
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="segment-mode-inline-switch"
            aria-pressed={true}
            className="rounded bg-scada-accent px-3 py-1 text-xs text-white"
          >
            Inline (R47)
          </button>
          <button
            type="button"
            data-testid="segment-mode-legacy-switch"
            onClick={onSwitchToLegacy}
            className="rounded border border-scada-border px-3 py-1 text-xs text-scada-text hover:bg-scada-hover-nav"
          >
            Widok 4-kart (legacy) →
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <LineSegmentInline
          initialDraft={initialDraft}
          onSave={handleSave}
          onCancel={handleCancel}
          mode={segmentRef ? 'edit' : 'create'}
        />
      </div>
    </div>
  );
}

interface SnSegmentLegacyProps {
  readonly surface: WorkspaceSurfaceDescriptor;
  readonly onSwitchToInline: () => void;
}

function SnSegmentLegacy(props: SnSegmentLegacyProps): JSX.Element {
  const { surface, onSwitchToInline } = props;
  const segmentRef = surface.entityRef ?? null;
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const [activeCard, setActiveCard] = useState<SegmentCardId>('identification');
  const [data, setData] = useState<SegmentData>(() => ({
    designation: '',
    family: 'kabel_sn',
    catalogItemId: '__missing__',
    conductorMm2: null,
    lengthM: null,
    layingType: 'ziemia',
    ambientTempC: 20,
    groundResistivity: 1,
    ampacityA: null,
  }));

  const segmentName = useMemo(() => {
    if (!segmentRef) return 'Odcinek niewybrany';
    if (!snapshot) return segmentRef;
    const branches = snapshot.branches ?? [];
    const branch = branches.find((b: { ref_id: string; name?: string }) => b.ref_id === segmentRef);
    return branch?.name ?? segmentRef;
  }, [segmentRef, snapshot]);

  const catalogOptions = data.family === 'kabel_sn' ? CABLE_SN_CATALOG : LINE_SN_CATALOG;

  return (
    <div data-testid="sn-segment-surface" className="flex h-full w-full flex-col p-4">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-scada-muted">
            E-12 · Odcinek SN (legacy 4-kart)
          </div>
          <h2 className="mt-1 text-base font-semibold text-scada-text">{segmentName}</h2>
          <div className="mt-1 text-xs text-scada-muted">
            Rodzina:{' '}
            <span className="font-medium text-scada-text">
              {data.family === 'kabel_sn' ? 'Kabel SN' : 'Linia napowietrzna SN'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="segment-mode-inline-switch"
            onClick={onSwitchToInline}
            className="rounded border border-scada-border px-3 py-1 text-xs text-scada-text hover:bg-scada-hover-nav"
          >
            ← Inline (R47)
          </button>
          <button
            type="button"
            data-testid="segment-mode-legacy-switch"
            aria-pressed={true}
            className="rounded bg-scada-accent px-3 py-1 text-xs text-white"
          >
            Widok 4-kart
          </button>
        </div>
      </div>

      <nav role="tablist" className="flex border-b border-scada-border">
        {(Object.keys(CARD_LABELS) as SegmentCardId[]).map((id) => (
          <button
            key={id}
            type="button"
            data-testid={`segment-tab-${id}`}
            data-active={activeCard === id}
            onClick={() => setActiveCard(id)}
            className={
              'whitespace-nowrap px-3 py-2 text-xs font-medium '
              + (activeCard === id
                ? 'border-b-2 border-scada-sn text-scada-text'
                : 'border-b-2 border-transparent text-scada-muted hover:text-scada-text')
            }
          >
            {CARD_LABELS[id]}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-auto p-4">
        {activeCard === 'identification' && (
          <div data-testid="segment-content-identification" className="space-y-3">
            <Field
              label="Oznaczenie"
              required
              value={data.designation}
              onChange={(v) => setData((d) => ({ ...d, designation: v }))}
              placeholder="np. K-12 / GPZ-Stacja-01"
            />
            <SelectField
              label="Rodzina"
              required
              value={data.family}
              onChange={(v) =>
                setData((d) => ({
                  ...d,
                  family: v as SegmentData['family'],
                  catalogItemId: '__missing__',
                }))
              }
              options={[
                { id: 'kabel_sn', label: 'Kabel SN' },
                { id: 'linia_napowietrzna_sn', label: 'Linia napowietrzna SN' },
              ]}
            />
          </div>
        )}

        {activeCard === 'catalog' && (
          <div data-testid="segment-content-catalog" className="space-y-3">
            <SelectField
              label="Katalog"
              required
              value={data.catalogItemId}
              onChange={(v) => setData((d) => ({ ...d, catalogItemId: v }))}
              options={catalogOptions}
            />
            <NumberField
              label="Przekrój żył roboczych"
              unit="mm²"
              value={data.conductorMm2}
              onChange={(v) => setData((d) => ({ ...d, conductorMm2: v }))}
            />
            <p className="rounded border border-scada-border bg-scada-surface p-2 text-[11px] text-scada-muted">
              Dane materializowane z katalogu (immutable copy) zgodnie z regułą
              catalog binding. Nadpisywanie parametrów R/X/C wymaga uzasadnienia
              w karcie "Override eksperckie" (Etap 8).
            </p>
          </div>
        )}

        {activeCard === 'route' && (
          <div data-testid="segment-content-route" className="space-y-3">
            <NumberField
              label="Długość trasy"
              unit="m"
              required
              value={data.lengthM}
              onChange={(v) => setData((d) => ({ ...d, lengthM: v }))}
              placeholder="np. 850"
            />
            <SelectField
              label="Sposób ułożenia"
              value={data.layingType}
              onChange={(v) => setData((d) => ({ ...d, layingType: v as SegmentData['layingType'] }))}
              options={[
                { id: 'ziemia', label: 'W ziemi' },
                { id: 'kanal', label: 'W kanale' },
                { id: 'powietrze', label: 'W powietrzu' },
              ]}
            />
            <NumberField
              label="Temperatura otoczenia"
              unit="°C"
              value={data.ambientTempC}
              onChange={(v) => setData((d) => ({ ...d, ambientTempC: v }))}
            />
            <NumberField
              label="Rezystywność gruntu"
              unit="K·m/W"
              value={data.groundResistivity}
              onChange={(v) => setData((d) => ({ ...d, groundResistivity: v }))}
            />
          </div>
        )}

        {activeCard === 'rating' && (
          <div data-testid="segment-content-rating" className="space-y-3">
            <NumberField
              label="Obciążalność długotrwała Idd"
              unit="A"
              value={data.ampacityA}
              onChange={(v) => setData((d) => ({ ...d, ampacityA: v }))}
            />
            <p className="rounded border border-scada-border bg-scada-surface p-2 text-[11px] text-scada-muted">
              Wynik analizy obciążalności cieplnej dostępny po obliczeniach
              rozpływu mocy (Etap 7). Aktualnie:{' '}
              <span className="font-medium">{MISSING_DASH}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}

function Field({ label, value, onChange, placeholder, required }: FieldProps) {
  return (
    <div>
      <label className="mb-1 block text-xs text-scada-muted">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-scada-border bg-scada-surface px-2 py-1.5 text-sm text-scada-text placeholder:text-scada-muted focus:border-scada-sn focus:outline-none"
      />
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  unit?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  required?: boolean;
}

function NumberField({ label, unit, value, onChange, placeholder, required }: NumberFieldProps) {
  return (
    <div>
      <label className="mb-1 block text-xs text-scada-muted">
        {label}
        {unit && <span> [{unit}]</span>}
        {required && <span className="text-red-400"> *</span>}
      </label>
      <input
        type="number"
        value={value === null ? '' : value}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onChange(null);
            return;
          }
          const num = Number(raw);
          onChange(Number.isNaN(num) ? null : num);
        }}
        placeholder={placeholder ?? '— brak danych —'}
        className="w-full rounded border border-scada-border bg-scada-surface px-2 py-1.5 text-sm text-scada-text placeholder:text-scada-muted focus:border-scada-sn focus:outline-none"
      />
    </div>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string }[];
  required?: boolean;
}

function SelectField({ label, value, onChange, options, required }: SelectFieldProps) {
  return (
    <div>
      <label className="mb-1 block text-xs text-scada-muted">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-scada-border bg-scada-surface px-2 py-1.5 text-sm text-scada-text focus:border-scada-sn focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default SnSegmentSurface;
