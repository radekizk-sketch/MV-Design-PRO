/**
 * SegmentInsertModal — wstawia obiekt punktowy na odcinek SN.
 *
 * Workflow „Wstaw [ZKSN/łącznik sekcyjny/mufa/słup] na odcinku":
 *   1. Operator klika menu kontekstowe na odcinek SN
 *   2. Modal pyta o:
 *      - Nazwę nowego obiektu
 *      - Punkt wstawienia (RATIO 0..1)
 *   3. Submit → executeDomainOperation z payload + zwrócone refsy nowych obiektów
 *   4. Backend rozcina odcinek na A-X i X-B + wstawia obiekt punktowy w X
 *   5. Snapshot odświeżony, notyfikacja sukcesu
 *
 * Kanon backend operations:
 *   - 'insert-zksn'      → insert_zksn_on_segment_sn
 *   - 'insert-sectional' → insert_section_switch_sn
 *   - 'insert-joint'     → insert_joint_on_segment_sn
 *   - 'insert-pole'      → insert_branch_pole_on_segment_sn
 */

import { useState } from 'react';

import { FormField, SldModal } from './SldModal';

export type SegmentInsertObjectKind = 'zksn' | 'sectional' | 'joint' | 'pole';

export const SEGMENT_INSERT_LABELS_PL: Readonly<Record<SegmentInsertObjectKind, string>> = {
  zksn: 'złącze kablowe SN (ZKSN)',
  sectional: 'łącznik sekcyjny',
  joint: 'mufa kablowa',
  pole: 'słup rozgałęźny',
};

export const SEGMENT_INSERT_BACKEND_OPS: Readonly<Record<SegmentInsertObjectKind, string>> = {
  zksn: 'insert_zksn_on_segment_sn',
  sectional: 'insert_section_switch_sn',
  joint: 'insert_joint_on_segment_sn',
  pole: 'insert_branch_pole_on_segment_sn',
};

export interface SegmentInsertModalContext {
  readonly segmentRef: string;
  readonly fromBusRef: string;
  readonly toBusRef: string;
  readonly lengthKm: number;
  readonly objectKind: SegmentInsertObjectKind;
}

export interface SegmentInsertFormData {
  readonly objectName: string;
  readonly insertAtRatio: number;
}

export interface SegmentInsertModalProps {
  readonly isOpen: boolean;
  readonly context: SegmentInsertModalContext;
  readonly onClose: () => void;
  readonly onSubmit: (data: SegmentInsertFormData) => Promise<void> | void;
}

const DEFAULT_FORM: SegmentInsertFormData = {
  objectName: '',
  insertAtRatio: 0.5,
};

export function SegmentInsertModal(props: SegmentInsertModalProps): JSX.Element {
  const { isOpen, context, onClose, onSubmit } = props;
  const [data, setData] = useState<SegmentInsertFormData>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);

  const objectLabel = SEGMENT_INSERT_LABELS_PL[context.objectKind];

  const errors: { objectName?: string; insertAtRatio?: string } = {};
  if (data.objectName.trim() === '') errors.objectName = 'Nazwa obiektu wymagana';
  if (data.insertAtRatio <= 0 || data.insertAtRatio >= 1) {
    errors.insertAtRatio = 'Punkt wstawienia musi być w zakresie (0, 1)';
  }
  const isValid = Object.keys(errors).length === 0;

  const firstHalfKm = (data.insertAtRatio * context.lengthKm).toFixed(3);
  const secondHalfKm = ((1 - data.insertAtRatio) * context.lengthKm).toFixed(3);

  const handleConfirm = async (): Promise<void> => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(data);
      setData(DEFAULT_FORM);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SldModal
      isOpen={isOpen}
      title={`Wstaw ${objectLabel}`}
      subtitle={`Odcinek ${context.segmentRef}: ${context.fromBusRef} → ${context.toBusRef} (${context.lengthKm.toFixed(3)} km)`}
      onClose={onClose}
      onConfirm={() => { void handleConfirm(); }}
      confirmLabel={submitting ? 'Wstawianie…' : `Wstaw ${objectLabel}`}
      confirmDisabled={!isValid || submitting}
      width={520}
    >
      <FormField
        label="Nazwa obiektu"
        required
        errorPl={errors.objectName}
        hintPl="Identyfikator dyspozytorski (np. ZK-001, S-002, M-003, P-004)"
      >
        <input
          data-testid="segment-insert-name"
          type="text"
          value={data.objectName}
          onChange={(e) => setData({ ...data, objectName: e.target.value })}
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

      <FormField
        label={`Punkt wstawienia (współczynnik 0..1) — A=${firstHalfKm} km, B=${secondHalfKm} km`}
        required
        errorPl={errors.insertAtRatio}
        hintPl="Stosunek długości pierwszej połówki do całości. 0.5 = środek odcinka."
      >
        <input
          data-testid="segment-insert-ratio"
          type="number"
          min={0.001}
          max={0.999}
          step={0.001}
          value={data.insertAtRatio}
          onChange={(e) => setData({ ...data, insertAtRatio: Number(e.target.value) })}
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

      <div
        style={{
          marginTop: 8,
          padding: 8,
          background: '#0A2A1A',
          border: '1px solid #1F8A4A',
          borderRadius: 2,
          color: '#9CA3AF',
          fontSize: 12,
        }}
      >
        Po wstawieniu odcinek zostanie podzielony na dwa: A-X o długości {firstHalfKm} km
        oraz X-B o długości {secondHalfKm} km. Wyniki obliczeń odcinka zostaną unieważnione (Inv 4).
      </div>
    </SldModal>
  );
}
