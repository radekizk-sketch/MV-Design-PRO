/**
 * ApparatusStateModal — modal sterowania łącznikami pola SN (R30).
 *
 * Operacyjnie krytyczny: dyspozytor klika 100+ razy dziennie żeby
 * otworzyć/zamknąć CB/DS/ES w polu. Ten modal jest to PUNKT KOŃCOWY
 * dla `set-switch-state` action z context menu pola.
 *
 * Per IEC 61850 + kanon polski:
 *   - CB (Q0) — wyłącznik (kwadrat) — closed/open
 *   - DS_BUS (Q1) — odłącznik szynowy (kółko) — closed/open
 *   - DS_LIN (Q9) — odłącznik liniowy (kółko) — closed/open
 *   - ES (Q8) — uziemnik (boczny) — closed (uziemione)/open/absent
 *
 * Walidacje (interlock):
 *   - ES NIE może być closed gdy CB lub DS jeszcze closed (zagrożenie zwarciem)
 *   - CB NIE może zamknąć gdy DS_BUS lub DS_LIN open (otwarte odłączniki)
 *
 * Operator-mode:
 *   - Tryb "remote" → wszystkie operacje przez backend
 *   - Tryb "local" → wymaga manipulator (lock fizyczny)
 */

import { useState } from 'react';

import type { SwitchState } from '../renderer/GpzCanonicalRenderer';
import { FormField, SldModal } from './SldModal';

export interface ApparatusStateData {
  readonly bayRef: string;
  readonly bayNumber: string;
  readonly feederName: string;
  /** Current states (read from runtime SCADA). */
  readonly cbState: SwitchState;
  readonly dsBusState: SwitchState;
  readonly dsLinState: SwitchState;
  readonly esState: 'closed' | 'open' | 'absent' | 'unknown';
  /** Q-numbery (z bay.qDesignations). */
  readonly cbQ: string;
  readonly dsBusQ: string;
  readonly dsLinQ: string;
  readonly esQ: string;
  readonly controlMode: 'remote' | 'local' | 'unknown';
}

export interface ApparatusStateModalProps {
  readonly isOpen: boolean;
  readonly initial: ApparatusStateData;
  readonly onClose: () => void;
  /** Submit zwraca delta — które aparaty mają zmienić stan + nowe stany. */
  readonly onSubmit: (delta: {
    readonly bayRef: string;
    readonly cbState?: SwitchState;
    readonly dsBusState?: SwitchState;
    readonly dsLinState?: SwitchState;
    readonly esState?: 'closed' | 'open' | 'absent' | 'unknown';
    readonly operatorComment: string;
  }) => void;
}

const SWITCH_STATE_LABEL: Readonly<Record<SwitchState, string>> = {
  closed: 'Zamknięty',
  open: 'Otwarty',
  unknown: 'Nieznany',
};

