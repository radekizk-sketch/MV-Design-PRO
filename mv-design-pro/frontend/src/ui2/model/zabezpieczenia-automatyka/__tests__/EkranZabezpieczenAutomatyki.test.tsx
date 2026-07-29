/**
 * Testy ekranu „Zabezpieczenia i automatyka" (E-27, realny dostawca ui2).
 * Interakcje przez natywną ścieżkę użytkownika (userEvent.click) — dyrektywa
 * Zero-Debt pkt 5 (żadnych syntetycznych dispatchEvent).
 *
 * Read-model pola (`useFieldReadModel`) jest reużyty BEZ ZMIAN — w teście
 * podmieniamy wyłącznie jego wynik (fixture o kształcie 1:1 z ENM
 * `BayProtectionControlUnit`/`SpzState`); logika mapowania (`model.ts`) i
 * akcje store'ów (`openInspectorPanel`, `openRouteSurface`) pozostają rzeczywiste.
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../ui/app-state';
import { useNetworkBuildStore } from '../../../../ui/network-build/networkBuildStore';
import { useShellStore } from '../../../shell/useShellStore';

// Reużycie hooka read-modelu pola BEZ ZMIAN: nadpisujemy tylko jego wynik.
vi.mock('../../../../ui/field/useFieldReadModel', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../ui/field/useFieldReadModel')>();
  return { ...actual, useFieldReadModel: vi.fn() };
});

import {
  useFieldReadModel,
  type FieldReadModelItem,
  type FieldReadModelView,
} from '../../../../ui/field/useFieldReadModel';
import { EkranZabezpieczenAutomatyki } from '../EkranZabezpieczenAutomatyki';
import {
  buildSterowniki,
  buildWierszeZabezpieczen,
  ETYKIETY_CECH,
} from '../model';
import { ZABEZPIECZENIA_STRINGS as T } from '../strings';

const mockReadModel = vi.mocked(useFieldReadModel);

function mkItem(
  bayRef: string,
  bayName: string,
  protectionConfig: unknown,
): FieldReadModelItem {
  return {
    bay_id: bayRef,
    bay_ref: bayRef,
    bay_name: bayName,
    canonical_model: {
      base_model: {
        bay_ref: bayRef,
        protection_config: protectionConfig,
      },
    },
  } as unknown as FieldReadModelItem;
}

// Fixture ENM 1:1: pole liniowe z pełnym sterownikiem, SPZ aktywnym.
const POLE_A = mkItem('bay-a', 'Pole liniowe A', {
  unit_ref: 'unit-a',
  model: 'REF615',
  functions: [{ code: '50' }, { code: '51' }, { code: '50N' }],
  measurement_inputs: {},
  automation_features: {
    synchrocheck_enabled: true,
    arc_protection_enabled: false,
    breaker_failure_enabled: true,
  },
  spz: {
    bound_breaker_ref: 'cb-a',
    enabled: true,
    fast_attempts_max: 1,
    slow_attempts_max: 2,
    attempts_done: 0,
    blocked: false,
    blocked_reason: null,
    state: 'gotowe',
  },
});

// Fixture ENM 1:1: pole transformatorowe z sterownikiem, SPZ nieskonfigurowany.
const POLE_B = mkItem('bay-b', 'Pole transformatorowe B', {
  unit_ref: 'unit-b',
  model: 'SEL-751',
  functions: [{ code: '51' }],
  measurement_inputs: {},
  automation_features: {
    synchrocheck_enabled: false,
    arc_protection_enabled: false,
    breaker_failure_enabled: false,
  },
  spz: null,
});

// Fixture ENM 1:1: pole pomiarowe bez przypisania zabezpieczenia.
const POLE_C = mkItem('bay-c', 'Pole pomiarowe C', null);

function ustawReadModel(fields: FieldReadModelItem[]) {
  mockReadModel.mockReturnValue({
    data: { fields } as unknown as FieldReadModelView['data'],
    isLoading: false,
    error: null,
    itemsByBayRef: new Map(),
    itemsByBayId: new Map(),
    viewStatus: { data_source: 'ENM_FIELD_READ_MODEL', result_state: 'FRESH', has_field_data: true },
    summary: {
      total_fields: fields.length,
      migrated_count: fields.length,
      requires_completion_count: 0,
      source_fields_count: 0,
      coupler_fields_count: 0,
      fields_with_results_count: 0,
    },
  } as unknown as FieldReadModelView);
}

beforeEach(() => {
  useAppStateStore.getState().reset();
  useNetworkBuildStore.getState().reset();
  useShellStore.setState({ activeSpace: 'wyniki' });
  ustawReadModel([POLE_A, POLE_B, POLE_C]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('model.ts — mapowanie ENM → UI (bez fabrykacji)', () => {
  it('buildWierszeZabezpieczen: wszystkie pola, posortowane, z kodami funkcji', () => {
    const wiersze = buildWierszeZabezpieczen([POLE_C, POLE_A, POLE_B]);
    expect(wiersze.map((w) => w.bayRef)).toEqual(['bay-a', 'bay-b', 'bay-c']);
    expect(wiersze[0].urzadzenie).toBe('REF615');
    expect(wiersze[0].funkcje).toEqual(['50', '51', '50N']);
    expect(wiersze[0].maZabezpieczenie).toBe(true);
  });

  it('buildWierszeZabezpieczen: pole bez przypisania → brak urządzenia i funkcji', () => {
    const wiersze = buildWierszeZabezpieczen([POLE_C]);
    expect(wiersze[0].urzadzenie).toBeNull();
    expect(wiersze[0].funkcje).toEqual([]);
    expect(wiersze[0].maZabezpieczenie).toBe(false);
    // Pole bez rodziny producenta → szablon/rodzina null (uczciwie „uniwersalne").
    expect(wiersze[0].szablon).toBeNull();
    expect(wiersze[0].rodzina).toBeNull();
  });

  it('buildWierszeZabezpieczen: surfacing szablonu pola + rodziny producenta (Reference Engine)', () => {
    const pole = {
      bay_id: 'bay-t',
      bay_ref: 'bay-t',
      bay_name: 'Pole odpływowe T',
      canonical_model: {
        base_model: {
          bay_ref: 'bay-t',
          protection_config: null,
          bay_template_ref: 'ABB__SAFERING__LINE_OUT',
          switchgear_family_ref: 'ABB__SAFERING',
        },
      },
    } as unknown as FieldReadModelItem;
    const [wiersz] = buildWierszeZabezpieczen([pole]);
    expect(wiersz.szablon).toBe('ABB__SAFERING__LINE_OUT');
    expect(wiersz.rodzina).toBe('ABB__SAFERING');
  });

  it('buildSterowniki: tylko pola ze sterownikiem, cechy z etykietami PL', () => {
    const sterowniki = buildSterowniki([POLE_A, POLE_B, POLE_C]);
    expect(sterowniki.map((s) => s.bayRef)).toEqual(['bay-a', 'bay-b']);
    const cechaSync = sterowniki[0].cechy.find((c) => c.klucz === 'synchrocheck_enabled');
    expect(cechaSync?.etykieta).toBe(ETYKIETY_CECH.synchrocheck_enabled);
    expect(cechaSync?.aktywna).toBe(true);
    expect(sterowniki[0].cechy.find((c) => c.klucz === 'arc_protection_enabled')?.aktywna).toBe(false);
  });

  it('buildSterowniki: SPZ obecny → widok stanu; SPZ null → brak (uczciwe)', () => {
    const sterowniki = buildSterowniki([POLE_A, POLE_B]);
    expect(sterowniki[0].spz).not.toBeNull();
    expect(sterowniki[0].spz?.aktywny).toBe(true);
    expect(sterowniki[0].spz?.probySzybkie).toBe(1);
    expect(sterowniki[0].spz?.probyWolne).toBe(2);
    expect(sterowniki[0].spz?.stanEtykieta).toBe('Gotowe');
    expect(sterowniki[1].spz).toBeNull();
  });
});

describe('EkranZabezpieczenAutomatyki — nagłówek i stany zerowe', () => {
  it('nagłówek: eyebrow obszaru i zdanie celu inżynierskiego', () => {
    useAppStateStore.getState().setActiveProject('project-1', 'GPZ Wschód');
    render(<EkranZabezpieczenAutomatyki />);
    expect(screen.getByText(T.eyebrow)).toBeInTheDocument();
    expect(screen.getByText(T.cel)).toBeInTheDocument();
  });

  it('bez aktywnego projektu: stan zerowy z akcją prowadzącą do przestrzeni Projekt', async () => {
    const user = userEvent.setup();
    render(<EkranZabezpieczenAutomatyki />);

    expect(screen.getByTestId('mvd-za-brak-projektu')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-za-zabezpieczenia')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('mvd-za-brak-projektu-akcja'));
    expect(useShellStore.getState().activeSpace).toBe('projekt');
  });

  it('projekt bez pól w modelu: stan zerowy z akcją prowadzącą do Modelu sieci', async () => {
    const user = userEvent.setup();
    useAppStateStore.getState().setActiveProject('project-1', 'GPZ Wschód');
    ustawReadModel([]);
    render(<EkranZabezpieczenAutomatyki />);

    expect(screen.getByTestId('mvd-za-brak-pol')).toBeInTheDocument();
    await user.click(screen.getByTestId('mvd-za-brak-pol-akcja'));
    expect(useShellStore.getState().activeSpace).toBe('model');
  });
});

describe('EkranZabezpieczenAutomatyki — sekcja zabezpieczeń', () => {
  beforeEach(() => {
    useAppStateStore.getState().setActiveProject('project-1', 'GPZ Wschód');
  });

  it('tabela zabezpieczeń: wiersz per pole z urządzeniem i kodami funkcji', () => {
    render(<EkranZabezpieczenAutomatyki />);
    const tabela = screen.getByTestId('mvd-za-zabezpieczenia');
    expect(within(tabela).getByTestId('mvd-za-wiersz-bay-a')).toBeInTheDocument();
    expect(within(tabela).getByText('REF615')).toBeInTheDocument();
    expect(within(tabela).getByText('50, 51, 50N')).toBeInTheDocument();
  });

  it('pole bez zabezpieczenia: jawne „nie skonfigurowano" (bez fabrykacji)', () => {
    render(<EkranZabezpieczenAutomatyki />);
    expect(screen.getByTestId('mvd-za-bez-zabezpieczenia-bay-c')).toHaveTextContent(
      T.spzNieSkonfigurowano,
    );
  });

  it('akcja wiersza „Otwórz kartę pola" otwiera panel pola E-11 w store (realna ścieżka)', async () => {
    const user = userEvent.setup();
    render(<EkranZabezpieczenAutomatyki />);

    await user.click(screen.getByTestId('mvd-za-otworz-pole-bay-a'));

    const surface = useNetworkBuildStore.getState().activeSurface;
    expect(surface?.screenCode).toBe('E-11');
  });
});

describe('EkranZabezpieczenAutomatyki — sekcja automatyki', () => {
  beforeEach(() => {
    useAppStateStore.getState().setActiveProject('project-1', 'GPZ Wschód');
  });

  it('chipy funkcji automatyki: stan włączony/wyłączony z automation_features', () => {
    render(<EkranZabezpieczenAutomatyki />);
    const sync = screen.getByTestId('mvd-za-cecha-bay-a-synchrocheck_enabled');
    expect(sync).toHaveAttribute('data-aktywna', 'true');
    const arc = screen.getByTestId('mvd-za-cecha-bay-a-arc_protection_enabled');
    expect(arc).toHaveAttribute('data-aktywna', 'false');
  });

  it('SPZ: szczegóły stanu dla skonfigurowanego, „nie skonfigurowano" dla braku', () => {
    render(<EkranZabezpieczenAutomatyki />);
    expect(screen.getByTestId('mvd-za-spz-bay-a')).toHaveTextContent('Gotowe');
    expect(screen.getByTestId('mvd-za-spz-brak-bay-b')).toHaveTextContent(T.spzNieSkonfigurowano);
  });
});

describe('EkranZabezpieczenAutomatyki — następny krok', () => {
  it('akcja „Koordynacja zabezpieczeń" otwiera ekran E-28 w store', async () => {
    const user = userEvent.setup();
    useAppStateStore.getState().setActiveProject('project-1', 'GPZ Wschód');
    render(<EkranZabezpieczenAutomatyki />);

    await user.click(screen.getByTestId('mvd-za-nastepny'));
    expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-28');
  });
});
