/**
 * Tabela pól SN (karta KATALOG-PRZEJECIE-PR, „Pola SN" zamiast bilansu liczników).
 *
 * Iloczyn cech: sekcja {z polami, bez pól} × pole {tej stacji, innej stacji na tej samej szynie}
 * × rola {BKR z baterią / bez, ZU z zespołem / bez, inna} × akcja {Dodaj pole z rolą, Konfiguruj,
 * Usuń → Tak / Nie, odmowa backendu, Dodaj obiekt BKR / ZU} × kontekst sekcji {GPZ, stacja}.
 * Każda akcja ma trafić w istniejącą operację albo ekran z kontekstem (bez nowych formularzy).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import {
  TabelaPolSn,
  obiektPola,
  opisSprzeglaPola,
  polaSekcji,
  roleDodawanegoPola,
  sekcjaSasiednia,
} from '../cards/TabelaPolSn';

const executeDomainOperation = vi.fn();
const openOperationForm = vi.fn();
const openRouteSurface = vi.fn();
let currentSnapshot: Record<string, unknown> = {};

vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: unknown) => unknown) =>
    selector({ snapshot: currentSnapshot, executeDomainOperation }),
}));
vi.mock('../../app-state/store', () => ({ useActiveCaseId: () => 'case-1' }));
vi.mock('../networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (state: unknown) => unknown) => selector({ openOperationForm, openRouteSurface }),
}));
vi.mock('../../field/useFieldReadModel', () => ({
  useFieldReadModel: () => ({
    itemsByBayRef: new Map([
      ['pole-wy', { canonical_model: { base_model: { equipment_data_state: 'MODEL' } } }],
      ['pole-bkr', { canonical_model: { base_model: { equipment_data_state: 'PROPOZYCJA' } } }],
    ]),
  }),
}));
vi.mock('../../catalog/api', () => ({
  fetchSwitchgearFamilies: () => Promise.resolve([{ switchgear_family_ref: 'rodzina-1', family_name: 'Rozdzielnica X' }]),
  fetchMvApparatusTypes: () => Promise.resolve([{ id: 'aparat-1', name: 'Wyłącznik Y 630 A' }]),
}));

function pole(ref: string, rola: string, nadpisz: Record<string, unknown> = {}) {
  return { ref_id: ref, name: `Pole ${ref}`, bay_role: rola, bus_ref: 's1', substation_ref: 'st', equipment_refs: [], tags: [], meta: {}, ...nadpisz };
}

beforeEach(() => {
  executeDomainOperation.mockReset();
  executeDomainOperation.mockResolvedValue({ error: null });
  openOperationForm.mockReset();
  openRouteSurface.mockReset();
  currentSnapshot = {
    buses: [{ ref_id: 'zacisk-bkr', voltage_kv: 15 }],
    bays: [
      pole('pole-wy', 'OUT', { switchgear_family_ref: 'rodzina-1' }),
      pole('pole-bkr', 'BKR', { terminal_bus_ref: 'zacisk-bkr', apparatus_catalog_ref: 'aparat-1' }),
      pole('pole-zu', 'ZU', { terminal_bus_ref: 'zacisk-zu' }),
      // Pole innej stacji na szynie o tym samym refie nie należy do tej rozdzielnicy.
      pole('pole-obce', 'OUT', { substation_ref: 'inna' }),
      pole('pole-s2', 'TR', { bus_ref: 's2' }),
    ],
    shunt_capacitors: [],
    zespoly_uziemiajace: [],
  };
});

const SEKCJE = [
  { busRef: 's1', etykieta: 'Sekcja 1', gpzSectionId: 'sek-1', sprzegla: ['Sprzęgło S1-S2'] },
  { busRef: 's3', etykieta: 'Sekcja 3' },
];

describe('TabelaPolSn — pola z modelu', () => {
  it('pola tej stacji na szynie sekcji w kolejności modelu; pusta sekcja mówi to wprost', () => {
    render(<TabelaPolSn stationRef="st" sekcje={SEKCJE} />);
    const s1 = screen.getByTestId('tabela-pol-sn-sekcja-s1');
    const wiersze = within(s1).getAllByTestId(/^tabela-pol-sn-wiersz-/).map((w) => w.getAttribute('data-testid'));
    expect(wiersze).toEqual(['tabela-pol-sn-wiersz-pole-wy', 'tabela-pol-sn-wiersz-pole-bkr', 'tabela-pol-sn-wiersz-pole-zu']);
    expect(screen.getByTestId('tabela-pol-sn-pusta-s3')).toHaveTextContent('Sekcja nie ma pól w modelu.');
    expect(s1).toHaveTextContent('Sprzęgło: Sprzęgło S1-S2');
  });

  it('rola z kanonu, wyrób z katalogu (bez identyfikatorów), stan wyposażenia z odczytu pól', async () => {
    render(<TabelaPolSn stationRef="st" sekcje={SEKCJE} />);
    expect(screen.getByTestId('tabela-pol-sn-rola-pola-pole-wy')).toHaveTextContent('Pole liniowe wyjściowe');
    expect(screen.getByTestId('tabela-pol-sn-rola-pola-pole-bkr')).toHaveTextContent('Pole baterii kondensatorów');
    await waitFor(() => expect(screen.getByTestId('tabela-pol-sn-wiersz-pole-wy')).toHaveTextContent('Rozdzielnica X'));
    expect(screen.getByTestId('tabela-pol-sn-wiersz-pole-wy')).toHaveTextContent('Dane z katalogu');
    expect(screen.getByTestId('tabela-pol-sn-wiersz-pole-bkr')).toHaveTextContent('Wyłącznik Y 630 A');
    expect(screen.getByTestId('tabela-pol-sn-wiersz-pole-bkr')).toHaveTextContent('Propozycja');
    expect(screen.getByTestId('tabela-pol-sn-wiersz-pole-zu')).toHaveTextContent('wyposażenie: brak odczytu');
    expect(screen.getByTestId('tabela-pol-sn-wiersz-pole-zu')).not.toHaveTextContent('rodzina-1');
  });

  it('polaSekcji: filtr stacja × szyna', () => {
    expect(polaSekcji(currentSnapshot as never, 'st', 's1').map((b) => b.ref_id)).toEqual(['pole-wy', 'pole-bkr', 'pole-zu']);
    expect(polaSekcji(currentSnapshot as never, 'inna', 's1').map((b) => b.ref_id)).toEqual(['pole-obce']);
  });
});

describe('TabelaPolSn — Dodaj pole', () => {
  it('sprzęgło na liście ról wyłącznie przy ≥ 2 sekcjach (łączy dwie szyny sekcji)', () => {
    expect(roleDodawanegoPola(1).map((o) => o.value)).not.toContain('COUPLER');
    expect(roleDodawanegoPola(2).map((o) => o.value)).toContain('COUPLER');
    render(<TabelaPolSn stationRef="st" sekcje={SEKCJE} />);
    const opcje = Array.from((screen.getByTestId('tabela-pol-sn-rola-s1') as HTMLSelectElement).options).map((o) => o.value);
    expect(opcje).toContain('COUPLER');
    expect(opcje).toEqual(expect.arrayContaining(['OUT', 'IN', 'FEEDER', 'TR', 'MEASUREMENT', 'OZE', 'BKR', 'ZU']));
  });

  it('jedna sekcja: brak roli sprzęgła w wyborze', () => {
    render(<TabelaPolSn stationRef="st" sekcje={[SEKCJE[0]]} />);
    const opcje = Array.from((screen.getByTestId('tabela-pol-sn-rola-s1') as HTMLSelectElement).options).map((o) => o.value);
    expect(opcje).not.toContain('COUPLER');
  });

  it.each([
    ['s1', { bus_ref: 's1', station_ref: 'st', gpz_section_id: 'sek-1', bay_role: 'COUPLER', coupled_bus_ref: 's3', coupler_normal_state: 'closed' }],
    ['s3', { bus_ref: 's3', station_ref: 'st', bay_role: 'COUPLER', coupled_bus_ref: 's1', coupler_normal_state: 'closed' }],
  ])('sprzęgło z sekcji %s → kreator z sekcją sąsiednią po drugiej stronie i stanem zamkniętym', (bus, kontekst) => {
    render(<TabelaPolSn stationRef="st" sekcje={SEKCJE} />);
    fireEvent.change(screen.getByTestId(`tabela-pol-sn-rola-${bus}`), { target: { value: 'COUPLER' } });
    fireEvent.click(screen.getByTestId(`tabela-pol-sn-dodaj-${bus}`));
    expect(openOperationForm).toHaveBeenCalledWith('add_sn_bay', kontekst);
  });

  it('sekcjaSasiednia: następna, dla ostatniej poprzednia, nieznana → brak', () => {
    const trzy = [...SEKCJE, { busRef: 's4', etykieta: 'Sekcja 4' }];
    expect(sekcjaSasiednia(trzy, 's1')?.busRef).toBe('s3');
    expect(sekcjaSasiednia(trzy, 's3')?.busRef).toBe('s4');
    expect(sekcjaSasiednia(trzy, 's4')?.busRef).toBe('s3');
    expect(sekcjaSasiednia(trzy, 'x')).toBeUndefined();
    expect(sekcjaSasiednia([SEKCJE[0]], 's1')).toBeUndefined();
  });

  it.each([
    ['s1', 'BKR', { bus_ref: 's1', station_ref: 'st', gpz_section_id: 'sek-1', bay_role: 'BKR' }],
    ['s3', 'ZU', { bus_ref: 's3', station_ref: 'st', bay_role: 'ZU' }],
  ])('sekcja %s z rolą %s → kreator add_sn_bay z szyną, stacją, sekcją i rolą', (bus, rola, kontekst) => {
    render(<TabelaPolSn stationRef="st" sekcje={SEKCJE} />);
    fireEvent.change(screen.getByTestId(`tabela-pol-sn-rola-${bus}`), { target: { value: rola } });
    fireEvent.click(screen.getByTestId(`tabela-pol-sn-dodaj-${bus}`));
    expect(openOperationForm).toHaveBeenCalledWith('add_sn_bay', kontekst);
  });

  it('bez wyboru roli: pierwsza rola listy (pole liniowe wyjściowe)', () => {
    render(<TabelaPolSn stationRef="st" sekcje={SEKCJE} />);
    fireEvent.click(screen.getByTestId('tabela-pol-sn-dodaj-s1'));
    expect(openOperationForm).toHaveBeenCalledWith('add_sn_bay', expect.objectContaining({ bay_role: 'OUT' }));
  });
});

describe('TabelaPolSn — obiekt pola BKR/ZU', () => {
  it('brak obiektu → akcja dodania istniejącym kreatorem przypiętym do pola', () => {
    render(<TabelaPolSn stationRef="st" sekcje={SEKCJE} />);
    fireEvent.click(screen.getByTestId('tabela-pol-sn-dodaj-obiekt-pole-bkr'));
    expect(openOperationForm).toHaveBeenCalledWith('add_shunt_compensator_sn', {
      bus_ref: 'zacisk-bkr',
      bus_name: 'Pole pole-bkr',
      bus_voltage_kv: 15,
    });
    fireEvent.click(screen.getByTestId('tabela-pol-sn-dodaj-obiekt-pole-zu'));
    expect(openOperationForm).toHaveBeenCalledWith('add_zespol_uziemiajacy_sn', { bay_ref: 'pole-zu', bay_name: 'Pole pole-zu' });
    expect(screen.queryByTestId('tabela-pol-sn-obiekt-pole-wy')).not.toBeInTheDocument();
  });

  it('obiekt w modelu → jego nazwa zamiast akcji', () => {
    currentSnapshot = {
      ...currentSnapshot,
      shunt_capacitors: [{ ref_id: 'bat', name: 'BK 1', bus_ref: 'zacisk-bkr' }],
      zespoly_uziemiajace: [{ ref_id: 'zu', name: 'ZU 1', bus_ref: 'zacisk-zu', bay_ref: 'pole-zu' }],
    };
    render(<TabelaPolSn stationRef="st" sekcje={SEKCJE} />);
    expect(screen.getByTestId('tabela-pol-sn-obiekt-pole-bkr')).toHaveTextContent('BK 1');
    expect(screen.getByTestId('tabela-pol-sn-obiekt-pole-zu')).toHaveTextContent('ZU 1');
    expect(screen.queryByTestId('tabela-pol-sn-dodaj-obiekt-pole-bkr')).not.toBeInTheDocument();
  });

  it('obiektPola: bateria na innej szynie niż zacisk pola nie jest obiektem pola', () => {
    const snap = { shunt_capacitors: [{ ref_id: 'b', name: 'BK obca', bus_ref: 's1' }] };
    expect(obiektPola(snap as never, pole('x', 'BKR', { terminal_bus_ref: 'zacisk-bkr' }) as never)).toEqual({ rodzaj: 'BKR', nazwa: null });
    expect(obiektPola(snap as never, pole('x', 'OUT') as never)).toBeNull();
  });
});

describe('TabelaPolSn — Konfiguruj i Usuń', () => {
  it('Konfiguruj → karta pola E-11 tego pola', () => {
    render(<TabelaPolSn stationRef="st" sekcje={SEKCJE} />);
    fireEvent.click(screen.getByTestId('tabela-pol-sn-konfiguruj-pole-wy'));
    expect(openRouteSurface).toHaveBeenCalledWith('E-11', { entityRef: 'pole-wy', subjectKind: 'helper_context' });
  });

  it('Usuń → Tak = delete_element; Nie = bez operacji', async () => {
    render(<TabelaPolSn stationRef="st" sekcje={SEKCJE} />);
    fireEvent.click(screen.getByTestId('tabela-pol-sn-usun-pole-wy'));
    fireEvent.click(screen.getByTestId('tabela-pol-sn-usun-nie-pole-wy'));
    expect(executeDomainOperation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('tabela-pol-sn-usun-pole-wy'));
    fireEvent.click(screen.getByTestId('tabela-pol-sn-usun-tak-pole-wy'));
    await waitFor(() =>
      expect(executeDomainOperation).toHaveBeenCalledWith('case-1', 'delete_element', { element_ref: 'pole-wy' }),
    );
  });

  it('odmowa backendu (pole z zależnościami) wraca w tabeli', async () => {
    executeDomainOperation.mockResolvedValue({ error: 'Pole nie może zostać usunięte — ma odcinek.' });
    render(<TabelaPolSn stationRef="st" sekcje={SEKCJE} />);
    fireEvent.click(screen.getByTestId('tabela-pol-sn-usun-pole-wy'));
    fireEvent.click(screen.getByTestId('tabela-pol-sn-usun-tak-pole-wy'));
    expect(await screen.findByTestId('tabela-pol-sn-blad')).toHaveTextContent('ma odcinek');
  });
});

describe('TabelaPolSn — opis pola sprzęgła z modelu', () => {
  const sprzeglo = pole('pole-sp', 'COUPLER', { equipment_refs: ['sp-1'] });
  it.each([
    ['open', undefined, 'Łączy z: Sekcja 3 · normalnie otwarte'],
    ['closed', 'open', 'Łączy z: Sekcja 3 · normalnie zamknięte'],
    [undefined, 'open', 'Łączy z: Sekcja 3 · normalnie otwarte'],
  ])('stan normalny %s (stan bieżący %s) → %s', (normal, status, opis) => {
    const snap = {
      ...currentSnapshot,
      branches: [{ ref_id: 'sp-1', type: 'bus_coupler', from_bus_ref: 's3', to_bus_ref: 's1', status: status ?? 'closed', ...(normal ? { normal_state: normal } : {}) }],
    };
    expect(opisSprzeglaPola(snap as never, sprzeglo as never, SEKCJE)).toBe(opis);
  });

  it('pole sprzęgła bez gałęzi sprzęgła mówi to wprost; inne pole — brak opisu', () => {
    expect(opisSprzeglaPola({ ...currentSnapshot, branches: [] } as never, sprzeglo as never, SEKCJE)).toBe(
      'Brak sprzęgła między sekcjami',
    );
    expect(opisSprzeglaPola(currentSnapshot as never, pole('x', 'OUT') as never, SEKCJE)).toBeNull();
  });

  it('wiersz pola sprzęgła pokazuje opis w tabeli', () => {
    currentSnapshot = {
      ...currentSnapshot,
      bays: [sprzeglo],
      branches: [{ ref_id: 'sp-1', type: 'bus_coupler', from_bus_ref: 's1', to_bus_ref: 's3', status: 'open', normal_state: 'open' }],
    };
    render(<TabelaPolSn stationRef="st" sekcje={SEKCJE} />);
    expect(screen.getByTestId('tabela-pol-sn-sprzeglo-pole-sp')).toHaveTextContent('Łączy z: Sekcja 3 · normalnie otwarte');
  });
});
