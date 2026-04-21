import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { clsx } from 'clsx';
import {
  exportTypeLibrary,
  fetchTypesByCategory,
  importTypeLibrary,
  type CatalogListItem,
} from './api';
import type {
  CableType,
  LineType,
  SwitchEquipmentType,
  TransformerType,
  TypeCategory,
} from './types';

interface TabDefinition {
  id: TypeCategory;
  label: string;
  icon: string;
}

const TAB_DEFINITIONS: readonly TabDefinition[] = [
  { id: 'LINE', label: 'Typy linii napowietrznych', icon: '≋' },
  { id: 'CABLE', label: 'Typy kabli SN', icon: '⟂' },
  { id: 'SYSTEM_SOURCE', label: 'Typy zasilania systemowego SN', icon: '⚡' },
  { id: 'TRANSFORMER', label: 'Typy transformatorów SN/nN', icon: '⬍' },
  { id: 'SWITCH_EQUIPMENT', label: 'Typy aparatury łączeniowej SN', icon: '⎆' },
  { id: 'MV_APPARATUS', label: 'Typy aparatury SN', icon: '◫' },
  { id: 'LV_APPARATUS', label: 'Typy aparatury nN', icon: '▥' },
  { id: 'LV_CABLE', label: 'Typy kabli nN', icon: '⟃' },
  { id: 'LOAD', label: 'Typy obciążeń', icon: '◔' },
  { id: 'CT', label: 'Typy przekładników prądowych', icon: '◎' },
  { id: 'VT', label: 'Typy przekładników napięciowych', icon: '◌' },
  { id: 'MEASUREMENT_TRANSFORMER', label: 'Typy przekładników pomiarowych', icon: '◍' },
  { id: 'PV_INVERTER', label: 'Typy falowników źródeł fotowoltaicznych', icon: '☀' },
  { id: 'BESS_INVERTER', label: 'Typy falowników magazynów energii', icon: '▣' },
  { id: 'CONVERTER', label: 'Typy konwerterów', icon: '⟲' },
  { id: 'PROTECTION_DEVICE', label: 'Typy zabezpieczeń', icon: '🛡' },
] as const;

const CATEGORY_LABELS: Record<TypeCategory, string> = Object.fromEntries(
  TAB_DEFINITIONS.map((tab) => [tab.id, tab.label]),
) as Record<TypeCategory, string>;

const GENERIC_FIELD_LABELS: Partial<Record<string, string>> = {
  vendor: 'Dostawca',
  manufacturer: 'Producent',
  model: 'Model',
  series: 'Seria',
  equipment_kind: 'Rodzaj aparatu',
  device_kind: 'Rodzaj urządzenia',
  measurement_kind: 'Rodzaj przekładnika',
  source_catalog: 'Źródło katalogu',
  operator_name: 'Operator',
  supply_role: 'Rola zasilania',
  short_circuit_model: 'Model zwarciowy',
  earthing_system: 'Układ uziemienia',
  notes_pl: 'Uwagi',
  standard: 'Norma',
  control_mode: 'Tryb sterowania',
  grid_code: 'Wymagania przyłączeniowe',
  model_type: 'Model',
  functions_supported: 'Funkcje obsługiwane',
  curves_supported: 'Krzywe obsługiwane',
  unverified: 'Niezweryfikowane',
  unverified_ranges: 'Zakresy niezweryfikowane',
  voltage_rating_kv: 'Napięcie znamionowe [kV]',
  sk3_mva: 'Moc zwarciowa Sk3 [MVA]',
  ik3_ka: 'Prąd zwarciowy Ik3 [kA]',
  rx_ratio: 'Stosunek R/X',
  u_n_kv: 'Napięcie znamionowe [kV]',
  i_n_a: 'Prąd znamionowy [A]',
  breaking_capacity_ka: 'Zdolność wyłączalna [kA]',
  making_capacity_ka: 'Zdolność załączalna [kA]',
  cross_section_mm2: 'Przekrój [mm2]',
  number_of_cores: 'Liczba żył',
  ratio_primary_a: 'Przekładnia pierwotna [A]',
  ratio_secondary_a: 'Przekładnia wtórna [A]',
  ratio_primary_v: 'Przekładnia pierwotna [V]',
  ratio_secondary_v: 'Przekładnia wtórna [V]',
  accuracy_class: 'Klasa dokładności',
  burden_va: 'Moc obciążeniowa [VA]',
  p_kw: 'Moc czynna P [kW]',
  q_kvar: 'Moc bierna Q [kvar]',
  cos_phi: 'cos phi',
  cos_phi_mode: 'Tryb cos phi',
  profile_id: 'Profil',
  s_n_kva: 'Moc znamionowa S [kVA]',
  p_max_kw: 'Moc maksymalna Pmax [kW]',
  p_charge_kw: 'Moc ładowania [kW]',
  p_discharge_kw: 'Moc rozładowania [kW]',
  e_kwh: 'Pojemność energii [kWh]',
  rated_current_a: 'Prąd znamionowy [A]',
  catalog_number: 'Numer katalogowy',
};

