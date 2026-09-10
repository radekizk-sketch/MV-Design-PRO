import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import {
  fetchPtpireeGeneratorCertificatesPage,
  fetchTypesByCategory,
  type CatalogListItem,
} from './api';
import type {
  CableType,
  LineType,
  SourceSystemCatalogType,
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
  { id: 'PTPIREE_CERTIFICATE', label: 'Wykaz certyfikatów PTPiREE', icon: '☑' },
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
  i_th_ka: 'Prąd wytrzymywany krótkotrwale I_th [kA]',
  i_th_duration_s: 'Czas odniesienia I_th [s]',
  i_th_pochodzenie: 'Pochodzenie I_th',
  i_dyn_ka: 'Prąd dynamiczny szczytowy I_dyn [kA]',
  i_dyn_pochodzenie: 'Pochodzenie I_dyn',
  break_time_s: 'Czas własny aparatu [s]',
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
  'i_th_ka',
  'i_th_duration_s',
  'i_th_pochodzenie',
  'i_dyn_ka',
  'i_dyn_pochodzenie',
  'break_time_s',
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
      return `${formatDetailValue(record.u_n_kv)} kV · ${formatDetailValue(record.i_n_a)} A · Ik=${formatDetailValue(record.breaking_capacity_ka)} kA`;
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
  // CV-4.3 K7: sk3_min_mva/ik3_min_ka/rx_ratio_min ukryte tu — panel generyczny
  // UKRYWA pola null zamiast "brak danych" (K1), więc renderują się WYŁĄCZNIE
  // przez bespoke `renderSystemSourceMinParams` (etykiety PL + jawny brak danych,
  // zero duplikatu wartości pod dwiema różnymi etykietami).
  const hiddenKeys = new Set([
    'id',
    'name',
    'manufacturer',
    'vendor',
    'sk3_min_mva',
    'ik3_min_ka',
    'rx_ratio_min',
  ]);
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

/**
 * Kategorie z SERWEROWYM filtrem i wycinkiem (dług 5 z rejestru V12K-321):
 * pełny wykaz certyfikatów PTPiREE ma ~6887 pozycji (~3 MB) — przeglądarka
 * pobiera stronę z filtrem po stronie backendu zamiast całości, a filtr
 * lokalny jest dla tych kategorii wyłączony (działałby na niepełnej liście
 * i kłamał wynikiem).
 */
const KATEGORIE_SZUKANE_SERWEROWO: ReadonlySet<TypeCategory> = new Set(['PTPIREE_CERTIFICATE']);

/** Rozmiar strony wykazu certyfikatów — pełna lista dostępna przez zawężenie. */
const LIMIT_STRONY_CERTYFIKATOW = 300;

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
  // Liczność wykazu PO serwerowym filtrze (null = kategoria bez stron serwera).
  const [serverTotal, setServerTotal] = useState<number | null>(null);
  // Zapytanie z opóźnieniem — strona serwera nie leci na każdą literę.
  const [odroczoneZapytanie, setOdroczoneZapytanie] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setOdroczoneZapytanie(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSearchQuery('');
    setOdroczoneZapytanie('');
    setSelectedTypeId(null);

    if (KATEGORIE_SZUKANE_SERWEROWO.has(activeTab)) {
      // Pierwsza strona kategorii serwerowej — dalsze zapytania obsługuje
      // efekt odroczonego zapytania poniżej.
      return () => {
        cancelled = true;
      };
    }
    setServerTotal(null);

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

  // Kategorie serwerowe: strona wykazu per (kategoria, odroczone zapytanie).
  useEffect(() => {
    if (!KATEGORIE_SZUKANE_SERWEROWO.has(activeTab)) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchPtpireeGeneratorCertificatesPage(odroczoneZapytanie, LIMIT_STRONY_CERTYFIKATOW)
      .then((strona) => {
        if (cancelled) return;
        setTypes(strona.items);
        setServerTotal(strona.total);
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
  }, [activeTab, odroczoneZapytanie]);

  const filteredTypes = useMemo(() => {
    if (KATEGORIE_SZUKANE_SERWEROWO.has(activeTab)) {
      // Filtr wykonał serwer — lokalne filtrowanie strony kłamałoby wynikiem.
      return types;
    }
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
  }, [activeTab, searchQuery, types]);

  const selectedType = useMemo(
    () => types.find((type) => type.id === selectedTypeId) ?? null,
    [selectedTypeId, types],
  );

  const handleSelectType = (typeId: string) => {
    setSelectedTypeId(typeId);
    onSelectType?.(typeId, activeTab);
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
        {serverTotal !== null && serverTotal > filteredTypes.length ? (
          <p className="mt-2 text-xs text-gray-500" data-testid="catalog-strona-serwera">
            Pokazano {filteredTypes.length.toLocaleString('pl-PL')} z{' '}
            {serverTotal.toLocaleString('pl-PL')} pozycji wykazu — zawęź wyszukiwanie, aby
            zobaczyć pozostałe.
          </p>
        ) : null}
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
                {searchQuery ? 'Nie znaleziono typu dla zapytania.' : 'Katalog typów wymaga konfiguracji.'}
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
          {/* CV-4.3 K7: dane scenariusza MIN ZRODLO_SN — bespoke (nie generyczny
              panel powyżej), bo panel generyczny UKRYWA pola `null` zamiast
              pokazać "brak danych" (wzór K1: `renderLineParams` / `max_temperature_c`).
              Dokłada się DO generycznych wpisów (Sk3/Ik3/R-X maks. już tam są). */}
          {category === 'SYSTEM_SOURCE' ? renderSystemSourceMinParams(type as SourceSystemCatalogType) : null}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-700">
          Instancje używające tego typu
        </h3>
        <p className="text-sm text-gray-500">Instancje katalogowe nie są dostępne w tym widoku.</p>
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
        Ta kategoria nie ma dodatkowych pól szczegółowych.
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
      <DetailField
        label="Przekrój"
        value={type.cross_section_mm2 == null ? 'brak danych' : type.cross_section_mm2.toFixed(0)}
        unit="mm2"
      />
      <DetailField
        label="Maks. temperatura"
        value={type.max_temperature_c == null ? 'brak danych' : type.max_temperature_c.toFixed(0)}
        unit="C"
      />
    </>
  );
}

/**
 * CV-4.3 K7: trzy pola scenariusza MIN (warunki przyłączenia OSD) dla ZRODLO_SN —
 * „brak danych" gdy null (wzór K1, `max_temperature_c` w `renderLineParams`).
 * Dokładany OBOK generycznego panelu (Sk3/Ik3/R-X MAKS. już renderują tamtędy).
 */
function renderSystemSourceMinParams(type: SourceSystemCatalogType) {
  return (
    <>
      <DetailField
        label="Moc zwarciowa Sk3 min"
        value={type.sk3_min_mva == null ? 'brak danych' : formatNumber(type.sk3_min_mva)}
        unit="MVA"
      />
      <DetailField
        label="Prąd zwarciowy Ik3 min"
        value={type.ik3_min_ka == null ? 'brak danych' : formatNumber(type.ik3_min_ka)}
        unit="kA"
      />
      <DetailField
        label="Stosunek R/X min"
        value={type.rx_ratio_min == null ? 'brak danych' : formatNumber(type.rx_ratio_min)}
      />
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
