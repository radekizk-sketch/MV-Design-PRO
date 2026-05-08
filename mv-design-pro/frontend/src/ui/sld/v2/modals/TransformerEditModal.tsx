/**
 * TransformerEditModal — modal edycji transformatora SN/HV (R14).
 *
 * Otwierany przez context menu transformatora lub double-click na symbolu.
 *
 * Pola formularza:
 *   - Oznaczenie (TR1, TR2, ...)
 *   - Moc znamionowa Sn (MVA)
 *   - Napięcie HV (kV)
 *   - Napięcie LV (kV)
 *   - Grupa wektorowa (YNd11, Yyn0, Dyn5, ...)
 *   - Ref katalogowy
 *
 * Walidacje:
 *   - sn_mva > 0
 *   - uHV > uLV (transformator step-down)
 *   - vector_group ∈ allowed list
 */

import { useState } from 'react';

import { FormField, SldModal } from './SldModal';

export interface TransformerData {
  readonly transformerRef: string;
  readonly designation: string;
  readonly snMva: number;
  readonly uhvKv: number;
  readonly ulvKv: number;
  readonly vectorGroup: string | null;
  readonly catalogRef: string | null;
}

export interface TransformerEditModalProps {
  readonly isOpen: boolean;
  readonly initial: TransformerData;
  readonly onClose: () => void;
  readonly onSubmit: (data: TransformerData) => void;
}

const ALLOWED_VECTOR_GROUPS = [
  'YNd11', 'YNd1', 'YNd5', 'YNd7',
  'Dyn1', 'Dyn5', 'Dyn11',
  'Yyn0', 'Yy0',
  'Yzn5', 'Yzn11',
];

export function TransformerEditModal(props: TransformerEditModalProps): JSX.Element {
  const { isOpen, initial, onClose, onSubmit } = props;
  const [data, setData] = useState<TransformerData>(initial);

  const errors: { snMva?: string; voltages?: string; designation?: string } = {};
  if (data.snMva <= 0) errors.snMva = 'Moc Sn musi być większa od 0';
  if (data.uhvKv <= data.ulvKv) errors.voltages = 'Napięcie HV musi być większe niż LV';
  if (data.designation.trim() === '') errors.designation = 'Oznaczenie wymagane';

  const isValid = Object.keys(errors).length === 0;

  const handleConfirm = (): void => {
    if (!isValid) return;
    onSubmit(data);
  };

  return (
    <SldModal
      isOpen={isOpen}
      title={`Edycja transformatora ${initial.designation}`}
      subtitle={`Ref: ${initial.transformerRef}`}
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmLabel="Zapisz"
      confirmDisabled={!isValid}
      width={480}
    >
      <FormField label="Oznaczenie" required errorPl={errors.designation} hintPl="np. TR1, TR2, T01">
        <input
          data-testid="tr-edit-designation"
          type="text"
          value={data.designation}
          onChange={(e) => setData({ ...data, designation: e.target.value })}
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

      <FormField label="Moc znamionowa Sn (MVA)" required errorPl={errors.snMva}>
        <input
          data-testid="tr-edit-sn-mva"
          type="number"
          step={0.1}
          min={0}
          value={data.snMva}
          onChange={(e) => setData({ ...data, snMva: parseFloat(e.target.value) || 0 })}
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

      <div style={{ display: 'flex', gap: 12 }}>
        <FormField label="Napięcie HV (kV)" required>
          <input
            data-testid="tr-edit-uhv"
            type="number"
            step={1}
            min={0}
            value={data.uhvKv}
            onChange={(e) => setData({ ...data, uhvKv: parseFloat(e.target.value) || 0 })}
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
        <FormField label="Napięcie LV (kV)" required errorPl={errors.voltages}>
          <input
            data-testid="tr-edit-ulv"
            type="number"
            step={0.5}
            min={0}
            value={data.ulvKv}
            onChange={(e) => setData({ ...data, ulvKv: parseFloat(e.target.value) || 0 })}
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
      </div>

      <FormField label="Grupa wektorowa">
        <select
          data-testid="tr-edit-vector-group"
          value={data.vectorGroup ?? ''}
          onChange={(e) => setData({ ...data, vectorGroup: e.target.value || null })}
          style={{
            width: '100%',
            padding: '6px 8px',
            background: '#1A1F26',
            border: '1px solid #3A3A3A',
            color: '#E5E7EB',
            borderRadius: 2,
          }}
        >
          <option value="">— bez wskazania —</option>
          {ALLOWED_VECTOR_GROUPS.map((vg) => (
            <option key={vg} value={vg}>{vg}</option>
          ))}
        </select>
      </FormField>

      <FormField label="Referencja katalogowa">
        <input
          data-testid="tr-edit-catalog-ref"
          type="text"
          value={data.catalogRef ?? ''}
          onChange={(e) => setData({ ...data, catalogRef: e.target.value || null })}
          placeholder="np. cat:transformer:25mva-110-15"
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
