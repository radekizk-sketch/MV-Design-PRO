/**
 * ConsciousSplitModal — Phase 0C (operator-grade SLD plan v2).
 *
 * Workflow „Świadomy podział odcinka":
 *   1. Operator klika menu kontekstowe na odcinek SN
 *   2. Otwiera się modal — pyta o punkt podziału + obiekt do wstawienia
 *   3. „Pokaż podgląd" → executeDomainOperation('insert_station_on_segment_sn', {dry_run: true})
 *   4. Modal pokazuje electrical_impact (halves, invalidated_results, affected_proof_packs)
 *   5. „Zatwierdź" → executeDomainOperation z dry_run=false → mutacja ENM
 *   6. Snapshot odświeżony, notyfikacja sukcesu
 *
 * Acceptance Invariant 5: Świadomy split = osobna komenda, z preview,
 * z potwierdzeniem, audytowana.
 *
 * @see SLD_CONSCIOUS_SPLIT_WORKFLOW.md
 * @see backend/src/enm/domain_operations.py:insert_station_on_segment_sn
 */

import { useState } from 'react';

import {
  INSERTED_OBJECT_LABELS_PL,
  type InsertedObjectKind,
  type SplitElectricalImpact,
  type SplitStationType,
} from '../workflow/ConsciousSplitController';
import { FormField, SldModal } from './SldModal';

const SPLIT_STATION_TYPE_LABELS_PL: Readonly<Record<SplitStationType, string>> = {
  terminal: 'Stacja końcowa',
  inline: 'Stacja przelotowa',
  branch: 'Stacja odgałęźna',
  sectional: 'Stacja sekcyjna',
};

export interface ConsciousSplitModalContext {
  readonly segmentRef: string;
  readonly segmentType: 'cable' | 'line_overhead';
  readonly fromBusRef: string;
  readonly toBusRef: string;
  readonly lengthKm: number;
  readonly snVoltageKv: number;
}

export interface ConsciousSplitFormData {
  /** Współczynnik podziału w [0, 1]. */
  readonly insertAtRatio: number;
  /** Rodzaj wstawianego obiektu. */
  readonly insertedKind: InsertedObjectKind;
  /** Pola dla insertedKind='station'. */
  readonly stationName: string;
  readonly stationType: SplitStationType;
  readonly nnVoltageKv: number;
  readonly transformerCatalogRef: string;
}

export interface ConsciousSplitModalProps {
  readonly isOpen: boolean;
  readonly context: ConsciousSplitModalContext;
  readonly onClose: () => void;
  /**
   * Wywoływane PRZY KLIKU „Pokaż podgląd". Wywołuje backend z dry_run=true,
   * zwraca electrical_impact lub rzuca błąd.
   */
  readonly onPreview: (data: ConsciousSplitFormData) => Promise<SplitElectricalImpact>;
  /** Wywoływane PRZY KLIKU „Zatwierdź" (po wyświetleniu preview). */
  readonly onCommit: (data: ConsciousSplitFormData) => Promise<void> | void;
}

const DEFAULT_FORM: ConsciousSplitFormData = {
  insertAtRatio: 0.5,
  insertedKind: 'station',
  stationName: '',
  stationType: 'inline',
  nnVoltageKv: 0.4,
  transformerCatalogRef: '',
};

