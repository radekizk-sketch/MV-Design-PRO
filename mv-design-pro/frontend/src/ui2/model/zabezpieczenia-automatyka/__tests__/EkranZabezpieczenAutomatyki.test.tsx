/**
 * Testy ekranu „Zabezpieczenia i automatyka" (E-27, realny dostawca ui2) — karta
 * OCHRONA-JEDNO-ZRODLO (ADR-022): jedna tabela sterowników (sterownik = wiersz), automatyka jako
 * funkcje tego samego sterownika (SPZ = funkcja 79), edytor nastaw w rozwinięciu wiersza.
 *
 * Wejście: PRAWDZIWY model sieci złotej G08 (migawka z generatora fikstur harnessu: pola szablonu
 * ze sterownikami bez nastaw, pole GPZ i pola nN bez sterownika, dwa sterowniki wyłączników
 * liniowych z nastawami) i PRAWDZIWY read model `protection-view` tego modelu. Read model pola
 * (`useFieldReadModel`) jest reużyty BEZ ZMIAN — podmieniony wyłącznie jego wynik, zbudowany z tej
 * samej migawki tak jak backend (`base_model.zabezpieczenie` = sterownik pola z
 * `protection_assignments`, `enm.zabezpieczenie.sterownik_pola`). Granica HTTP read modelu
 * zabezpieczeń (`fetchProtectionView`) podmieniona danymi generatora. Interakcje natywne
 * (userEvent.click) — dyrektywa Zero-Debt pkt 5.
 *
 * Iloczyn cech: {pole ze sterownikiem, bez sterownika, sterownik wyłącznika liniowego bez pola} ×
 * {SPZ: brak funkcji 79, włączona z cyklami, włączona bez nastawy cykli, wyłączona} × {funkcja
 * włączona, wyłączona} × {grupa aktywna 1, inna} × {jeden sterownik (rozwinięty od razu), wiele (na
 * żądanie)} × {wyłącznik liniowy bez przekładnika, z przekładnikiem bez sterownika, kompletny} ×
 * {odczyt read modelu udany, błąd} × {brak projektu, brak pól i sterowników}.
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../ui/app-state';
import { useNetworkBuildStore } from '../../../../ui/network-build/networkBuildStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { sterownikPola } from '../../../../ui/shared/sterownikZabezpieczen';
import { sterownikTestowy } from '../../../../test/sterownik';
import type { Bay, EnergyNetworkModel, ProtectionAssignment } from '../../../../types/enm';
import { useShellStore } from '../../../shell/useShellStore';

// Reużycie hooka read-modelu pola BEZ ZMIAN: nadpisujemy tylko jego wynik.
vi.mock('../../../../ui/field/useFieldReadModel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../ui/field/useFieldReadModel')>();
  return { ...actual, useFieldReadModel: vi.fn() };
});

// Read model zabezpieczeń: hook `useProtectionView` realny, podmieniona wyłącznie granica HTTP.
vi.mock('../../../../ui/protection/protection-view', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../ui/protection/protection-view')>();
  return { ...actual, fetchProtectionView: vi.fn() };
});

import { useFieldReadModel, type FieldReadModelItem, type FieldReadModelView } from '../../../../ui/field/useFieldReadModel';
import { fetchProtectionView, type ProtectionViewResponse } from '../../../../ui/protection/protection-view';
import migawkaSceny from '../../../../harness-fixtures/generated/koordynacja_scena_migawka.json';
import widokSceny from '../../../../harness-fixtures/generated/koordynacja_scena_widok_zabezpieczen.json';
import { EkranZabezpieczenAutomatyki } from '../EkranZabezpieczenAutomatyki';
import { buildWierszeZabezpieczen } from '../model';
import { ZABEZPIECZENIA_STRINGS as T } from '../strings';

const MIGAWKA = migawkaSceny as unknown as EnergyNetworkModel;
const WIDOK = widokSceny as unknown as ProtectionViewResponse;
const mockReadModel = vi.mocked(useFieldReadModel);
const mockWidok = vi.mocked(fetchProtectionView);

/** Rekord read modelu pola z migawki — sterownik pola tak jak backend (`sterownik_pola`). */
function poleReadModelu(model: EnergyNetworkModel, bay: Bay): FieldReadModelItem {
  return {
    bay_id: bay.ref_id,
    bay_ref: bay.ref_id,
    bay_name: bay.name,
    canonical_model: {
      base_model: {
        bay_ref: bay.ref_id,
        zabezpieczenie: sterownikPola(model, bay.ref_id),
        bay_template_ref: bay.bay_template_ref ?? null,
        switchgear_family_ref: bay.switchgear_family_ref ?? null,
      },
    },
  } as unknown as FieldReadModelItem;
}

