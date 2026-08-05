import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { PulpitProjektu } from '../PulpitProjektu';
import { PULPIT_STRINGS } from '../strings';
import { INSPECTOR_STRINGS } from '../../../inspector';
import { useAppStateStore } from '../../../../ui/app-state';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { useStudyCasesStore } from '../../../../ui/study-cases/store';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import {
  snapshotFixture,
  readinessZBlokadami,
  caseListItem,
  activeCaseFixture,
  runFixture,
} from './fixtures';

function ustawGotowy() {
  useSnapshotStore.setState({
    snapshot: snapshotFixture(),
    readiness: readinessZBlokadami(),
    loading: false,
  });
  useStudyCasesStore.setState({
    cases: [
      caseListItem('K1', 'Stan normalny', 'FRESH'),
      caseListItem('K2', 'Zwarcia maks.', 'OUTDATED', { is_active: true }),
    ],
    activeCase: activeCaseFixture('FRESH'),
  });
  useExecutionRunsStore.setState({
    runs: [runFixture({ started_at: '2026-07-15T14:32:00Z', status: 'DONE' })],
    activeStudyCaseId: 'K2',
  });
}

function props() {
  return {
    onNawiguj: vi.fn(),
    onOtworzProjekt: vi.fn(),
    onZaznaczPrzypadek: vi.fn(),
    onOtworzPrzypadek: vi.fn(),
    onOtworzArchiwum: vi.fn(),
  };
}

beforeEach(() => {
  useSnapshotStore.setState({ snapshot: null, readiness: null, loading: false });
  useStudyCasesStore.setState({ cases: [], activeCase: null });
  useExecutionRunsStore.setState({ runs: [], activeStudyCaseId: null });
});

describe('PulpitProjektu — stany przestrzeni', () => {
  it('brak projektu: „Nie otwarto projektu" + akcja „Otwórz projekt"', () => {
    const p = props();
    render(<PulpitProjektu {...p} />);
    expect(screen.getByText(PULPIT_STRINGS.brakProjektu)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: PULPIT_STRINGS.otworzProjekt }));
    expect(p.onOtworzProjekt).toHaveBeenCalledTimes(1);
  });

  it('ładowanie: snapshot null + loading → „Wczytywanie…"', () => {
    useSnapshotStore.setState({ snapshot: null, loading: true });
    render(<PulpitProjektu {...props()} />);
    expect(screen.getByText(PULPIT_STRINGS.ladowanie)).toBeInTheDocument();
  });

  it('gotowy: nagłówek „Pulpit projektu"', () => {
    ustawGotowy();
    render(<PulpitProjektu {...props()} />);
    expect(screen.getByText(PULPIT_STRINGS.tytul)).toBeInTheDocument();
  });
});

