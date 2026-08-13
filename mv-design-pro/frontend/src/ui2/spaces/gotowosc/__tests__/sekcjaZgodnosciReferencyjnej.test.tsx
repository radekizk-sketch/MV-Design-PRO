/*
 * Testy sekcji „Ocena zgodności referencyjnej" (REF-A, HANDOFF pkt 2.1).
 * Mock globalnego `fetch` na kontrakcie HANDOFF §1.1 (wymóg §3.4 — brak
 * backendu na tej gałęzi). Weryfikacja: null→„nie dotyczy" (NIGDY 0%/100%),
 * progi kolorów (100/≥80/<80/null), rozwinięcie sprawdzeń, stany
 * pusty/ładowanie/błąd/bez przypadku.
 *
 * REF-PAKIET: sekcja pobiera DWIE różne rzeczy — katalog referencji
 * (`/reference/packs`, niezależny od przypadku) i raport zgodności
 * (`/cases/{id}/reference/compliance`). Mock MUSI rozróżniać adresy; wspólna
 * odpowiedź „cokolwiek na każdy adres" ukrywałaby, którym zapytaniem ekran
 * faktycznie się posłużył.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SekcjaZgodnosciReferencyjnej } from '../SekcjaZgodnosciReferencyjnej';
import { GOTOWOSC_STRINGS } from '../strings';
import { useAppStateStore } from '../../../../ui/app-state/store';
import { useWyborPakietu } from '../../../referencje/wyborPakietu';
import type {
  ReferenceComplianceReport,
  ReferencePackComplianceReport,
  ReferencePackSummary,
} from '../../../referencje/api';

function pack(over: Partial<ReferencePackComplianceReport> = {}): ReferencePackComplianceReport {
  return {
    pack_id: 'iec62271',
    name_pl: 'IEC 62271',
    kind: 'norm',
    version: '1.0',
    applicable: 4,
    passed: 4,
    failed: 0,
    score_percent: 100,
    checks: [],
    ...over,
  };
}

function raport(packs: ReferencePackComplianceReport[]): ReferenceComplianceReport {
  return { packs };
}

/** Katalog referencji zwracany przez `/reference/packs` (dane, nie stała UI). */
const KATALOG: ReferencePackSummary[] = [
  {
    pack_id: 'iec62271',
    kind: 'norm',
    name_pl: 'IEC 62271',
    version: '1.0',
    status: 'repo_verified',
    switchgear_family_ref: null,
    source_document_refs: [],
  },
  {
    pack_id: 'osd_enea',
    kind: 'osd',
    name_pl: 'OSD Enea',
    version: '3.2',
    status: 'repo_verified',
    switchgear_family_ref: null,
    source_document_refs: [],
  },
];