const GENERIC_FIELD_ORDER = [
  'model',
  'series',
  'equipment_kind',
  'device_kind',
  'measurement_kind',
  'voltage_rating_kv',
  'u_n_kv',
  'sk3_mva',
  'ik3_ka',
  'rx_ratio',
  'rated_current_a',
  'i_n_a',
  'breaking_capacity_ka',
  'making_capacity_ka',
  'cross_section_mm2',
  'number_of_cores',
  'ratio_primary_a',
  'ratio_secondary_a',
  'ratio_primary_v',
  'ratio_secondary_v',
  'accuracy_class',
  'burden_va',
  'p_kw',
  'q_kvar',
  'cos_phi',
  'cos_phi_mode',
  's_n_kva',
  'p_max_kw',
  'p_charge_kw',
  'p_discharge_kw',
  'e_kwh',
  'functions_supported',
  'curves_supported',
  'operator_name',
  'supply_role',
  'earthing_system',
  'short_circuit_model',
  'standard',
  'source_catalog',
  'catalog_number',
  'notes_pl',
  'unverified',
  'unverified_ranges',
] as const;

interface TypeLibraryBrowserProps {
  onSelectType?: (typeId: string, category: TypeCategory) => void;
  initialTab?: TypeCategory;
}

interface ImportReport {
  mode: string;
  added: string[];
  skipped: string[];
  conflicts: Array<{ type_id: string; type_category: string; reason: string }>;
  success: boolean;
}

function getCatalogManufacturer(type: CatalogListItem): string | null {
  const record = type as unknown as Record<string, unknown>;
  if (typeof record.manufacturer === 'string' && record.manufacturer.trim()) {
    return record.manufacturer;
  }
  if (typeof record.vendor === 'string' && record.vendor.trim()) {
    return record.vendor;
  }
  return null;
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(3).replace(/\.?0+$/, '');
}

function formatDetailValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => formatDetailValue(entry)).join(', ');
  }
  if (typeof value === 'boolean') {
    return value ? 'Tak' : 'Nie';
  }
  if (typeof value === 'number') {
    return formatNumber(value);
  }
  if (value == null || value === '') {
    return '—';
  }
  return String(value);
}

