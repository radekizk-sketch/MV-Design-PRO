/*
 * Model prezentacji okna „Analizy akademickie" (ui2/wyniki/akademickie).
 * Wyłącznie MAPOWANIE gotowych artefaktów backendu na model widoku — ZERO fizyki,
 * ZERO ocen lokalnych, ZERO uzupełniania brakujących wartości.
 *
 * DEKLARACJA (przypięta testami `model.test.ts`): spłaszczenie wyniku jest PEŁNE —
 * liczba wierszy równa się liczbie liści ładunku, niezależnie od jego rozmiaru
 * i głębokości. Powierzchnia zastana `V126AcademicSurface` gubiła tu dane przez
 * trzy zaszyte limity (`slice(0,18)` wierszy, `slice(0,8)` zagnieżdżeń,
 * `slice(0,6)` pól pierwszego elementu tablicy) — zmierzone straty: 11 wierszy
 * dla `ssci_impedance`, 6 dla `neutral_earthing_design`, po 4 dla
 * `voltage_stability` i `earthing_safety`, a przy tablicach (widmo harmonicznych,
 * punkty TRV) tysiące pól nie miały jak się pokazać. Limit MA WYNIKAĆ Z DANYCH.
 */

import type { OpisSwiezosci } from '../../freshness/freshnessModel';
import type { WierszInformacjiAudytowych } from '../wzorzec/InformacjeAudytowe';
import type {
  KluczMetrykiRaportu,
  KrokDowodu,
  KrokSladu,
  PolitykaEksportuRaportu,
  RaportAnalizy,
} from './api';
import { AKADEMICKIE_STRINGS as S } from './strings';

// ---------------------------------------------------------------------------
// Spłaszczenie wyniku
// ---------------------------------------------------------------------------

/** Pojedynczy liść wyniku: pełna ścieżka pola + wartość skalarna. */
export interface WierszWyniku {
  /** Pełna ścieżka pola, np. `settings.u0_start_percent` albo `arresters[0].bil_kv`. */
  readonly sciezka: string;
  /** Pierwszy segment ścieżki — klucz grupowania w widoku. */
  readonly grupa: string;
  readonly wartosc: unknown;
}

function jestObiektem(wartosc: unknown): wartosc is Record<string, unknown> {
  return typeof wartosc === 'object' && wartosc !== null && !Array.isArray(wartosc);
}

function zbierz(wartosc: unknown, sciezka: string, grupa: string, wyjscie: WierszWyniku[]): void {
  if (Array.isArray(wartosc)) {
    if (wartosc.length === 0) {
      wyjscie.push({ sciezka, grupa, wartosc: [] });
      return;
    }
    wartosc.forEach((element, index) => {
      zbierz(element, `${sciezka}[${index}]`, grupa, wyjscie);
    });
    return;
  }
  if (jestObiektem(wartosc)) {
    const klucze = Object.keys(wartosc);
    if (klucze.length === 0) {
      wyjscie.push({ sciezka, grupa, wartosc: {} });
      return;
    }
    klucze.forEach((klucz) => {
      const dziecko = sciezka === '' ? klucz : `${sciezka}.${klucz}`;
      zbierz(wartosc[klucz], dziecko, sciezka === '' ? klucz : grupa, wyjscie);
    });
    return;
  }
  wyjscie.push({ sciezka, grupa, wartosc });
}

/**
 * Spłaszcza ładunek wyniku do PEŁNEJ listy liści (bez żadnego limitu liczby wierszy,
 * głębokości ani długości tablic). Kolejność deterministyczna — zgodna z kolejnością
 * kluczy w odpowiedzi backendu (JSON zachowuje kolejność wstawienia).
 */
export function splaszczWynik(payload: unknown): WierszWyniku[] {
  const wyjscie: WierszWyniku[] = [];
  if (payload === null || payload === undefined) return wyjscie;
  zbierz(payload, '', '', wyjscie);
  return wyjscie;
}

// ---------------------------------------------------------------------------
// Ślad, dowód, raport — przekazanie BEZ limitu
// ---------------------------------------------------------------------------

/**
 * Kroki śladu do wyświetlenia. Funkcja tożsamościowa Z ZAŁOŻENIA — istnieje po to,
 * by miejsce ewentualnego limitu było jedno i pokryte testem. Liczba kroków wynika
 * WYŁĄCZNIE z odpowiedzi backendu (kontrakt `AcademicWhiteBoxTraceV1`).
 */
export function krokiSladuDoWidoku(kroki: readonly KrokSladu[]): readonly KrokSladu[] {
  return kroki;
}

/** Kroki dowodu do wyświetlenia — komplet pakietu `AcademicProofPackV1`. */
export function krokiDowoduDoWidoku(kroki: readonly KrokDowodu[]): readonly KrokDowodu[] {
  return kroki;
}

