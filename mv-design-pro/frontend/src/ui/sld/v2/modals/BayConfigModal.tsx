/**
 * BayConfigModal — modal edycji konfiguracji pola SN (R14).
 *
 * Otwierany przez context menu → "Otwórz okno pola" lub doubleclick na polu.
 *
 * Pola formularza:
 *   - Nazwa odpływu (feeder_short_name)
 *   - Numer dyspozytorski (bay_number)
 *   - Rola pola (LINE_OUT/LINE_IN/LINE_BRANCH/TRANSFORMER/COUPLER/MEASUREMENT)
 *   - Cel kabla (outgoing_destination_ref → text label)
 *   - Tryb sterowania (remote/local/unknown)
 *
 * Walidacje:
 *   - bay_number ≠ pusty string (Inv 9: brak ≠ "?")
 *   - feeder_short_name ≤ 12 znaków (kanon SCADA OSD)
 */

import { useState } from 'react';

import type { BayFieldRole } from '../renderer/GpzCanonicalRenderer';
import { FormField, SldModal } from './SldModal';

export interface BayConfigData {
  readonly bayRef: string;
  readonly bayNumber: string;
  readonly feederName: string;
  readonly fieldRole: BayFieldRole;
  readonly destinationLabel: string;
  readonly controlMode: 'remote' | 'local' | 'unknown';
}

export interface BayConfigModalProps {
  readonly isOpen: boolean;
  readonly initial: BayConfigData;
  readonly onClose: () => void;
  readonly onSubmit: (data: BayConfigData) => void;
}

const FIELD_ROLES_PL: Readonly<Record<BayFieldRole, string>> = {
  LINE_OUT: 'Liniowe wyjściowe',
  LINE_IN: 'Liniowe wejściowe',
  LINE_BRANCH: 'Odgałęzienie liniowe',
  TRANSFORMER: 'Transformatorowe',
  COUPLER: 'Sprzęgło',
  MEASUREMENT: 'Pomiarowe',
};

export function BayConfigModal(props: BayConfigModalProps): JSX.Element {
  const { isOpen, initial, onClose, onSubmit } = props;
  const [data, setData] = useState<BayConfigData>(initial);

  /* Walidacja per pole */
  const errors: { bayNumber?: string; feederName?: string } = {};
  if (data.bayNumber.trim() === '') errors.bayNumber = 'Numer dyspozytorski wymagany';
  if (data.feederName.length > 12) errors.feederName = 'Maks. 12 znaków (kanon SCADA)';

  const isValid = Object.keys(errors).length === 0;

  const handleConfirm = (): void => {
    if (!isValid) return;
    onSubmit(data);
  };

  return (
    <SldModal
      isOpen={isOpen}
      title={`Konfiguracja pola ${initial.bayNumber || initial.bayRef}`}
      subtitle={`Ref: ${initial.bayRef}`}
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmLabel="Zapisz"
      confirmDisabled={!isValid}
      width={520}
    >
      <FormField label="Numer dyspozytorski" required errorPl={errors.bayNumber} hintPl="Numer pola w rozdzielni (np. 10, 23/1)">
        <input
          data-testid="bay-config-number"
          type="text"
          value={data.bayNumber}
          onChange={(e) => setData({ ...data, bayNumber: e.target.value })}
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

      <FormField label="Nazwa odpływu" errorPl={errors.feederName} hintPl="Krótka nazwa, maks. 12 znaków (np. PST1, ZUS-II)">
        <input
          data-testid="bay-config-feeder"
          type="text"
          value={data.feederName}
          onChange={(e) => setData({ ...data, feederName: e.target.value })}
          maxLength={12}
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

      <FormField label="Rola pola">
        <select
          data-testid="bay-config-role"
          value={data.fieldRole}
          onChange={(e) => setData({ ...data, fieldRole: e.target.value as BayFieldRole })}
          style={{
            width: '100%',
            padding: '6px 8px',
            background: '#1A1F26',
            border: '1px solid #3A3A3A',
            color: '#E5E7EB',
            borderRadius: 2,
          }}
        >
          {(Object.keys(FIELD_ROLES_PL) as BayFieldRole[]).map((role) => (
            <option key={role} value={role}>{FIELD_ROLES_PL[role]}</option>
          ))}
        </select>
      </FormField>

      <FormField label="Cel kabla / stacja odbiorcza">
        <input
          data-testid="bay-config-destination"
          type="text"
          value={data.destinationLabel}
          onChange={(e) => setData({ ...data, destinationLabel: e.target.value })}
          placeholder="np. STAROŁĘCKA 42"
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

      <FormField label="Tryb sterowania">
        <select
          data-testid="bay-config-control"
          value={data.controlMode}
          onChange={(e) => setData({ ...data, controlMode: e.target.value as 'remote' | 'local' | 'unknown' })}
          style={{
            width: '100%',
            padding: '6px 8px',
            background: '#1A1F26',
            border: '1px solid #3A3A3A',
            color: '#E5E7EB',
            borderRadius: 2,
          }}
        >
          <option value="remote">Zdalne</option>
          <option value="local">Lokalne</option>
          <option value="unknown">Nieznane</option>
        </select>
      </FormField>
    </SldModal>
  );
}
