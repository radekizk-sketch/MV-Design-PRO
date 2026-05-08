/**
 * CouplerEditModal — modal edycji sprzęgła międzysekcyjnego (R14).
 *
 * Otwierany przez context menu sprzęgła.
 *
 * Pola formularza:
 *   - Stan CB sprzęgła (zamknięty/otwarty/nieznany)
 *   - Tryb SP/SZR (samoczynny powrót / samoczynne załączenie rezerwy)
 *   - Komentarz operatora (free text dla audytu)
 *
 * Walidacje:
 *   - jeśli CB closed → sekcje są elektrycznie połączone (read-only info)
 *   - SZR ma sens tylko dla CB open + tryb SZR_AKTYWNY
 */

import { useState } from 'react';

import type { SwitchState } from '../renderer/GpzCanonicalRenderer';
import { FormField, SldModal } from './SldModal';

export interface CouplerData {
  readonly couplerId: string;
  readonly designation: string;
  readonly leftSectionId: string;
  readonly rightSectionId: string;
  readonly closedState: SwitchState;
  readonly autoMode: 'manual' | 'sp' | 'szr';
  readonly comment: string;
}

export interface CouplerEditModalProps {
  readonly isOpen: boolean;
  readonly initial: CouplerData;
  readonly onClose: () => void;
  readonly onSubmit: (data: CouplerData) => void;
}

export function CouplerEditModal(props: CouplerEditModalProps): JSX.Element {
  const { isOpen, initial, onClose, onSubmit } = props;
  const [data, setData] = useState<CouplerData>(initial);

  const handleConfirm = (): void => {
    onSubmit(data);
  };

  /* Status info: gdy CB closed, sekcje są elektrycznie połączone */
  const sectionsConnectedInfo = data.closedState === 'closed'
    ? `Sekcje ${data.leftSectionId} ↔ ${data.rightSectionId} są POŁĄCZONE elektrycznie.`
    : data.closedState === 'open'
      ? `Sekcje ${data.leftSectionId} ↔ ${data.rightSectionId} są ROZDZIELONE.`
      : 'Stan elektryczny sprzęgła nieznany.';

  return (
    <SldModal
      isOpen={isOpen}
      title={`Sprzęgło ${initial.designation}`}
      subtitle={`Ref: ${initial.couplerId}`}
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmLabel="Zatwierdź zmiany"
      width={520}
    >
      <FormField label="Stan wyłącznika sprzęgła" required hintPl={sectionsConnectedInfo}>
        <select
          data-testid="coupler-edit-state"
          value={data.closedState}
          onChange={(e) => setData({ ...data, closedState: e.target.value as SwitchState })}
          style={{
            width: '100%',
            padding: '6px 8px',
            background: '#1A1F26',
            border: '1px solid #3A3A3A',
            color: '#E5E7EB',
            borderRadius: 2,
          }}
        >
          <option value="closed">Zamknięty (sekcje połączone)</option>
          <option value="open">Otwarty (sekcje rozdzielone)</option>
          <option value="unknown">Nieznany</option>
        </select>
      </FormField>

      <FormField label="Tryb automatyki sprzęgła" hintPl="SP — samoczynny powrót | SZR — samoczynne załączenie rezerwy">
        <select
          data-testid="coupler-edit-auto-mode"
          value={data.autoMode}
          onChange={(e) => setData({ ...data, autoMode: e.target.value as 'manual' | 'sp' | 'szr' })}
          style={{
            width: '100%',
            padding: '6px 8px',
            background: '#1A1F26',
            border: '1px solid #3A3A3A',
            color: '#E5E7EB',
            borderRadius: 2,
          }}
        >
          <option value="manual">Ręczny</option>
          <option value="sp">SP — samoczynny powrót</option>
          <option value="szr">SZR — samoczynne załączenie rezerwy</option>
        </select>
      </FormField>

      <FormField label="Komentarz operatora">
        <textarea
          data-testid="coupler-edit-comment"
          value={data.comment}
          onChange={(e) => setData({ ...data, comment: e.target.value })}
          placeholder="np. SZR aktywny w nocy, ręczne załączenie po awarii TR1"
          rows={3}
          style={{
            width: '100%',
            padding: '6px 8px',
            background: '#1A1F26',
            border: '1px solid #3A3A3A',
            color: '#E5E7EB',
            borderRadius: 2,
            fontFamily: 'inherit',
            fontSize: 'inherit',
            resize: 'vertical',
          }}
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
        ⓘ Zmiana stanu sprzęgła wpływa na topologię sieci. Wyniki obliczeń
        powiązane z sekcjami {initial.leftSectionId} i {initial.rightSectionId}{' '}
        zostaną unieważnione (zgodnie z Inv 4 — Case Immutability Rule).
      </div>
    </SldModal>
  );
}