export function ApparatusStateModal(props: ApparatusStateModalProps): JSX.Element {
  const { isOpen, initial, onClose, onSubmit } = props;
  const [cbState, setCbState] = useState<SwitchState>(initial.cbState);
  const [dsBusState, setDsBusState] = useState<SwitchState>(initial.dsBusState);
  const [dsLinState, setDsLinState] = useState<SwitchState>(initial.dsLinState);
  const [esState, setEsState] = useState<'closed' | 'open' | 'absent' | 'unknown'>(initial.esState);
  const [comment, setComment] = useState('');

  /* Interlock walidacje (kanon polski + IEC 61850) */
  const errors: { es?: string; cb?: string } = {};
  if (esState === 'closed' && (cbState === 'closed' || dsBusState === 'closed' || dsLinState === 'closed')) {
    errors.es = 'BLOKADA: ES nie może być załączone gdy CB/DS są zamknięte (zagrożenie zwarciem!)';
  }
  if (cbState === 'closed' && (dsBusState === 'open' || dsLinState === 'open')) {
    errors.cb = 'BLOKADA: CB nie może być zamknięte gdy DS_BUS lub DS_LIN są otwarte';
  }

  /* Read-only gdy controlMode='local' (operator musi przyjść do urządzenia) */
  const isReadOnly = initial.controlMode === 'local';

  const isValid = Object.keys(errors).length === 0;

  const handleConfirm = (): void => {
    if (!isValid || isReadOnly) return;
    onSubmit({
      bayRef: initial.bayRef,
      operatorComment: comment,
      cbState: cbState !== initial.cbState ? cbState : undefined,
      dsBusState: dsBusState !== initial.dsBusState ? dsBusState : undefined,
      dsLinState: dsLinState !== initial.dsLinState ? dsLinState : undefined,
      esState: esState !== initial.esState ? esState : undefined,
    });
  };

  /* Suma zmian (delta count) */
  const changeCount = [
    cbState !== initial.cbState,
    dsBusState !== initial.dsBusState,
    dsLinState !== initial.dsLinState,
    esState !== initial.esState,
  ].filter(Boolean).length;

  return (
    <SldModal
      isOpen={isOpen}
      title={`Sterowanie polem ${initial.bayNumber || initial.bayRef}`}
      subtitle={`Odpływ: ${initial.feederName || '—'} · Tryb: ${
        initial.controlMode === 'remote' ? 'zdalne' : initial.controlMode === 'local' ? 'lokalne' : 'nieznane'
      }`}
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmLabel={changeCount > 0 ? `Wykonaj ${changeCount} zmian` : 'Brak zmian'}
      confirmDisabled={!isValid || isReadOnly || changeCount === 0}
      width={560}
    >
      {isReadOnly && (
        <div
          data-testid="apparatus-state-readonly-warning"
          style={{
            marginBottom: 16,
            padding: 10,
            background: 'rgba(255, 192, 64, 0.15)',
            border: '1px solid #FFC857',
            borderRadius: 4,
            color: '#FFC857',
            fontSize: 12,
          }}
        >
          ⚠ Pole w trybie LOKALNYM — sterowanie zdalne ZABLOKOWANE.
          Operator musi przyjść do rozdzielni i użyć manipulatora.
        </div>
      )}

      <FormField
        label={`Wyłącznik CB (${initial.cbQ})`}
        errorPl={errors.cb}
        hintPl="Główny łącznik mocy pola"
      >
        <select
          data-testid="apparatus-state-cb"
          value={cbState}
          onChange={(e) => setCbState(e.target.value as SwitchState)}
          disabled={isReadOnly}
          style={selectStyle(isReadOnly)}
        >
          <option value="closed">{SWITCH_STATE_LABEL.closed}</option>
          <option value="open">{SWITCH_STATE_LABEL.open}</option>
          <option value="unknown">{SWITCH_STATE_LABEL.unknown}</option>
        </select>
      </FormField>

      <FormField
        label={`Odłącznik szynowy DS_BUS (${initial.dsBusQ})`}
        hintPl="Odłącznik między polem a szyną"
      >
        <select
          data-testid="apparatus-state-ds-bus"
          value={dsBusState}
          onChange={(e) => setDsBusState(e.target.value as SwitchState)}
          disabled={isReadOnly}
          style={selectStyle(isReadOnly)}
        >
          <option value="closed">{SWITCH_STATE_LABEL.closed}</option>
          <option value="open">{SWITCH_STATE_LABEL.open}</option>
          <option value="unknown">{SWITCH_STATE_LABEL.unknown}</option>
        </select>
      </FormField>

      <FormField
        label={`Odłącznik liniowy DS_LIN (${initial.dsLinQ})`}
        hintPl="Odłącznik między polem a kablem wychodzącym"
      >
        <select
          data-testid="apparatus-state-ds-lin"
          value={dsLinState}
          onChange={(e) => setDsLinState(e.target.value as SwitchState)}
          disabled={isReadOnly}
          style={selectStyle(isReadOnly)}
        >
          <option value="closed">{SWITCH_STATE_LABEL.closed}</option>
          <option value="open">{SWITCH_STATE_LABEL.open}</option>
          <option value="unknown">{SWITCH_STATE_LABEL.unknown}</option>
        </select>
      </FormField>

      <FormField
        label={`Uziemnik ES (${initial.esQ})`}
        errorPl={errors.es}
        hintPl="Uziemienie pola po stronie kabla — dla bezpieczeństwa pracy"
      >
        <select
          data-testid="apparatus-state-es"
          value={esState}
          onChange={(e) => setEsState(e.target.value as typeof esState)}
          disabled={isReadOnly}
          style={selectStyle(isReadOnly)}
        >
          <option value="closed">Załączony (uziemione)</option>
          <option value="open">Otwarty</option>
          <option value="absent">Brak</option>
          <option value="unknown">Nieznany</option>
        </select>
      </FormField>

      <FormField
        label="Komentarz operatora"
        hintPl="Wymagany dla audytu — przyczyna manipulacji (np. 'Wyłączono pole 10 do prac konserwacyjnych')"
      >
        <textarea
          data-testid="apparatus-state-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          disabled={isReadOnly}
          placeholder="np. Wyłączono pole 10 do prac konserwacyjnych — zlecenie K-2026-001"
          style={{
            ...selectStyle(isReadOnly),
            resize: 'vertical',
          }}
        />
      </FormField>

      {changeCount > 0 && !errors.es && !errors.cb && (
        <div
          data-testid="apparatus-state-impact-summary"
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
          ⓘ Wykonanie {changeCount} {changeCount === 1 ? 'zmiany' : 'zmian'} stanu spowoduje
          UNIEWAŻNIENIE wyników obliczeń pola {initial.bayNumber || initial.bayRef} oraz wszystkich
          obliczeń sieci powiązanych (Inv 4 — Case Immutability Rule).
        </div>
      )}
    </SldModal>
  );
}

function selectStyle(isReadOnly: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '6px 8px',
    background: isReadOnly ? '#0F1318' : '#1A1F26',
    border: `1px solid ${isReadOnly ? '#2A2A2A' : '#3A3A3A'}`,
    color: isReadOnly ? '#666' : '#E5E7EB',
    borderRadius: 2,
    fontFamily: 'inherit',
    fontSize: 'inherit',
    cursor: isReadOnly ? 'not-allowed' : 'pointer',
  };
}
