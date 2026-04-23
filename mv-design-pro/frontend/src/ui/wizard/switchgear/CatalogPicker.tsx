/**
 * CatalogPicker — Dialog wyboru pozycji katalogowej dla aparatu.
 *
 * RUN #3G §1.3: Filtrowanie po typie aparatu, wyszukiwarka, podgląd parametrów.
 *
 * BINDING: Polish labels, catalogRef required, no empty devices.
 */

import { useState, useMemo, useCallback } from 'react';
import { useSwitchgearStore } from './useSwitchgearStore';
import { useSwitchgearOps } from './useSwitchgearOps';
import { APARAT_TYPE_LABELS_PL, AparatTypeV1 } from '../../sld/core/fieldDeviceContracts';
import type { CatalogEntryV1 } from './types';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface CatalogPickerProps {
  /** Active study case ID for backend operations */
  readonly caseId?: string | null;
}

export function CatalogPicker({ caseId = null }: CatalogPickerProps): JSX.Element | null {
  const catalogPickerOpen = useSwitchgearStore((s) => s.catalogPickerOpen);
  const catalogPickerDeviceId = useSwitchgearStore((s) => s.catalogPickerDeviceId);
  const catalogPickerAparatType = useSwitchgearStore((s) => s.catalogPickerAparatType);
  const catalogEntries = useSwitchgearStore((s) => s.catalogEntries);
  const closeCatalogPicker = useSwitchgearStore((s) => s.closeCatalogPicker);
  const { assignCatalog } = useSwitchgearOps(caseId);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<CatalogEntryV1 | null>(null);

  // Filter entries by aparat type and search query
  const filteredEntries = useMemo(() => {
    let entries = [...catalogEntries];

    // Filter by apparatus type (strict — no showing incompatible types)
    if (catalogPickerAparatType) {
      entries = entries.filter((e) => e.aparatType === catalogPickerAparatType);
    }

    // Filter by search query (manufacturer + model)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      entries = entries.filter(
        (e) =>
          e.manufacturer.toLowerCase().includes(q) ||
          e.modelName.toLowerCase().includes(q) ||
          (e.description?.toLowerCase().includes(q) ?? false),
      );
    }

    return entries;
  }, [catalogEntries, catalogPickerAparatType, searchQuery]);

  const handleConfirm = useCallback(() => {
    if (selectedEntry && catalogPickerDeviceId) {
      void assignCatalog(catalogPickerDeviceId, selectedEntry.catalogId);
      closeCatalogPicker();
      setSelectedEntry(null);
      setSearchQuery('');
    }
  }, [selectedEntry, catalogPickerDeviceId, assignCatalog, closeCatalogPicker]);

  const handleCancel = useCallback(() => {
    closeCatalogPicker();
    setSelectedEntry(null);
    setSearchQuery('');
  }, [closeCatalogPicker]);

  if (!catalogPickerOpen) return null;

  const aparatLabel = catalogPickerAparatType
    ? (APARAT_TYPE_LABELS_PL[catalogPickerAparatType as AparatTypeV1] ?? catalogPickerAparatType)
    : 'aparat';

  return (
    <div className="switchgear-catalog-overlay" data-testid="catalog-picker">
      <div className="switchgear-catalog-dialog">
        <h3>Wybór pozycji katalogowej: {aparatLabel}</h3>

        {/* Search */}
        <div className="switchgear-catalog-search">
          <input
            type="text"
            className="switchgear-input"
            placeholder="Szukaj: producent, model, parametry..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="catalog-search-input"
            autoFocus
          />
        </div>

        {/* Results */}
        <div className="switchgear-catalog-results" data-testid="catalog-results">
          {filteredEntries.length === 0 ? (
            <p className="switchgear-catalog-empty">
              Brak pozycji katalogowych dla typu: {aparatLabel}.
            </p>
          ) : (
            <table className="switchgear-table">
              <thead>
                <tr>
                  <th>Producent</th>
                  <th>Model</th>
                  <th>Parametry</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry: CatalogEntryV1) => (
                  <tr
                    key={entry.catalogId}
                    className={`switchgear-catalog-row ${
                      selectedEntry?.catalogId === entry.catalogId
                        ? 'switchgear-catalog-row--selected'
                        : ''
                    }`}
                    onClick={() => setSelectedEntry(entry)}
                    data-testid={`catalog-entry-${entry.catalogId}`}
                  >
                    <td>{entry.manufacturer}</td>
                    <td>{entry.modelName}</td>
                    <td>
                      {Object.entries(entry.keyParameters).map(([key, val]) => (
                        <span key={key} className="switchgear-param-chip">
                          {key}: {val}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Selected preview */}
        {selectedEntry && (
          <div className="switchgear-catalog-preview" data-testid="catalog-preview">
            <h4>Podgląd: {selectedEntry.manufacturer} {selectedEntry.modelName}</h4>
            <div className="switchgear-catalog-params">
              {Object.entries(selectedEntry.keyParameters).map(([key, val]) => (
                <div key={key} className="switchgear-field-info-row">
                  <span className="switchgear-label">{key}:</span>
                  <span className="switchgear-value">{val}</span>
                </div>
              ))}
            </div>
            {selectedEntry.description && (
              <p className="switchgear-catalog-desc">{selectedEntry.description}</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="switchgear-dialog-actions">
          <button
            className="switchgear-btn switchgear-btn--primary"
            disabled={!selectedEntry}
            onClick={handleConfirm}
            data-testid="catalog-confirm"
          >
            Przypisz katalog
          </button>
          <button
            className="switchgear-btn switchgear-btn--secondary"
            onClick={handleCancel}
            data-testid="catalog-cancel"
          >
            Anuluj
          </button>
        </div>
      </div>
    </div>
  );
}
