/**
 * Adapter katalogu — cienka warstwa nad ISTNIEJĄCYM klientem `ui/catalog/api.ts`.
 *
 * Nie tworzy nowego kanału sieciowego — deleguje do zweryfikowanych funkcji
 * pobierających realne endpointy `/api/catalog/*`. Zero mutacji katalogu.
 *
 * MAPOWANIA API (plik:linia) — zbadane w bazie worktree:
 *
 *   Kategoria LINIA:
 *     • klient:  ui/catalog/api.ts:147  fetchLineTypes() → GET /api/catalog/line-types
 *     • backend: backend/src/api/catalog.py:225  list_line_types()
 *     • typ:     ui/catalog/types.ts:25  interface LineType
 *   Kategoria KABEL:
 *     • klient:  ui/catalog/api.ts:180  fetchCableTypes() → GET /api/catalog/cable-types
 *     • backend: backend/src/api/catalog.py:231  list_cable_types()
 *     • typ:     ui/catalog/types.ts:41  interface CableType
 *   Kategoria TRANSFORMATOR:
 *     • klient:  ui/catalog/api.ts:184  fetchTransformerTypes() → GET /api/catalog/transformer-types
 *     • backend: backend/src/api/catalog.py:237  list_transformer_types()
 *     • typ:     ui/catalog/types.ts:66  interface TransformerType
 *   Kategoria APARAT (aparaty łączeniowe):
 *     • klient:  ui/catalog/api.ts:188  fetchSwitchEquipmentTypes() → GET /api/catalog/switch-equipment-types
 *     • backend: backend/src/api/catalog.py:243  list_switch_equipment_types()
 *     • typ:     ui/catalog/types.ts:85  interface SwitchEquipmentType
 *   Kategoria FALOWNIK (OZE):
 *     • klient:  ui/catalog/api.ts:255  fetchConverterTypes() → GET pv-inverter-types + bess-inverter-types + wind-inverter-types
 *     • backend: backend/src/api/catalog.py:291/297/319  list_pv/bess/wind_inverter_types()
 *     • typ:     ui/catalog/types.ts:98  interface ConverterType
 *
 * Kategorie zgodne z semantyką kontraktów:
 *   • CATALOG_BROWSER_CONTRACT.md §3 (pasywne: linia/kabel/transformator/aparat),
 *   • karta E4.1 §1 rozszerza o falowniki (OZE) — parametry typu, nie Case-zależne.
 */

import {
  fetchCableTypes,
  fetchConverterTypes,
  fetchLineTypes,
  fetchSwitchEquipmentTypes,
  fetchTransformerTypes,
} from '../../../../../ui/catalog/api';
import type { KatalogPozycja, KategoriaId } from '../types';

/** Metadana kategorii: id, kolejność wyświetlania i uporządkowana lista pól parametrów. */
export interface MetadanaKategorii {
  id: KategoriaId;
  /** Uporządkowane klucze pól API renderowane jako parametry (muszą mieć definicję). */
  poleParametrow: readonly string[];
  /** Funkcja pobierająca realne typy z klienta `ui/catalog/api.ts`. */
  pobierz: () => Promise<KatalogPozycja[]>;
}

export const KATEGORIE: readonly MetadanaKategorii[] = [
  {
    id: 'LINIA',
    poleParametrow: [
      'voltage_rating_kv',
      'cross_section_mm2',
      'rated_current_a',
      'r_ohm_per_km',
      'x_ohm_per_km',
      'b_us_per_km',
      'r0_ohm_per_km',
      'x0_ohm_per_km',
      'max_temperature_c',
      'ith_1s_a',
      'jth_1s_a_per_mm2',
    ],
    pobierz: () => fetchLineTypes() as unknown as Promise<KatalogPozycja[]>,
  },
  {
    id: 'KABEL',
    poleParametrow: [
      'voltage_rating_kv',
      'cross_section_mm2',
      'rated_current_a',
      'r_ohm_per_km',
      'x_ohm_per_km',
      'c_nf_per_km',
      'r0_ohm_per_km',
      'x0_ohm_per_km',
      'max_temperature_c',
      'ith_1s_a',
    ],
    pobierz: () => fetchCableTypes() as unknown as Promise<KatalogPozycja[]>,
  },
  {
    id: 'TRANSFORMATOR',
    poleParametrow: [
      'rated_power_mva',
      'voltage_hv_kv',
      'voltage_lv_kv',
      'uk_percent',
      'pk_kw',
      'i0_percent',
      'p0_kw',
      'vector_group',
      'tap_step_percent',
    ],
    pobierz: () => fetchTransformerTypes() as unknown as Promise<KatalogPozycja[]>,
  },
  {
    id: 'APARAT',
    poleParametrow: ['un_kv', 'in_a', 'ik_ka', 'icw_ka'],
    pobierz: () => fetchSwitchEquipmentTypes() as unknown as Promise<KatalogPozycja[]>,
  },
  {
    id: 'FALOWNIK',
    poleParametrow: ['sn_mva', 'un_kv', 'pmax_mw', 'cosphi_min', 'cosphi_max', 'e_kwh'],
    pobierz: () => fetchConverterTypes() as unknown as Promise<KatalogPozycja[]>,
  },
];

const KATEGORIE_PO_ID: Readonly<Record<KategoriaId, MetadanaKategorii>> = Object.fromEntries(
  KATEGORIE.map((k) => [k.id, k]),
) as Record<KategoriaId, MetadanaKategorii>;

/** Zwraca metadanę kategorii po jej identyfikatorze. */
export function metadanaKategorii(id: KategoriaId): MetadanaKategorii {
  return KATEGORIE_PO_ID[id];
}

/** Uporządkowana lista pól parametrów dla kategorii. */
export function poleParametrow(id: KategoriaId): readonly string[] {
  return KATEGORIE_PO_ID[id].poleParametrow;
}

/** Domyślny loader typów dla panelu (deleguje do realnego klienta katalogu). */
export async function pobierzTypy(kategoria: KategoriaId): Promise<KatalogPozycja[]> {
  return KATEGORIE_PO_ID[kategoria].pobierz();
}

/**
 * Wyodrębnia unikalną, posortowaną listę producentów z pozycji katalogu
 * (do filtra „Producent"). Pomija puste wartości.
 */
export function producenci(pozycje: readonly KatalogPozycja[]): string[] {
  const zbior = new Set<string>();
  for (const poz of pozycje) {
    const p = poz.manufacturer;
    if (typeof p === 'string' && p.trim().length > 0) {
      zbior.add(p.trim());
    }
  }
  return [...zbior].sort((a, b) => a.localeCompare(b, 'pl'));
}

/**
 * Filtruje pozycje po frazie (nazwa + producent) i opcjonalnym producencie.
 * Deterministyczne, bez mutacji wejścia.
 */
export function filtrujPozycje(
  pozycje: readonly KatalogPozycja[],
  fraza: string,
  producent: string | null,
): KatalogPozycja[] {
  const f = fraza.trim().toLocaleLowerCase('pl');
  return pozycje.filter((poz) => {
    const nazwa = poz.name.toLocaleLowerCase('pl');
    const prod = typeof poz.manufacturer === 'string' ? poz.manufacturer : '';
    if (producent && prod !== producent) {
      return false;
    }
    if (f.length === 0) {
      return true;
    }
    return nazwa.includes(f) || prod.toLocaleLowerCase('pl').includes(f);
  });
}
