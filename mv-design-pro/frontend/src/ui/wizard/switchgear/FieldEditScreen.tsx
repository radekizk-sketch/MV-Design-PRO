/**
 * FieldEditScreen (Screen C) — Edycja pola: aparaty + wiązania + FixActions.
 *
 * RUN #3G §1.1.C: Formularz pola z listą aparatów, powiązaniami i FixActions.
 *
 * BINDING: Polish labels, no codenames, no guessing, catalogRef required.
 *
 * Layout:
 *   Część 1: Dane pola (typ, rola, powiązanie topologiczne)
 *   Część 2: Aparaty w polu (lista z akcjami)
 *   Część 3: Powiązania logiczne (relay→CB, CT on power path, VT side)
 *   Część 4: FixActions lokalne (z nawigacją do fokus)
 */

import { useCallback } from 'react';
import { useSwitchgearStore, useCurrentFieldData, useFocusTarget } from './useSwitchgearStore';
import { useSwitchgearOps } from './useSwitchgearOps';
import {
  POLE_TYPE_LABELS_PL,
  APARAT_TYPE_LABELS_PL,
  AparatTypeV1,
  FieldRoleV1,
} from '../../sld/core/fieldDeviceContracts';
import { PV_BESS_SN_ROLES } from '../../sld/core/switchgearConfig';
import type {
  DeviceEntryV1,
  DeviceBindingV1,
  FieldFixActionV1,
  ReadinessStatus,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadge(status: ReadinessStatus): string {
  switch (status) {
    case 'OK':
      return 'OK';
    case 'NIE':
      return 'Brak';
    case 'CZESCIOWO':
      return 'Częściowo';
  }
}

function severityClass(severity: 'BLOCKER' | 'WARNING' | 'INFO'): string {
  switch (severity) {
    case 'BLOCKER':
      return 'switchgear-fix--blocker';
    case 'WARNING':
      return 'switchgear-fix--warning';
    case 'INFO':
      return 'switchgear-fix--info';
  }
}

const ADDABLE_APARAT_TYPES: AparatTypeV1[] = [
  AparatTypeV1.WYLACZNIK,
  AparatTypeV1.ODLACZNIK,
  AparatTypeV1.ROZLACZNIK,
  AparatTypeV1.BEZPIECZNIK,
  AparatTypeV1.UZIEMNIK,
  AparatTypeV1.PRZEKLADNIK_PRADOWY,
  AparatTypeV1.PRZEKLADNIK_NAPIECIOWY,
  AparatTypeV1.ZABEZPIECZENIE,
  AparatTypeV1.GLOWICA_KABLOWA,
  AparatTypeV1.ACB,
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DeviceRow({
  device,
  onSelectCatalog,
  onRemove,
}: {
  readonly device: DeviceEntryV1;
  readonly onSelectCatalog: (deviceId: string, aparatType: string) => void;
  readonly onRemove: (deviceId: string) => void;
}): JSX.Element {
  return (
    <tr
      className="switchgear-device-row"
      data-testid={`device-row-${device.deviceId}`}
      id={`device-${device.deviceId}`}
    >
      <td>{APARAT_TYPE_LABELS_PL[device.aparatType as AparatTypeV1] ?? device.aparatType}</td>
      <td>
        {device.catalogRef ? (
          <span className="switchgear-catalog-ref">
            {device.catalogName ?? device.catalogRef}
          </span>
        ) : (
          <span className="switchgear-catalog-missing">Brak katalogu</span>
        )}
      </td>
      <td>{device.hasParameters ? 'Tak' : 'Nie'}</td>
      <td>{statusBadge(device.validationStatus)}</td>
      <td>
        <button
          className="switchgear-btn switchgear-btn--small"
          onClick={() => onSelectCatalog(device.deviceId, device.aparatType)}
          data-testid={`catalog-btn-${device.deviceId}`}
        >
          Przypnij katalog
        </button>
        <button
          className="switchgear-btn switchgear-btn--small switchgear-btn--danger"
          onClick={() => onRemove(device.deviceId)}
          data-testid={`remove-btn-${device.deviceId}`}
        >
          Usuń
        </button>
      </td>
    </tr>
  );
}

function BindingRow({
  binding,
}: {
  readonly binding: DeviceBindingV1;
}): JSX.Element {
  const bindingLabel: Record<string, string> = {
    RELAY_TO_CB: 'Zabezpieczenie → Wyłącznik',
    CT_ON_POWER_PATH: 'Przekładnik prądowy w torze mocy',
    VT_SIDE: 'Przekładnik napięciowy (boczny)',
  };

  return (
    <tr
      className={`switchgear-binding-row ${!binding.isValid ? 'switchgear-binding--invalid' : ''}`}
      data-testid={`binding-row-${binding.bindingId}`}
    >
      <td>{bindingLabel[binding.bindingType] ?? binding.bindingType}</td>
      <td>{binding.sourceDeviceId}</td>
      <td>{binding.targetDeviceId}</td>
      <td>{binding.isValid ? 'OK' : 'Brak'}</td>
    </tr>
  );
}

function FixActionRow({
  fix,
  onNavigate,
}: {
  readonly fix: FieldFixActionV1;
  readonly onNavigate: (fix: FieldFixActionV1) => void;
}): JSX.Element {
  return (
    <div
      className={`switchgear-fix-action ${severityClass(fix.severity)}`}
      data-testid={`fix-action-${fix.code}`}
    >
      <span className="switchgear-fix-code">[{fix.severity}]</span>
      <span className="switchgear-fix-message">{fix.messagePl}</span>
      <button
        className="switchgear-btn switchgear-btn--small"
        onClick={() => onNavigate(fix)}
        data-testid={`fix-navigate-${fix.code}`}
      >
        Przejdź do
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export interface FieldEditScreenProps {
  /** Active study case ID for backend operations */
  readonly caseId?: string | null;
}

export function FieldEditScreen({ caseId = null }: FieldEditScreenProps): JSX.Element {
  const fieldData = useCurrentFieldData();
  const focusTarget = useFocusTarget();
  const navigateToStationEdit = useSwitchgearStore((s) => s.navigateToStationEdit);
  const navigateByFixAction = useSwitchgearStore((s) => s.navigateByFixAction);
  const openCatalogPicker = useSwitchgearStore((s) => s.openCatalogPicker);
  const { addDevice, removeDevice } = useSwitchgearOps(caseId);

  const handleBack = useCallback(() => {
    if (fieldData) {
      navigateToStationEdit(fieldData.stationId);
    }
  }, [fieldData, navigateToStationEdit]);

  const handleSelectCatalog = useCallback(
    (deviceId: string, aparatType: string) => {
      openCatalogPicker(deviceId, aparatType);
    },
    [openCatalogPicker],
  );

  const handleRemoveDevice = useCallback(
    (deviceId: string) => {
      void removeDevice(deviceId);
    },
    [removeDevice],
  );

  const handleAddDevice = useCallback(
    (aparatType: string) => {
      if (fieldData) {
        void addDevice(fieldData.fieldId, aparatType);
      }
    },
    [fieldData, addDevice],
  );

  // Scroll to focused element after render
  if (focusTarget && typeof document !== 'undefined') {
    requestAnimationFrame(() => {
      const el = document.getElementById(focusTarget);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('switchgear-focus-highlight');
      }
    });
  }

  if (!fieldData) {
    return (
      <div className="switchgear-empty" data-testid="switchgear-no-field">
        Nie wybrano pola.
      </div>
    );
  }

  return (
    <div className="switchgear-field-edit" data-testid="switchgear-field-edit">
      {/* Header + Back */}
      <div className="switchgear-header">
        <button
          className="switchgear-btn switchgear-btn--back"
          onClick={handleBack}
          data-testid="field-edit-back"
        >
          Powrót do stacji
        </button>
        <h2>Pole: {fieldData.fieldName}</h2>
      </div>

      {/* Part 1: Field data */}
      <section className="switchgear-section" data-testid="section-field-data">
        <h3 className="switchgear-section-title">Dane pola</h3>
        <div className="switchgear-field-info">
          <div className="switchgear-field-info-row">
            <span className="switchgear-label">Typ pola:</span>
            <span className="switchgear-value">
              {POLE_TYPE_LABELS_PL[fieldData.poleType] ?? fieldData.poleType}
            </span>
          </div>
          <div className="switchgear-field-info-row">
            <span className="switchgear-label">Rola:</span>
            <span className="switchgear-value">{fieldData.fieldRole}</span>
          </div>
          <div className="switchgear-field-info-row">
            <span className="switchgear-label">Element topologiczny:</span>
            <span className="switchgear-value">
              {fieldData.topologyElementId ? (
                <span>
                  {fieldData.topologyElementId} ({fieldData.topologyElementType ?? 'N/D'})
                </span>
              ) : (
                <span className="switchgear-missing">Nie powiązano</span>
              )}
            </span>
          </div>
        </div>
      </section>

      {/* PV/BESS: Transformer required section */}
      {PV_BESS_SN_ROLES.has(fieldData.fieldRole as FieldRoleV1) && (
        <section className="switchgear-section switchgear-section--transformer" data-testid="section-transformer-required">
          <h3 className="switchgear-section-title">Transformator (wymagany)</h3>
          {fieldData.devices.some(
            (d: DeviceEntryV1) => d.aparatType === AparatTypeV1.TRANSFORMATOR,
          ) ? (
            <p className="switchgear-all-ok">
              Transformator przypisany do pola.
            </p>
          ) : (
            <div className="switchgear-transformer-missing" data-testid="transformer-missing-warning">
              <p className="switchgear-fix-action switchgear-fix--blocker">
                Zrodlo PV/BESS wymaga transformatora — brak transformatora w torze przylaczenia.
              </p>
              <button
                className="switchgear-btn switchgear-btn--primary"
                onClick={() => handleAddDevice(AparatTypeV1.TRANSFORMATOR)}
                data-testid="add-transformer-btn"
              >
                Dodaj transformator
              </button>
            </div>
          )}
        </section>
      )}

      {/* Part 2: Devices */}
      <section className="switchgear-section" data-testid="section-devices">
        <h3 className="switchgear-section-title">Aparaty w polu</h3>
        {fieldData.devices.length === 0 ? (
          <p className="switchgear-empty-fields">
            Brak aparatów. Dodaj wymagane aparaty poniżej.
          </p>
        ) : (
          <table className="switchgear-table">
            <thead>
              <tr>
                <th>Typ aparatu</th>
                <th>Katalog</th>
                <th>Parametry</th>
                <th>Status</th>
                <th>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {fieldData.devices.map((dev: DeviceEntryV1) => (
                <DeviceRow
                  key={dev.deviceId}
                  device={dev}
                  onSelectCatalog={handleSelectCatalog}
                  onRemove={handleRemoveDevice}
                />
              ))}
            </tbody>
          </table>
        )}
        <div className="switchgear-add-device">
          <select
            className="switchgear-select"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                handleAddDevice(e.target.value);
                e.target.value = '';
              }
            }}
            data-testid="add-device-select"
          >
            <option value="">Dodaj aparat...</option>
            {ADDABLE_APARAT_TYPES.map((at) => (
              <option key={at} value={at}>
                {APARAT_TYPE_LABELS_PL[at] ?? at}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Part 3: Bindings */}
      <section className="switchgear-section" data-testid="section-bindings">
        <h3 className="switchgear-section-title">Powiązania logiczne</h3>
        {fieldData.bindings.length === 0 ? (
          <p className="switchgear-empty-fields">
            Brak powiązań. Powiązania zabezpieczenie→wyłącznik są wymagane dla gotowości.
          </p>
        ) : (
          <table className="switchgear-table">
            <thead>
              <tr>
                <th>Typ powiązania</th>
                <th>Źródło</th>
                <th>Cel</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {fieldData.bindings.map((b: DeviceBindingV1) => (
                <BindingRow key={b.bindingId} binding={b} />
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Part 4: FixActions */}
      <section className="switchgear-section" data-testid="section-fix-actions">
        <h3 className="switchgear-section-title">Braki i wymagane poprawki</h3>
        {fieldData.fixActions.length === 0 ? (
          <p className="switchgear-all-ok">Pole kompletne — brak wymaganych poprawek.</p>
        ) : (
          <div className="switchgear-fix-list">
            {fieldData.fixActions.map((fix: FieldFixActionV1) => (
              <FixActionRow
                key={fix.code}
                fix={fix}
                onNavigate={navigateByFixAction}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
