import { useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { fetchTypesByCategory } from '../catalog';
import type { CatalogListItem } from '../catalog/api';
import {
  getNamespaceLabelPl,
  NAMESPACE_TO_PICKER_CATEGORY,
} from '../catalog/elementCatalogRegistry';
import type { CatalogNamespace } from '../catalog/types';

interface CatalogTypeEntry {
  id: string;
  name: string;
  manufacturer?: string;
  parameters: Record<string, string | number>;
}

const BROWSER_NAMESPACES: readonly CatalogNamespace[] = [
  'LINIA_SN',
  'KABEL_SN',
  'TRAFO_SN_NN',
  'APARAT_SN',
  'APARAT_NN',
  'KABEL_NN',
  'CT',
  'VT',
];

const NAMESPACE_ICONS: Record<CatalogNamespace, string> = {
  LINIA_SN: 'LN',
  KABEL_SN: 'CB',
  ZRODLO_SN: 'GPZ',
  TRAFO_SN_NN: 'TR',
  APARAT_SN: 'SN',
  APARAT_NN: 'nN',
  KABEL_NN: 'nn',
  CT: 'CT',
  VT: 'VT',
  OBCIAZENIE: 'LD',
  ZRODLO_NN_PV: 'PV',
  ZRODLO_NN_BESS: 'BESS',
  ZABEZPIECZENIE: 'ZAB',
  NASTAWY_ZABEZPIECZEN: 'NST',
  CONVERTER: 'CNV',
  INVERTER: 'INV',
  mv_branch_points: 'BP',
};

const NAMESPACE_PARAM_LABELS: Partial<Record<CatalogNamespace, Record<string, string>>> = {
  LINIA_SN: {
    r_ohm_per_km: "R' [Ohm/km]",
    x_ohm_per_km: "X' [Ohm/km]",
    rated_current_a: 'In [A]',
  },
  KABEL_SN: {
    r_ohm_per_km: "R' [Ohm/km]",
    x_ohm_per_km: "X' [Ohm/km]",
    rated_current_a: 'In [A]',
    insulation_type: 'Izolacja',
  },
  TRAFO_SN_NN: {
    rated_power_mva: 'Sn [MVA]',
    uk_percent: 'uk [%]',
    pk_kw: 'Pk [kW]',
    vector_group: 'Grupa',
  },
  ZRODLO_SN: {
    voltage_rating_kv: 'Un [kV]',
    sk3_mva: 'Sk3 [MVA]',
    rx_ratio: 'R/X',
  },
  APARAT_SN: {
    u_n_kv: 'Un [kV]',
    i_n_a: 'In [A]',
    breaking_capacity_ka: 'Iwyl [kA]',
  },
  APARAT_NN: {
    u_n_kv: 'Un [kV]',
    i_n_a: 'In [A]',
    breaking_capacity_ka: 'Iwyl [kA]',
  },
  KABEL_NN: {
    u_n_kv: 'Un [kV]',
    cross_section_mm2: 'S [mm2]',
    i_max_a: 'Imax [A]',
  },
  OBCIAZENIE: {
    model: 'Model',
    p_kw: 'P [kW]',
    cos_phi: 'cos fi',
  },
  ZRODLO_NN_PV: {
    s_n_kva: 'Sn [kVA]',
    p_max_kw: 'Pmax [kW]',
    control_mode: 'Sterowanie',
  },
  ZRODLO_NN_BESS: {
    p_charge_kw: 'P ladow. [kW]',
    p_discharge_kw: 'P rozlad. [kW]',
    e_kwh: 'E [kWh]',
  },
  ZABEZPIECZENIE: {
    vendor: 'Producent',
    series: 'Seria',
    rated_current_a: 'In [A]',
  },
  CT: {
    ratio_primary_a: 'Iprim [A]',
    ratio_secondary_a: 'Iwt [A]',
    accuracy_class: 'Klasa',
  },
  VT: {
    ratio_primary_v: 'Uprim [V]',
    ratio_secondary_v: 'Uwt [V]',
    accuracy_class: 'Klasa',
  },
};

function normalizeCatalogTypeEntry(raw: CatalogListItem): CatalogTypeEntry {
  const source = raw as unknown as Record<string, unknown>;
  const id = String(source.id ?? '');
  const name = String(source.name ?? source.name_pl ?? id);
  const manufacturer =
    typeof source.manufacturer === 'string'
      ? source.manufacturer
      : typeof source.vendor === 'string'
        ? source.vendor
        : undefined;
  const parameters: Record<string, string | number> = {};

  for (const [key, value] of Object.entries(source)) {
    if (['id', 'name', 'name_pl', 'manufacturer'].includes(key)) {
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      parameters[key] = value;
    }
  }

  return { id, name, manufacturer, parameters };
}

export interface CatalogBrowserProps {
  className?: string;
  onSelectType?: (typeId: string, namespace: CatalogNamespace) => void;
  onClose?: () => void;
}

export function CatalogBrowser({ className, onSelectType, onClose }: CatalogBrowserProps) {
  const [activeNamespace, setActiveNamespace] = useState<CatalogNamespace>('KABEL_SN');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [types, setTypes] = useState<CatalogTypeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const category = NAMESPACE_TO_PICKER_CATEGORY[activeNamespace];
    setSelectedTypeId(null);
    setLoading(true);
    setError(null);

    let cancelled = false;

    fetchTypesByCategory(category)
      .then((items) => {
        if (cancelled) return;
        setTypes(items.map(normalizeCatalogTypeEntry));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setTypes([]);
        setError(err instanceof Error ? err.message : 'Błąd pobierania katalogu.');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeNamespace]);

  const filteredTypes = useMemo(() => {
    if (!searchQuery.trim()) {
      return types;
    }
    const query = searchQuery.toLowerCase();
    return types.filter((item) => {
      return (
        item.name.toLowerCase().includes(query)
        || item.id.toLowerCase().includes(query)
        || item.manufacturer?.toLowerCase().includes(query)
      );
    });
  }, [searchQuery, types]);

  const selectedType = useMemo(
    () => filteredTypes.find((item) => item.id === selectedTypeId) ?? null,
    [filteredTypes, selectedTypeId],
  );

  const paramLabels = useMemo(
    () => NAMESPACE_PARAM_LABELS[activeNamespace] ?? {},
    [activeNamespace],
  );

  const handleAssign = useCallback(() => {
    if (selectedTypeId && onSelectType) {
      onSelectType(selectedTypeId, activeNamespace);
    }
  }, [activeNamespace, onSelectType, selectedTypeId]);

  return (
    <div className={clsx('flex h-full flex-col bg-white', className)} data-testid="catalog-browser">
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Przeglądarka katalogów</h3>
          <p className="mt-0.5 text-[10px] text-gray-500">Wybierz kategorię i typ elementu pasywnego</p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-200"
            aria-label="Zamknij przeglądarkę"
          >
            x
          </button>
        ) : null}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-52 flex-shrink-0 overflow-y-auto border-r border-gray-200">
          <div className="py-1">
            {BROWSER_NAMESPACES.map((namespace) => (
              <button
                key={namespace}
                type="button"
                onClick={() => {
                  setActiveNamespace(namespace);
                  setSearchQuery('');
                }}
                className={clsx(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors',
                  activeNamespace === namespace
                    ? 'bg-blue-50 font-medium text-blue-800'
                    : 'text-gray-600 hover:bg-gray-50',
                )}
              >
                <span className="min-w-8 text-[10px] font-semibold uppercase text-gray-400">
                  {NAMESPACE_ICONS[namespace]}
                </span>
                <span className="truncate">{getNamespaceLabelPl(namespace)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="border-b border-gray-100 px-3 py-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Szukaj po nazwie, oznaczeniu lub producencie..."
              className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-[11px]"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-[11px] text-gray-500">Ładowanie katalogu...</p>
              </div>
            ) : error ? (
              <div className="flex h-full items-center justify-center px-4">
                <p className="text-center text-[11px] text-red-600">{error}</p>
              </div>
            ) : filteredTypes.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-[11px] text-gray-400">Nie znaleziono typów w tej kategorii.</p>
              </div>
            ) : (
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="sticky top-0 bg-gray-50">
                    <th className="px-3 py-1.5 text-left font-medium text-gray-500">Nazwa</th>
                    <th className="px-3 py-1.5 text-left font-medium text-gray-500">Producent</th>
                    {Object.values(paramLabels).map((label) => (
                      <th key={label} className="px-3 py-1.5 text-right font-medium text-gray-500">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTypes.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedTypeId(item.id)}
                      className={clsx(
                        'cursor-pointer border-b border-gray-50 transition-colors',
                        selectedTypeId === item.id ? 'bg-blue-50' : 'hover:bg-gray-50',
                      )}
                    >
                      <td className="px-3 py-1.5 font-medium text-gray-800">{item.name}</td>
                      <td className="px-3 py-1.5 text-gray-500">{item.manufacturer ?? '-'}</td>
                      {Object.keys(paramLabels).map((key) => (
                        <td key={key} className="px-3 py-1.5 text-right text-gray-600">
                          {String(item.parameters[key] ?? '-')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {selectedType ? (
            <div className="border-t border-gray-200 bg-gray-50 px-3 py-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-gray-800">{selectedType.name}</p>
                  <p className="hidden" aria-hidden="true">
                    {selectedType.manufacturer ? ` • ${selectedType.manufacturer}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAssign}
                  className="rounded bg-blue-600 px-3 py-1 text-[10px] font-medium text-white hover:bg-blue-700"
                >
                  Przypisz do elementu
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
