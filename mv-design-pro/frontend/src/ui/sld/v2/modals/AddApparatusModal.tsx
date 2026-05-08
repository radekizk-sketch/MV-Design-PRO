/**
 * AddApparatusModal — modal dodawania pojedynczego aparatu do pola SN (R31).
 *
 * Otwierany przez context menu pola → "Skonfiguruj aparaturę" lub
 * "Skonfiguruj przekładniki". Pozwala dodać:
 *   - CT (przekładnik prądowy) z ratio i klasą
 *   - VT (przekładnik napięciowy) z ratio i bezpiecznikami
 *   - Surge Arrester (odgromnik) z napięciem znamionowym
 *   - Fuse (bezpiecznik HRC)
 *   - Cable Head (głowica kablowa) z typem kabla
 *
 * Per `BayDeviceOrderPolicy`: pozycja w polu wynika z apparatus_kind +
 * field_role, NIE jest wybierana ręcznie.
 *
 * Walidacje:
 *   - ratio > 0 dla CT/VT
 *   - voltage_kv > 0 dla SA
 *   - position musi być compatible z field_role
 */

import { useState } from 'react';

import { FormField, SldModal } from './SldModal';

export type ApparatusKind =
  | 'ct'
  | 'vt'
  | 'surge_arrester'
  | 'fuse'
  | 'cable_head'
  | 'metering_cubicle';

export interface AddApparatusData {
  readonly bayRef: string;
  readonly bayNumber: string;
  readonly fieldRole: 'LINE_OUT' | 'LINE_IN' | 'LINE_BRANCH' | 'TRANSFORMER' | 'COUPLER' | 'MEASUREMENT';
  readonly apparatusKind: ApparatusKind;
  readonly designation: string;
  readonly ratioPrimary: number | null;
  readonly ratioSecondary: number | null;
  readonly accuracyClass: string;
  readonly ratedVoltageKv: number | null;
  readonly ratedCurrentA: number | null;
  readonly catalogRef: string | null;
}

export interface AddApparatusModalProps {
  readonly isOpen: boolean;
  readonly initial: AddApparatusData;
  readonly onClose: () => void;
  readonly onSubmit: (data: AddApparatusData) => void;
}

const APPARATUS_LABELS_PL: Readonly<Record<ApparatusKind, string>> = {
  ct: 'Przekładnik prądowy (CT)',
  vt: 'Przekładnik napięciowy (VT)',
  surge_arrester: 'Odgromnik (SA)',
  fuse: 'Bezpiecznik (HRC)',
  cable_head: 'Głowica kablowa',
  metering_cubicle: 'Szafka pomiarowa',
};

const ACCURACY_CLASSES = ['0.1', '0.2', '0.5', '1.0', '3.0', '5P10', '5P20', '10P10', '10P20'];

