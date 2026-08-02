/*
 * Podsumowanie topologii BEZ pól kolekcyjnych nie wywraca ekranu.
 * Dług V12K-317 poz. 6 (PRE-EXISTING na czystym drzewie bazowym), karta W3 §2.1.
 *
 * DEFEKT: `TopologyGraphSummary` deklaruje `spine`/`adjacency`/`lateral_roots`
 * jako pola wymagane, ale deklaracja TypeScriptu nie jest sprawdzana w runtime.
 * Odpowiedź serwera bez tych pól przechodziła przez `if (!summary)` jako obiekt
 * prawdziwy i pierwszy odczyt kolekcji rzucał
 * `TypeError: Cannot read properties of undefined (reading 'map')`.
 * React wynosił wyjątek do NAJBLIŻSZEJ granicy błędu, a w produkcji jest nią
 * korzeń aplikacji — więc brak jednego pola w JEDNYM panelu gasił CAŁY ekran
 * („Błąd w sekcji: Aplikacja MV-DESIGN-PRO"). Tą samą drogą był czerwony
 * `e2e/create-first-case`: jego atrapa API odpowiada `{}` na każdą nieobsłużoną
 * ścieżkę, w tym na `GET /api/cases/{id}/enm/topology/summary`.
 *
 * ŚCIEŻKA REALNA (wymóg karty §2.4): dane wchodzą PRODUKCYJNĄ akcją store'u
 * `useTopologyStore.loadSummary` (ta sama, którą woła aplikacja) przez
 * PRODUKCYJNEGO klienta `fetchTopologySummary` — sterujemy wyłącznie odpowiedzią
 * serwera (`fetch`), nigdy stanem magazynu. Renderowane są produkcyjne
 * `useTopologyTree` + `ContextTree`, opakowane produkcyjną granicą błędu
 * `ErrorBoundary` — dokładnie tak, jak składa je `ui2/AppRoot`.
 *
 * ILOCZYN CECH (reguła KLASA, NIE INSTANCJA pkt 2): defekt mógłby się schować w
 * KAŻDEJ kombinacji brakujących kolekcji, nie tylko w tej z karty. Tabela niżej
 * wylicza pełny iloczyn {spine} × {adjacency} × {lateral_roots} (2³ = 8 wariantów)
 * + brak `children_refs` w elemencie magistrali + odpowiedź pusta `{}` + kolekcje
 * podstawione wartością NIE-tablicową (`null`), bo `Array.isArray` jest tu jedynym
 * predykatem osłony.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';

import { ContextTree } from '../../ContextTree';
import { useTopologyTree } from '../topologyTreeAdapter';
import { useTopologyStore } from '../../../../ui/topology/store';
import { ErrorBoundary } from '../../../../ui/shared/ErrorBoundary';

const CASE_ID = 'case-topologia-bez-pol';
const ENDPOINT = `/api/cases/${CASE_ID}/enm/topology/summary`;

/** Pola skalarne podsumowania — zawsze obecne; badamy WYŁĄCZNIE kolekcje. */
function skalary() {
  return {
    case_id: CASE_ID,
    enm_revision: 3,
    bus_count: 2,
    branch_count: 1,
    transformer_count: 0,
    source_count: 1,
    load_count: 0,
    generator_count: 0,
    measurement_count: 0,
    protection_count: 0,
    is_radial: true,
    has_cycles: false,
  };
}

const SPINE_PELNY = [
  { bus_ref: 'GPZ', depth: 0, is_source: true, children_refs: ['ST-1'] },
  { bus_ref: 'ST-1', depth: 1, is_source: false, children_refs: [] },
];
const ADJACENCY_PELNA = [
  { bus_ref: 'GPZ', neighbor_ref: 'ST-1', via_ref: 'L-1', via_type: 'line' },
];

/** Odpowiedź serwera złożona z wybranych kolekcji (brak klucza = pole nieobecne). */
function odpowiedz(pola: Record<string, unknown>): Record<string, unknown> {
  return { ...skalary(), ...pola };
}

function stubFetch(cialo: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      if (String(input) === ENDPOINT) {
        return { ok: true, status: 200, json: async () => cialo };
      }
      return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) };
    }),
  );
}

/** Produkcyjne złożenie z `ui2/AppRoot` dla przestrzeni „Model". */
function DrzewoModelu() {
  const wezly = useTopologyTree('zasilania');
  return (
    <ContextTree
      wezly={wezly}
      zaznaczonyId={null}
      onZaznacz={vi.fn()}
      onOtworz={vi.fn()}
      filtrProblemy={false}
    />
  );
}

function Ekran() {
  return (
    <ErrorBoundary sectionLabel="Aplikacja MV-DESIGN-PRO">
      <DrzewoModelu />
    </ErrorBoundary>
  );
}

/** Wczytuje podsumowanie PRODUKCYJNĄ akcją store'u (zero `setState` na badanym store). */
async function wczytajPodsumowanie(): Promise<void> {
  await act(async () => {
    await useTopologyStore.getState().loadSummary(CASE_ID);
  });
}

