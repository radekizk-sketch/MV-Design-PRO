import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PulpitProjektu } from '../PulpitProjektu';
import { PULPIT_STRINGS } from '../strings';
import { INSPECTOR_STRINGS } from '../../../inspector';
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

  it('klik kafla „Warunki przyłączenia" → onNawiguj(„model")', () => {
    const p = props();
    render(<PulpitProjektu {...p} />);
    fireEvent.click(screen.getByRole('button', { name: PULPIT_STRINGS.przylaczenieTytul }));
    expect(p.onNawiguj).toHaveBeenCalledWith('model');
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

  it('klik wiersza przypadku = selekcja; 2× klik = otwarcie', () => {
    const p = props();
    render(<PulpitProjektu {...p} />);
    fireEvent.click(screen.getByText('Stan normalny'));
    expect(p.onZaznaczPrzypadek).toHaveBeenCalledWith('K1');
    fireEvent.doubleClick(screen.getByText('Zwarcia maks.'));
    expect(p.onOtworzPrzypadek).toHaveBeenCalledWith('K2');
  });
});
