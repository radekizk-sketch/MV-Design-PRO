/**
 * AppendStationModal — Phase 0B (operator-grade SLD plan v2).
 *
 * Workflow „Zakończ ciąg w stacji":
 *   1. Operator klika menu kontekstowe na pole bay (free endpoint)
 *   2. Otwiera się modal — pyta o typ stacji + nazwę + napięcie nN
 *   3. Submit → executeDomainOperation('append_station_on_endpoint', payload)
 *   4. Backend tworzy stację + przypina port wejściowy SN do endpoint busa
 *   5. Snapshot odświeżony, notyfikacja sukcesu
 *
 * Acceptance Invariant 4: Append-on-endpoint = domyślny workflow tworzenia stacji.
 *
 * @see SLD_STATION_APPEND_WORKFLOW.md
 * @see backend/src/enm/domain_operations.py:append_station_on_endpoint
 */

import { useState } from 'react';

import {
  APPEND_STATION_TYPE_LABELS_PL,
  type AppendStationType,
} from '../workflow/AppendOnEndpointController';
import { FormField, SldModal } from './SldModal';

export interface AppendStationModalContext {
  /** Endpoint bus na którym kończy się ciąg (źródło append). */
  readonly endpointBusRef: string;
  /** Bay zawierający endpoint (do display). */
  readonly bayRef: string;
  /** SN voltage endpointu (kV) — do display + walidacji compatibility. */
  readonly snVoltageKv: number;
  /** Opcjonalne: ref ciągu dla payload. */
  readonly runRef?: string | null;
}

export interface AppendStationFormData {
  readonly stationName: string;
  readonly stationType: AppendStationType;
  readonly nnVoltageKv: number;
  /** Opcjonalny katalog transformatora — pusty = pomiń. */
  readonly transformerCatalogRef: string;
}

export interface AppendStationModalProps {
  readonly isOpen: boolean;
  readonly context: AppendStationModalContext;
  readonly onClose: () => void;
  readonly onSubmit: (data: AppendStationFormData) => Promise<void> | void;
}

const DEFAULT_FORM: AppendStationFormData = {
  stationName: '',
  stationType: 'terminal',
  nnVoltageKv: 0.4,
  transformerCatalogRef: '',
};

export function AppendStationModal(props: AppendStationModalProps): JSX.Element {
  const { isOpen, context, onClose, onSubmit } = props;
  const [data, setData] = useState<AppendStationFormData>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);

  /* Walidacja per pole */
  const errors: { stationName?: string; nnVoltageKv?: string } = {};
  if (data.stationName.trim() === '') errors.stationName = 'Nazwa stacji wymagana';
  if (data.nnVoltageKv <= 0 || data.nnVoltageKv > context.snVoltageKv) {
    errors.nnVoltageKv = `Napięcie nN musi być w zakresie (0, ${context.snVoltageKv}) kV`;
  }
  const isValid = Object.keys(errors).length === 0;

  const handleConfirm = async (): Promise<void> => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(data);
      /* Reset formularza po sukcesie */
      setData(DEFAULT_FORM);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SldModal
      isOpen={isOpen}
      title="Zakończ ciąg w stacji"
      subtitle={`Endpoint: ${context.bayRef} (szyna ${context.endpointBusRef}, ${context.snVoltageKv} kV SN)`}
      onClose={onClose}
      onConfirm={() => { void handleConfirm(); }}
      confirmLabel={submitting ? 'Tworzenie…' : 'Utwórz stację'}
      confirmDisabled={!isValid || submitting}
      width={520}
    >
      <FormField
        label="Nazwa stacji"
        required
        errorPl={errors.stationName}
        hintPl="Identyfikator dyspozytorski (np. ST-PST1, GPZ-Stacja-12)"
      >
        <input
          data-testid="append-station-name"
          type="text"
          value={data.stationName}
          onChange={(e) => setData({ ...data, stationName: e.target.value })}
          autoFocus
          style={{
            width: '100%',
            padding: '6px 8px',
            background: '#1A1F26',
            border: '1px solid #3A3A3A',
            color: '#E5E7EB',
            borderRadius: 2,
          }}
        />
      </FormField>

      <FormField label="Typ stacji" hintPl="Wpływa na footprint mini-bloku w widoku oddalonym.">
        <select
          data-testid="append-station-type"
          value={data.stationType}
          onChange={(e) => setData({ ...data, stationType: e.target.value as AppendStationType })}
          style={{
            width: '100%',
            padding: '6px 8px',
            background: '#1A1F26',
            border: '1px solid #3A3A3A',
            color: '#E5E7EB',
            borderRadius: 2,
          }}
        >
          {(Object.keys(APPEND_STATION_TYPE_LABELS_PL) as AppendStationType[]).map((t) => (
            <option key={t} value={t}>
              {APPEND_STATION_TYPE_LABELS_PL[t]}
            </option>
          ))}
        </select>
      </FormField>

      <FormField
        label="Napięcie nN"
        required
        errorPl={errors.nnVoltageKv}
        hintPl="Domyślnie 0.4 kV (sieć dystrybucyjna). Musi być < napięcia SN."
      >
        <input
          data-testid="append-station-nn-voltage"
          type="number"
          min={0.1}
          max={context.snVoltageKv - 0.001}
          step={0.001}
          value={data.nnVoltageKv}
          onChange={(e) => setData({ ...data, nnVoltageKv: Number(e.target.value) })}
          style={{
            width: '100%',
            padding: '6px 8px',
            background: '#1A1F26',
            border: '1px solid #3A3A3A',
            color: '#E5E7EB',
            borderRadius: 2,
          }}
        />
      </FormField>

      <FormField
        label="Katalog transformatora"
        hintPl="Opcjonalny. Pusty = stacja bez transformatora (np. switching station)."
      >
        <input
          data-testid="append-station-transformer-catalog"
          type="text"
          value={data.transformerCatalogRef}
          onChange={(e) => setData({ ...data, transformerCatalogRef: e.target.value })}
          placeholder="np. cat:transformer:630-15-0.4"
          style={{
            width: '100%',
            padding: '6px 8px',
            background: '#1A1F26',
            border: '1px solid #3A3A3A',
            color: '#E5E7EB',
            borderRadius: 2,
          }}
        />
      </FormField>
    </SldModal>
  );
}
