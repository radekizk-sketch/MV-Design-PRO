/**
 * Protection Library Browser (Biblioteka zabezpieczeń)
 *
 * P14a: Protection Library (FOUNDATION, READ-ONLY)
 * P14b: Protection Library Governance (manifest+fingerprint, export/import, UI controls)
 *
 * Przeglądarka biblioteki zabezpieczeń w stylu Canonical z 3 zakładkami:
 * - Urządzenia (Device Types)
 * - Krzywe (Curves)
 * - Szablony nastaw (Setting Templates)
 *
 * P14b adds:
 * - Export/Import buttons with manifest+fingerprint
 * - Manifest panel (vendor/series/revision/fingerprint)
 * - Import report dialog (added/skipped/conflicts/blocked)
 *
 * Wszystkie etykiety w języku polskim (100% PL).
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { clsx } from 'clsx';
import {
  fetchProtectionTypesByCategory,
  exportProtectionLibrary,
  importProtectionLibrary,
  type ProtectionCategory,
  type ProtectionDeviceType,
  type ProtectionCurve,
  type ProtectionSettingTemplate,
  type ProtectionTypeUnion,
  type ProtectionImportReport,
  type ProtectionLibraryManifest,
} from './';

interface Tab {
  id: ProtectionCategory;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { id: 'DEVICE', label: 'Urządzenia', icon: '[DEV]' },
  { id: 'CURVE', label: 'Krzywe', icon: '[CRV]' },
  { id: 'TEMPLATE', label: 'Szablony nastaw', icon: '[TPL]' },
];

interface ProtectionLibraryBrowserProps {
  /** Callback when type is selected for inspection */
  onSelectType?: (typeId: string, category: ProtectionCategory) => void;
  /** Initial active tab */
  initialTab?: ProtectionCategory;
}

/**
 * Protection Library Browser Component.
 *
 * Wyświetla katalog zabezpieczeń w 3 zakładkach z listą i filtrowaniem.
 * Wszystkie typy są read-only (przeglądanie tylko).
 */
