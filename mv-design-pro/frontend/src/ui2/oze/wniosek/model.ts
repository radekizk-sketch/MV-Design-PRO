/*
 * Model okna „Wniosek OSD" (karta W-707 / E13). Czyste funkcje warstwy
 * prezentacji: wybór zakończonych przebiegów (rozpływ/zwarcie) z rejestru biegów,
 * uczciwa bramka kompletności formularza (powód blokady PL) oraz budowa żądania
 * `ZadanieWniosku` z danych okna i biegu NC RfG. Zero fizyki, zero mutacji, zero
 * wołań API stąd — wszystkie wielkości i werdykty pochodzą z backendu.
 */

import type { NcRfgModuleInput } from '../../../ui/ncrfg-tests/api';
import type { ExecutionRun } from '../../../ui/study-cases/types';
import { jestPrzebiegiemZwarciowym } from '../../wyniki/jakosc';
import type { ZadanieWniosku } from '../api';
import { WNIOSEK_STRINGS } from './strings';

/** Zakończone przebiegi rozpływu mocy (LOAD_FLOW/DONE) — kolejność źródłowa. */
export function przebiegiRozplywu(runs: readonly ExecutionRun[]): ExecutionRun[] {
  return runs.filter((r) => r.analysis_type === 'LOAD_FLOW' && r.status === 'DONE');
}

/** Zakończone przebiegi zwarciowe (rodzaj SC_, status DONE) — kolejność źródłowa. */
export function przebiegiZwarciowe(runs: readonly ExecutionRun[]): ExecutionRun[] {
  return runs.filter((r) => jestPrzebiegiemZwarciowym(r.analysis_type) && r.status === 'DONE');
}

/**
 * Domyślny wybór przebiegu: preferuje aktywny (gdy jest na liście), inaczej
 * OSTATNI z listy kandydatów. `null`, gdy brak kandydatów.
 */
export function domyslnyPrzebieg(
  kandydaci: readonly ExecutionRun[],
  activeRunId: string | null,
): string | null {
  if (kandydaci.length === 0) return null;
  const aktywny = kandydaci.find((r) => r.id === activeRunId);
  return (aktywny ?? kandydaci[kandydaci.length - 1]).id;
}

/** Stan formularza wniosku decydujący o dostępności generacji. */
export interface WejscieWniosku {
  readonly pfRunId: string | null;
  readonly scRunId: string | null;
  readonly busRef: string;
  readonly nazwaProjektu: string;
  /** Czy istnieje zakończony bieg NC RfG (macierz/certyfikat). */
  readonly maBiegNcRfg: boolean;
}

/**
 * Pierwszy powód blokady generacji (PL) lub `null`, gdy formularz kompletny.
 * Kolejność deterministyczna i spójna z bramką backendu: bieg NC RfG →
 * rozpływ → zwarcie → węzeł → nazwa projektu.
 */
export function powodBlokadyWniosku(w: WejscieWniosku): string | null {
  if (!w.maBiegNcRfg) return WNIOSEK_STRINGS.blokadaNcRfg;
  if (w.pfRunId === null) return WNIOSEK_STRINGS.blokadaBrakRozplywu;
  if (w.scRunId === null) return WNIOSEK_STRINGS.blokadaBrakZwarcia;
  if (w.busRef.trim() === '') return WNIOSEK_STRINGS.blokadaBrakWezla;
  if (w.nazwaProjektu.trim() === '') return WNIOSEK_STRINGS.blokadaBrakProjektu;
  return null;
}

/** Dane identyfikacyjne wniosku z formularza (pola tekstowe). */
export interface IdentyfikacjaFormularza {
  readonly nazwaProjektu: string;
  readonly nazwaPrzypadku: string;
  readonly wnioskodawca: string;
  readonly adres: string;
}

/** Parametry budowy żądania wniosku (wywoływane tylko dla kompletnego formularza). */
export interface ParametryZadaniaWniosku {
  readonly pfRunId: string;
  readonly scRunId: string;
  readonly busRef: string;
  readonly identyfikacja: IdentyfikacjaFormularza;
  readonly modules: readonly NcRfgModuleInput[];
  readonly procedureVersion?: string;
}

/** Pole opcjonalne: przycięte i `null`, gdy puste (kontrakt backendu). */
function polePcjonalne(wartosc: string): string | null {
  const przyciete = wartosc.trim();
  return przyciete === '' ? null : przyciete;
}

/**
 * Zbuduj żądanie wniosku OSD 1:1 z danymi okna i biegu NC RfG
 * (`ncRfgStore.ostatnieWejscia`). Pola opcjonalne przycięte i zamienione na
 * `null`, gdy puste; węzeł i nazwa projektu przycięte (bramka wymaga niepustych).
 */
export function zbudujZadanieWniosku(params: ParametryZadaniaWniosku): ZadanieWniosku {
  return {
    nazwa_projektu: params.identyfikacja.nazwaProjektu.trim(),
    nazwa_przypadku: polePcjonalne(params.identyfikacja.nazwaPrzypadku),
    wnioskodawca: polePcjonalne(params.identyfikacja.wnioskodawca),
    adres_przylaczenia: polePcjonalne(params.identyfikacja.adres),
    pf_run_id: params.pfRunId,
    sc_run_id: params.scRunId,
    bus_ref: params.busRef.trim(),
    run_request: {
      modules: params.modules,
      procedure_version: params.procedureVersion,
    },
  };
}