describe('PulpitProjektu — kafle z danymi ze store read-only', () => {
  beforeEach(ustawGotowy);

  it('KafelModelu: licznik elementów (128) ze snapshotu', () => {
    render(<PulpitProjektu {...props()} />);
    expect(screen.getByTestId('pulpit-model-elementow')).toHaveTextContent('128');
  });

  it('KafelGotowosci: „Niegotowa" + blokady/ostrzeżenia z gotowości', () => {
    render(<PulpitProjektu {...props()} />);
    const kafel = screen.getByRole('button', { name: PULPIT_STRINGS.gotowoscTytul });
    expect(within(kafel).getByText(PULPIT_STRINGS.niegotowa)).toBeInTheDocument();
    expect(within(kafel).getByText('1')).toBeInTheDocument();
    expect(within(kafel).getByText('2')).toBeInTheDocument();
  });

  it('KafelOstatniegoPrzebiegu: czas z przebiegu (bez Date) + status', () => {
    render(<PulpitProjektu {...props()} />);
    const kafel = screen.getByRole('button', { name: PULPIT_STRINGS.ostatniPrzebieg });
    expect(within(kafel).getByText('2026-07-15 14:32')).toBeInTheDocument();
    expect(within(kafel).getByText('Zakończony')).toBeInTheDocument();
  });

  it('KafelSpojnosci: FreshnessBadge „aktualne" dla aktywnego przypadku FRESH', () => {
    render(<PulpitProjektu {...props()} />);
    const badge = screen.getByTestId('pulpit-spojnosc-freshness');
    expect(within(badge).getByText(INSPECTOR_STRINGS.aktualne)).toBeInTheDocument();
  });

  it('kafel „wkrótce": tylko „Postęp wg celu" (bilans zastąpiony realnym kaflem)', () => {
    render(<PulpitProjektu {...props()} />);
    expect(screen.getByText(PULPIT_STRINGS.celTytul)).toBeInTheDocument();
    expect(screen.getAllByText(PULPIT_STRINGS.wkrotce)).toHaveLength(1);
  });

  it('KafelPrzylaczenia: warunki przyłączenia (U/Sk″) + bilans mocy z realnego snapshotu', () => {
    useSnapshotStore.setState({
      snapshot: snapshotFixture({
        buses: [{ ref_id: 'B-GPZ', id: 'B-GPZ', voltage_kv: 15 }] as never,
        sources: [
          { ref_id: 'S', id: 'S', name: 'GPZ', bus_ref: 'B-GPZ', sk3_mva: 250, ik3_ka: 9.6 },
        ] as never,
        generators: [{ ref_id: 'G', id: 'G', bus_ref: 'B-GPZ', p_mw: 3.7 }] as never,
        loads: [{ ref_id: 'L', id: 'L', bus_ref: 'B-GPZ', p_mw: 2.3 }] as never,
      }),
    });
    render(<PulpitProjektu {...props()} />);
    expect(screen.getByText(PULPIT_STRINGS.przylaczenieTytul)).toBeInTheDocument();
    expect(screen.getByTestId('pulpit-przylaczenie-sk')).toHaveTextContent('250');
    expect(screen.getByTestId('pulpit-przylaczenie-generacja')).toHaveTextContent('3,70');
    expect(screen.getByTestId('pulpit-przylaczenie-netto')).toHaveTextContent('1,40');
  });

  it('KafelPrzylaczenia: brak źródła sieciowego → uczciwy stan zerowy', () => {
    useSnapshotStore.setState({
      snapshot: snapshotFixture({ sources: [] as never }),
    });
    render(<PulpitProjektu {...props()} />);
    expect(screen.getByTestId('pulpit-przylaczenie-brak')).toBeInTheDocument();
  });

  it('warunki OSD nie podane → uczciwa informacja + przycisk „Uzupełnij warunki OSD"', () => {
    render(<PulpitProjektu {...props()} />);
    expect(screen.getByTestId('pulpit-osd-nie-podano')).toBeInTheDocument();
    expect(screen.getByTestId('pulpit-osd-uzupelnij')).toBeInTheDocument();
    expect(screen.queryByTestId('pulpit-osd-werdykt')).not.toBeInTheDocument();
  });

  it('warunki OSD w nagłówku snapshotu → limit + werdykt bilansu (K2)', () => {
    const snap = snapshotFixture({
      generators: [{ ref_id: 'G', id: 'G', bus_ref: 'B', p_mw: 3.7 }] as never,
      loads: [] as never,
    });
    snap.header.connection_conditions = { moc_przylaczeniowa_mw: 2.0 };
    useSnapshotStore.setState({ snapshot: snap });
    render(<PulpitProjektu {...props()} />);
    expect(screen.getByTestId('pulpit-osd-limit')).toHaveTextContent('2,00');
    expect(screen.getByTestId('pulpit-osd-werdykt')).toHaveTextContent('przekracza limit OSD');
  });

  it('formularz warunków OSD: realna ścieżka zapisu przez operację domenową', async () => {
    const executeDomainOperation = vi
      .fn()
      .mockResolvedValue({ error: null, snapshot: snapshotFixture() });
    useSnapshotStore.setState({ executeDomainOperation } as never);
    useAppStateStore.setState({ activeCaseId: 'case-1' } as never);
    render(<PulpitProjektu {...props()} />);

    fireEvent.click(screen.getByTestId('pulpit-osd-uzupelnij'));
    fireEvent.change(screen.getByTestId('pulpit-osd-moc'), { target: { value: '2,5' } });
    fireEvent.change(screen.getByTestId('pulpit-osd-cosphi'), { target: { value: '0,95' } });
    fireEvent.click(screen.getByTestId('pulpit-osd-zapisz'));

    await waitFor(() =>
      expect(executeDomainOperation).toHaveBeenCalledWith('case-1', 'set_connection_conditions', {
        moc_przylaczeniowa_mw: 2.5,
        wymagany_cos_phi: 0.95,
      }),
    );
  });

  it('formularz warunków OSD: walidacja PL przed wysłaniem (cosφ poza (0,1] → bez wołania)', () => {
    const executeDomainOperation = vi.fn();
    useSnapshotStore.setState({ executeDomainOperation } as never);
    useAppStateStore.setState({ activeCaseId: 'case-1' } as never);
    render(<PulpitProjektu {...props()} />);

    fireEvent.click(screen.getByTestId('pulpit-osd-uzupelnij'));
    fireEvent.change(screen.getByTestId('pulpit-osd-cosphi'), { target: { value: '1,5' } });
    fireEvent.click(screen.getByTestId('pulpit-osd-zapisz'));

    expect(screen.getByTestId('pulpit-osd-blad')).toHaveTextContent('cosφ');
    expect(executeDomainOperation).not.toHaveBeenCalled();
  });

  it('lista przypadków: wiersze ze study-cases', () => {
    render(<PulpitProjektu {...props()} />);
    expect(screen.getByText('Stan normalny')).toBeInTheDocument();
    expect(screen.getByText('Zwarcia maks.')).toBeInTheDocument();
  });

  it('„Ostatni przebieg" per wiersz tylko dla aktywnego przypadku (TODO-KARTA #3)', () => {
    render(<PulpitProjektu {...props()} />);
    // Aktywny K2 → czas przebiegu; K1 → „—".
    const wierszK2 = screen.getByText('Zwarcia maks.').closest('tr')!;
    expect(within(wierszK2).getByText('2026-07-15 14:32')).toBeInTheDocument();
    const wierszK1 = screen.getByText('Stan normalny').closest('tr')!;
    expect(within(wierszK1).getByText('—')).toBeInTheDocument();
  });
});

