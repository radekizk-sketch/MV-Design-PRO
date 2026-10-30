/**
 * Karta szczegółów przeglądarki typów nie wywraca się na niepełnych danych z serwera
 * (karta komunikatów, commit 5).
 *
 * Wcześniej `renderCableParams` / `renderTransformerParams` / `renderLineParams` /
 * `renderSwitchParams` wołały `.toFixed` na każdym polu liczbowym — rekord bez pola
 * (25 typów transformatorów katalogu ma `i0_percent: null`) wywracał kartę wyjątkiem,
 * a test etykiet obchodził to kategorią LOAD zamiast kabla.
 *
 * Iloczyn cech na realnej ścieżce (zakładka → klik pozycji → karta szczegółów):
 * {linia, kabel, transformator, łącznik, minimum źródła systemowego} × {dane pełne, brak
 * pojedynczego pola (każde pole karty po kolei), brak wszystkich pól opcjonalnych, sam
 * identyfikator i nazwa}. Niezmienniki: brak wyjątku, każda etykieta karty obecna, pole bez
 * danej pokazuje „brak danych” bez jednostki, nigdy „undefined”, „null” ani „NaN”.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TypeLibraryBrowser } from '../TypeLibraryBrowser';
import type { TypeCategory } from '../types';

const fetchTypesByCategoryMock = vi.fn();

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchTypesByCategory: (...args: unknown[]) => fetchTypesByCategoryMock(...args),
  };
});

interface PoleKarty {
  /** Klucz rekordu z serwera. */
  readonly klucz: string;
  /** Etykieta wiersza karty. */
  readonly etykieta: string;
  /** Oczekiwana wartość przy danych pełnych (z jednostką, jeśli jest). */
  readonly pelna: string;
  /** Pole opcjonalne w kontrakcie serwera (`| None`). */
  readonly opcjonalne: boolean;
  /** Wartość przy braku pola (domyślnie „brak danych”). */
  readonly brak?: string;
}

interface KategoriaKarty {
  readonly kategoria: TypeCategory;
  readonly rekord: Readonly<Record<string, unknown>>;
  readonly pola: readonly PoleKarty[];
}

