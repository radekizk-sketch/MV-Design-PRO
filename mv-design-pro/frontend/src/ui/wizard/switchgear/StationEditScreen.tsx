/**
 * StationEditScreen (Screen B) — Edycja stacji: pola SN/nN + źródła PV/BESS.
 *
 * RUN #3G §1.1.B: Edycja stacji z sekcjami SN i nN.
 *
 * BINDING: Polish labels, no codenames, no guessing.
 * ZAKAZ: "magiczne generowanie pól" — dodanie pola wymaga wyboru PoleTypeV1.
 * PV/BESS: jawny wariant A (nn_side) lub B (block_transformer).
 */

import { useCallback, useState } from 'react';
import { useSwitchgearStore, useCurrentStationData } from './useSwitchgearStore';
import { useSwitchgearOps } from './useSwitchgearOps';
import { PoleTypeV1, POLE_TYPE_LABELS_PL } from '../../sld/core/fieldDeviceContracts';
import type { FieldSummaryV1, GeneratorSourceEntryV1, ReadinessStatus } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readinessIcon(status: ReadinessStatus): string {
  switch (status) {
    case 'OK':
      return '[OK]';
    case 'NIE':
      return '[!]';
    case 'CZESCIOWO':
      return '[~]';
  }
}

const SN_POLE_TYPES: PoleTypeV1[] = [
  PoleTypeV1.POLE_LINIOWE_SN,
  PoleTypeV1.POLE_TRANSFORMATOROWE_SN_NN,
  PoleTypeV1.POLE_SPRZEGLOWE_SN,
  PoleTypeV1.POLE_ZRODLA_PV_SN,
  PoleTypeV1.POLE_ZRODLA_BESS_SN,
  PoleTypeV1.POLE_LACZNIKA_SZYN_SN,
];