const stanPoczatkowyTopologii = useTopologyStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  useTopologyStore.setState(stanPoczatkowyTopologii, true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// ILOCZYN CECH: {spine} × {adjacency} × {lateral_roots}
// ---------------------------------------------------------------------------

interface Wariant {
  nazwa: string;
  cialo: unknown;
  /** Węzły magistrali, które MUSZĄ się pojawić w drzewie (pusto = uczciwy stan zerowy). */
  oczekiwaneWiersze: string[];
}

const WARIANTY: Wariant[] = [
  {
    nazwa: 'komplet kolekcji (wariant kontrolny — drzewo się rysuje)',
    cialo: odpowiedz({ spine: SPINE_PELNY, adjacency: ADJACENCY_PELNA, lateral_roots: [] }),
    oczekiwaneWiersze: ['magistrala'],
  },
  {
    nazwa: 'brak spine',
    cialo: odpowiedz({ adjacency: ADJACENCY_PELNA, lateral_roots: [] }),
    // Bez magistrali oba węzły sąsiedztwa są izolowane — to nadal uczciwy obraz danych.
    oczekiwaneWiersze: ['izolowane'],
  },
  {
    nazwa: 'brak adjacency',
    cialo: odpowiedz({ spine: SPINE_PELNY, lateral_roots: [] }),
    oczekiwaneWiersze: ['magistrala'],
  },
  {
    nazwa: 'brak lateral_roots',
    cialo: odpowiedz({ spine: SPINE_PELNY, adjacency: ADJACENCY_PELNA }),
    oczekiwaneWiersze: ['magistrala'],
  },
  {
    nazwa: 'brak spine + adjacency',
    cialo: odpowiedz({ lateral_roots: [] }),
    oczekiwaneWiersze: [],
  },
  {
    nazwa: 'brak spine + lateral_roots',
    cialo: odpowiedz({ adjacency: ADJACENCY_PELNA }),
    oczekiwaneWiersze: ['izolowane'],
  },
  {
    nazwa: 'brak adjacency + lateral_roots',
    cialo: odpowiedz({ spine: SPINE_PELNY }),
    oczekiwaneWiersze: ['magistrala'],
  },
  {
    nazwa: 'brak wszystkich trzech kolekcji',
    cialo: odpowiedz({}),
    oczekiwaneWiersze: [],
  },
  {
    nazwa: 'odpowiedź pusta `{}` (atrapa API scenariusza create-first-case)',
    cialo: {},
    oczekiwaneWiersze: [],
  },
  {
    nazwa: 'kolekcje obecne, ale NIE-tablicowe (null)',
    cialo: odpowiedz({ spine: null, adjacency: null, lateral_roots: null }),
    oczekiwaneWiersze: [],
  },
  {
    nazwa: 'brak children_refs w węźle magistrali',
    cialo: odpowiedz({
      spine: [{ bus_ref: 'GPZ', depth: 0, is_source: true }],
      adjacency: ADJACENCY_PELNA,
      lateral_roots: [],
    }),
    oczekiwaneWiersze: ['magistrala'],
  },
];

describe('drzewo topologii — brak pola w odpowiedzi to STAN, nie wyjątek (V12K-317 poz. 6)', () => {
  for (const wariant of WARIANTY) {
    it(`${wariant.nazwa} → ekran żyje, zero granicy błędu`, async () => {
      stubFetch(wariant.cialo);
      render(<Ekran />);
      await wczytajPodsumowanie();

      // SEDNO: granica błędu NIE zapadła — panel nie zgasił ekranu.
      expect(screen.queryByTestId('error-boundary-fallback')).toBeNull();
      // Drzewo jest zamontowane (a nie zastąpione komunikatem awarii).
      expect(screen.getByTestId('mvd-tree-wrap')).toBeInTheDocument();

      if (wariant.oczekiwaneWiersze.length === 0) {
        // Uczciwy stan zerowy: „brak danych topologii" istniejącym wzorcem pustego drzewa.
        expect(screen.getByTestId('mvd-tree-empty')).toBeInTheDocument();
      } else {
        for (const id of wariant.oczekiwaneWiersze) {
          expect(screen.getByTestId(`mvd-tree-row-${id}`)).toBeInTheDocument();
        }
      }
    });
  }

  it('wariant kontrolny dowodzi, że test NIE przechodzi przez pusty ekran', async () => {
    stubFetch(odpowiedz({ spine: SPINE_PELNY, adjacency: ADJACENCY_PELNA, lateral_roots: [] }));
    render(<Ekran />);
    await wczytajPodsumowanie();

    // Gdyby osłona wycinała dane zamiast tylko brakujące pola, ta asercja by padła.
    expect(screen.getByTestId('mvd-tree-row-magistrala')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-tree-empty')).toBeNull();
  });
});