function mockFetchOk(report: ReferenceComplianceReport, katalog: ReferencePackSummary[] = KATALOG) {
  const spy = vi.fn(async (url: string) => {
    if (String(url).includes('/reference/packs')) {
      return { ok: true, json: async () => katalog } as Response;
    }
    return { ok: true, json: async () => report } as Response;
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

function ustawPrzypadek(id: string | null) {
  useAppStateStore.setState({ activeCaseId: id });
}

beforeEach(() => {
  localStorage.clear();
  useWyborPakietu.setState({ pakietId: null });
  ustawPrzypadek('C1');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  ustawPrzypadek(null);
  useWyborPakietu.setState({ pakietId: null });
  localStorage.clear();
});

describe('SekcjaZgodnosciReferencyjnej — stany', () => {
  it('bez aktywnego przypadku: uczciwy stan pusty PL, bez wołania oceny zgodności', () => {
    // Intencja pierwotna: brak przypadku ⇒ ekran NIE liczy zgodności.
    // REF-PAKIET: katalog referencji (`/reference/packs`) nie zależy od
    // przypadku i wolno go pobrać — zakazane jest wołanie oceny zgodności.
    const spy = mockFetchOk(raport([]));
    ustawPrzypadek(null);
    render(<SekcjaZgodnosciReferencyjnej />);
    expect(screen.getByTestId('mvd-ref-brak-przypadku')).toHaveTextContent(
      GOTOWOSC_STRINGS.refBrakPrzypadku,
    );
    const adresy = spy.mock.calls.map((c) => String(c[0]));
    expect(adresy.some((u) => u.includes('/reference/compliance'))).toBe(false);
  });

  it('ładowanie: komunikat PL w trakcie pobierania', async () => {
    let rozwiaz: (r: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((res) => (rozwiaz = res))),
    );
    render(<SekcjaZgodnosciReferencyjnej />);
    expect(await screen.findByTestId('mvd-ref-ladowanie')).toHaveTextContent(
      GOTOWOSC_STRINGS.refLadowanie,
    );
    rozwiaz({ ok: true, json: async () => raport([]) } as Response);
  });

  it('błąd pobierania: komunikat PL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, statusText: 'Internal' } as Response),
    );
    render(<SekcjaZgodnosciReferencyjnej />);
    expect(await screen.findByTestId('mvd-ref-blad')).toHaveTextContent(GOTOWOSC_STRINGS.refBlad);
  });

  it('pusta lista pakietów: uczciwy komunikat PL', async () => {
    mockFetchOk(raport([]));
    render(<SekcjaZgodnosciReferencyjnej />);
    expect(await screen.findByTestId('mvd-ref-brak-pakietow')).toHaveTextContent(
      GOTOWOSC_STRINGS.refBrakPakietow,
    );
  });
});

describe('SekcjaZgodnosciReferencyjnej — tabela i wynik', () => {
  it('renderuje wiersz per pakiet z rodzajem (etykieta PL) i wersją', async () => {
    mockFetchOk(raport([pack({ pack_id: 'osd_enea', name_pl: 'OSD Enea', kind: 'osd', version: '3.2' })]));
    render(<SekcjaZgodnosciReferencyjnej />);
    const wiersz = await screen.findByTestId('mvd-ref-wiersz-osd_enea');
    expect(wiersz).toHaveTextContent('OSD Enea');
    expect(wiersz).toHaveTextContent('OSD'); // REFERENCE_PACK_KIND_LABELS_PL.osd
    expect(wiersz).toHaveTextContent('3.2');
  });

  it('pokazuje zaliczone/oblane (passed/failed)', async () => {
    mockFetchOk(raport([pack({ pack_id: 'siemens_8djh', passed: 7, failed: 3, score_percent: 70 })]));
    render(<SekcjaZgodnosciReferencyjnej />);
    const wiersz = await screen.findByTestId('mvd-ref-wiersz-siemens_8djh');
    expect(wiersz).toHaveTextContent('7 / 3');
  });

  it('score_percent=null ⇒ DOKŁADNIE „nie dotyczy" (NIGDY 0% ani 100%), kolor szary', async () => {
    mockFetchOk(raport([pack({ pack_id: 'nd', score_percent: null, applicable: 0, passed: 0, failed: 0 })]));
    render(<SekcjaZgodnosciReferencyjnej />);
    const wynik = await screen.findByTestId('mvd-ref-wynik-nd');
    expect(wynik).toHaveTextContent(GOTOWOSC_STRINGS.refNieDotyczy);
    expect(wynik.textContent).not.toContain('0%');
    expect(wynik.textContent).not.toContain('100%');
    expect(wynik.className).toContain('mvd-ref-score-nd');
  });

  it('100% ⇒ kolor zieleni (mvd-ref-score-ok)', async () => {
    mockFetchOk(raport([pack({ pack_id: 'ok', score_percent: 100 })]));
    render(<SekcjaZgodnosciReferencyjnej />);
    const wynik = await screen.findByTestId('mvd-ref-wynik-ok');
    expect(wynik).toHaveTextContent('100%');
    expect(wynik.className).toContain('mvd-ref-score-ok');
  });

  it('≥80% (85%) ⇒ kolor bursztynu (mvd-ref-score-warn)', async () => {
    mockFetchOk(raport([pack({ pack_id: 'w', score_percent: 85 })]));
    render(<SekcjaZgodnosciReferencyjnej />);
    const wynik = await screen.findByTestId('mvd-ref-wynik-w');
    expect(wynik).toHaveTextContent('85%');
    expect(wynik.className).toContain('mvd-ref-score-warn');
  });

  it('próg 80% (dokładnie 80) nadal bursztyn, nie czerwień', async () => {
    mockFetchOk(raport([pack({ pack_id: 'g', score_percent: 80 })]));
    render(<SekcjaZgodnosciReferencyjnej />);
    const wynik = await screen.findByTestId('mvd-ref-wynik-g');
    expect(wynik.className).toContain('mvd-ref-score-warn');
    expect(wynik.className).not.toContain('mvd-ref-score-err');
  });

  it('<80% (60%) ⇒ kolor czerwieni (mvd-ref-score-err)', async () => {
    mockFetchOk(raport([pack({ pack_id: 'e', score_percent: 60 })]));
    render(<SekcjaZgodnosciReferencyjnej />);
    const wynik = await screen.findByTestId('mvd-ref-wynik-e');
    expect(wynik).toHaveTextContent('60%');
    expect(wynik.className).toContain('mvd-ref-score-err');
  });
});

