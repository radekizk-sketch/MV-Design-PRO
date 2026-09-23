/*
 * Sekcja "Zgodność przekrojowa przypadku" (karta S-3, 2026-09-16 — jeden tor NC RfG).
 * Pokrycie: stan zerowy (brak przypadku / brak DER / błąd) × dane (bieg z modułami,
 * DER pominięte, stopień dowodowy S-1, braki wymaganych testów) × natywny klik
 * odświeżenia i odesłania do macierzy — KLASA NIE INSTANCJA, nie przykład z karty.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import {
  fetchNcRfgCaseCompliance,
  type NcRfgCaseComplianceResponse,
  type NcRfgModuleResult,
  type NcRfgRunResult,
} from '../../../../ui/ncrfg-tests/api';
import { SekcjaZgodnosciPrzekrojowej } from '../SekcjaZgodnosciPrzekrojowej';

vi.mock('../../../../ui/ncrfg-tests/api', () => ({
  fetchNcRfgCaseCompliance: vi.fn(),
}));

const fetchMock = vi.mocked(fetchNcRfgCaseCompliance);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function modul(over: Partial<NcRfgModuleResult>): NcRfgModuleResult {
  return {
    der_ref: 'pv-1',
    der_name: 'PV z biegu',
    operator_id: 'enea',
    operator_name_pl: 'Enea Operator',
    module_type: 'B',
    module_family: 'PPM',
    p_max_kw: 1935,
    voltage_kv: 15,
    required_count: 8,
    pass_count: 8,
    fail_count: 0,
    no_data_count: 0,
    not_required_count: 12,
    overall_status: 'zgodny',
    tests: [],
    ...over,
  };
}

function bieg(modules: NcRfgModuleResult[], over: Partial<NcRfgRunResult> = {}): NcRfgRunResult {
  return {
    contract: 'NcRfgPtpireeTestResultV1',
    procedure_version: 'PTPiREE Procedura testowania v3.0',
    solver_version: 'ncrfg-ptpiree-whitebox-1.0',
    input_hash: 'in',
    deterministic_hash: 'det',
    modules,
    certificate_evidence: [],
    reporting_status: 'reportable',
    proof_status: 'complete',
    evidence_limitations: [],
    evidence_note_pl: 'Wszystkie wymagane testy oparte sa o stopien dowodowy dopuszczalny do zgloszenia.',
    evidence_per_module: {},
    evidence_by_test: {},
    wynik_inzynierski: {},
    test_catalog: [],
    white_box_trace: [],
    report_pl: '',
    ...over,
  };
}

function odpowiedz(over: Partial<NcRfgCaseComplianceResponse>): NcRfgCaseComplianceResponse {
  return { case_id: 'case-1', operator_id: 'enea', der_count: 0, pominiete: [], bieg: null, ...over };
}

describe('SekcjaZgodnosciPrzekrojowej — stan zerowy: brak przypadku', () => {
  it('bez caseId NIE woła API i pokazuje komunikat "wybierz przypadek"', async () => {
    render(<SekcjaZgodnosciPrzekrojowej caseId={null} operatorId="enea" nazwyModulow={{}} />);
    expect(await screen.findByTestId('mvd-oze-zgodnosc-przekrojowa-brak-przypadku')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('przycisk odświeżenia jest wyłączony bez aktywnego przypadku', async () => {
    render(<SekcjaZgodnosciPrzekrojowej caseId={null} operatorId="enea" nazwyModulow={{}} />);
    expect(await screen.findByTestId('mvd-oze-zgodnosc-przekrojowa-odswiez')).toBeDisabled();
  });
});

describe('SekcjaZgodnosciPrzekrojowej — stan zerowy: brak DER', () => {
  it('caseId obecny, der_count=0 bez pominiętych → komunikat "brak źródła", zero tabeli', async () => {
    fetchMock.mockResolvedValueOnce(odpowiedz({}));
    render(<SekcjaZgodnosciPrzekrojowej caseId="case-1" operatorId="enea" nazwyModulow={{}} />);
    expect(await screen.findByTestId('mvd-oze-zgodnosc-przekrojowa-brak-der')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-oze-zgodnosc-przekrojowa-tabela')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('case-1', 'enea');
  });

  it('der_count=0, ale DER pominięty przez backend → lista pominiętych z powodem, bez tabeli i bez "brak DER"', async () => {
    fetchMock.mockResolvedValueOnce(
      odpowiedz({
        pominiete: [
          { der_ref: 'pv-0', der_name: 'PV bez mocy', powod: 'brak_mocy', powod_pl: 'Moc czynna modułu nie jest dodatnia.' },
        ],
      }),
    );
    render(<SekcjaZgodnosciPrzekrojowej caseId="case-1" operatorId="enea" nazwyModulow={{}} />);
    const pominiety = await screen.findByTestId('mvd-oze-zgodnosc-przekrojowa-pominiety-pv-0');
    expect(pominiety).toHaveTextContent('PV bez mocy');
    expect(pominiety).toHaveTextContent('Moc czynna modułu nie jest dodatnia.');
    expect(screen.queryByTestId('mvd-oze-zgodnosc-przekrojowa-brak-der')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-oze-zgodnosc-przekrojowa-tabela')).not.toBeInTheDocument();
    // Podsumowanie liczy pominięty DER jako moduł bez danych (jeden model werdyktu z macierzą).
    const podsum = screen.getByTestId('mvd-oze-zgodnosc-przekrojowa-podsum');
    expect(podsum).toHaveTextContent('brak danych');
  });
});

describe('SekcjaZgodnosciPrzekrojowej — stan zerowy: błąd', () => {
  it('odrzucenie zapytania pokazuje komunikat błędu z treścią wyjątku', async () => {
    fetchMock.mockRejectedValueOnce(new Error('backend padł'));
    render(<SekcjaZgodnosciPrzekrojowej caseId="case-1" operatorId="enea" nazwyModulow={{}} />);
    const blad = await screen.findByTestId('mvd-oze-zgodnosc-przekrojowa-blad');
    expect(blad).toHaveTextContent('backend padł');
    expect(screen.queryByTestId('mvd-oze-zgodnosc-przekrojowa-tabela')).not.toBeInTheDocument();
  });

  it('błąd bez komunikatu Error (rzut nie-Error) używa etykiety generycznej', async () => {
    fetchMock.mockRejectedValueOnce('coś się zepsuło');
    render(<SekcjaZgodnosciPrzekrojowej caseId="case-1" operatorId="enea" nazwyModulow={{}} />);
    const blad = await screen.findByTestId('mvd-oze-zgodnosc-przekrojowa-blad');
    expect(blad).toHaveTextContent('Nie udało się sprawdzić zgodności przekrojowej');
  });
});

describe('SekcjaZgodnosciPrzekrojowej — dane: tabela z kontraktu biegu macierzy', () => {
  const wynikDwaModuly = (): NcRfgCaseComplianceResponse =>
    odpowiedz({
      der_count: 2,
      bieg: bieg(
        [
          modul({ der_ref: 'pv-1', overall_status: 'zgodny', required_count: 8, pass_count: 8 }),
          modul({
            der_ref: 'bess-1',
            der_name: 'Magazyn z biegu',
            module_type: 'B',
            p_max_kw: 1500,
            overall_status: 'niezgodny',
            required_count: 8,
            pass_count: 6,
            fail_count: 1,
            no_data_count: 1,
            tests: [
              {
                test_id: 'T09',
                ability_pl: 'Zdolność do generacji mocy biernej',
                required: true,
                required_reason_pl: 'Wymagany dla modułu typu B.',
                verdict: 'fail',
                summary_pl: 'Zakres Q: -300.0 do 300.0 kvar.',
                metrics: {},
                trace_refs: [],
                fix_actions: ['Wybierz falownik/sterownik z pełnym zakresem Q i krzywą Q(U).'],
              },
              {
                test_id: 'T16',
                ability_pl: 'Odbudowa mocy czynnej po zakłóceniu',
                required: true,
                required_reason_pl: 'Wymagany dla modułu typu B.',
                verdict: 'no_data',
                summary_pl: 'Brak czasu odbudowy mocy czynnej po FRT.',
                metrics: {},
                trace_refs: [],
                fix_actions: [],
              },
              {
                test_id: 'T04',
                ability_pl: 'Regulacja odbudowy częstotliwości',
                required: false,
                required_reason_pl: 'Nie jest wymagany.',
                verdict: 'fail',
                summary_pl: 'Informacyjnie.',
                metrics: {},
                trace_refs: [],
                fix_actions: [],
              },
            ],
          }),
        ],
        {
          reporting_status: 'not_reportable',
          proof_status: 'incomplete',
          evidence_limitations: ['T14:UNVALIDATED_MODEL'],
          evidence_note_pl: 'BRAK DOWODU dla testów: T14:UNVALIDATED_MODEL.',
          evidence_per_module: {
            'pv-1': {
              der_ref: 'pv-1',
              reporting_status: 'not_reportable',
              proof_status: 'incomplete',
              evidence_limitations: ['T14:UNVALIDATED_MODEL'],
              evidence_note_pl: 'BRAK DOWODU dla testów: T14:UNVALIDATED_MODEL.',
            },
            'bess-1': {
              der_ref: 'bess-1',
              reporting_status: 'reportable',
              proof_status: 'complete',
              evidence_limitations: [],
              evidence_note_pl: '',
            },
          },
        },
      ),
    });

  it('renderuje wiersz per moduł: nazwa ze słownika, klasa, moc, napięcie, status, liczniki, stopień dowodowy', async () => {
    fetchMock.mockResolvedValueOnce(wynikDwaModuly());
    render(
      <SekcjaZgodnosciPrzekrojowej
        caseId="case-1"
        operatorId="enea"
        nazwyModulow={{ 'pv-1': 'PV Dach A', 'bess-1': 'Magazyn energii 1' }}
      />,
    );

    const tabela = await screen.findByTestId('mvd-oze-zgodnosc-przekrojowa-tabela');
    expect(within(tabela).getByText('PV Dach A')).toBeInTheDocument();
    expect(within(tabela).getByText('Magazyn energii 1')).toBeInTheDocument();
    expect(screen.getAllByTestId('mvd-oze-zgodnosc-przekrojowa-wiersz')).toHaveLength(2);

    expect(screen.getByTestId('mvd-oze-zgodnosc-przekrojowa-werdykt-pv-1')).toHaveTextContent('zgodny');
    expect(screen.getByTestId('mvd-oze-zgodnosc-przekrojowa-werdykt-bess-1')).toHaveTextContent('niezgodny');
    // Liczniki solvera (pass/required, fail, no_data) — bez własnej arytmetyki.
    const wierszBess = screen.getByTestId('mvd-oze-zgodnosc-przekrojowa-werdykt-bess-1').closest('tr');
    expect(wierszBess).toHaveTextContent('6 / 8');
    // Stopień dowodowy per moduł z evidence_per_module (S-1).
    expect(screen.getByTestId('mvd-oze-zgodnosc-przekrojowa-dowod-pv-1')).toHaveTextContent(
      'brak wystarczającego dowodu',
    );
    expect(screen.getByTestId('mvd-oze-zgodnosc-przekrojowa-dowod-bess-1')).toHaveTextContent(
      'wystarczający do zgłoszenia',
    );
    // Baner biegu: reporting_status biegu = not_reportable → nota z backendu, zero oceny lokalnej.
    expect(screen.getByTestId('mvd-oze-zgodnosc-przekrojowa-baner-brak-dowodu')).toHaveTextContent(
      'BRAK DOWODU dla testów: T14:UNVALIDATED_MODEL.',
    );
    expect(screen.getByTestId('mvd-oze-zgodnosc-przekrojowa-dowod-biegu')).toHaveTextContent(
      'brak wystarczającego dowodu',
    );

    // Podsumowanie: 2 moduły, 1 zgodny, 1 niezgodny, 14/16 spełnionych wymaganych, operator.
    const podsum = screen.getByTestId('mvd-oze-zgodnosc-przekrojowa-podsum');
    expect(podsum).toHaveTextContent('2');
    expect(podsum).toHaveTextContent('14 / 16');
    expect(screen.getByTestId('mvd-oze-zgodnosc-przekrojowa-operator')).toHaveTextContent('Enea Operator');

    // Braki: tylko testy WYMAGANE fail/no_data (T09, T16); T04 (niewymagany fail) pominięty.
    const niespelniony = screen.getByTestId('mvd-oze-zgodnosc-przekrojowa-niespelniony-bess-1');
    expect(niespelniony).toHaveTextContent('T09 Zdolność do generacji mocy biernej');
    expect(niespelniony).toHaveTextContent('Wybierz falownik/sterownik z pełnym zakresem Q');
    expect(niespelniony).toHaveTextContent('T16 Odbudowa mocy czynnej po zakłóceniu');
    expect(niespelniony).not.toHaveTextContent('T04');
    expect(screen.queryByTestId('mvd-oze-zgodnosc-przekrojowa-niespelniony-pv-1')).not.toBeInTheDocument();
    // Bez DER pominiętych — bez listy pominiętych.
    expect(screen.queryByTestId('mvd-oze-zgodnosc-przekrojowa-pominiete')).not.toBeInTheDocument();
  });

  it('moduł bez wpisu w słowniku nazw pokazuje der_name z biegu, a bez niego der_ref', async () => {
    fetchMock.mockResolvedValueOnce(
      odpowiedz({
        der_count: 2,
        bieg: bieg([
          modul({ der_ref: 'pv-nieznany-w-store', der_name: 'PV z biegu' }),
          modul({ der_ref: 'pv-bez-nazwy', der_name: null }),
        ]),
      }),
    );
    render(<SekcjaZgodnosciPrzekrojowej caseId="case-1" operatorId="enea" nazwyModulow={{}} />);
    const tabela = await screen.findByTestId('mvd-oze-zgodnosc-przekrojowa-tabela');
    expect(within(tabela).getByText('PV z biegu')).toBeInTheDocument();
    expect(within(tabela).getByText('pv-bez-nazwy')).toBeInTheDocument();
    // Stopień dowodowy biegu z backendu: reportable → etykieta dodatnia, bez banera.
    expect(screen.getByTestId('mvd-oze-zgodnosc-przekrojowa-dowod-biegu')).toHaveTextContent(
      'wystarczający do zgłoszenia',
    );
    expect(screen.queryByTestId('mvd-oze-zgodnosc-przekrojowa-baner-brak-dowodu')).not.toBeInTheDocument();
    // Brak oceny per moduł (evidence_per_module puste) → jawny brak, nie „w porządku".
    expect(screen.getByTestId('mvd-oze-zgodnosc-przekrojowa-dowod-pv-bez-nazwy')).toHaveTextContent('—');
  });

  it('DER pominięte przez backend obok tabeli: lista z powodem, podsumowanie liczy je jako brak danych', async () => {
    fetchMock.mockResolvedValueOnce(
      odpowiedz({
        der_count: 1,
        bieg: bieg([modul({ der_ref: 'pv-1' })]),
        pominiete: [
          { der_ref: 'pv-orphan', der_name: 'PV bez szyny', powod: 'brak_napiecia', powod_pl: 'Szyna przyłączenia nie istnieje.' },
        ],
      }),
    );
    render(<SekcjaZgodnosciPrzekrojowej caseId="case-1" operatorId="enea" nazwyModulow={{}} />);
    await screen.findByTestId('mvd-oze-zgodnosc-przekrojowa-tabela');
    expect(screen.getByTestId('mvd-oze-zgodnosc-przekrojowa-pominiety-pv-orphan')).toHaveTextContent(
      'Szyna przyłączenia nie istnieje.',
    );
    expect(screen.getAllByTestId('mvd-oze-zgodnosc-przekrojowa-wiersz')).toHaveLength(1);
    const podsum = screen.getByTestId('mvd-oze-zgodnosc-przekrojowa-podsum');
    expect(podsum).toHaveTextContent('2');
  });
});

describe('SekcjaZgodnosciPrzekrojowej — natywny klik', () => {
  it('klik przycisku odświeżenia ponawia zapytanie z aktualnym operatorId', async () => {
    fetchMock.mockResolvedValue(odpowiedz({}));
    render(<SekcjaZgodnosciPrzekrojowej caseId="case-1" operatorId="enea" nazwyModulow={{}} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('mvd-oze-zgodnosc-przekrojowa-odswiez'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith('case-1', 'enea');
  });

  it('zmiana operatorId (prop) automatycznie ponawia zapytanie — nie wymaga kliku', async () => {
    fetchMock.mockResolvedValue(odpowiedz({}));
    const { rerender } = render(
      <SekcjaZgodnosciPrzekrojowej caseId="case-1" operatorId="enea" nazwyModulow={{}} />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender(<SekcjaZgodnosciPrzekrojowej caseId="case-1" operatorId="pge" nazwyModulow={{}} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith('case-1', 'pge');
  });

  it('„Pokaż w macierzy" woła onWybierzModul z der_ref — tylko dla modułów znanych macierzy', async () => {
    fetchMock.mockResolvedValueOnce(
      odpowiedz({
        der_count: 2,
        bieg: bieg([modul({ der_ref: 'pv-1' }), modul({ der_ref: 'pv-spoza-store' })]),
      }),
    );
    const onWybierzModul = vi.fn();
    render(
      <SekcjaZgodnosciPrzekrojowej
        caseId="case-1"
        operatorId="enea"
        nazwyModulow={{ 'pv-1': 'PV Dach A' }}
        onWybierzModul={onWybierzModul}
      />,
    );
    await screen.findByTestId('mvd-oze-zgodnosc-przekrojowa-tabela');
    fireEvent.click(screen.getByTestId('mvd-oze-zgodnosc-przekrojowa-pokaz-pv-1'));
    expect(onWybierzModul).toHaveBeenCalledWith('pv-1');
    // DER spoza store'u macierzy: bez przycisku (żaden martwy klik).
    expect(screen.queryByTestId('mvd-oze-zgodnosc-przekrojowa-pokaz-pv-spoza-store')).not.toBeInTheDocument();
  });

  it('bez onWybierzModul kolumna odesłania nie istnieje', async () => {
    fetchMock.mockResolvedValueOnce(odpowiedz({ der_count: 1, bieg: bieg([modul({ der_ref: 'pv-1' })]) }));
    render(<SekcjaZgodnosciPrzekrojowej caseId="case-1" operatorId="enea" nazwyModulow={{ 'pv-1': 'PV' }} />);
    await screen.findByTestId('mvd-oze-zgodnosc-przekrojowa-tabela');
    expect(screen.queryByTestId('mvd-oze-zgodnosc-przekrojowa-pokaz-pv-1')).not.toBeInTheDocument();
  });
});
