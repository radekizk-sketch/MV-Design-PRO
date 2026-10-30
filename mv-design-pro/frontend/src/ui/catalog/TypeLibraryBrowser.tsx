import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import {
  fetchPtpireeGeneratorCertificatesPage,
  fetchTypesByCategory,
  type CatalogListItem,
} from './api';
import { PozycjeDoPrzegladu } from './PozycjeDoPrzegladu';
import { ETYKIETY_KATEGORII_TYPOW } from './etykietyKategoriiTypow';
import {
  maBudowniczegoWierszy,
  POLA_KARTY_KATEGORII,
  POLA_POZA_PANELEM_OGOLNYM,
  type KategoriaPaneluOgolnego,
} from './polaKartyKatalogu';
import {
  BRAK_DANYCH_PL,
  pradAparatuSnKatalogu,
  pradKaLubBrakDanych,
  pradLacznikaKatalogu,
} from './pradZwarciowyKatalogu';
import {
  formatNumber,
  wierszeKabla,
  wierszeLacznika,
  wierszeLinii,
  wierszeTransformatora,
  wierszeZrodlaSystemowegoMin,
  type WierszKatalogu,
} from './wierszeKartyKatalogu';
import type {
  CableType,
  LineType,
  MVApparatusType,
  PropozycjaWartosciRoboczej,
  SourceSystemCatalogType,
  SwitchEquipmentType,
  TransformerType,
  TypeCategory,
} from './types';

interface TabDefinition {
  id: TypeCategory;
  icon: string;
}

// Etykieta zakładki = `ETYKIETY_KATEGORII_TYPOW[id]` (jedno źródło, pełny słownik).
const TAB_DEFINITIONS: readonly TabDefinition[] = [
  { id: 'LINE', icon: '≋' },
  { id: 'HV_OVERHEAD_CONDUCTOR', icon: '≈' },
  { id: 'CABLE', icon: '⟂' },
  { id: 'SYSTEM_SOURCE', icon: '⚡' },
  { id: 'TRANSFORMER', icon: '⬍' },
  { id: 'SWITCH_EQUIPMENT', icon: '⎆' },
  { id: 'MV_APPARATUS', icon: '◫' },
  { id: 'LV_APPARATUS', icon: '▥' },
  { id: 'LV_RCD', icon: '⊜' },
  { id: 'LV_CABLE', icon: '⟃' },
  { id: 'LOAD', icon: '◔' },
  { id: 'CT', icon: '◎' },
  { id: 'VT', icon: '◌' },
  { id: 'MEASUREMENT_TRANSFORMER', icon: '◍' },
  { id: 'PV_INVERTER', icon: '☀' },
  { id: 'BESS_INVERTER', icon: '▣' },
  { id: 'CONVERTER', icon: '⟲' },
  { id: 'PROTECTION_DEVICE', icon: '🛡' },
  { id: 'PTPIREE_CERTIFICATE', icon: '☑' },
] as const;

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
    case 'HV_OVERHEAD_CONDUCTOR':
      return `${formatDetailValue(record.oznaczenie)} · ${record.przeznaczenie === 'ODGROMOWY' ? 'przewód odgromowy' : 'przewód fazowy'} · R20=${formatDetailValue(record.r20_dc_ohm_per_km)} Ohm/km · d=${formatDetailValue(record.srednica_mm)} mm`;
    case 'CABLE':
      return `R=${formatDetailValue(record.r_ohm_per_km)} Ohm/km · X=${formatDetailValue(record.x_ohm_per_km)} Ohm/km · C=${formatDetailValue(record.c_nf_per_km)} nF/km`;
    case 'TRANSFORMER':
      return `${formatDetailValue(record.rated_power_mva)} MVA · ${formatDetailValue(record.voltage_hv_kv)}/${formatDetailValue(record.voltage_lv_kv)} kV · uk=${formatDetailValue(record.uk_percent)}%`;
    case 'SWITCH_EQUIPMENT':
      return `${formatDetailValue(record.un_kv)} kV · ${formatDetailValue(record.in_a)} A · Ik ${pradLacznikaKatalogu(record, 'ik_ka')}`;
    case 'SYSTEM_SOURCE':
      return `${formatDetailValue(record.voltage_rating_kv)} kV · Sk3=${formatDetailValue(record.sk3_mva)} MVA · R/X=${formatDetailValue(record.rx_ratio)}`;
    case 'MV_APPARATUS':
      return `${formatDetailValue(record.u_n_kv)} kV · ${formatDetailValue(record.i_n_a)} A · Ik ${pradAparatuSnKatalogu(record, 'breaking_capacity_ka')}`;
    case 'LV_APPARATUS':
      return `${formatDetailValue(record.u_n_kv)} kV · ${formatDetailValue(record.i_n_a)} A · Ik ${pradKaLubBrakDanych(record.breaking_capacity_ka)}`;
    case 'LV_RCD':
      return `IΔn=${formatDetailValue(record.i_delta_n_a)} A · typ ${formatDetailValue(record.rcd_type)} · In=${formatDetailValue(record.in_a)} A · ta=${formatDetailValue(record.t_a_s)} s`;
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

