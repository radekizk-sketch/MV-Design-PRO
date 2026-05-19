/**
 * EarthingInspector — karta techniczna doziemienia (Pakiet E).
 *
 * Wariant per element type (5 osobnych sekcji, jeden komponent):
 *   - GPZ — punkt neutralny strony SN
 *   - Transformer — strona nN trafa SN/nN
 *   - Busbar — sieć szyny SN
 *   - Cable — ekran kabla SN
 *   - Petersen — cewka kompensacyjna
 *
 * White box: read-only view (audytor); edycja poprzez SetEarthingForm.
 */

import { useMemo } from 'react';

import {
  BUSBAR_EARTHING_MODE_LABELS_PL,
  CABLE_SCREEN_MODE_LABELS_PL,
  validatePetersenCoilParams,
} from './earthingTypes';
import type {
  BusbarEarthing,
  CableScreenEarthing,
  GpzEarthing,
  PetersenCoil,
  TransformerEarthing,
} from './earthingTypes';

export type EarthingInspectorEntity =
  | { kind: 'gpz'; data: GpzEarthing }
  | { kind: 'transformer'; data: TransformerEarthing }
  | { kind: 'busbar'; data: BusbarEarthing }
  | { kind: 'cable_screen'; data: CableScreenEarthing }
  | { kind: 'petersen'; data: PetersenCoil };

export interface EarthingInspectorProps {
  entity: EarthingInspectorEntity;
  onEdit?: () => void;
}

function Field({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex justify-between gap-4 text-xs" data-testid={testId}>
      <span className="text-scada-muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function fmtNum(v: number | undefined, suffix: string): string {
  if (v === undefined) return '—';
  return `${v.toFixed(3)} ${suffix}`;
}

function GpzSection({ data }: { data: GpzEarthing }) {
  return (
    <section data-testid="earthing-gpz-section" className="flex flex-col gap-1">
      <h4 className="text-xs font-semibold">Uziemienie GPZ ({data.gpz_id})</h4>
      <Field label="Tryb" value={BUSBAR_EARTHING_MODE_LABELS_PL[data.mode]} testId="gpz-mode" />
      <Field label="X₀" value={fmtNum(data.x0_ohm, 'Ω')} testId="gpz-x0" />
      <Field label="R₀" value={fmtNum(data.r0_ohm, 'Ω')} testId="gpz-r0" />
      <Field label="C₀" value={fmtNum(data.c0_uf, 'µF')} testId="gpz-c0" />
    </section>
  );
}

function TransformerSection({ data }: { data: TransformerEarthing }) {
  return (
    <section data-testid="earthing-transformer-section" className="flex flex-col gap-1">
      <h4 className="text-xs font-semibold">Doziemienie strony nN trafa ({data.transformer_id})</h4>
      <Field
        label="Punkt neutralny"
        value={data.ln_grounded ? 'Uziemiony' : 'Nieuziemiony'}
        testId="trafo-ln-grounded"
      />
      <Field label="R_E" value={fmtNum(data.r_e_ohm, 'Ω')} testId="trafo-re" />
      <Field label="X_E" value={fmtNum(data.x_e_ohm, 'Ω')} testId="trafo-xe" />
    </section>
  );
}

function BusbarSection({ data }: { data: BusbarEarthing }) {
  return (
    <section data-testid="earthing-busbar-section" className="flex flex-col gap-1">
      <h4 className="text-xs font-semibold">Tryb pracy sieci ({data.busbar_id})</h4>
      <Field label="Tryb" value={BUSBAR_EARTHING_MODE_LABELS_PL[data.mode]} testId="bus-mode" />
      <Field label="C₀" value={fmtNum(data.c0_uf, 'µF')} testId="bus-c0" />
      <Field
        label="R_uziemienia"
        value={fmtNum(data.r_grounding_ohm, 'Ω')}
        testId="bus-r-grounding"
      />
    </section>
  );
}

function CableScreenSection({ data }: { data: CableScreenEarthing }) {
  return (
    <section data-testid="earthing-cable-section" className="flex flex-col gap-1">
      <h4 className="text-xs font-semibold">Ekran kabla ({data.cable_id})</h4>
      <Field
        label="Sposób uziemienia"
        value={CABLE_SCREEN_MODE_LABELS_PL[data.mode]}
        testId="cable-mode"
      />
      <Field label="R_ekranu" value={fmtNum(data.r_screen_ohm, 'Ω')} testId="cable-r-screen" />
    </section>
  );
}

function PetersenSection({ data }: { data: PetersenCoil }) {
  const error = useMemo(() => validatePetersenCoilParams(data), [data]);
  return (
    <section data-testid="earthing-petersen-section" className="flex flex-col gap-1">
      <h4 className="text-xs font-semibold">Cewka Petersena ({data.coil_id})</h4>
      <Field label="L" value={fmtNum(data.l_h, 'H')} testId="petersen-l" />
      <Field label="R_par" value={fmtNum(data.r_par_ohm, 'Ω')} testId="petersen-r-par" />
      <Field
        label="Kompensacja"
        value={`${data.compensation_percent.toFixed(1)} %`}
        testId="petersen-compensation"
      />
      <Field
        label="Tryb regulacji"
        value={data.control_mode === 'auto' ? 'Automatyczny' : 'Ręczny'}
        testId="petersen-control-mode"
      />
      {error && (
        <p className="text-xs text-red-400" data-testid="petersen-error">
          {error}
        </p>
      )}
    </section>
  );
}

export function EarthingInspector({ entity, onEdit }: EarthingInspectorProps) {
  return (
    <div
      data-testid="earthing-inspector"
      data-earthing-kind={entity.kind}
      className="flex flex-col gap-3 p-3 bg-scada-surface border border-scada-border"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Inspektor uziemienia</h3>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-xs px-2 py-0.5 border border-scada-border hover:bg-scada-hover-nav"
            data-testid="earthing-edit-button"
          >
            Edytuj →
          </button>
        )}
      </div>

      {entity.kind === 'gpz' && <GpzSection data={entity.data} />}
      {entity.kind === 'transformer' && <TransformerSection data={entity.data} />}
      {entity.kind === 'busbar' && <BusbarSection data={entity.data} />}
      {entity.kind === 'cable_screen' && <CableScreenSection data={entity.data} />}
      {entity.kind === 'petersen' && <PetersenSection data={entity.data} />}
    </div>
  );
}