export function ConsciousSplitModal(props: ConsciousSplitModalProps): JSX.Element {
  const { isOpen, context, onClose, onPreview, onCommit } = props;
  const [data, setData] = useState<ConsciousSplitFormData>(DEFAULT_FORM);
  const [stage, setStage] = useState<'form' | 'preview' | 'committing'>('form');
  const [impact, setImpact] = useState<SplitElectricalImpact | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /* Walidacja formularza */
  const errors: { insertAtRatio?: string; stationName?: string; nnVoltageKv?: string } = {};
  if (data.insertAtRatio <= 0 || data.insertAtRatio >= 1) {
    errors.insertAtRatio = 'Punkt podziału musi być w zakresie (0, 1)';
  }
  if (data.insertedKind === 'station') {
    if (data.stationName.trim() === '') errors.stationName = 'Nazwa stacji wymagana';
    if (data.nnVoltageKv <= 0 || data.nnVoltageKv > context.snVoltageKv) {
      errors.nnVoltageKv = `Napięcie nN musi być w zakresie (0, ${context.snVoltageKv}) kV`;
    }
  }
  const isFormValid = Object.keys(errors).length === 0;

  const firstHalfKm = (data.insertAtRatio * context.lengthKm).toFixed(3);
  const secondHalfKm = ((1 - data.insertAtRatio) * context.lengthKm).toFixed(3);

  const handlePreview = async (): Promise<void> => {
    if (!isFormValid) return;
    setErrorMsg(null);
    try {
      const result = await onPreview(data);
      setImpact(result);
      setStage('preview');
    } catch (e) {
      setErrorMsg((e as Error).message ?? 'Błąd podglądu — sprawdź konsolę.');
    }
  };

  const handleCommit = async (): Promise<void> => {
    if (stage !== 'preview') return;
    setStage('committing');
    setErrorMsg(null);
    try {
      await onCommit(data);
      /* Reset po sukcesie. */
      setData(DEFAULT_FORM);
      setImpact(null);
      setStage('form');
    } catch (e) {
      setErrorMsg((e as Error).message ?? 'Błąd commitu — sprawdź konsolę.');
      setStage('preview');
    }
  };

  const handleClose = (): void => {
    setData(DEFAULT_FORM);
    setImpact(null);
    setStage('form');
    setErrorMsg(null);
    onClose();
  };

  const handleBackToForm = (): void => {
    setImpact(null);
    setStage('form');
  };

  /* Stage-specific confirm action. */
  const confirmHandler = stage === 'form' ? () => { void handlePreview(); } : () => { void handleCommit(); };
  const confirmLabel =
    stage === 'form' ? 'Pokaż podgląd skutków'
    : stage === 'committing' ? 'Zatwierdzanie…'
    : 'Zatwierdź podział';
  const confirmDisabled = stage === 'form' ? !isFormValid : stage === 'committing';

  return (
    <SldModal
      isOpen={isOpen}
      title="Świadomy podział odcinka SN"
      subtitle={`Odcinek ${context.segmentRef}: ${context.fromBusRef} → ${context.toBusRef} (${context.lengthKm.toFixed(3)} km, ${context.snVoltageKv} kV)`}
      onClose={handleClose}
      onConfirm={confirmHandler}
      confirmLabel={confirmLabel}
      confirmDisabled={confirmDisabled}
      cancelLabel={stage === 'preview' ? 'Wróć do formularza' : 'Anuluj'}
      width={620}
    >
      {errorMsg && (
        <div
          data-testid="conscious-split-error"
          style={{
            background: '#3A1010',
            border: '1px solid #8A1F1F',
            color: '#FFAFAF',
            padding: '8px 10px',
            marginBottom: 12,
            borderRadius: 2,
            fontSize: 13,
          }}
        >
          {errorMsg}
        </div>
      )}

      {stage === 'form' && (
        <>
          <FormField
            label={`Punkt podziału (współczynnik 0..1) — A=${firstHalfKm} km, B=${secondHalfKm} km`}
            required
            errorPl={errors.insertAtRatio}
            hintPl="Stosunek długości pierwszej połówki do całości. 0.5 = środek."
          >
            <input
              data-testid="conscious-split-ratio"
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

          <FormField label="Wstawiany obiekt">
            <select
              data-testid="conscious-split-inserted-kind"
              value={data.insertedKind}
              onChange={(e) => setData({ ...data, insertedKind: e.target.value as InsertedObjectKind })}
              style={{
                width: '100%',
                padding: '6px 8px',
                background: '#1A1F26',
                border: '1px solid #3A3A3A',
                color: '#E5E7EB',
                borderRadius: 2,
              }}
            >
              {(Object.keys(INSERTED_OBJECT_LABELS_PL) as InsertedObjectKind[]).map((k) => (
                <option key={k} value={k}>
                  {INSERTED_OBJECT_LABELS_PL[k]}
                </option>
              ))}
            </select>
          </FormField>

          {data.insertedKind === 'station' && (
            <>
              <FormField
                label="Nazwa stacji"
                required
                errorPl={errors.stationName}
              >
                <input
                  data-testid="conscious-split-station-name"
                  type="text"
                  value={data.stationName}
                  onChange={(e) => setData({ ...data, stationName: e.target.value })}
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

              <FormField label="Typ stacji">
                <select
                  data-testid="conscious-split-station-type"
                  value={data.stationType}
                  onChange={(e) => setData({ ...data, stationType: e.target.value as SplitStationType })}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    background: '#1A1F26',
                    border: '1px solid #3A3A3A',
                    color: '#E5E7EB',
                    borderRadius: 2,
                  }}
                >
                  {(Object.keys(SPLIT_STATION_TYPE_LABELS_PL) as SplitStationType[]).map((t) => (
                    <option key={t} value={t}>
                      {SPLIT_STATION_TYPE_LABELS_PL[t]}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField
                label="Napięcie nN"
                required
                errorPl={errors.nnVoltageKv}
              >
                <input
                  data-testid="conscious-split-nn-voltage"
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

              <FormField label="Katalog transformatora (opcjonalny)">
                <input
                  data-testid="conscious-split-transformer-catalog"
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
            </>
          )}
        </>
      )}

      {stage !== 'form' && impact && (
        <div data-testid="conscious-split-preview" style={{ fontSize: 13, color: '#E5E7EB' }}>
          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              data-testid="conscious-split-back"
              onClick={handleBackToForm}
              disabled={stage === 'committing'}
              style={{
                background: 'transparent',
                border: '1px solid #3A3A3A',
                color: '#9CA3AF',
                padding: '4px 10px',
                fontSize: 12,
                borderRadius: 2,
                cursor: stage === 'committing' ? 'not-allowed' : 'pointer',
              }}
            >
              ← Edytuj parametry
            </button>
          </div>

          <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>
            Skutki elektryczne podziału
          </h4>

          <div style={{ marginBottom: 10 }}>
            <strong>Połówki odcinka:</strong>
            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
              <li>
                A: {impact.halves.firstSegmentId ?? '(nowy)'} — {impact.halves.firstLengthKm.toFixed(3)} km
              </li>
              <li>
                B: {impact.halves.secondSegmentId ?? '(nowy)'} — {impact.halves.secondLengthKm.toFixed(3)} km
              </li>
              <li>Współczynnik podziału: {impact.halves.splitRatio.toFixed(3)}</li>
            </ul>
          </div>

          <div style={{ marginBottom: 10 }}>
            <strong>Dziedziczenie katalogu:</strong>{' '}
            {impact.catalogInheritance.sourceCatalogRef
              ? `${impact.catalogInheritance.sourceCatalogRef} → A=${impact.catalogInheritance.firstInherits ? '✓' : '✗'}, B=${impact.catalogInheritance.secondInherits ? '✓' : '✗'}`
              : 'brak (oryginalny odcinek bez katalogu)'}
            {impact.catalogInheritance.rule && (
              <div style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 16 }}>
                Reguła: {impact.catalogInheritance.rule}
              </div>
            )}
          </div>

          <div
            style={{
              marginBottom: 10,
              padding: 8,
              background: impact.invalidatedResults.length > 0 ? '#3A2A0A' : '#0A2A1A',
              border: `1px solid ${impact.invalidatedResults.length > 0 ? '#8A6A1F' : '#1F8A4A'}`,
              borderRadius: 2,
            }}
          >
            <strong>
              Unieważnione obliczenia: {impact.invalidatedResults.length}
            </strong>
            {impact.invalidatedResults.length > 0 && (
              <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: 12 }}>
                {impact.invalidatedResults.slice(0, 5).map((r) => (
                  <li key={r.runRef}>
                    {r.runKind}: {r.runRef} ({r.reason})
                  </li>
                ))}
                {impact.invalidatedResults.length > 5 && (
                  <li>… i {impact.invalidatedResults.length - 5} więcej</li>
                )}
              </ul>
            )}
          </div>

          <div
            style={{
              marginBottom: 10,
              padding: 8,
              background: impact.affectedProofPacks.length > 0 ? '#3A2A0A' : '#0A2A1A',
              border: `1px solid ${impact.affectedProofPacks.length > 0 ? '#8A6A1F' : '#1F8A4A'}`,
              borderRadius: 2,
            }}
          >
            <strong>
              Wymagana ponowna walidacja proof-packs: {impact.affectedProofPacks.length}
            </strong>
          </div>

          {impact.missingDataAfter.length > 0 && (
            <div
              style={{
                marginBottom: 10,
                padding: 8,
                background: '#3A1010',
                border: '1px solid #8A1F1F',
                borderRadius: 2,
              }}
            >
              <strong>Po podziale brakujące dane:</strong>
              <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: 12 }}>
                {impact.missingDataAfter.slice(0, 5).map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
                {impact.missingDataAfter.length > 5 && (
                  <li>… i {impact.missingDataAfter.length - 5} więcej</li>
                )}
              </ul>
            </div>
          )}

          <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>
            Topologia: {impact.topologyTypeChanged ? 'ZMIENIONA' : 'bez zmian'} ·
            Dotyczy {impact.affectedObjectRefs.length} obiektów ·
            {impact.affectedBuses.length} szyn
          </div>
        </div>
      )}
    </SldModal>
  );
}