export function AddApparatusModal(props: AddApparatusModalProps): JSX.Element {
  const { isOpen, initial, onClose, onSubmit } = props;
  const [data, setData] = useState<AddApparatusData>(initial);

  const errors: { ratio?: string; voltage?: string; current?: string; designation?: string } = {};
  if (data.designation.trim() === '') errors.designation = 'Oznaczenie wymagane';
  if ((data.apparatusKind === 'ct' || data.apparatusKind === 'vt')) {
    if (!data.ratioPrimary || data.ratioPrimary <= 0) errors.ratio = 'Strona pierwotna > 0';
    if (!data.ratioSecondary || data.ratioSecondary <= 0) errors.ratio = (errors.ratio ?? '') + ' Strona wtórna > 0';
  }
  if (data.apparatusKind === 'surge_arrester') {
    if (!data.ratedVoltageKv || data.ratedVoltageKv <= 0) errors.voltage = 'Napięcie znamionowe > 0';
  }
  if (data.apparatusKind === 'ct') {
    if (!data.ratedCurrentA || data.ratedCurrentA <= 0) errors.current = 'Prąd znamionowy > 0';
  }

  const isValid = Object.keys(errors).length === 0;

  const handleConfirm = (): void => {
    if (!isValid) return;
    onSubmit(data);
  };

  const showRatio = data.apparatusKind === 'ct' || data.apparatusKind === 'vt';
  const showVoltage = data.apparatusKind === 'surge_arrester' || data.apparatusKind === 'vt';
  const showCurrent = data.apparatusKind === 'ct' || data.apparatusKind === 'fuse';
  const showAccuracy = data.apparatusKind === 'ct' || data.apparatusKind === 'vt';

  return (
    <SldModal
      isOpen={isOpen}
      title={`Dodaj aparat do pola ${initial.bayNumber || initial.bayRef}`}
      subtitle={`Rola pola: ${initial.fieldRole}`}
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmLabel="Dodaj"
      confirmDisabled={!isValid}
      width={520}
    >
      <FormField label="Typ aparatu" required>
        <select
          data-testid="add-apparatus-kind"
          value={data.apparatusKind}
          onChange={(e) => setData({ ...data, apparatusKind: e.target.value as ApparatusKind })}
          style={selectStyle()}
        >
          {(Object.keys(APPARATUS_LABELS_PL) as ApparatusKind[]).map((k) => (
            <option key={k} value={k}>{APPARATUS_LABELS_PL[k]}</option>
          ))}
        </select>
      </FormField>

      <FormField label="Oznaczenie" required errorPl={errors.designation} hintPl="np. T1, T2, PU1, SA-1">
        <input
          data-testid="add-apparatus-designation"
          type="text"
          value={data.designation}
          onChange={(e) => setData({ ...data, designation: e.target.value })}
          style={selectStyle()}
        />
      </FormField>

      {showRatio && (
        <div style={{ display: 'flex', gap: 12 }}>
          <FormField label="Strona pierwotna" required errorPl={errors.ratio}>
            <input
              data-testid="add-apparatus-ratio-primary"
              type="number"
              step={1}
              min={0}
              value={data.ratioPrimary ?? 0}
              onChange={(e) => setData({ ...data, ratioPrimary: parseFloat(e.target.value) || null })}
              style={selectStyle()}
            />
          </FormField>
          <FormField label="Strona wtórna" required>
            <input
              data-testid="add-apparatus-ratio-secondary"
              type="number"
              step={0.1}
              min={0}
              value={data.ratioSecondary ?? 0}
              onChange={(e) => setData({ ...data, ratioSecondary: parseFloat(e.target.value) || null })}
              style={selectStyle()}
            />
          </FormField>
        </div>
      )}

      {showVoltage && (
        <FormField label="Napięcie znamionowe (kV)" required errorPl={errors.voltage}>
          <input
            data-testid="add-apparatus-voltage"
            type="number"
            step={0.1}
            min={0}
            value={data.ratedVoltageKv ?? 0}
            onChange={(e) => setData({ ...data, ratedVoltageKv: parseFloat(e.target.value) || null })}
            style={selectStyle()}
          />
        </FormField>
      )}

      {showCurrent && (
        <FormField label="Prąd znamionowy (A)" required={data.apparatusKind === 'ct'} errorPl={errors.current}>
          <input
            data-testid="add-apparatus-current"
            type="number"
            step={1}
            min={0}
            value={data.ratedCurrentA ?? 0}
            onChange={(e) => setData({ ...data, ratedCurrentA: parseFloat(e.target.value) || null })}
            style={selectStyle()}
          />
        </FormField>
      )}

      {showAccuracy && (
        <FormField label="Klasa dokładności" hintPl="0.1/0.2/0.5/1.0 dla pomiaru, 5P/10P dla zabezpieczeń">
          <select
            data-testid="add-apparatus-accuracy"
            value={data.accuracyClass}
            onChange={(e) => setData({ ...data, accuracyClass: e.target.value })}
            style={selectStyle()}
          >
            <option value="">— bez wskazania —</option>
            {ACCURACY_CLASSES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </FormField>
      )}

      <FormField label="Referencja katalogowa" hintPl="np. cat:ct:200/5/0.5/15kV">
        <input
          data-testid="add-apparatus-catalog-ref"
          type="text"
          value={data.catalogRef ?? ''}
          onChange={(e) => setData({ ...data, catalogRef: e.target.value || null })}
          style={selectStyle()}
        />
      </FormField>

      <div
        style={{
          marginTop: 16,
          padding: 8,
          background: 'rgba(45, 111, 186, 0.1)',
          border: '1px solid rgba(45, 111, 186, 0.3)',
          borderRadius: 2,
          fontSize: 11,
          color: '#A5B4C7',
        }}
      >
        ⓘ Pozycja aparatu w polu zostanie ustalona automatycznie wg
        BayDeviceOrderPolicy (kanon polski + IEC 81346).
      </div>
    </SldModal>
  );
}

function selectStyle(): React.CSSProperties {
  return {
    width: '100%',
    padding: '6px 8px',
    background: '#1A1F26',
    border: '1px solid #3A3A3A',
    color: '#E5E7EB',
    borderRadius: 2,
    fontFamily: 'inherit',
    fontSize: 'inherit',
  };
}