/**
 * Wielkości zwarciowe pozycji aparatu SN: brak liczby niesie dwie różne informacje —
 * „nie dotyczy” (rodzaj aparatu jej nie ma) albo „brak danych” (karta jej nie podaje).
 */
const WIELKOSCI_ZWARCIOWE_APARATU_SN = ['breaking_capacity_ka', 'i_th_ka'] as const;

/** Wartość pola karty w panelu ogólnym: brak wartości = jawne „brak danych” (zasada nr 4). */
function wartoscPolaKarty(value: unknown): string {
  if (value == null || value === '') return BRAK_DANYCH_PL;
  if (Array.isArray(value)) {
    return value.length === 0 ? 'brak pozycji' : value.map((v) => wartoscPolaKarty(v)).join(', ');
  }
  if (typeof value === 'boolean') return value ? 'Tak' : 'Nie';
  if (typeof value === 'number') return Number.isFinite(value) ? formatNumber(value) : BRAK_DANYCH_PL;
  if (typeof value === 'object') {
    const wpisy = Object.entries(value as Record<string, unknown>);
    return wpisy.length === 0
      ? BRAK_DANYCH_PL
      : wpisy.map(([klucz, v]) => `${humanizeKey(klucz)}: ${wartoscPolaKarty(v)}`).join('; ');
  }
  return String(value);
}

/**
 * Wiersze panelu ogólnego: KAŻDE pole schematu kategorii (`POLA_KARTY_KATEGORII` — lustro
 * serializacji serwera) i każde pole rekordu spoza schematu, także `null` i pominięte —
 * brak wartości jest jawny, nie ukryty.
 */
function getGenericDetailEntries(
  type: CatalogListItem,
  category: KategoriaPaneluOgolnego,
): Array<{ klucz: string; label: string; value: string }> {
  const record = type as unknown as Record<string, unknown>;
  const pola = [...new Set([...POLA_KARTY_KATEGORII[category], ...Object.keys(record)])].filter(
    (key) => !POLA_POZA_PANELEM_OGOLNYM.has(key),
  );
  const orderedKeys = [
    ...GENERIC_FIELD_ORDER.filter((key) => pola.includes(key)),
    ...pola
      .filter((key) => !GENERIC_FIELD_ORDER.includes(key as (typeof GENERIC_FIELD_ORDER)[number]))
      .sort(),
  ];

  return orderedKeys.map((key) => ({
    klucz: key,
    label: humanizeKey(key),
    value:
      category === 'MV_APPARATUS'
      && (WIELKOSCI_ZWARCIOWE_APARATU_SN as readonly string[]).includes(key)
        ? pradAparatuSnKatalogu(record, key as (typeof WIELKOSCI_ZWARCIOWE_APARATU_SN)[number])
        : wartoscPolaKarty(record[key]),
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
                {ETYKIETY_KATEGORII_TYPOW[tab.id]}
              </button>
            );
          })}
        </div>
      </div>

      <PozycjeDoPrzegladu />

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
  const genericEntries = useMemo(
    () => (maBudowniczegoWierszy(category) ? [] : getGenericDetailEntries(type, category)),
    [type, category],
  );
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
          <DetailField label="Kategoria" value={ETYKIETY_KATEGORII_TYPOW[category]} />
          <DetailField label="Producent" value={manufacturer ?? BRAK_DANYCH_PL} />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-700">
          Dane katalogowe
        </h3>
        <div className="grid grid-cols-2 gap-4" data-testid="type-library-details-grid">
          {category === 'LINE' ? <WierszeKatalogu wiersze={wierszeLinii(type as LineType)} /> : null}
          {category === 'CABLE' ? <WierszeKatalogu wiersze={wierszeKabla(type as CableType)} /> : null}
          {category === 'TRANSFORMER' ? (
            <WierszeKatalogu wiersze={wierszeTransformatora(type as TransformerType)} />
          ) : null}
          {category === 'SWITCH_EQUIPMENT' ? (
            <WierszeKatalogu wiersze={wierszeLacznika(type as SwitchEquipmentType)} />
          ) : null}
          {!maBudowniczegoWierszy(category) ? (
            <GenericTypeDetailsPanel entries={genericEntries} />
          ) : null}
          {/* CV-4.3 K7: dane scenariusza MIN ZRODLO_SN — etykiety PL z jednostkami
              (`wierszeZrodlaSystemowegoMin`); panel ogólny pomija te klucze, żeby ta sama
              wartość nie wystąpiła pod dwiema etykietami. */}
          {category === 'SYSTEM_SOURCE' ? (
            <WierszeKatalogu wiersze={wierszeZrodlaSystemowegoMin(type as SourceSystemCatalogType)} />
          ) : null}
        </div>
      </div>

      {category === 'MV_APPARATUS' ? (
        <WartosciRoboczePozycji propozycje={(type as MVApparatusType).wartosci_robocze ?? []} />
      ) : null}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-700">
          Instancje używające tego typu
        </h3>
        <p className="text-sm text-gray-500">Instancje katalogowe nie są dostępne w tym widoku.</p>
      </div>
    </div>
  );
}

