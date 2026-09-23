/*
 * Fixtures okna „Praca wyspowa" (ochrona LoM, karta U4 P46). Kształty 1:1 z
 * serializacją `application/analyses/ochrona_lom.py::build_ochrona_lom_view`:
 * `context`/`input_hash`/`zalozenia_pl`/`normative_sources`/`fields`/
 * `modules_without_field`/`summary`. Statusy i komunikaty pochodzą z backendu
 * (ZERO oceny w UI). Deterministyczne, bez losowości.
 *
 * KARTA AB-1a D7 (2026-09-23): porównanie pola to obiekt `OcenaNastawyLom`
 * (`rodzaj`, `funkcja*`, `wynik`, `komunikat_pl`, `wartosc`, `jednostka`,
 * `odniesienie_dolne/gorne`, `margines*`, `podstawa`, `dowod`, `wywod`) zamiast pary
 * istotność/komunikat; podstawa każdej oceny ma status źródła „niezweryfikowane".
 * Liczby i istotności BEZ ZMIAN względem poprzedniej postaci fixtury (intencja
 * zachowana: pole PV bez funkcji LoM (ERROR), pole BESS z ROCOF poniżej okna (WARN)
 * + koordynacja SPZ (INFO) — od karty z NAZWANYM wyłączeniem magazynu z zakresu
 * RfG, pole FW z 81U w oknie (OK) + SPZ (INFO → status pola INFO)).
 */

import type { OcenaNastawyLom, PodstawaNormatywnaOdpowiedz, WidokOchronyLom } from '../../api';

const UWAGA_DOKUMENTU =
  'Dokument źródłowy nastaw wymaganych (IRiESD operatora, PN-EN 50549-1/-2), jego wydanie i '
  + 'klauzula nie są potwierdzone — wartość nie jest wymaganiem z dokumentu.';

function podstawa(uwaga: string): PodstawaNormatywnaOdpowiedz {
  return {
    dokument: null,
    wersja: null,
    klauzula: null,
    zrodlo_status: 'UNVERIFIED_SOURCE',
    uwaga_pl: uwaga,
  };
}

const PODSTAWA_ROCOF = podstawa(
  'Rozporządzenie (UE) 2016/631 art. 13 ust. 1 lit. b wymaga zdolności do wytrzymania '
  + 'szybkości zmian częstotliwości o wartości określonej przez właściwego operatora — '
  + `rozporządzenie nie podaje 2 Hz/s. ${UWAGA_DOKUMENTU}`,
);
const PODSTAWA_PASMA = podstawa(
  'Pasmo 47,5–51,5 Hz pochodzi z tabeli zakresów częstotliwości rozporządzenia (UE) '
  + `2016/631 art. 13 ust. 1 lit. a, która wiąże pasma z CZASAMI pracy. ${UWAGA_DOKUMENTU}`,
);
const PODSTAWA_78 = podstawa(`Brak okna nastawy przesunięcia wektora w katalogu. ${UWAGA_DOKUMENTU}`);
const PODSTAWA_OBECNOSCI = podstawa(
  `Wymóg zabezpieczenia interfejsowego od pracy wyspowej w polu modułu wytwórczego. ${UWAGA_DOKUMENTU}`,
);
const PODSTAWA_SPZ = podstawa(
  'Zasada koordynacji: zabezpieczenie od pracy wyspowej wyłącza moduł przed ponownym '
  + 'załączeniem SPZ jednostek nadrzędnych. Wymagany zapas czasu nie ma dokumentu źródłowego.',
);

const ZALOZENIA = [
  'Ocena LoM to interpretacja normatywna (porównania), nie symulacja fizyki wyspy.',
  'Moduł wytwórczy = generator w ENM; pole przyłączeniowe = pole (bay) na szynie '
  + 'modułu lub o roli OZE z przypisaniem zabezpieczeń.',
  'Okna nastaw są stałymi oceny; ich podstawa (dokument, wydanie, klauzula) NIE jest '
  + 'potwierdzona — każda ocena niesie podstawę ze statusem źródła niezweryfikowanego.',
  'Czasy przerwy SPZ pochodzą z SpzState jednostek nadrzędnych; gdy nieosiągalne '
  + 'w ENM — uczciwy INFO.',
];