function polaModelu(model: EnergyNetworkModel): FieldReadModelItem[] {
  return (model.bays ?? []).map((b) => poleReadModelu(model, b));
}

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

/** Model i read model pola z jednego źródła — żaden test nie rozjeżdża ich ręcznie. */
function ustawModel(model: EnergyNetworkModel | null) {
  useSnapshotStore.setState({ snapshot: model, error: null } as never);
  ustawReadModel(model ? polaModelu(model) : []);
}

/** Wariant sieci złotej: sterownik pola zastąpiony podanym (ten sam `bay_ref`). */
function zSterownikiemPola(sterownik: ProtectionAssignment): EnergyNetworkModel {
  return {
    ...MIGAWKA,
    protection_assignments: [
      ...MIGAWKA.protection_assignments!.filter((p) => p.bay_ref !== sterownik.bay_ref),
      sterownik,
    ],
  };
}

const POLE_STEROWNIKA = MIGAWKA.protection_assignments!.find((p) => p.bay_ref)!.bay_ref!;
const LINIOWE = MIGAWKA.protection_assignments!.filter((p) => !p.bay_ref);
const POLE_BEZ_STEROWNIKA = MIGAWKA.bays!.find((b) => !sterownikPola(MIGAWKA, b.ref_id))!;

let licznikPrzypadkow = 0;
const otworzFormularz = vi.fn();