const RODZAJ_ZRODLA_PL: Readonly<Record<PropozycjaWartosciRoboczej['rodzaj_zrodla'], string>> = {
  PROFIL_URZADZENIA: 'profil typowy urządzenia',
  NORMA: 'norma',
  ZALOZENIE_INZYNIERSKIE: 'założenie inżynierskie',
};

/**
 * Zasada nr 4 (V12K-351): czym obliczenie uzupełni parametr, którego karta pozycji nie podaje —
 * wartość robocza z rodzajem źródła, odniesieniem i wpływem (rejestr backendu). To NIE jest
 * dana karty: projektant może nadać własną wartość na elemencie modelu.
 */
function WartosciRoboczePozycji({
  propozycje,
}: {
  propozycje: readonly PropozycjaWartosciRoboczej[];
}) {
  return (
    <div className="space-y-3" data-testid="type-library-wartosci-robocze">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-700">
        Wartości robocze obliczeń (brak w karcie)
      </h3>
      {propozycje.length === 0 ? (
        <p className="text-sm text-gray-500">
          Karta podaje wszystkie parametry aparatu używane w ocenie — obliczenie nie przyjmuje
          wartości roboczych.
        </p>
      ) : (
        <ul className="space-y-2">
          {propozycje.map((p) => (
            <li key={p.parametr} className="text-sm" data-testid={`type-library-wartosc-robocza-${p.parametr}`}>
              <span className="font-medium text-gray-900">
                {p.nazwa_pl}: {formatNumber(p.wartosc).replace('.', ',')} {p.jednostka}
              </span>
              <span className="ml-2 text-gray-500">({RODZAJ_ZRODLA_PL[p.rodzaj_zrodla]})</span>
              <p className="text-xs text-gray-500">
                {p.uzasadnienie_pl}. Źródło: {p.odniesienie}. Wpływ: {p.wplyw_pl}.
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GenericTypeDetailsPanel({
  entries,
}: {
  entries: Array<{ klucz: string; label: string; value: string }>;
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
          key={entry.klucz}
          label={entry.label}
          value={entry.value}
          testId={`type-library-pole-${entry.klucz}`}
        />
      ))}
    </>
  );
}

function DetailField({
  label,
  value,
  unit,
  testId,
}: {
  label: string;
  value: string;
  unit?: string;
  testId?: string;
}) {
  return (
    <div data-testid={testId}>
      <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">
        {value}
        {unit ? <span className="ml-1 text-gray-500">{unit}</span> : null}
      </dd>
    </div>
  );
}

function WierszeKatalogu({ wiersze }: { wiersze: readonly WierszKatalogu[] }) {
  return (
    <>
      {wiersze.map((w) => (
        <DetailField key={w.label} label={w.label} value={w.value} unit={w.unit} />
      ))}
    </>
  );
}

