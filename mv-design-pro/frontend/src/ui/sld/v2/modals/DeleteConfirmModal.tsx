/**
 * DeleteConfirmModal — potwierdzenie usunięcia obiektu z modelu sieci.
 *
 * Workflow „Usuń obiekt":
 *   1. Operator klika menu kontekstowe „Usuń pole/odcinek/stację/PV/BESS/FW"
 *   2. Modal pokazuje informację o obiekcie i ostrzeżenie o konsekwencjach
 *      (Inv 4: wyniki obliczeń zostaną unieważnione)
 *   3. Submit → executeDomainOperation('delete_element', { element_ref })
 *   4. Backend usuwa obiekt + wszystkie powiązane (cascade) + invaliduje wyniki
 *   5. Snapshot odświeżony, notyfikacja sukcesu
 *
 * Acceptance Invariant 4: Case Immutability — usunięcie obiektu invaliduje
 * wszystkie wyniki referujące ten obiekt.
 */

import { useState } from 'react';

import { SldModal } from './SldModal';

export type DeletableKind =
  | 'bay'
  | 'segment'
  | 'station'
  | 'der_pv'
  | 'der_bess'
  | 'der_fw';

export const DELETABLE_LABELS_PL: Readonly<Record<DeletableKind, string>> = {
  bay: 'pole SN',
  segment: 'odcinek',
  station: 'stację',
  der_pv: 'źródło PV',
  der_bess: 'magazyn BESS',
  der_fw: 'farmę wiatrową',
};

export interface DeleteConfirmModalContext {
  readonly elementRef: string;
  readonly elementKind: DeletableKind;
  readonly displayName: string;
  /** Lista refs obiektów które będą usunięte cascade (np. bays gdy usuwamy stację). */
  readonly cascadeRefs?: readonly string[];
}

export interface DeleteConfirmModalProps {
  readonly isOpen: boolean;
  readonly context: DeleteConfirmModalContext;
  readonly onClose: () => void;
  readonly onConfirm: (elementRef: string) => Promise<void> | void;
}

export function DeleteConfirmModal(props: DeleteConfirmModalProps): JSX.Element {
  const { isOpen, context, onClose, onConfirm } = props;
  const [submitting, setSubmitting] = useState(false);

  const kindLabel = DELETABLE_LABELS_PL[context.elementKind];

  const handleConfirm = async (): Promise<void> => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(context.elementRef);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SldModal
      isOpen={isOpen}
      title={`Usunięcie: ${kindLabel}`}
      subtitle={`${context.displayName} (${context.elementRef})`}
      onClose={onClose}
      onConfirm={() => { void handleConfirm(); }}
      confirmLabel={submitting ? 'Usuwanie…' : 'Usuń'}
      confirmDisabled={submitting}
      width={480}
    >
      <div
        data-testid="delete-confirm-warning"
        style={{
          padding: '10px 12px',
          background: '#3A2A0A',
          border: '1px solid #8A6A1F',
          borderRadius: 2,
          color: '#FCD34D',
          fontSize: 13,
          marginBottom: 12,
        }}
      >
        <strong>Uwaga — operacja nieodwracalna.</strong>
        <div style={{ marginTop: 4, color: '#E5E7EB' }}>
          Usunięcie obiektu spowoduje:
        </div>
        <ul style={{ margin: '4px 0 0 18px', padding: 0, color: '#E5E7EB' }}>
          <li>Trwałe usunięcie z modelu sieci (ENM)</li>
          <li>Unieważnienie wyników obliczeń referujących ten obiekt (Inv 4)</li>
          <li>Cascade: usunięcie obiektów zależnych (np. pól stacji, transformatorów)</li>
        </ul>
      </div>

      {context.cascadeRefs && context.cascadeRefs.length > 0 && (
        <div
          data-testid="delete-confirm-cascade"
          style={{
            padding: 8,
            background: '#1A1F26',
            border: '1px solid #3A3A3A',
            borderRadius: 2,
            color: '#9CA3AF',
            fontSize: 12,
            marginBottom: 12,
          }}
        >
          <strong>Razem z obiektem zostanie usuniętych: {context.cascadeRefs.length}</strong>
          <ul style={{ margin: '4px 0 0 18px', padding: 0, fontFamily: 'monospace' }}>
            {context.cascadeRefs.slice(0, 8).map((ref) => (
              <li key={ref}>{ref}</li>
            ))}
            {context.cascadeRefs.length > 8 && (
              <li>… i {context.cascadeRefs.length - 8} więcej</li>
            )}
          </ul>
        </div>
      )}

      <div style={{ color: '#E5E7EB', fontSize: 13 }}>
        Czy na pewno chcesz usunąć {kindLabel} <strong>{context.displayName}</strong>?
      </div>
    </SldModal>
  );
}