export function ProtectionLibraryBrowser({
  onSelectType,
  initialTab = 'DEVICE',
}: ProtectionLibraryBrowserProps) {
  const [activeTab, setActiveTab] = useState<ProtectionCategory>(initialTab);
  const [types, setTypes] = useState<ProtectionTypeUnion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [importReport, setImportReport] = useState<ProtectionImportReport | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [manifest, setManifest] = useState<ProtectionLibraryManifest | null>(null);
  const [showManifestPanel, setShowManifestPanel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch types when active tab changes
  useEffect(() => {
    setLoading(true);
    setError(null);
    setSearchQuery(''); // Reset search on tab change
    setSelectedTypeId(null); // Reset selection on tab change

    fetchProtectionTypesByCategory(activeTab)
      .then((fetchedTypes) => {
        setTypes(fetchedTypes);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message ?? 'Błąd pobierania typów zabezpieczeń');
        setLoading(false);
      });
  }, [activeTab]);

  // Filter types by search query (name_pl, vendor, id)
  const filteredTypes = useMemo(() => {
    if (!searchQuery.trim()) return types;

    const query = searchQuery.toLowerCase();
    return types.filter((type) => {
      const namePl = (type as any).name_pl?.toLowerCase() || '';
      const id = type.id.toLowerCase();
      const vendor = (type as any).vendor?.toLowerCase() || '';

      return namePl.includes(query) || id.includes(query) || vendor.includes(query);
    });
  }, [types, searchQuery]);

  // Handle type selection
  const handleSelectType = (typeId: string) => {
    setSelectedTypeId(typeId);
    if (onSelectType) {
      onSelectType(typeId, activeTab);
    }
  };

  // Get selected type object
  const selectedType = useMemo(() => {
    return types.find((t) => t.id === selectedTypeId);
  }, [types, selectedTypeId]);

  // Handle export (P14b)
  const handleExport = async () => {
    try {
      setLoading(true);
      const exportData = await exportProtectionLibrary();

      // Save manifest for display
      setManifest(exportData.manifest);

      // Download as JSON file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `protection_library_export_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setLoading(false);
    } catch (err: any) {
      setError(err.message ?? 'Błąd eksportu biblioteki zabezpieczeń');
      setLoading(false);
    }
  };

  // Handle import button click (P14b)
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  // Handle file selection (P14b)
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      setError(null);

      // Read file
      const fileText = await file.text();
      const importData = JSON.parse(fileText);

      // Save manifest from import
      if (importData.manifest) {
        setManifest(importData.manifest);
      }

      // Import (default mode: merge)
      const report = await importProtectionLibrary(importData, 'merge');

      // Show report dialog
      setImportReport(report);
      setShowImportDialog(true);

      // Refresh types
      const fetchedTypes = await fetchProtectionTypesByCategory(activeTab);
      setTypes(fetchedTypes);

      setLoading(false);
    } catch (err: any) {
      setError(err.message ?? 'Błąd importu biblioteki zabezpieczeń');
      setLoading(false);
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="protection-library-browser flex h-full flex-col bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Biblioteka zabezpieczeń</h2>
            <p className="text-sm text-gray-500">
              Przeglądaj urządzenia, krzywe i szablony nastaw
            </p>
          </div>

          {/* Export/Import/Manifest Buttons (P14b) */}
          <div className="flex space-x-2">
            <button
              onClick={handleExport}
              disabled={loading}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Eksportuj
            </button>
            <button
              onClick={handleImportClick}
              disabled={loading}
              className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              Importuj
            </button>
            <button
              onClick={() => setShowManifestPanel(!showManifestPanel)}
              className="rounded bg-gray-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
            >
              Manifest
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* Manifest Panel (P14b) */}
      {showManifestPanel && manifest && (
        <div className="border-b border-gray-200 bg-blue-50 px-4 py-3">
          <div className="text-sm space-y-1">
            <div><strong>Biblioteka:</strong> {manifest.name_pl}</div>
            <div><strong>Producent:</strong> {manifest.vendor}</div>
            <div><strong>Seria:</strong> {manifest.series}</div>
            <div><strong>Rewizja:</strong> {manifest.revision}</div>
            <div><strong>Wersja schematu:</strong> {manifest.schema_version}</div>
            <div className="font-mono text-xs"><strong>Fingerprint:</strong> {manifest.fingerprint}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white">
        <div className="flex space-x-1 px-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex items-center space-x-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              )}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Type List */}
        <div className="flex w-1/2 flex-col border-r border-gray-200 bg-white">
          {/* Search Bar */}
          <div className="border-b border-gray-200 p-3">
            <input
              type="text"
              placeholder="Szukaj po nazwie, producencie lub ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Type List */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center p-8 text-gray-500">
                Ładowanie typów zabezpieczeń...
              </div>
            )}

            {error && (
              <div className="m-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {!loading && !error && filteredTypes.length === 0 && (
              <div className="flex items-center justify-center p-8 text-gray-500">
                Katalog zabezpieczeń wymaga konfiguracji
              </div>
            )}

            {!loading && !error && filteredTypes.length > 0 && (
              <div className="divide-y divide-gray-100">
                {filteredTypes.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => handleSelectType(type.id)}
                    className={clsx(
                      'w-full px-4 py-3 text-left transition-colors',
                      selectedTypeId === type.id
                        ? 'bg-blue-50 text-blue-700'
                        : 'hover:bg-gray-50'
                    )}
                  >
                    <div className="font-medium text-sm">
                      {(type as any).name_pl || type.id}
                    </div>
                    {(type as any).vendor && (
                      <div className="text-xs text-gray-500 mt-1">
                        {(type as any).vendor}
                      </div>
                    )}
                    {(type as any).unverified && (
                      <div className="mt-1 text-xs font-medium text-amber-700">
                        Dane analityczne - wymagaja weryfikacji
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer: Type Count */}
          <div className="border-t border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-600">
            Znaleziono: {filteredTypes.length} {filteredTypes.length === 1 ? 'typ' : 'typów'}
          </div>
        </div>

        {/* Right: Type Details */}
        <div className="flex w-1/2 flex-col bg-white">
          {!selectedType && (
            <div className="flex flex-1 items-center justify-center text-gray-400">
              Wybierz typ z listy, aby zobaczyć szczegóły
            </div>
          )}

          {selectedType && (
            <div className="flex-1 overflow-y-auto p-4">
              <TypeDetailsPanel type={selectedType} category={activeTab} />
            </div>
          )}
        </div>
      </div>

      {/* Import Report Dialog (P14b) */}
      {showImportDialog && importReport && (
        <ProtectionImportReportDialog
          report={importReport}
          onClose={() => {
            setShowImportDialog(false);
            setImportReport(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Type Details Panel (Property Grid - READ-ONLY)
 */
function TypeDetailsPanel({
  type,
  category,
}: {
  type: ProtectionTypeUnion;
  category: ProtectionCategory;
}) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-gray-800">
          {(type as any).name_pl || type.id}
        </h3>
        <p className="text-xs text-gray-500 mt-1">ID: {type.id}</p>
      </div>

      {/* Properties Grid */}
      <div className="space-y-3">
        {category === 'DEVICE' && <DeviceTypeDetails type={type as ProtectionDeviceType} />}
        {category === 'CURVE' && <CurveDetails type={type as ProtectionCurve} />}
        {category === 'TEMPLATE' && <TemplateDetails type={type as ProtectionSettingTemplate} />}
      </div>
    </div>
  );
}

/**
 * Device Type Details
 */
function DeviceTypeDetails({ type }: { type: ProtectionDeviceType }) {
  return (
    <>
      {type.unverified && (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Rekord analityczny. Dane urzadzenia lub zakresow nie sa jeszcze zweryfikowane
          produkcyjnie.
        </div>
      )}
      <DetailField label="Nazwa (PL)" value={type.name_pl} />
      <DetailField label="Producent" value={type.vendor} />
      <DetailField label="Model" value={type.model} />
      <DetailField label="Seria" value={type.series} />
      <DetailField label="Rewizja" value={type.revision} />
      <DetailField
        label="Prąd znamionowy"
        value={type.rated_current_a}
        unit="A"
      />
      <DetailField label="Zrodlo danych" value={type.source_catalog} />
      <DetailField
        label="Status weryfikacji"
        value={type.unverified ? 'NIEZWERYFIKOWANY' : 'Zweryfikowany'}
      />
      <DetailField
        label="Zakresy nastaw"
        value={type.unverified_ranges ? 'Wymagaja weryfikacji' : 'Zweryfikowane'}
      />
      <DetailField label="Notatki (PL)" value={type.notes_pl} multiline />
      {type.functions_supported && type.functions_supported.length > 0 && (
        <DetailField label="Funkcje" value={type.functions_supported.join(', ')} multiline />
      )}
      {type.curves_supported && type.curves_supported.length > 0 && (
        <DetailField label="Krzywe" value={type.curves_supported.join(', ')} multiline />
      )}
      <SettingRangeField
        label="51 fazowe"
        min={type.i_pickup_51_a_min}
        max={type.i_pickup_51_a_max}
        unit="A"
      />
      <SettingRangeField
        label="50 fazowe"
        min={type.i_inst_50_a_min}
        max={type.i_inst_50_a_max}
        unit="A"
      />
      <SettingRangeField
        label="51N ziemnozwarciowe"
        min={type.i_pickup_51n_a_min}
        max={type.i_pickup_51n_a_max}
        unit="A"
      />
      <SettingRangeField
        label="50N ziemnozwarciowe"
        min={type.i_inst_50n_a_min}
        max={type.i_inst_50n_a_max}
        unit="A"
      />
    </>
  );
}

/**
 * Curve Details
 */
function CurveDetails({ type }: { type: ProtectionCurve }) {
  return (
    <>
      <DetailField label="Nazwa (PL)" value={type.name_pl} />
      <DetailField label="Standard" value={type.standard} />
      <DetailField label="Typ krzywej" value={type.curve_kind} />
      {type.parameters && Object.keys(type.parameters).length > 0 && (
        <div className="border-t border-gray-200 pt-3">
          <div className="text-xs font-medium text-gray-600 mb-2">Parametry:</div>
          <div className="space-y-1">
            {Object.entries(type.parameters).map(([key, value]) => (
              <DetailField key={key} label={key} value={String(value)} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Template Details
 */
function TemplateDetails({ type }: { type: ProtectionSettingTemplate }) {
  return (
    <>
      <DetailField label="Nazwa (PL)" value={type.name_pl} />
      <DetailField label="Urządzenie (ref)" value={type.device_type_ref} />
      <DetailField label="Krzywa (ref)" value={type.curve_ref} />
      {type.setting_fields && type.setting_fields.length > 0 && (
        <div className="border-t border-gray-200 pt-3">
          <div className="text-xs font-medium text-gray-600 mb-2">Pola nastaw:</div>
          <div className="space-y-2">
            {type.setting_fields.map((field, idx) => (
              <div key={idx} className="border-l-2 border-blue-300 pl-3 py-1 text-xs">
                <div className="font-medium text-gray-700">{field.name}</div>
                {field.unit && <div className="text-gray-500">Jednostka: {field.unit}</div>}
                {field.min !== undefined && field.max !== undefined && (
                  <div className="text-gray-500">
                    Zakres: {field.min} – {field.max}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Detail Field Component (Property Grid Row)
 */
function DetailField({
  label,
  value,
  unit,
  multiline = false,
}: {
  label: string;
  value?: string | number | null;
  unit?: string;
  multiline?: boolean;
}) {
  if (value === undefined || value === null || value === '') return null;

  const displayValue = unit ? `${value} ${unit}` : value;

  return (
    <div className="flex justify-between border-b border-gray-100 py-2 text-sm">
      <span className="font-medium text-gray-600">{label}:</span>
      <span className={clsx('text-gray-800', multiline && 'text-left')}>
        {displayValue}
      </span>
    </div>
  );
}

function SettingRangeField({
  label,
  min,
  max,
  unit,
}: {
  label: string;
  min?: number;
  max?: number;
  unit: string;
}) {
  if (min === undefined || max === undefined) {
    return null;
  }

  return <DetailField label={label} value={`${min} - ${max}`} unit={unit} />;
}

/**
 * Protection Import Report Dialog Component (P14b).
 *
 * Wyświetla raport z importu biblioteki zabezpieczeń (added/skipped/conflicts/blocked).
 */
function ProtectionImportReportDialog({
  report,
  onClose,
}: {
  report: ProtectionImportReport;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">
            Raport importu biblioteki zabezpieczeń
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Tryb: {report.mode === 'merge' ? 'MERGE (dodaj nowe)' : 'REPLACE (zamień)'}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Success/Failure Banner */}
          {report.success ? (
            <div className="bg-green-50 border border-green-200 rounded-md px-4 py-3">
              <p className="text-green-800 font-medium">
                Import zakonczony sukcesem
              </p>
            </div>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-md px-4 py-3">
              <p className="text-red-800 font-medium">
                Import zakonczony bledami
              </p>
            </div>
          )}

          {/* Added Items */}
          {report.added.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2">
                Dodano ({report.added.length})
              </h3>
              <ul className="space-y-1">
                {report.added.map((item) => (
                  <li key={item.id} className="text-sm text-gray-600">
                    <span className="font-mono">+ {item.id}</span>
                    <span className="text-gray-500 ml-2">({item.kind}: {item.name_pl})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Skipped Items */}
          {report.skipped.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2">
                Pominięto (istniejące) ({report.skipped.length})
              </h3>
              <ul className="space-y-1">
                {report.skipped.map((item) => (
                  <li key={item.id} className="text-sm text-gray-500">
                    <span className="font-mono">— {item.id}</span>
                    <span className="ml-2">({item.kind}: {item.name_pl})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Conflicts */}
          {report.conflicts.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-red-700 uppercase tracking-wider mb-2">
                Konflikty ({report.conflicts.length})
              </h3>
              <ul className="space-y-2">
                {report.conflicts.map((item) => (
                  <li
                    key={item.id}
                    className="bg-red-50 border border-red-200 rounded-md px-3 py-2"
                  >
                    <p className="text-sm font-mono text-red-800">{item.id}</p>
                    <p className="text-xs text-red-600 mt-1">
                      {item.kind}: {item.name_pl} - {item.reason_code}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Blocked Items (REPLACE mode) */}
          {report.blocked.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-orange-700 uppercase tracking-wider mb-2">
                Zablokowane (w użyciu) ({report.blocked.length})
              </h3>
              <ul className="space-y-2">
                {report.blocked.map((item) => (
                  <li
                    key={item.id}
                    className="bg-orange-50 border border-orange-200 rounded-md px-3 py-2"
                  >
                    <p className="text-sm font-mono text-orange-800">{item.id}</p>
                    <p className="text-xs text-orange-600 mt-1">
                      {item.kind}: {item.name_pl} - {item.reason_code}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}