describe('SekcjaZgodnosciReferencyjnej — rozwinięcie sprawdzeń', () => {
  it('rozwinięcie wiersza pokazuje checks[] z message_pl i ✓/✗', async () => {
    mockFetchOk(
      raport([
        pack({
          pack_id: 'osd_enea',
          name_pl: 'OSD Enea',
          checks: [
            {
              element_ref: 'POLE-3',
              pack_id: 'osd_enea',
              rule_code: 'reference.bays.forbidden_apparatus',
              status: 'fail',
              message_pl: 'Aparat niedozwolony w polu liniowym.',
            },
            {
              element_ref: 'POLE-1',
              pack_id: 'osd_enea',
              rule_code: 'reference.bays.missing_required_apparatus',
              status: 'pass',
              message_pl: 'Skład aparatów zgodny z wymaganiem.',
            },
          ],
        }),
      ]),
    );
    render(<SekcjaZgodnosciReferencyjnej />);
    const rozwin = await screen.findByRole('button', { name: /OSD Enea/ });
    fireEvent.click(rozwin);
    const lista = await screen.findByTestId('mvd-ref-checks-osd_enea');
    expect(within(lista).getByText('Aparat niedozwolony w polu liniowym.')).toBeInTheDocument();
    expect(within(lista).getByText('Skład aparatów zgodny z wymaganiem.')).toBeInTheDocument();
    expect(within(lista).getByText('✗')).toBeInTheDocument();
    expect(within(lista).getByText('✓')).toBeInTheDocument();
    expect(within(lista).getByLabelText(GOTOWOSC_STRINGS.refCheckNiezgodne)).toBeInTheDocument();
  });

  it('ponowny klik zwija wiersz (sprawdzenia znikają)', async () => {
    mockFetchOk(
      raport([
        pack({
          pack_id: 'p',
          name_pl: 'IEC 62271',
          checks: [
            {
              element_ref: 'POLE-2',
              pack_id: 'p',
              rule_code: 'reference.bays.family_mismatch',
              status: 'fail',
              message_pl: 'Rodzina rozdzielnicy niezgodna.',
            },
          ],
        }),
      ]),
    );
    render(<SekcjaZgodnosciReferencyjnej />);
    const rozwin = await screen.findByRole('button', { name: /IEC 62271/ });
    fireEvent.click(rozwin);
    expect(await screen.findByTestId('mvd-ref-checks-p')).toBeInTheDocument();
    fireEvent.click(rozwin);
    await waitFor(() => expect(screen.queryByTestId('mvd-ref-checks-p')).not.toBeInTheDocument());
  });
});