const KATEGORIE: readonly KategoriaKarty[] = [
  {
    kategoria: 'LINE',
    rekord: {
      r_ohm_per_km: 0.306,
      x_ohm_per_km: 0.35,
      b_us_per_km: 3.2,
      rated_current_a: 290,
      voltage_rating_kv: 20,
      conductor_material: 'AFL',
      cross_section_mm2: 95,
      max_temperature_c: 80,
    },
    pola: [
      { klucz: 'r_ohm_per_km', etykieta: 'Rezystancja R', pelna: '0.306Ohm/km', opcjonalne: false },
      { klucz: 'x_ohm_per_km', etykieta: 'Reaktancja X', pelna: '0.350Ohm/km', opcjonalne: false },
      { klucz: 'b_us_per_km', etykieta: 'Susceptancja B', pelna: '3.200uS/km', opcjonalne: false },
      { klucz: 'rated_current_a', etykieta: 'Prąd znamionowy', pelna: '290A', opcjonalne: false },
      { klucz: 'voltage_rating_kv', etykieta: 'Napięcie znamionowe', pelna: '20.0kV', opcjonalne: false },
      { klucz: 'conductor_material', etykieta: 'Materiał przewodu', pelna: 'AFL', opcjonalne: true },
      { klucz: 'cross_section_mm2', etykieta: 'Przekrój', pelna: '95mm2', opcjonalne: true },
      { klucz: 'max_temperature_c', etykieta: 'Maks. temperatura', pelna: '80C', opcjonalne: true },
    ],
  },
  {
    kategoria: 'CABLE',
    rekord: {
      r_ohm_per_km: 0.253,
      x_ohm_per_km: 0.11,
      c_nf_per_km: 280,
      rated_current_a: 335,
      voltage_rating_kv: 20,
      insulation_type: 'XLPE',
      conductor_material: 'Al',
      cross_section_mm2: 120,
      max_temperature_c: 90,
    },
    pola: [
      { klucz: 'r_ohm_per_km', etykieta: 'Rezystancja R', pelna: '0.253Ohm/km', opcjonalne: false },
      { klucz: 'x_ohm_per_km', etykieta: 'Reaktancja X', pelna: '0.110Ohm/km', opcjonalne: false },
      { klucz: 'c_nf_per_km', etykieta: 'Pojemność C', pelna: '280nF/km', opcjonalne: false },
      { klucz: 'rated_current_a', etykieta: 'Prąd znamionowy', pelna: '335A', opcjonalne: false },
      { klucz: 'voltage_rating_kv', etykieta: 'Napięcie znamionowe', pelna: '20.0kV', opcjonalne: false },
      { klucz: 'insulation_type', etykieta: 'Izolacja', pelna: 'XLPE', opcjonalne: true },
      { klucz: 'conductor_material', etykieta: 'Materiał przewodu', pelna: 'Al', opcjonalne: true },
      { klucz: 'cross_section_mm2', etykieta: 'Przekrój', pelna: '120mm2', opcjonalne: false },
    ],
  },
  {
    kategoria: 'TRANSFORMER',
    rekord: {
      rated_power_mva: 0.63,
      voltage_hv_kv: 15,
      voltage_lv_kv: 0.4,
      uk_percent: 6,
      pk_kw: 6.5,
      i0_percent: 0.3,
      p0_kw: 0.86,
      vector_group: 'Dyn11',
      cooling_class: 'ONAN',
      tap_min: -2,
      tap_max: 2,
      tap_step_percent: 2.5,
    },
    pola: [
      { klucz: 'rated_power_mva', etykieta: 'Moc znamionowa', pelna: '0.6MVA', opcjonalne: false },
      { klucz: 'voltage_hv_kv', etykieta: 'Napięcie HV', pelna: '15.0kV', opcjonalne: false },
      { klucz: 'voltage_lv_kv', etykieta: 'Napięcie LV', pelna: '0.4kV', opcjonalne: false },
      { klucz: 'uk_percent', etykieta: 'uk', pelna: '6.00%', opcjonalne: false },
      { klucz: 'pk_kw', etykieta: 'Straty zwarcia Pk', pelna: '6.5kW', opcjonalne: false },
      { klucz: 'i0_percent', etykieta: 'Prąd jałowy i0', pelna: '0.30%', opcjonalne: true },
      { klucz: 'p0_kw', etykieta: 'Straty jałowe P0', pelna: '0.9kW', opcjonalne: true },
      { klucz: 'vector_group', etykieta: 'Grupa połączeń', pelna: 'Dyn11', opcjonalne: true },
      { klucz: 'cooling_class', etykieta: 'Chłodzenie', pelna: 'ONAN', opcjonalne: true },
      { klucz: 'tap_min', etykieta: 'Zakres zaczepów', pelna: '-2 … 2', opcjonalne: false },
      { klucz: 'tap_step_percent', etykieta: 'Krok zaczepu', pelna: '2.50%', opcjonalne: false },
    ],
  },
  {
    kategoria: 'SWITCH_EQUIPMENT',
    rekord: {
      equipment_kind: 'CIRCUIT_BREAKER',
      un_kv: 24,
      in_a: 630,
      ik_ka: 16,
      icw_ka: 16,
      medium: 'SF6',
    },
    pola: [
      { klucz: 'equipment_kind', etykieta: 'Rodzaj aparatu', pelna: 'wyłącznik', opcjonalne: false },
      { klucz: 'un_kv', etykieta: 'Napięcie znamionowe', pelna: '24.0kV', opcjonalne: false },
      { klucz: 'in_a', etykieta: 'Prąd znamionowy', pelna: '630A', opcjonalne: false },
      { klucz: 'ik_ka', etykieta: 'Prąd wyłączalny Ik', pelna: '16.0kA', opcjonalne: true },
      { klucz: 'icw_ka', etykieta: 'Prąd wytrzymałości Icw', pelna: '16.0kA', opcjonalne: true },
      { klucz: 'medium', etykieta: 'Ośrodek gaszący', pelna: 'SF6', opcjonalne: true },
    ],
  },
  {
    kategoria: 'SYSTEM_SOURCE',
    rekord: { sk3_min_mva: 180, ik3_min_ka: 6.9, rx_ratio_min: 0.12 },
    pola: [
      { klucz: 'sk3_min_mva', etykieta: 'Moc zwarciowa Sk3 min', pelna: '180MVA', opcjonalne: true },
      { klucz: 'ik3_min_ka', etykieta: 'Prąd zwarciowy Ik3 min', pelna: '6.9kA', opcjonalne: true },
      { klucz: 'rx_ratio_min', etykieta: 'Stosunek R/X min', pelna: '0.12', opcjonalne: true },
    ],
  },
];

const NAZWA = 'Typ wzorcowy karty';

async function kartaSzczegolow(kategoria: TypeCategory, rekord: Readonly<Record<string, unknown>>) {
  fetchTypesByCategoryMock.mockResolvedValue([{ id: 'typ-1', name: NAZWA, ...rekord }]);
  const user = userEvent.setup();
  render(<TypeLibraryBrowser initialTab={kategoria} />);
  await user.click(await screen.findByText(NAZWA));
  return screen.findByTestId('type-library-details-grid');
}

