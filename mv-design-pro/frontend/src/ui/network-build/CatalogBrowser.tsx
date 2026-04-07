/**
 * CatalogBrowser — Profesjonalna przeglądarka katalogów typów.
 *
 * Lewe drzewo kategorii (namespace), prawy panel z listą typów i podglądem.
 * Integruje się z API katalogowym (brak mocków).
 *
 * BINDING: 100% PL etykiety.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { fetchTypesByCategory, type TypeCategory } from '../catalog';

// =============================================================================
// Types
// =============================================================================

export type CatalogNamespace =
  | 'LINIA_SN'
  | 'KABEL_SN'
  | 'TRAFO_SN_NN'
  | 'APARAT_SN'
  | 'APARAT_NN'
  | 'KABEL_NN'
  | 'OBCIAZENIE'
  | 'ZRODLO_NN_PV'
  | 'ZRODLO_NN_BESS'
  | 'ZABEZPIECZENIE'
  | 'CT'
  | 'VT';

interface CatalogTypeEntry {
  id: string;
  name: string;
  manufacturer?: string;
  parameters: Record<string, string | number>;
}

// =============================================================================
// Constants
// =============================================================================

const NAMESPACE_LABELS: Record<CatalogNamespace, string> = {
  LINIA_SN: 'Linie napowietrzne SN',
  KABEL_SN: 'Kable SN',
  TRAFO_SN_NN: 'Transformatory SN/nN',
  APARAT_SN: 'Aparatura łączeniowa SN',
  APARAT_NN: 'Aparatura łączeniowa nN',
  KABEL_NN: 'Kable nN',
  OBCIAZENIE: 'Obciążenia',
  ZRODLO_NN_PV: 'Falowniki PV',
  ZRODLO_NN_BESS: 'Falowniki BESS',
  ZABEZPIECZENIE: 'Zabezpieczenia',
  CT: 'Przekładniki prądowe',
  VT: 'Przekładniki napięciowe',
};

const NAMESPACE_ICONS: Record<CatalogNamespace, string> = {
  LINIA_SN: '⚡',
  KABEL_SN: '📦',
  TRAFO_SN_NN: '🔄',
  APARAT_SN: '🔌',
  APARAT_NN: '🔧',
  KABEL_NN: '📦',
  OBCIAZENIE: '💡',
  ZRODLO_NN_PV: '☀',
  ZRODLO_NN_BESS: '🔋',
  ZABEZPIECZENIE: '🛡',
  CT: '📊',
  VT: '📊',
};

const NAMESPACE_PARAM_LABELS: Partial<Record<CatalogNamespace, Record<string, string>>> = {
  LINIA_SN: { r_ohm_per_km: "R' [Ω/km]", x_ohm_per_km: "X' [Ω/km]", rated_current_a: 'In [A]' },
  KABEL_SN: { r_ohm_per_km: "R' [Ω/km]", x_ohm_per_km: "X' [Ω/km]", rated_current_a: 'In [A]', insulation_type: 'Izolacja' },
  TRAFO_SN_NN: { rated_power_mva: 'Sn [MVA]', uk_percent: 'uk [%]', pk_kw: 'Pk [kW]', vector_group: 'Grupa' },
  APARAT_SN: { in_a: 'In [A]', un_kv: 'Un [kV]', ik_ka: 'Ics [kA]' },
  APARAT_NN: { in_a: 'In [A]', un_kv: 'Un [kV]', ik_ka: 'Ics [kA]' },
};

const NAMESPACE_TO_CATEGORY: Partial<Record<CatalogNamespace, TypeCategory>> = {
  LINIA_SN: 'LINE',
  KABEL_SN: 'CABLE',
  TRAFO_SN_NN: 'TRANSFORMER',
  APARAT_SN: 'SWITCH_EQUIPMENT',
  APARAT_NN: 'SWITCH_EQUIPMENT',
};

function mapCatalogTypeEntry(raw: Record<string, unknown>): CatalogTypeEntry {
  const id = String(raw.id ?? '');
  const name = String(raw.name ?? id);
  const manufacturer = raw.manufacturer ? String(raw.manufacturer) : undefined;
  const parameters: Record<string, string | number> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (['id', 'name', 'manufacturer'].includes(key)) continue;
    if (typeof value === 'string' || typeof value === 'number') {
      parameters[key] = value;
    }
  }

  return { id, name, manufacturer, parameters };
}

// =============================================================================
// Component
// =============================================================================

export interface CatalogBrowserProps {
  className?: string;
  onSelectType?: (typeId: string, namespace: CatalogNamespace) => void;
  onClose?: () => void;
  mode?: 'assign' | 'browse';
}

export function CatalogBrowser({
  className,
  onSelectType,
  onClose,
  mode = 'assign',
}: CatalogBrowserProps) {
  const [activeNamespace, setActiveNamespace] = useState<CatalogNamespace>('KABEL_SN');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [types, setTypes] = useState<CatalogTypeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allNamespaces = useMemo(() => Object.keys(NAMESPACE_LABELS) as CatalogNamespace[], []);

  useEffect(() => {
    const category = NAMESPACE_TO_CATEGORY[activeNamespace] ?? null;
    setSelectedTypeId(null);

    if (!category) {
      setTypes([]);
      setError('Dla tej przestrzeni katalogowej brak obsługi API w tym widoku.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchTypesByCategory(category)
      .then((items) => {
        if (cancelled) return;
        setTypes(items.map((item) => mapCatalogTypeEntry(item as unknown as Record<string, unknown>)));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Błąd pobierania katalogu';
        setError(message);
        setTypes([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeNamespace]);

  const filteredTypes = useMemo(() => {
    if (!searchQuery.trim()) return types;
    const q = searchQuery.toLowerCase();
    return types.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        (t.manufacturer && t.manufacturer.toLowerCase().includes(q)),
    );
  }, [types, searchQuery]);

  const selectedType = useMemo(
    () => filteredTypes.find((t) => t.id === selectedTypeId) ?? null,
    [filteredTypes, selectedTypeId],
  );

  const paramLabels = useMemo(
    () => NAMESPACE_PARAM_LABELS[activeNamespace] ?? {},
    [activeNamespace],
  );

  const handleSelectNamespace = useCallback((ns: CatalogNamespace) => {
    setActiveNamespace(ns);
    setSearchQuery('');
  }, []);

  const handleAssign = useCallback(() => {
    if (selectedTypeId && onSelectType) {
      onSelectType(selectedTypeId, activeNamespace);
    }
  }, [selectedTypeId, activeNamespace, onSelectType]);

  return (
    <div className={clsx('flex flex-col h-full bg-white', className)} data-testid="catalog-browser">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Przeglądarka katalogów</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {mode === 'assign'
              ? 'Wybierz kategorię i typ elementu.'
              : 'Przeglądaj warianty katalogowe i porównuj parametry.'}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-200"
            aria-label="Zamknij przeglądarkę"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-48 border-r border-gray-200 overflow-y-auto flex-shrink-0">
          <div className="py-1">
            {allNamespaces.map((ns) => (
              <button
                key={ns}
                type="button"
                onClick={() => handleSelectNamespace(ns)}
                className={clsx(
                  'w-full text-left px-3 py-1.5 text-[11px] flex items-center gap-2 transition-colors',
                  activeNamespace === ns
                    ? 'bg-blue-50 text-blue-800 font-medium'
                    : 'text-gray-600 hover:bg-gray-50',
                )}
              >
                <span className="text-xs">{NAMESPACE_ICONS[ns]}</span>
                <span className="truncate">{NAMESPACE_LABELS[ns]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Szukaj po nazwie, ID lub producencie..."
              className="w-full px-2.5 py-1.5 text-[11px] border border-gray-300 rounded"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-[11px] text-gray-500">Ładowanie katalogu…</p>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full px-4">
                <p className="text-[11px] text-red-600 text-center">{error}</p>
              </div>
            ) : filteredTypes.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-[11px] text-gray-400">Brak typów w tej kategorii</p>
              </div>
            ) : (
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-gray-50 sticky top-0">
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
                  {filteredTypes.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => setSelectedTypeId(t.id)}
                      className={clsx(
                        'cursor-pointer border-b border-gray-50 transition-colors',
                        selectedTypeId === t.id ? 'bg-blue-50' : 'hover:bg-gray-50',
                      )}
                    >
                      <td className="px-3 py-1.5 font-medium text-gray-800">{t.name}</td>
                      <td className="px-3 py-1.5 text-gray-500">{t.manufacturer ?? '—'}</td>
                      {Object.keys(paramLabels).map((k) => (
                        <td key={k} className="px-3 py-1.5 text-right text-gray-600">
                          {String(t.parameters[k] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {selectedType && (
            <div className="border-t border-gray-200 px-3 py-2 bg-gray-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-gray-800">{selectedType.name}</p>
                  <p className="text-[10px] text-gray-500">
                    ID: {selectedType.id}
                    {selectedType.manufacturer && ` • ${selectedType.manufacturer}`}
                  </p>
                </div>
                {mode === 'assign' && onSelectType ? (
                  <button
                    type="button"
                    onClick={handleAssign}
                    className="px-3 py-1 text-[10px] font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Przypisz do elementu
                  </button>
                ) : (
                  <div className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-600">
                    Tryb przeglądowy
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