function humanizeKey(key: string): string {
  if (GENERIC_FIELD_LABELS[key]) {
    return GENERIC_FIELD_LABELS[key] as string;
  }

  const cleaned = key
    .replace(/_/g, ' ')
    .replace(/\bkv\b/gi, 'kV')
    .replace(/\bka\b/gi, 'kA')
    .replace(/\bva\b/gi, 'VA')
    .replace(/\bkw\b/gi, 'kW')
    .replace(/\bkwh\b/gi, 'kWh');

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function getTypeSummary(type: CatalogListItem, category: TypeCategory): string {
  const record = type as unknown as Record<string, unknown>;

  switch (category) {
    case 'LINE':
      return `R=${formatDetailValue(record.r_ohm_per_km)} Ohm/km · X=${formatDetailValue(record.x_ohm_per_km)} Ohm/km · In=${formatDetailValue(record.rated_current_a)} A`;
    case 'CABLE':
      return `R=${formatDetailValue(record.r_ohm_per_km)} Ohm/km · X=${formatDetailValue(record.x_ohm_per_km)} Ohm/km · C=${formatDetailValue(record.c_nf_per_km)} nF/km`;
    case 'TRANSFORMER':
      return `${formatDetailValue(record.rated_power_mva)} MVA · ${formatDetailValue(record.voltage_hv_kv)}/${formatDetailValue(record.voltage_lv_kv)} kV · uk=${formatDetailValue(record.uk_percent)}%`;
    case 'SWITCH_EQUIPMENT':
      return `${formatDetailValue(record.un_kv)} kV · ${formatDetailValue(record.in_a)} A · ${formatDetailValue(record.ik_ka)} kA`;
    case 'SYSTEM_SOURCE':
      return `${formatDetailValue(record.voltage_rating_kv)} kV · Sk3=${formatDetailValue(record.sk3_mva)} MVA · R/X=${formatDetailValue(record.rx_ratio)}`;
    case 'MV_APPARATUS':
    case 'LV_APPARATUS':
      return `${formatDetailValue(record.u_n_kv)} kV · ${formatDetailValue(record.i_n_a)} A · Icw=${formatDetailValue(record.breaking_capacity_ka)} kA`;
    case 'LV_CABLE':
      return `${formatDetailValue(record.cross_section_mm2)} mm2 · ${formatDetailValue(record.number_of_cores)} żył · ${formatDetailValue(record.i_max_a)} A`;
    case 'LOAD':
      return `P=${formatDetailValue(record.p_kw)} kW · cos phi=${formatDetailValue(record.cos_phi)} · model=${formatDetailValue(record.model)}`;
    case 'CT':
      return `${formatDetailValue(record.ratio_primary_a)}/${formatDetailValue(record.ratio_secondary_a)} A · klasa=${formatDetailValue(record.accuracy_class)}`;
    case 'VT':
      return `${formatDetailValue(record.ratio_primary_v)}/${formatDetailValue(record.ratio_secondary_v)} V · klasa=${formatDetailValue(record.accuracy_class)}`;
    case 'MEASUREMENT_TRANSFORMER':
      return `${formatDetailValue(record.measurement_kind)} · klasa=${formatDetailValue(record.accuracy_class)} · burden=${formatDetailValue(record.burden_va)} VA`;
    case 'PV_INVERTER':
      return `S=${formatDetailValue(record.s_n_kva)} kVA · Pmax=${formatDetailValue(record.p_max_kw)} kW · sterowanie=${formatDetailValue(record.control_mode)}`;
    case 'BESS_INVERTER':
      return `Pdis=${formatDetailValue(record.p_discharge_kw)} kW · Pchg=${formatDetailValue(record.p_charge_kw)} kW · E=${formatDetailValue(record.e_kwh)} kWh`;
    case 'CONVERTER':
      return `S=${formatDetailValue(record.s_n_kva ?? record.sn_mva)} · P=${formatDetailValue(record.p_max_kw ?? record.pmax_mw)} · typ=${formatDetailValue(record.kind)}`;
    case 'PROTECTION_DEVICE':
      return `${formatDetailValue(record.series)} · funkcje=${Array.isArray(record.functions_supported) ? record.functions_supported.length : 0} · krzywe=${Array.isArray(record.curves_supported) ? record.curves_supported.length : 0}`;
    default:
      return 'Brak zdefiniowanego skrótu parametrów.';
  }
}

function getGenericDetailEntries(type: CatalogListItem): Array<{ label: string; value: string }> {
  const record = type as unknown as Record<string, unknown>;
  const hiddenKeys = new Set(['id', 'name', 'manufacturer', 'vendor']);
  const presentKeys = Object.keys(record).filter((key) => !hiddenKeys.has(key) && record[key] != null && record[key] !== '');
  const orderedKeys = [
    ...GENERIC_FIELD_ORDER.filter((key) => presentKeys.includes(key)),
    ...presentKeys
      .filter((key) => !GENERIC_FIELD_ORDER.includes(key as (typeof GENERIC_FIELD_ORDER)[number]))
      .sort(),
  ];

  return orderedKeys.map((key) => ({
    label: humanizeKey(key),
    value: formatDetailValue(record[key]),
  }));
}

export function TypeLibraryBrowser({
  onSelectType,
  initialTab = 'LINE',
}: TypeLibraryBrowserProps) {
  const [activeTab, setActiveTab] = useState<TypeCategory>(initialTab);
  const [types, setTypes] = useState<CatalogListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSearchQuery('');
    setSelectedTypeId(null);

    fetchTypesByCategory(activeTab)
      .then((fetchedTypes) => {
        if (cancelled) return;
        setTypes(fetchedTypes);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Błąd pobierania typów.');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const filteredTypes = useMemo(() => {
    if (!searchQuery.trim()) {
      return types;
    }

    const query = searchQuery.toLowerCase();
    return types.filter((type) => {
      const manufacturer = getCatalogManufacturer(type);
      return (
        type.name.toLowerCase().includes(query)
        || type.id.toLowerCase().includes(query)
        || (manufacturer != null && manufacturer.toLowerCase().includes(query))
      );
    });
  }, [searchQuery, types]);

  const selectedType = useMemo(
    () => types.find((type) => type.id === selectedTypeId) ?? null,
    [selectedTypeId, types],
  );

  const handleSelectType = (typeId: string) => {
    setSelectedTypeId(typeId);
    onSelectType?.(typeId, activeTab);
  };

  const handleExport = async () => {
    try {
      setLoading(true);
      setError(null);
      const exportData = await exportTypeLibrary();
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `type_library_export_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setLoading(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Błąd eksportu biblioteki.');
      setLoading(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const fileText = await file.text();
      const importData = JSON.parse(fileText);
      const report = await importTypeLibrary(importData, 'merge');
      setImportReport(report);
      setShowImportDialog(true);

      const fetchedTypes = await fetchTypesByCategory(activeTab);
      setTypes(fetchedTypes);
      setLoading(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Błąd importu biblioteki.');
      setLoading(false);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Biblioteka typów</h1>
          <p className="mt-1 text-sm text-gray-600">
            Przeglądanie aktywnych katalogów technicznych elementów sieci.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleExport}
            disabled={loading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            Eksportuj bibliotekę typów
          </button>
          <button
            onClick={handleImportClick}
            disabled={loading}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            Importuj bibliotekę typów
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

      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex flex-wrap gap-2">
          {TAB_DEFINITIONS.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={`type-library-tab-${tab.id}`}
                onClick={() => {
                  setSelectedTypeId(null);
                  setSearchQuery('');
                  setActiveTab(tab.id);
                }}
                className={clsx(
                  'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800',
                )}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <input
          type="text"
          placeholder="Szukaj po nazwie, producencie lub ID..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="w-full rounded-md border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 overflow-y-auto border-r border-gray-200 bg-white">
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-gray-500">Ładowanie typów...</p>
            </div>
          ) : null}

          {error ? (
            <div className="flex h-32 flex-col items-center justify-center text-red-600">
              <p className="font-semibold">Błąd</p>
              <p className="text-sm">{error}</p>
            </div>
          ) : null}

          {!loading && !error && filteredTypes.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-gray-500">
                {searchQuery ? 'Brak wyników dla zapytania.' : 'Brak typów w katalogu.'}
              </p>
            </div>
          ) : null}

          {!loading && !error && filteredTypes.length > 0 ? (
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Nazwa
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Producent
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Parametry kluczowe
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredTypes.map((type) => {
                  const isSelected = type.id === selectedTypeId;
                  return (
                    <tr
                      key={type.id}
                      onClick={() => handleSelectType(type.id)}
                      className={clsx(
                        'cursor-pointer transition-colors hover:bg-blue-50',
                        isSelected && 'bg-blue-100',
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{type.name}</div>
                        <div className="font-mono text-xs text-gray-500">{type.id}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {getCatalogManufacturer(type) ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {getTypeSummary(type, activeTab)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </div>

        <div className="w-1/2 overflow-y-auto bg-white p-6">
          {!selectedType ? (
            <div className="flex h-full items-center justify-center text-gray-500">
              Wybierz typ z listy, aby zobaczyć szczegóły
            </div>
          ) : (
            <TypeDetailsPanel type={selectedType} category={activeTab} />
          )}
        </div>
      </div>

      {showImportDialog && importReport ? (
        <ImportReportDialog
          report={importReport}
          onClose={() => {
            setShowImportDialog(false);
            setImportReport(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ImportReportDialog({
  report,
  onClose,
}: {
  report: ImportReport;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-xl font-semibold text-gray-800">Raport importu biblioteki typów</h2>
          <p className="mt-1 text-sm text-gray-600">
            Tryb: {report.mode === 'merge' ? 'MERGE (dodaj nowe)' : 'REPLACE (zamień)'}
          </p>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
          <div
            className={clsx(
              'rounded-md border px-4 py-3',
              report.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50',
            )}
          >
            <p className={clsx('font-medium', report.success ? 'text-green-800' : 'text-red-800')}>
              {report.success ? 'Import zakończony sukcesem' : 'Import zakończony błędami'}
            </p>
          </div>

          {report.added.length > 0 ? (
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-700">
                Dodano ({report.added.length})
              </h3>
              <ul className="space-y-1">
                {report.added.map((typeId) => (
                  <li key={typeId} className="font-mono text-sm text-gray-600">
                    + {typeId}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {report.skipped.length > 0 ? (
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-700">
                Pominięto ({report.skipped.length})
              </h3>
              <ul className="space-y-1">
                {report.skipped.map((typeId) => (
                  <li key={typeId} className="font-mono text-sm text-gray-500">
                    — {typeId}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {report.conflicts.length > 0 ? (
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-red-700">
                Konflikty ({report.conflicts.length})
              </h3>
              <ul className="space-y-2">
                {report.conflicts.map((conflict, index) => (
                  <li key={`${conflict.type_id}-${index}`} className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
                    <p className="font-mono text-sm text-red-800">{conflict.type_id}</p>
                    <p className="mt-1 text-xs text-red-600">
                      {conflict.type_category}: {conflict.reason}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}

function TypeDetailsPanel({
  type,
  category,
}: {
  type: CatalogListItem;
  category: TypeCategory;
}) {
  const genericEntries = useMemo(() => getGenericDetailEntries(type), [type]);
  const manufacturer = getCatalogManufacturer(type);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-800">{type.name}</h2>
        <p className="mt-1 font-mono text-sm text-gray-500">{type.id}</p>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-700">
          Informacje podstawowe
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <DetailField label="Kategoria" value={CATEGORY_LABELS[category]} />
          <DetailField label="Producent" value={manufacturer ?? '—'} />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-700">
          Dane katalogowe
        </h3>
        <div className="grid grid-cols-2 gap-4" data-testid="type-library-details-grid">
          {category === 'LINE' ? renderLineParams(type as LineType) : null}
          {category === 'CABLE' ? renderCableParams(type as CableType) : null}
          {category === 'TRANSFORMER' ? renderTransformerParams(type as TransformerType) : null}
          {category === 'SWITCH_EQUIPMENT' ? renderSwitchParams(type as SwitchEquipmentType) : null}
          {!['LINE', 'CABLE', 'TRANSFORMER', 'SWITCH_EQUIPMENT'].includes(category) ? (
            <GenericTypeDetailsPanel entries={genericEntries} />
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-700">
          Instancje używające tego typu
        </h3>
        <p className="text-sm text-gray-500">Brak instancji (funkcja w przyszłej wersji)</p>
      </div>
    </div>
  );
}

function GenericTypeDetailsPanel({
  entries,
}: {
  entries: Array<{ label: string; value: string }>;
}) {
  if (entries.length === 0) {
    return (
      <div className="col-span-2 rounded-md border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
        Brak jawnych pól szczegółowych dla tej kategorii.
      </div>
    );
  }

  return (
    <>
      {entries.map((entry) => (
        <DetailField
          key={entry.label}
          label={entry.label}
          value={entry.value}
        />
      ))}
    </>
  );
}

function DetailField({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">
        {value}
        {unit ? <span className="ml-1 text-gray-500">{unit}</span> : null}
      </dd>
    </div>
  );
}

function renderLineParams(type: LineType) {
  return (
    <>
      <DetailField label="Rezystancja R" value={type.r_ohm_per_km.toFixed(3)} unit="Ohm/km" />
      <DetailField label="Reaktancja X" value={type.x_ohm_per_km.toFixed(3)} unit="Ohm/km" />
      <DetailField label="Susceptancja B" value={type.b_us_per_km.toFixed(3)} unit="uS/km" />
      <DetailField label="Prąd znamionowy" value={type.rated_current_a.toFixed(0)} unit="A" />
      <DetailField label="Napięcie znamionowe" value={type.voltage_rating_kv.toFixed(1)} unit="kV" />
      <DetailField label="Materiał przewodu" value={type.conductor_material ?? '—'} />
      <DetailField label="Przekrój" value={type.cross_section_mm2.toFixed(0)} unit="mm2" />
      <DetailField label="Maks. temperatura" value={type.max_temperature_c.toFixed(0)} unit="C" />
    </>
  );
}

function renderCableParams(type: CableType) {
  return (
    <>
      <DetailField label="Rezystancja R" value={type.r_ohm_per_km.toFixed(3)} unit="Ohm/km" />
      <DetailField label="Reaktancja X" value={type.x_ohm_per_km.toFixed(3)} unit="Ohm/km" />
      <DetailField label="Pojemność C" value={type.c_nf_per_km.toFixed(0)} unit="nF/km" />
      <DetailField label="Prąd znamionowy" value={type.rated_current_a.toFixed(0)} unit="A" />
      <DetailField label="Napięcie znamionowe" value={type.voltage_rating_kv.toFixed(1)} unit="kV" />
      <DetailField label="Izolacja" value={type.insulation_type ?? '—'} />
      <DetailField label="Materiał przewodu" value={type.conductor_material ?? '—'} />
      <DetailField label="Przekrój" value={type.cross_section_mm2.toFixed(0)} unit="mm2" />
    </>
  );
}

function renderTransformerParams(type: TransformerType) {
  return (
    <>
      <DetailField label="Moc znamionowa" value={type.rated_power_mva.toFixed(1)} unit="MVA" />
      <DetailField label="Napięcie HV" value={type.voltage_hv_kv.toFixed(1)} unit="kV" />
      <DetailField label="Napięcie LV" value={type.voltage_lv_kv.toFixed(1)} unit="kV" />
      <DetailField label="uk" value={type.uk_percent.toFixed(2)} unit="%" />
      <DetailField label="Straty zwarcia Pk" value={type.pk_kw.toFixed(1)} unit="kW" />
      <DetailField label="Prąd jałowy i0" value={type.i0_percent.toFixed(2)} unit="%" />
      <DetailField label="Straty jałowe P0" value={type.p0_kw.toFixed(1)} unit="kW" />
      <DetailField label="Grupa połączeń" value={type.vector_group} />
      <DetailField label="Chłodzenie" value={type.cooling_class ?? '—'} />
      <DetailField label="Zakres zaczepów" value={`${type.tap_min} ... ${type.tap_max}`} />
    </>
  );
}

function renderSwitchParams(type: SwitchEquipmentType) {
  return (
    <>
      <DetailField label="Rodzaj aparatu" value={type.equipment_kind} />
      <DetailField label="Napięcie znamionowe" value={type.un_kv.toFixed(1)} unit="kV" />
      <DetailField label="Prąd znamionowy" value={type.in_a.toFixed(0)} unit="A" />
      <DetailField label="Prąd wyłączalny Ik" value={type.ik_ka.toFixed(1)} unit="kA" />
      <DetailField label="Prąd wytrzymałości Icw" value={type.icw_ka.toFixed(1)} unit="kA" />
      <DetailField label="Ośrodek gaszący" value={type.medium ?? '—'} />
    </>
  );
}