const NN_POLE_TYPES: PoleTypeV1[] = [
  PoleTypeV1.POLE_GLOWNE_NN,
  PoleTypeV1.POLE_ODPLYWOWE_NN,
  PoleTypeV1.POLE_ZRODLA_PV_NN,
  PoleTypeV1.POLE_ZRODLA_BESS_NN,
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FieldRow({
  field,
  onEdit,
}: {
  readonly field: FieldSummaryV1;
  readonly onEdit: (fieldId: string) => void;
}): JSX.Element {
  return (
    <tr
      className="switchgear-field-row"
      data-testid={`field-row-${field.fieldId}`}
    >
      <td className="switchgear-cell--name">{field.fieldName}</td>
      <td>{POLE_TYPE_LABELS_PL[field.poleType] ?? field.poleType}</td>
      <td>{field.deviceCount}</td>
      <td>{readinessIcon(field.catalogReady)}</td>
      <td>{readinessIcon(field.bindingsReady)}</td>
      <td>{readinessIcon(field.overallReady)}</td>
      <td>
        <button
          className="switchgear-btn switchgear-btn--edit"
          onClick={() => onEdit(field.fieldId)}
          data-testid={`edit-field-${field.fieldId}`}
        >
          Edytuj
        </button>
      </td>
    </tr>
  );
}

function GeneratorRow({
  gen,
}: {
  readonly gen: GeneratorSourceEntryV1;
}): JSX.Element {
  return (
    <tr
      className={`switchgear-gen-row ${!gen.isValid ? 'switchgear-gen-row--invalid' : ''}`}
      data-testid={`generator-row-${gen.generatorId}`}
    >
      <td className="switchgear-cell--name">{gen.generatorName}</td>
      <td>{gen.generatorType}</td>
      <td>{gen.connectionVariant ?? 'Nie wybrano'}</td>
      <td>{gen.isValid ? 'OK' : gen.fixMessagePl ?? 'Błąd konfiguracji'}</td>
    </tr>
  );
}

function AddFieldDialog({
  poleTypes,
  sectionLabel,
  onAdd,
  onCancel,
}: {
  readonly poleTypes: readonly PoleTypeV1[];
  readonly sectionLabel: string;
  readonly onAdd: (poleType: PoleTypeV1) => void;
  readonly onCancel: () => void;
}): JSX.Element {
  const [selected, setSelected] = useState<PoleTypeV1 | null>(null);

  return (
    <div className="switchgear-add-field-dialog" data-testid="add-field-dialog">
      <h4>Dodaj pole {sectionLabel}</h4>
      <p>Wybierz typ pola (PoleTypeV1):</p>
      <select
        className="switchgear-select"
        value={selected ?? ''}
        onChange={(e) => setSelected(e.target.value as PoleTypeV1)}
        data-testid="add-field-type-select"
      >
        <option value="">-- Wybierz typ --</option>
        {poleTypes.map((pt) => (
          <option key={pt} value={pt}>
            {POLE_TYPE_LABELS_PL[pt] ?? pt}
          </option>
        ))}
      </select>
      <div className="switchgear-dialog-actions">
        <button
          className="switchgear-btn switchgear-btn--primary"
          disabled={!selected}
          onClick={() => selected && onAdd(selected)}
          data-testid="add-field-confirm"
        >
          Dodaj
        </button>
        <button
          className="switchgear-btn switchgear-btn--secondary"
          onClick={onCancel}
          data-testid="add-field-cancel"
        >
          Anuluj
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export interface StationEditScreenProps {
  /** Active study case ID for backend operations */
  readonly caseId?: string | null;
}

export function StationEditScreen({ caseId = null }: StationEditScreenProps): JSX.Element {
  const stationData = useCurrentStationData();
  const navigateToStationList = useSwitchgearStore((s) => s.navigateToStationList);
  const navigateToFieldEdit = useSwitchgearStore((s) => s.navigateToFieldEdit);
  const { addField } = useSwitchgearOps(caseId);

  const [addFieldSection, setAddFieldSection] = useState<'SN' | 'nN' | null>(null);

  const handleEditField = useCallback(
    (fieldId: string) => {
      if (stationData) {
        navigateToFieldEdit(stationData.stationId, fieldId);
      }
    },
    [stationData, navigateToFieldEdit],
  );

  const handleAddField = useCallback(
    (poleType: PoleTypeV1) => {
      setAddFieldSection(null);
      if (stationData) {
        void addField(stationData.stationId, poleType);
      }
    },
    [stationData, addField],
  );

  if (!stationData) {
    return (
      <div className="switchgear-empty" data-testid="switchgear-no-station">
        Nie wybrano stacji. Wróć do listy stacji.
        <button className="switchgear-btn" onClick={navigateToStationList}>
          Powrót
        </button>
      </div>
    );
  }

  return (
    <div className="switchgear-station-edit" data-testid="switchgear-station-edit">
      {/* Header */}
      <div className="switchgear-header">
        <button
          className="switchgear-btn switchgear-btn--back"
          onClick={navigateToStationList}
          data-testid="station-edit-back"
        >
          Powrót do listy
        </button>
        <h2>
          Stacja: {stationData.stationName}{' '}
          <span className="switchgear-station-type">({stationData.stationType})</span>
        </h2>
      </div>

      {/* SN Section */}
      <section className="switchgear-section" data-testid="section-sn">
        <h3 className="switchgear-section-title">Pola SN</h3>
        {stationData.fieldsSn.length === 0 ? (
          <p className="switchgear-empty-fields">Brak pól SN. Dodaj pole poniżej.</p>
        ) : (
          <table className="switchgear-table">
            <thead>
              <tr>
                <th>Nazwa pola</th>
                <th>Typ pola</th>
                <th>Aparaty</th>
                <th>Katalogi</th>
                <th>Wiązania</th>
                <th>Gotowość</th>
                <th>Akcja</th>
              </tr>
            </thead>
            <tbody>
              {stationData.fieldsSn.map((field: FieldSummaryV1) => (
                <FieldRow key={field.fieldId} field={field} onEdit={handleEditField} />
              ))}
            </tbody>
          </table>
        )}
        <button
          className="switchgear-btn switchgear-btn--add"
          onClick={() => setAddFieldSection('SN')}
          data-testid="add-field-sn"
        >
          Dodaj pole SN
        </button>
        {addFieldSection === 'SN' && (
          <AddFieldDialog
            poleTypes={SN_POLE_TYPES}
            sectionLabel="SN"
            onAdd={handleAddField}
            onCancel={() => setAddFieldSection(null)}
          />
        )}
      </section>

      {/* nN Section */}
      <section className="switchgear-section" data-testid="section-nn">
        <h3 className="switchgear-section-title">Pola nN</h3>
        {stationData.fieldsNn.length === 0 ? (
          <p className="switchgear-empty-fields">Brak pól nN. Dodaj pole poniżej.</p>
        ) : (
          <table className="switchgear-table">
            <thead>
              <tr>
                <th>Nazwa pola</th>
                <th>Typ pola</th>
                <th>Aparaty</th>
                <th>Katalogi</th>
                <th>Wiązania</th>
                <th>Gotowość</th>
                <th>Akcja</th>
              </tr>
            </thead>
            <tbody>
              {stationData.fieldsNn.map((field: FieldSummaryV1) => (
                <FieldRow key={field.fieldId} field={field} onEdit={handleEditField} />
              ))}
            </tbody>
          </table>
        )}
        <button
          className="switchgear-btn switchgear-btn--add"
          onClick={() => setAddFieldSection('nN')}
          data-testid="add-field-nn"
        >
          Dodaj pole nN
        </button>
        {addFieldSection === 'nN' && (
          <AddFieldDialog
            poleTypes={NN_POLE_TYPES}
            sectionLabel="nN"
            onAdd={handleAddField}
            onCancel={() => setAddFieldSection(null)}
          />
        )}
      </section>

      {/* PV/BESS Section */}
      <section className="switchgear-section" data-testid="section-generators">
        <h3 className="switchgear-section-title">Źródła (PV/BESS)</h3>
        {stationData.generators.length === 0 ? (
          <p className="switchgear-empty-fields">
            Brak źródeł PV/BESS powiązanych ze stacją. Dodaj generator w kreatorze (K6).
          </p>
        ) : (
          <table className="switchgear-table">
            <thead>
              <tr>
                <th>Nazwa generatora</th>
                <th>Typ</th>
                <th>Wariant przyłączenia</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {stationData.generators.map((gen: GeneratorSourceEntryV1) => (
                <GeneratorRow key={gen.generatorId} gen={gen} />
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