const NORMATIVE_SOURCES = {
  rocof_81R: { window_pl: 'df/dt ≥ 2.0 Hz/s', podstawa: PODSTAWA_ROCOF },
  vector_shift_78: { window_pl: null, podstawa: PODSTAWA_78 },
  underfrequency_81U: { window_pl: 'próg f ≤ 47.5 Hz', podstawa: PODSTAWA_PASMA },
  overfrequency_81O: { window_pl: 'próg f ≥ 51.5 Hz', podstawa: PODSTAWA_PASMA },
};

function dowod(pole: string): OcenaNastawyLom['dowod'] {
  return { run_id: null, element_id: pole, trace_ref: null };
}

function spzBezDanych(pole: string, czasLom: number | null): OcenaNastawyLom {
  return {
    rodzaj: 'koordynacja_spz',
    funkcja: null,
    funkcja_ansi: null,
    funkcja_pl: 'Koordynacja czasowa z SPZ',
    wynik: 'INFO',
    komunikat_pl:
      'Brak danych o przerwie SPZ jednostek nadrzędnych (SpzState nieosiągalny '
      + 'w ENM) — porównanie niemożliwe.',
    wartosc: czasLom,
    jednostka: 's',
    odniesienie_dolne: null,
    odniesienie_gorne: null,
    margines: null,
    margines_jednostka: null,
    podstawa: PODSTAWA_SPZ,
    dowod: dowod(pole),
    wywod: [],
  };
}