beforeEach(() => {
  useAppStateStore.getState().reset();
  useNetworkBuildStore.getState().reset();
  useShellStore.setState({ activeSpace: 'wyniki' });
  ustawModel(MIGAWKA);
  mockWidok.mockResolvedValue(WIDOK);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function aktywujProjekt() {
  // Osobny przypadek na test — pamięć podręczna read modelu jest kluczowana przypadkiem.
  licznikPrzypadkow += 1;
  useAppStateStore.getState().setActiveProject('projekt-za', 'Projekt');
  useAppStateStore.getState().setActiveCase(`case-za-${licznikPrzypadkow}`, 'Wariant bazowy');
  // Zmiana przypadku czyści migawkę magazynu (inny przypadek = inny model) — model sieci złotej
  // wraca po aktywacji, jak po odczycie przypadku w aplikacji.
  ustawModel(MIGAWKA);
}

describe('model.ts — wiersze z modelu (bez fabrykacji)', () => {
  it('każde pole read modelu i każdy sterownik wyłącznika liniowego — kolejność deterministyczna', () => {
    const wiersze = buildWierszeZabezpieczen(polaModelu(MIGAWKA), MIGAWKA);
    const pola = [...MIGAWKA.bays!].map((b) => b.ref_id).sort((a, b) => a.localeCompare(b));
    expect(wiersze.map((w) => w.klucz)).toEqual([...pola, ...LINIOWE.map((s) => s.ref_id).sort()]);
    // Odwrócona kolejność wejścia daje te same wiersze (determinizm).
    expect(buildWierszeZabezpieczen([...polaModelu(MIGAWKA)].reverse(), MIGAWKA)).toEqual(wiersze);
    for (const w of wiersze.filter((x) => x.bayRef !== null)) {
      const s = sterownikPola(MIGAWKA, w.bayRef);
      expect(w.sterownikRef).toBe(s?.ref_id ?? null);
      expect(w.funkcje).toEqual(s ? s.funkcje.map((f) => f.kod) : []);
    }
  });

  it('stacja pola w wierszu: nazwy pól powtarzają się między stacjami, para (stacja, pole) jest jednoznaczna', () => {
    const wiersze = buildWierszeZabezpieczen(polaModelu(MIGAWKA), MIGAWKA).filter((w) => w.bayRef !== null);
    const nazwy = wiersze.map((w) => w.nazwa);
    // Warunek testu (nie pusta wyrocznia): sieć złota ma pola o tej samej nazwie w różnych stacjach.
    expect(new Set(nazwy).size).toBeLessThan(nazwy.length);
    for (const w of wiersze) {
      const wlasciciel = MIGAWKA.bays!.find((b) => b.ref_id === w.bayRef)!.substation_ref;
      const stacja = MIGAWKA.substations.find((st) => st.ref_id === wlasciciel);
      // Wyrocznia: pole stacji obecnej w modelu ma stację w wierszu; bez stacji — jawne `null`.
      expect(w.stacja === null).toBe(stacja === undefined);
    }
    const pary = wiersze.map((w) => `${w.stacja} · ${w.nazwa}`);
    expect(new Set(pary).size).toBe(pary.length);
    expect(buildWierszeZabezpieczen([], MIGAWKA).every((w) => w.stacja === null)).toBe(true);
  });

  it('sterownik wyłącznika liniowego: nazwa gałęzi wyłącznika, urządzenie z katalogu', () => {
    const wiersze = buildWierszeZabezpieczen([], MIGAWKA);
    expect(wiersze).toHaveLength(LINIOWE.length);
    for (const w of wiersze) {
      const s = LINIOWE.find((x) => x.ref_id === w.klucz)!;
      const wylacznik = s.macierz_wyzwolen[0].aparat_refs[0];
      expect(w.bayRef).toBeNull();
      expect(w.nazwa).toBe(MIGAWKA.branches.find((b) => b.ref_id === wylacznik)!.name);
      expect(w.urzadzenie).toBe(s.materialized_params!.name_pl);
    }
  });

  it('pole bez sterownika → brak urządzenia, funkcji, grupy i SPZ (uczciwie, nie zero)', () => {
    const [wiersz] = buildWierszeZabezpieczen([poleReadModelu(MIGAWKA, POLE_BEZ_STEROWNIKA)], MIGAWKA);
    expect(wiersz).toMatchObject({ sterownikRef: null, urzadzenie: null, funkcje: [], aktywnaGrupa: null, spz: null });
  });

  it.each([
    ['brak funkcji 79', { kody: ['51'] }, null],
    ['79 włączona z dwoma cyklami', { kody: ['51', '79'], nastawy: { '79': { liczba_cykli: 2 } } }, { wlaczone: true, cykle: 2 }],
    ['79 włączona bez nastawy cykli', { kody: ['51', '79'] }, { wlaczone: true, cykle: null }],
    ['79 wyłączona', { kody: ['51', '79'], wylaczone: ['79'], nastawy: { '79': { liczba_cykli: 1 } } }, { wlaczone: false, cykle: 1 }],
  ] as const)('SPZ z funkcji 79 sterownika: %s', (_opis, dane, spz) => {
    const sterownik = sterownikTestowy({ bayRef: POLE_STEROWNIKA, ...dane });
    const model = zSterownikiemPola(sterownik);
    const wiersz = buildWierszeZabezpieczen(polaModelu(model), model).find((w) => w.klucz === POLE_STEROWNIKA)!;
    expect(wiersz.spz).toEqual(spz);
  });

  it('funkcja wyłączona nie jest na liście funkcji; grupa aktywna z modelu', () => {
    const sterownik = sterownikTestowy({ bayRef: POLE_STEROWNIKA, kody: ['51', '50', '51N'], wylaczone: ['50'], aktywnaGrupa: 3 });
    const model = zSterownikiemPola(sterownik);
    const wiersz = buildWierszeZabezpieczen(polaModelu(model), model).find((w) => w.klucz === POLE_STEROWNIKA)!;
    expect(wiersz.funkcje).toEqual(['51', '51N']);
    expect(wiersz.aktywnaGrupa).toBe(3);
  });

  it('szablon pola i rodzina producenta (Reference Engine) przechodzą z rekordu pola', () => {
    const bay = { ...POLE_BEZ_STEROWNIKA, bay_template_ref: 'ABB__SAFERING__LINE_OUT', switchgear_family_ref: 'ABB__SAFERING' };
    const [wiersz] = buildWierszeZabezpieczen([poleReadModelu(MIGAWKA, bay as Bay)], MIGAWKA);
    expect(wiersz.szablon).toBe('ABB__SAFERING__LINE_OUT');
    expect(wiersz.rodzina).toBe('ABB__SAFERING');
  });
});

describe('EkranZabezpieczenAutomatyki — nagłówek i stany zerowe', () => {
  it('nagłówek: eyebrow obszaru i zdanie celu inżynierskiego', () => {
    aktywujProjekt();
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

  it('projekt bez pól i bez sterowników: stan zerowy z akcją prowadzącą do Modelu sieci', async () => {
    const user = userEvent.setup();
    aktywujProjekt();
    ustawModel(null);
    mockWidok.mockResolvedValue({ ...WIDOK, assignments: [], wylaczniki_liniowe: [] });
    render(<EkranZabezpieczenAutomatyki />);
    expect(screen.getByTestId('mvd-za-brak-pol')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-za-nastepny')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('mvd-za-brak-pol-akcja'));
    expect(useShellStore.getState().activeSpace).toBe('model');
  });

  it('sieć bez pól rozdzielni, ze sterownikami wyłączników liniowych — tabela zamiast stanu zerowego', async () => {
    aktywujProjekt();
    ustawReadModel([]);
    render(<EkranZabezpieczenAutomatyki />);
    expect(screen.queryByTestId('mvd-za-brak-pol')).not.toBeInTheDocument();
    for (const s of LINIOWE) expect(screen.getByTestId(`mvd-za-wiersz-${s.ref_id}`)).toBeInTheDocument();
  });
});

describe('EkranZabezpieczenAutomatyki — tabela sterowników', () => {
  beforeEach(() => {
    aktywujProjekt();
    useNetworkBuildStore.setState({ openOperationForm: otworzFormularz });
  });

  it('wiersz sterownika: urządzenie, funkcje, grupa, SPZ; wiele sterowników — edytory zwinięte', () => {
    render(<EkranZabezpieczenAutomatyki />);
    const [s] = LINIOWE;
    const wiersz = screen.getByTestId(`mvd-za-wiersz-${s.ref_id}`);
    expect(wiersz).toHaveTextContent(String(s.materialized_params!.name_pl));
    expect(within(wiersz).getByTestId(`mvd-za-funkcje-${s.ref_id}`)).toHaveTextContent(s.funkcje.map((f) => f.kod).join(', '));
    expect(within(wiersz).getByTestId(`mvd-za-spz-${s.ref_id}`)).toHaveTextContent('—');
    expect(screen.queryByTestId(/^mvd-za-edytor-/)).toBeNull();
  });

  it('„Nastawy" natywnym klikiem rozwija edytor sterownika z nastawami read modelu; drugi klik zwija', async () => {
    const user = userEvent.setup();
    render(<EkranZabezpieczenAutomatyki />);
    const [s] = LINIOWE;
    const przycisk = screen.getByTestId(`mvd-za-nastawy-${s.ref_id}`);
    expect(przycisk).toHaveAttribute('aria-expanded', 'false');
    await user.click(przycisk);
    expect(przycisk).toHaveAttribute('aria-expanded', 'true');
    const edytor = await screen.findByTestId(`mvd-za-edytor-${s.ref_id}`);
    expect(within(edytor).getByTestId(`mvd-za-edytor-${s.ref_id}-przekladnia`)).toHaveTextContent('600/5 A 5P20');
    expect(await within(edytor).findByTestId(`mvd-za-edytor-${s.ref_id}-gotowe`)).toBeInTheDocument();
    await user.click(przycisk);
    expect(screen.queryByTestId(`mvd-za-edytor-${s.ref_id}`)).toBeNull();
  });

  it('jeden sterownik w modelu — edytor rozwinięty od razu (zero kliknięć do nastaw)', async () => {
    aktywujProjekt();
    const [s] = LINIOWE;
    ustawModel({ ...MIGAWKA, bays: [], protection_assignments: [s] });
    render(<EkranZabezpieczenAutomatyki />);
    expect(await screen.findByTestId(`mvd-za-edytor-${s.ref_id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`mvd-za-nastawy-${s.ref_id}`)).toHaveAttribute('aria-expanded', 'true');
  });

  it('pole bez sterownika: jawne „bez sterownika" i „Dodaj sterownik" z kotwicą pola', async () => {
    const user = userEvent.setup();
    render(<EkranZabezpieczenAutomatyki />);
    const ref = POLE_BEZ_STEROWNIKA.ref_id;
    expect(screen.getByTestId(`mvd-za-bez-zabezpieczenia-${ref}`)).toHaveTextContent(T.bezSterownika);
    expect(screen.queryByTestId(`mvd-za-nastawy-${ref}`)).toBeNull();
    await user.click(screen.getByTestId(`mvd-za-dodaj-sterownik-${ref}`));
    expect(otworzFormularz).toHaveBeenCalledWith('add_relay', { bay_ref: ref });
  });

  it('SPZ sterownika pola w kolumnie — wartości z nastaw funkcji 79 grupy aktywnej', () => {
    aktywujProjekt();
    const sterownik = sterownikTestowy({ bayRef: POLE_STEROWNIKA, kody: ['51', '79'], nastawy: { '79': { liczba_cykli: 2 } } });
    ustawModel(zSterownikiemPola(sterownik));
    render(<EkranZabezpieczenAutomatyki />);
    expect(screen.getByTestId(`mvd-za-spz-${POLE_STEROWNIKA}`)).toHaveTextContent(T.spzWlaczone(2));
  });

  it('akcja wiersza „Karta pola" otwiera panel pola E-11 (realna ścieżka store)', async () => {
    const user = userEvent.setup();
    render(<EkranZabezpieczenAutomatyki />);
    await user.click(screen.getByTestId(`mvd-za-otworz-pole-${POLE_STEROWNIKA}`));
    expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-11');
  });

  it('akcja „Koordynacja zabezpieczeń" otwiera ekran E-28', async () => {
    const user = userEvent.setup();
    render(<EkranZabezpieczenAutomatyki />);
    await user.click(screen.getByTestId('mvd-za-nastepny'));
    expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-28');
  });

  it('błąd odczytu read modelu nastaw — komunikat z przyczyną', async () => {
    mockWidok.mockRejectedValue(new Error('HTTP 500'));
    render(<EkranZabezpieczenAutomatyki />);
    expect(await screen.findByTestId('mvd-za-nastawy-blad')).toHaveTextContent('HTTP 500');
  });
});

/**
 * Wyłączniki liniowe bez sterownika (prowadzenie do kreatorów). Sieć złota ma przy obu wyłącznikach
 * liniowych SN przekładnik i sterownik; stany „bez przekładnika" i „bez sterownika" to zmiana JEDNEGO
 * pola realnego wiersza read modelu.
 */
describe('EkranZabezpieczenAutomatyki — wyłączniki liniowe bez sterownika', () => {
  const [KOMPLETNY] = WIDOK.wylaczniki_liniowe!.filter((w) => w.zabezpieczenia.length > 0);

  beforeEach(() => {
    aktywujProjekt();
    useNetworkBuildStore.setState({ openOperationForm: otworzFormularz });
  });

  it('wyłącznik bez przekładnika → „Dodaj przekładnik" z kotwicą wyłącznika', async () => {
    const bezCt = { ...KOMPLETNY, przekladniki: [], zabezpieczenia: [] };
    mockWidok.mockResolvedValue({ ...WIDOK, wylaczniki_liniowe: [bezCt] });
    render(<EkranZabezpieczenAutomatyki />);
    const wiersz = await screen.findByTestId(`mvd-za-wylacznik-${bezCt.ref_id}`);
    expect(within(wiersz).queryByTestId(`mvd-za-dodaj-zabezpieczenie-${bezCt.ref_id}`)).toBeNull();
    await userEvent.click(within(wiersz).getByTestId(`mvd-za-dodaj-ct-${bezCt.ref_id}`));
    expect(otworzFormularz).toHaveBeenCalledWith('add_ct', { kotwica: 'wylacznik', breaker_ref: bezCt.ref_id });
  });

  it('wyłącznik z przekładnikiem bez sterownika → „Dodaj sterownik" z kotwicą wyłącznika', async () => {
    const bezSterownika = { ...KOMPLETNY, zabezpieczenia: [] };
    mockWidok.mockResolvedValue({ ...WIDOK, wylaczniki_liniowe: [bezSterownika] });
    render(<EkranZabezpieczenAutomatyki />);
    const wiersz = await screen.findByTestId(`mvd-za-wylacznik-${KOMPLETNY.ref_id}`);
    expect(within(wiersz).queryByTestId(`mvd-za-dodaj-ct-${KOMPLETNY.ref_id}`)).toBeNull();
    await userEvent.click(within(wiersz).getByTestId(`mvd-za-dodaj-zabezpieczenie-${KOMPLETNY.ref_id}`));
    expect(otworzFormularz).toHaveBeenCalledWith('add_relay', { kotwica: 'wylacznik', breaker_ref: KOMPLETNY.ref_id });
  });

  it('wyłączniki kompletne — sekcji prowadzenia nie ma (sterownik jest wierszem tabeli)', async () => {
    render(<EkranZabezpieczenAutomatyki />);
    // Read model wczytany (wynik odczytu widoczny w edytorze) — sekcja prowadzenia nadal nieobecna.
    await userEvent.click(screen.getByTestId(`mvd-za-nastawy-${LINIOWE[0].ref_id}`));
    expect(await screen.findByTestId(`mvd-za-edytor-${LINIOWE[0].ref_id}-gotowe`)).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-za-wylaczniki')).toBeNull();
  });
});