/** Wartość wiersza karty (``dd``) po etykiecie (``dt``). */
function wartosc(siatka: HTMLElement, etykieta: string): string {
  const dt = within(siatka).getAllByText(etykieta, { selector: 'dt' });
  // Panel generyczny może dołożyć wiersz o tej samej etykiecie — liczy się wiersz karty.
  return dt[0]!.nextElementSibling!.textContent ?? '';
}

function bezFalszywychWartosci(siatka: HTMLElement): void {
  expect(siatka.textContent).not.toMatch(/undefined|null|NaN/);
}

function bez(rekord: Readonly<Record<string, unknown>>, klucze: readonly string[]) {
  return Object.fromEntries(Object.entries(rekord).filter(([k]) => !klucze.includes(k)));
}

beforeEach(() => {
  fetchTypesByCategoryMock.mockReset();
});

describe.each(KATEGORIE)('karta szczegółów $kategoria', ({ kategoria, rekord, pola }) => {
  it('dane pełne — każda wartość z jednostką', async () => {
    const siatka = await kartaSzczegolow(kategoria, rekord);
    for (const pole of pola) {
      expect(wartosc(siatka, pole.etykieta)).toBe(pole.pelna);
    }
    bezFalszywychWartosci(siatka);
  });

  it.each(pola.map((p) => [p.klucz, p] as const))(
    'brak pojedynczego pola %s — „brak danych” bez jednostki, reszta bez zmian',
    async (_klucz, pole) => {
      const siatka = await kartaSzczegolow(kategoria, bez(rekord, [pole.klucz]));
      expect(wartosc(siatka, pole.etykieta)).toBe(pole.brak ?? 'brak danych');
      for (const inne of pola.filter((p) => p.etykieta !== pole.etykieta)) {
        expect(wartosc(siatka, inne.etykieta)).toBe(inne.pelna);
      }
      bezFalszywychWartosci(siatka);
    },
  );

  it('pole jawnie null (kontrakt serwera `| None`) — tak samo jak brak pola', async () => {
    const nulle = Object.fromEntries(
      pola.filter((p) => p.opcjonalne).map((p) => [p.klucz, null] as const),
    );
    const siatka = await kartaSzczegolow(kategoria, { ...rekord, ...nulle });
    for (const pole of pola) {
      expect(wartosc(siatka, pole.etykieta)).toBe(
        pole.opcjonalne ? (pole.brak ?? 'brak danych') : pole.pelna,
      );
    }
    bezFalszywychWartosci(siatka);
  });

  it('brak wszystkich pól opcjonalnych', async () => {
    const siatka = await kartaSzczegolow(
      kategoria,
      bez(
        rekord,
        pola.filter((p) => p.opcjonalne).map((p) => p.klucz),
      ),
    );
    for (const pole of pola) {
      expect(wartosc(siatka, pole.etykieta)).toBe(
        pole.opcjonalne ? (pole.brak ?? 'brak danych') : pole.pelna,
      );
    }
    bezFalszywychWartosci(siatka);
  });

  it('sam identyfikator i nazwa — każdy wiersz karty obecny, bez wyjątku', async () => {
    const siatka = await kartaSzczegolow(kategoria, {});
    for (const pole of pola) {
      expect(within(siatka).getAllByText(pole.etykieta, { selector: 'dt' })).not.toHaveLength(0);
      expect(wartosc(siatka, pole.etykieta)).not.toBe('');
    }
    bezFalszywychWartosci(siatka);
  });
});

describe('łącznik — brak liczby prądu rozstrzyga rodzaj aparatu', () => {
  it.each([
    ['CIRCUIT_BREAKER', 'brak danych', 'brak danych'],
    ['DISCONNECTOR', 'nie dotyczy', 'brak danych'],
    ['FUSE', 'brak danych', 'nie dotyczy'],
  ])('%s bez Ik i Icw', async (rodzaj, ik, icw) => {
    const siatka = await kartaSzczegolow('SWITCH_EQUIPMENT', {
      equipment_kind: rodzaj,
      un_kv: 24,
      in_a: 630,
    });
    expect(wartosc(siatka, 'Prąd wyłączalny Ik')).toBe(ik);
    expect(wartosc(siatka, 'Prąd wytrzymałości Icw')).toBe(icw);
  });

  it('rodzaj spoza słownika — opis zamiast kodu', async () => {
    const siatka = await kartaSzczegolow('SWITCH_EQUIPMENT', { equipment_kind: 'NOWY_RODZAJ' });
    expect(wartosc(siatka, 'Rodzaj aparatu')).not.toContain('NOWY_RODZAJ');
  });
});
