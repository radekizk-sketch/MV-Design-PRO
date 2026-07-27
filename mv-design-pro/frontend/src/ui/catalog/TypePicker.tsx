import { useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import type { CatalogListItem } from './api';
import { fetchTypesByCategory, getCatalogErrorMessage } from './api';
import type { TypeCategory } from './types';

interface TypePickerProps {
  category: TypeCategory;
  currentTypeId?: string | null;
  onSelectType: (typeId: string, typeName: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

const CATEGORY_LABELS: Partial<Record<TypeCategory, string>> = {
  LINE: 'Linie napowietrzne SN',
  CABLE: 'Kable SN',
  TRANSFORMER: 'Transformatory SN/nN',
  SWITCH_EQUIPMENT: 'Aparatura łączeniowa SN',
  MV_APPARATUS: 'Aparatura łączeniowa SN',
  LV_APPARATUS: 'Aparatura łączeniowa nN',
  LV_CABLE: 'Kable nN',
  LOAD: 'Obciążenia',
  CT: 'Przekładniki prądowe',
  VT: 'Przekładniki napięciowe',
  MEASUREMENT_TRANSFORMER: 'Przekładniki pomiarowe',
  PV_INVERTER: 'Falowniki PV',
  BESS_INVERTER: 'Falowniki BESS',
  PROTECTION_DEVICE: 'Zabezpieczenia',
  SYSTEM_SOURCE: 'Zasilanie systemowe SN',
  CONVERTER: 'Konwertery',
  BRANCH_POLE: 'Słupy rozgałęźne SN',
  ZKSN: 'ZKSN',
};

function getTypeParams(type: CatalogListItem, category: TypeCategory): string {
  const record = type as unknown as Record<string, unknown>;

  switch (category) {
    case 'LINE':
    case 'CABLE':
      return `R=${record.r_ohm_per_km ?? '-'} Ohm/km, X=${record.x_ohm_per_km ?? '-'} Ohm/km, I=${record.rated_current_a ?? '-'} A`;
    case 'TRANSFORMER':
      return `${record.rated_power_mva ?? '-'} MVA, ${record.voltage_hv_kv ?? '-'} / ${record.voltage_lv_kv ?? '-'} kV, uk=${record.uk_percent ?? '-'}%`;
    case 'SWITCH_EQUIPMENT':
      return `${record.un_kv ?? '-'} kV, ${record.in_a ?? '-'} A, ${record.ik_ka ?? '-'} kA`;
    case 'MV_APPARATUS':
      return `${record.u_n_kv ?? '-'} kV, ${record.i_n_a ?? '-'} A, ${record.breaking_capacity_ka ?? '-'} kA`;
    case 'LV_APPARATUS':
      return `${record.u_n_kv ?? '-'} kV, ${record.i_n_a ?? '-'} A, ${record.breaking_capacity_ka ?? '-'} kA`;
    case 'LV_CABLE':
      return `${record.u_n_kv ?? '-'} kV, ${record.cross_section_mm2 ?? '-'} mm2, ${record.i_max_a ?? '-'} A`;
    case 'LOAD':
      return `P=${record.p_kw ?? '-'} kW, cos fi=${record.cos_phi ?? '-'}, model=${record.model ?? '-'}`;
    case 'CT':
      return `${record.ratio_primary_a ?? '-'} / ${record.ratio_secondary_a ?? '-'} A, klasa=${record.accuracy_class ?? '-'}`;
    case 'VT':
      return `${record.ratio_primary_v ?? '-'} / ${record.ratio_secondary_v ?? '-'} V, klasa=${record.accuracy_class ?? '-'}`;
    case 'PV_INVERTER':
      return `${record.s_n_kva ?? '-'} kVA, Pmax=${record.p_max_kw ?? '-'} kW`;
    case 'BESS_INVERTER':
      return `P=${record.p_discharge_kw ?? '-'} kW, E=${record.e_kwh ?? '-'} kWh`;
    case 'PROTECTION_DEVICE':
      return `${record.vendor ?? record.manufacturer ?? '-'}, ${record.series ?? '-'}, In=${record.rated_current_a ?? '-'} A`;
    case 'SYSTEM_SOURCE':
      return `${record.voltage_rating_kv ?? '-'} kV, Sk3=${record.sk3_mva ?? '-'} MVA, R/X=${record.rx_ratio ?? '-'}`;
    case 'BRANCH_POLE':
    case 'ZKSN':
      return `${record.switch_device_kind ?? '-'}, ${record.switch_rated_current_a ?? '-'} A, porty odgałęzienia=${record.branch_ports_count ?? '-'}`;
    case 'MEASUREMENT_TRANSFORMER':
    case 'CONVERTER':
    default:
      return '-';
  }
}

export function TypePicker({
  category,
  currentTypeId,
  onSelectType,
  onClose,
  isOpen,
}: TypePickerProps) {
  const [types, setTypes] = useState<CatalogListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadTypes = useCallback(() => {
    setLoading(true);
    setError(null);

    fetchTypesByCategory(category)
      .then((items) => {
        setTypes(items);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setTypes([]);
        setError(getCatalogErrorMessage(err));
        setLoading(false);
      });
  }, [category]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    loadTypes();
  }, [isOpen, loadTypes]);

  const filteredTypes = useMemo(() => {
    if (!searchQuery.trim()) {
      return types;
    }
    const query = searchQuery.toLowerCase();
    return types.filter((type) => {
      const manufacturer =
        (type as unknown as Record<string, unknown>).manufacturer
        ?? (type as unknown as Record<string, unknown>).vendor;
      return (
        type.name.toLowerCase().includes(query)
        || type.id.toLowerCase().includes(query)
        || (typeof manufacturer === 'string' && manufacturer.toLowerCase().includes(query))
      );
    });
  }, [searchQuery, types]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[80vh] w-full max-w-5xl flex-col rounded-lg border border-scada-border bg-scada-panel shadow-xl">
        <div className="border-b border-scada-border px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-scada-text">
              Wybierz typ: {CATEGORY_LABELS[category] ?? category}
            </h2>
            <button
              onClick={onClose}
              className="text-2xl leading-none text-scada-muted hover:text-scada-text"
              aria-label="Zamknij"
            >
              ×
            </button>
          </div>
          <div className="mt-4">
            <input
              type="text"
              placeholder="Szukaj po nazwie lub ID..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-md border border-scada-border bg-scada-surface px-4 py-2 text-scada-text placeholder:text-scada-muted focus:outline-none focus:ring-2 focus:ring-scada-nn"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="py-8 text-center text-scada-muted">Ładowanie typów katalogowych…</div>
          ) : null}

          {error ? (
            <div className="py-8 text-center text-scada-alarm">
              <p className="font-semibold">Nie udało się pobrać typów katalogowych</p>
              <p className="mt-2 text-sm">{error}</p>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={loadTypes}
                  className="rounded-md border border-scada-border bg-scada-surface px-4 py-2 text-sm font-medium text-scada-text transition-colors hover:bg-scada-hover-nav"
                >
                  Ponów
                </button>
              </div>
            </div>
          ) : null}

          {!loading && !error && filteredTypes.length === 0 ? (
            <div className="py-8 text-center text-scada-muted">
              {searchQuery ? 'Nie znaleziono typu dla zapytania.' : 'Katalog typów wymaga konfiguracji.'}
            </div>
          ) : null}

          {!loading && !error && filteredTypes.length > 0 ? (
            <table className="w-full">
              <thead className="sticky top-0 bg-scada-surface">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-scada-muted">
                    Nazwa
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-scada-muted">
                    Producent
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-scada-muted">
                    Parametry
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-scada-border">
                {filteredTypes.map((type) => {
                  const record = type as unknown as Record<string, unknown>;
                  const manufacturer =
                    typeof record.manufacturer === 'string'
                      ? record.manufacturer
                      : typeof record.vendor === 'string'
                        ? record.vendor
                        : '-';

                  return (
                    <tr
                      key={type.id}
                      onClick={() => {
                        onSelectType(type.id, type.name);
                        onClose();
                      }}
                      className={clsx(
                        'cursor-pointer transition-colors hover:bg-scada-hover-nav',
                        type.id === currentTypeId ? 'bg-scada-active' : '',
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-scada-text">{type.name}</div>
                        <div className="text-xs text-scada-muted">{type.id}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-scada-text">{manufacturer}</td>
                      <td className="px-4 py-3 text-sm text-scada-muted">
                        {getTypeParams(type, category)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </div>

        <div className="flex justify-end gap-3 border-t border-scada-border px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-md border border-scada-border bg-scada-surface px-4 py-2 text-sm font-medium text-scada-text hover:bg-scada-hover-nav"
          >
            Anuluj
          </button>
        </div>
      </div>
    </div>
  );
}