// ---------------------------------------------------------------------------
// Raport — tożsamość w „Informacjach audytowych" (karta #145)
// ---------------------------------------------------------------------------

/**
 * Polskie etykiety STAŁYCH kluczy metryk raportu — mapa typowana unią kontraktu:
 * nowy klucz w backendzie nie skompiluje się tu bez etykiety (parytet z fiksturą
 * backendu pilnuje `__tests__/model.test.ts`).
 */
export const ETYKIETY_METRYK_RAPORTU: Readonly<Record<KluczMetrykiRaportu, string>> = {
  proof_id: S.dowodId,
  proof_hash: S.dowodOdcisk,
  trace_step_count: S.raportKrokowSladu,
  result_hash: S.raportOdciskWyniku,
  solver_version: S.wersjaSolwera,
  input_hash: S.odciskWejscia,
};

/** Polska nazwa polityki eksportu raportu. */
export const POLITYKI_EKSPORTU_RAPORTU: Readonly<Record<PolitykaEksportuRaportu, string>> = {
  frozen_result_and_proof_only: S.raportPolitykaZamrozona,
};

/** Liczba kroków śladu dowodu z metryki raportu (`null`, gdy raport jej nie niesie). */
export function liczbaKrokowSladuRaportu(raport: RaportAnalizy): number | null {
  for (const sekcja of raport.sections) {
    for (const metryka of sekcja.metrics) {
      if (metryka.label === 'trace_step_count' && typeof metryka.value === 'number') {
        return metryka.value;
      }
    }
  }
  return null;
}

/**
 * Wiersze „Informacji audytowych" raportu: identyfikator i odcisk raportu oraz każda
 * metryka sekcji z polską etykietą stałego klucza — komplet, w kolejności kontraktu.
 */
export function wierszeAudytoweRaportu(raport: RaportAnalizy): WierszInformacjiAudytowych[] {
  return [
    { etykieta: S.raportId, wartosc: raport.report_id },
    { etykieta: S.raportOdcisk, wartosc: raport.report_hash },
    ...raport.sections.flatMap((sekcja) =>
      sekcja.metrics.map((metryka) => ({
        etykieta: ETYKIETY_METRYK_RAPORTU[metryka.label],
        wartosc: metryka.value === null ? S.kreska : String(metryka.value),
      })),
    ),
  ];
}

// ---------------------------------------------------------------------------
// Świeżość wyniku TEGO okna (V126-JEZYK)
// ---------------------------------------------------------------------------

/**
 * Świeżość wyniku analizy specjalistycznej.
 *
 * DEFEKT NAPRAWIANY U ŹRÓDŁA (nadzór, 2026-08-07): nagłówek okna meldował
 * „brak wyników", gdy niżej stał zakończony przebieg z kompletem wielkości
 * i werdyktem. Przyczyna: okno pokazywało WSPÓLNY wskaźnik świeżości przypadku
 * (`useSwiezoscWynikow`), sterowany zdarzeniem magistrali `wyniki-gotowe`,
 * które emituje adapter rejestru przebiegów KANONICZNYCH
 * (`ui2/events/adapters/caseAdapter.ts` ← `useExecutionRunsStore`). Przebieg
 * V12.6 powstaje własną końcówką (`POST …/runs/v126/{rodzaj}`) i do tego
 * rejestru nie trafia, więc zdarzenie nie mogło paść NIGDY — wskaźnik z
 * definicji nie opisywał tego, co widać na ekranie.
 *
 * Naprawa NIE polega na emitowaniu `wyniki-gotowe` dla przebiegu spoza rejestru
 * (inni subskrybenci ładują wtedy wynik po nieznanym identyfikatorze — to samo
 * kłamstwo, tylko głośniejsze). Naprawa: świeżość okna wynika z JEDNEGO
 * predykatu — pary rewizji modelu — i jest liczona TĄ funkcją, wspólną dla
 * nagłówka i dla stanu przebiegu. Typ i formater pozostają wspólne z kontraktem
 * E15.2 (`OpisSwiezosci`, `opisSwiezosci`), więc słownictwo się nie rozjeżdża.
 *
 * Zero fizyki: porównanie dwóch numerów rewizji to prezentacja, nie obliczenie.
 */
export function swiezoscWyniku(
  rewizjaPrzyBiegu: number | null,
  rewizjaModelu: number,
): OpisSwiezosci {
  if (rewizjaPrzyBiegu === null) return { stan: 'brak', rewizjaModelu };
  if (rewizjaPrzyBiegu === rewizjaModelu) {
    return { stan: 'aktualne', rewizjaDanej: rewizjaPrzyBiegu, rewizjaModelu };
  }
  return {
    stan: 'nieaktualne',
    rewizjaDanej: rewizjaPrzyBiegu,
    rewizjaModelu,
    przyczyna: 'model-zmieniony',
  };
}