describe('PulpitProjektu — nawigacja i selekcja (gramatyka §2)', () => {
  beforeEach(ustawGotowy);

  it('klik kafla „Model sieci" → onNawiguj(„model")', () => {
    const p = props();
    render(<PulpitProjektu {...p} />);
    fireEvent.click(screen.getByRole('button', { name: PULPIT_STRINGS.modelTytul }));
    expect(p.onNawiguj).toHaveBeenCalledWith('model');
  });

  it('klik kafla „Gotowość do analiz" → onNawiguj(„gotowosc")', () => {
    const p = props();
    render(<PulpitProjektu {...p} />);
    fireEvent.click(screen.getByRole('button', { name: PULPIT_STRINGS.gotowoscTytul }));
    expect(p.onNawiguj).toHaveBeenCalledWith('gotowosc');
  });

  it('klik kafla „Archiwum projektu (ZIP)" → otwarcie okna archiwum', () => {
    const p = props();
    render(<PulpitProjektu {...p} />);
    fireEvent.click(screen.getByRole('button', { name: PULPIT_STRINGS.archiwumAkcja }));
    expect(p.onOtworzArchiwum).toHaveBeenCalledTimes(1);
  });

  it('klik wiersza przypadku = selekcja; 2× klik = otwarcie', () => {
    const p = props();
    render(<PulpitProjektu {...p} />);
    fireEvent.click(screen.getByText('Stan normalny'));
    expect(p.onZaznaczPrzypadek).toHaveBeenCalledWith('K1');
    fireEvent.doubleClick(screen.getByText('Zwarcia maks.'));
    expect(p.onOtworzPrzypadek).toHaveBeenCalledWith('K2');
  });
});