/** Pełny widok LoM z trzema polami (ERROR/WARN/INFO) i modułem bez pola. */
export function widokOchronyLomFixture(): WidokOchronyLom {
  return {
    analysis: 'ochrona_lom',
    context: { enm_name: 'Sieć testowa OZE', enm_hash: 'enm-hash-123' },
    input_hash: 'lom-hash-abc',
    zalozenia_pl: ZALOZENIA,
    normative_sources: NORMATIVE_SOURCES,
    fields: [
      {
        bay_ref: 'bay-pv-a',
        bay_name: 'Pole PV A',
        substation_ref: 'gpz-1',
        bus_ref: 'bus-oze-1',
        generating_module_refs: ['gen-pv-1'],
        status: 'ERROR',
        poza_zakresem_rfg: null,
        checks: [
          {
            rodzaj: 'obecnosc',
            funkcja: null,
            funkcja_ansi: null,
            funkcja_pl: null,
            wynik: 'ERROR',
            komunikat_pl:
              'Pole modułu wytwórczego bez jakiejkolwiek funkcji ochrony od pracy '
              + 'wyspowej (LoM: 81R / 78 / 81U / 81O).',
            wartosc: null,
            jednostka: null,
            odniesienie_dolne: null,
            odniesienie_gorne: null,
            margines: null,
            margines_jednostka: null,
            podstawa: PODSTAWA_OBECNOSCI,
            dowod: dowod('bay-pv-a'),
            wywod: [],
          },
        ],
      },
      {
        bay_ref: 'bay-bess-b',
        bay_name: 'Pole BESS B',
        substation_ref: 'gpz-1',
        bus_ref: 'bus-oze-2',
        generating_module_refs: ['gen-bess-1'],
        status: 'WARN',
        poza_zakresem_rfg: {
          kod: 'poza_zakresem_rfg_do_OD-40',
          moduly: ['gen-bess-1'],
          opis_pl:
            'Magazyn energii nie jest objęty rozporządzeniem (UE) 2016/631 (art. 3 ust. 2) — '
            + 'okna nastaw wyprowadzone z wymagań dla modułów wytwarzania nie mają dla niego '
            + 'podstawy.',
        },
        checks: [
          {
            rodzaj: 'okno_normatywne',
            funkcja: 'rocof_81R',
            funkcja_ansi: '81R',
            funkcja_pl: 'Szybkość zmian częstotliwości (df/dt)',
            wynik: 'WARN',
            komunikat_pl:
              'Nastawa df/dt (1.0 Hz/s) poniżej dolnego okna (2.0 Hz/s) — ryzyko '
              + 'zbędnych wyłączeń (fałszywe wykrycie wyspy).',
            wartosc: 1.0,
            jednostka: 'Hz/s',
            odniesienie_dolne: 2.0,
            odniesienie_gorne: null,
            margines: -1.0,
            margines_jednostka: 'Hz/s',
            podstawa: PODSTAWA_ROCOF,
            dowod: dowod('bay-bess-b'),
            // Wywód dyplomowy {tekst, latex} — kształt 1:1 z `_wywod_okna` backendu.
            wywod: [
              {
                tekst: 'Wzor: warunek okna normatywnego funkcji 81R (nastawa nie nizsza niz krawedz okna)',
                latex: '\\left(\\tfrac{df}{dt}\\right)_{nast} \\ge 2.0\\ \\tfrac{\\text{Hz}}{\\text{s}}',
              },
              {
                tekst: 'Dane: nastawa = 1.0000 (przekaznik pola), krawedz okna = 2.0 — dolna krawedz okna (podstawa niezweryfikowana).',
                latex: null,
              },
              {
                tekst: 'Podstawienie: 1.0000 >= 2.0 NIESPELNIONE',
                latex: '1.0000 < 2.0\\ \\tfrac{\\text{Hz}}{\\text{s}}',
              },
              { tekst: 'Werdykt: WARN — nastawa ponizej okna.', latex: null },
            ],
          },
          spzBezDanych('bay-bess-b', 0.3),
        ],
      },
      {
        bay_ref: 'bay-fw-c',
        bay_name: 'Pole FW C',
        substation_ref: 'gpz-2',
        bus_ref: 'bus-oze-3',
        generating_module_refs: ['gen-fw-1', 'gen-fw-2'],
        status: 'INFO',
        poza_zakresem_rfg: null,
        checks: [
          {
            rodzaj: 'okno_normatywne',
            funkcja: 'underfrequency_81U',
            funkcja_ansi: '81U',
            funkcja_pl: 'Podczęstotliwościowa (f<)',
            wynik: 'OK',
            komunikat_pl: 'Próg 81U (47.5 Hz) w oknie (≤ 47.5 Hz).',
            wartosc: 47.5,
            jednostka: 'Hz',
            odniesienie_dolne: null,
            odniesienie_gorne: 47.5,
            margines: 0.0,
            margines_jednostka: 'Hz',
            podstawa: PODSTAWA_PASMA,
            dowod: dowod('bay-fw-c'),
            wywod: [],
          },
          spzBezDanych('bay-fw-c', null),
        ],
      },
    ],
    modules_without_field: ['gen-pv-orphan'],
    summary: {
      fields_total: 3,
      generating_modules_total: 5,
      by_status: { OK: 0, INFO: 1, WARN: 1, ERROR: 1 },
      overall_status: 'ERROR',
    },
  };
}

/** Widok bez pól i bez modułów bez pola — uczciwy stan „brak pól". */
export function widokLomPustyFixture(): WidokOchronyLom {
  return {
    analysis: 'ochrona_lom',
    context: { enm_name: 'Sieć bez OZE', enm_hash: 'enm-hash-empty' },
    input_hash: 'lom-hash-empty',
    zalozenia_pl: ZALOZENIA,
    normative_sources: NORMATIVE_SOURCES,
    fields: [],
    modules_without_field: [],
    summary: {
      fields_total: 0,
      generating_modules_total: 0,
      by_status: { OK: 0, INFO: 0, WARN: 0, ERROR: 0 },
      overall_status: 'INFO',
    },
  };
}
