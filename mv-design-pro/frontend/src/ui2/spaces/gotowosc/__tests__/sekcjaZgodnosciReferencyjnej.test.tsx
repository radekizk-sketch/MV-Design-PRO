/*
 * Testy sekcji „Ocena zgodności referencyjnej" (REF-A, HANDOFF pkt 2.1).
 * Mock globalnego `fetch` na kontrakcie HANDOFF §1.1 (wymóg §3.4 — brak
 * backendu na tej gałęzi). Weryfikacja: null→„nie dotyczy" (NIGDY 0%/100%),
 * wynik pakietu jako miara bez koloru werdyktu (karta WERDYKT-MIGRACJA-190 zdjęła próg okna
 * 100/≥80/<80), rozwinięcie sprawdzeń z rekordem oceny z backendu, stany
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
import {
  SPRAWDZENIE_NIEZGODNE,
  SPRAWDZENIE_ZGODNE,
  sprawdzenieDla,
} from '../../../referencje/__tests__/fixturyReferencyjne';

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

  // Iloczyn: wynik pakietu {100, 85, 80, 60, 0} — zawsze ta sama klasa miary, żaden kolor
  // werdyktu (dawny próg okna 100 % zieleń / ≥ 80 % bursztyn / reszta czerwień).
  it.each([100, 85, 80, 60, 0])('wynik %i%% ⇒ miara bez koloru werdyktu', async (wartosc) => {
    mockFetchOk(raport([pack({ pack_id: 'm', score_percent: wartosc })]));
    render(<SekcjaZgodnosciReferencyjnej />);
    const wynik = await screen.findByTestId('mvd-ref-wynik-m');
    expect(wynik).toHaveTextContent(`${wartosc}%`);
    expect(wynik.className).toContain('mvd-ref-score-miara');
    expect(wynik.className).not.toMatch(/mvd-ref-score-(ok|warn|err)/);
  });
});

describe('SekcjaZgodnosciReferencyjnej — rozwinięcie sprawdzeń', () => {
  it('rozwinięcie wiersza pokazuje sprawdzenia z etykietą i wyjaśnieniem rekordu backendu', async () => {
    mockFetchOk(
      raport([
        pack({
          pack_id: 'iec62271',
          name_pl: 'IEC 62271',
          checks: [SPRAWDZENIE_NIEZGODNE, SPRAWDZENIE_ZGODNE],
        }),
      ]),
    );
    render(<SekcjaZgodnosciReferencyjnej />);
    const rozwin = await screen.findByRole('button', { name: /IEC 62271/ });
    fireEvent.click(rozwin);
    const lista = await screen.findByTestId('mvd-ref-checks-iec62271');
    for (const [i, check] of [SPRAWDZENIE_NIEZGODNE, SPRAWDZENIE_ZGODNE].entries()) {
      const wiersz = within(lista).getByTestId(`mvd-ref-check-iec62271-${i}`);
      expect(wiersz.dataset.status).toBe(check.ocena.status_maszynowy);
      expect(wiersz).toHaveTextContent(check.ocena.etykieta.etykieta_pl);
      expect(wiersz).toHaveTextContent(check.message_pl);
      expect(wiersz).toHaveTextContent(check.ocena.przedmiot.nazwa_pl);
      // Identyfikator elementu nie trafia do treści (nazwa z modelu, karta #142).
      expect(wiersz.textContent).not.toContain(check.element_ref);
      // Wyjaśnienie rekordu (karta werdyktu) dostępne w wierszu.
      expect(within(wiersz).getByTestId(`mvd-werdykt-${check.ocena.kryterium_id}`)).toBeInTheDocument();
    }
    // Bez własnych znaków ✓/✗ ekranu.
    expect(lista.textContent).not.toMatch(/[✓✗]/);
  });

  it('ponowny klik zwija wiersz (sprawdzenia znikają)', async () => {
    mockFetchOk(
      raport([
        pack({
          pack_id: 'p',
          name_pl: 'IEC 62271',
          checks: [sprawdzenieDla(SPRAWDZENIE_NIEZGODNE, 'POLE-2', 'p')],
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

describe('SekcjaZgodnosciReferencyjnej — brak pakietu operatora przypadku (karta OD-17a)', () => {
  const KOMUNIKAT =
    'Przypadek obliczeniowy „Wariant A”: operator Energa Operator nie ma pakietu wymagań ' +
    'w rejestrze wymagań referencyjnych, więc zgodności ze standardami tego operatora nie ' +
    'oceniono.';

  function raportZBrakiem(packs: ReferencePackComplianceReport[]): ReferenceComplianceReport {
    return {
      packs,
      braki_pakietow: [
        {
          kod: 'BRAK_PAKIETU_OSD:energa',
          rodzaj: 'BRAK_PAKIETU_OSD',
          identyfikator: 'energa',
          nazwa_elementu: 'Wariant A',
          status_maszynowy: 'BRAK_PODSTAWY',
          komunikat_pl: KOMUNIKAT,
          wyjasnienie: {
            zdanie_pl: KOMUNIKAT,
            przyczyna_pl: 'brak danych zewnętrznych',
            czego_brakuje: ['pakiet wymagań operatora Energa Operator'],
            zastrzezenia: [],
          },
        },
      ],
    };
  }

  it('zdanie odmowy z backendu widoczne obok tabeli pakietów, bez kodu maszynowego', async () => {
    mockFetchOk(raportZBrakiem([pack()]));
    render(<SekcjaZgodnosciReferencyjnej />);
    const braki = await screen.findByTestId('mvd-braki-pakietow');
    expect(within(braki).getByTestId('mvd-brak-pakietu-BRAK_PAKIETU_OSD')).toHaveTextContent(KOMUNIKAT);
    expect(braki.textContent).not.toContain('BRAK_PAKIETU_OSD');
    expect(screen.getByTestId('mvd-ref-tabela')).toBeInTheDocument();
  });

  it('odmowa widoczna także, gdy raport nie ma żadnego pakietu (brak danych ≠ brak pakietów)', async () => {
    mockFetchOk(raportZBrakiem([]));
    render(<SekcjaZgodnosciReferencyjnej />);
    expect(await screen.findByTestId('mvd-brak-pakietu-BRAK_PAKIETU_OSD')).toHaveTextContent(KOMUNIKAT);
    expect(screen.getByTestId('mvd-ref-brak-pakietow')).toBeInTheDocument();
  });

  it('raport bez braków: brak listy odmów', async () => {
    mockFetchOk(raport([pack()]));
    render(<SekcjaZgodnosciReferencyjnej />);
    await screen.findByTestId('mvd-ref-tabela');
    expect(screen.queryByTestId('mvd-braki-pakietow')).not.toBeInTheDocument();
  });
});
