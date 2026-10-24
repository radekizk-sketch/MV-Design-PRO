/**
 * QET-SCADA Frame 1.0 — kanoniczny kontrakt stanu aparatu SN/nN.
 *
 * Nie utożsamia: położenia mechanicznego, obecności napięcia, przepływu,
 * alarmu ani jakości danych. Ramka CZERWONA = ZAMKNIĘTY; ZIELONA = OTWARTY.
 * Otwarty nie znaczy bez napięcia. Zamknięty nie znaczy, że płynie prąd.
 *
 * B-02: nie wydaje poleceń SCADA, nie oblicza rozpływu ani zwarć.
 * Zewnętrzne ENM / scenariusz / solver są wyłącznym źródłem prawdy.
 */
export type PolozenieMechaniczne = 'OTWARTY' | 'ZAMKNIETY' | 'W_PRZELACZANIU' | 'NIEZNANY';
export type StanEksploatacyjny = 'NORMALNY' | 'WYZWOLONY' | 'ZABLOKOWANY' | 'AWARIA';
export type JakoscDanych = 'PRAWIDLOWE' | 'PRZESTARZALE' | 'NIEWIARYGODNE' | 'BRAK';
export type ZrodloStanu = 'TELEMETRIA' | 'ENM' | 'SYMULACJA';
export type StanZasilenia = 'POD_NAPIECIEM' | 'BEZ_NAPIECIA' | 'NIEUSTALONY';
export type StanWkladki = 'SPRAWNA' | 'PRZEPALONA' | 'NIEZNANY';
export type RodzajAparatu = 'LACZNIK' | 'BEZPIECZNIK' | 'ELEMENT_STALY';
export type RodzajRamki = 'ZAMKNIETY' | 'OTWARTY' | 'NIEZNANY' | 'PRZEJSCIOWY' | 'BRAK_RAMKI';

export interface KontraktWersjiSld {
  /** Identyfikacja atomowego przebiegu/projekcji z backendu. */
  readonly scenarioId: string;
  readonly enmVersion: string;
  readonly topologyHash: string;
  readonly resultSnapshotId?: string | null;
  readonly resultTopologyHash?: string | null;
  readonly resultEnmVersion?: string | null;
  readonly resultScenarioId?: string | null;
}

export interface ScadaFrameInput {
  readonly elementRef: string;
  readonly rodzaj: RodzajAparatu;
  readonly polozenie: PolozenieMechaniczne;
  readonly eksploatacja: StanEksploatacyjny;
  readonly jakosc: JakoscDanych;
  readonly zrodlo: ZrodloStanu;
  readonly zasilenie: StanZasilenia;
  /** Nie dotyczy łącznika; nigdy nie zamienia bezpiecznika w łącznik. */
  readonly wkladka?: StanWkladki;
  readonly wersjaStanu: KontraktWersjiSld;
  readonly wersjaWidoku: KontraktWersjiSld;
}

export interface ScadaFrameWynik {
  readonly ramka: RodzajRamki;
  readonly stanGeometryczny: 'closed' | 'open' | 'unknown';
  readonly etykieta: string;
  readonly zrodlo: ZrodloStanu;
  readonly alarm: boolean;
  readonly blokada: boolean;
  readonly niespojnosc: boolean;
  readonly wynikiAktualne: boolean;
  readonly moznaSymulowacZmiane: boolean;
  readonly komunikaty: readonly string[];
}

export function ocenStanRamki(input: ScadaFrameInput): ScadaFrameWynik {
  const uwagi: string[] = [];
  const v = input.wersjaWidoku;
  const s = input.wersjaStanu;
  const zgodnoscStanu =
    s.scenarioId === v.scenarioId &&
    s.enmVersion === v.enmVersion &&
    s.topologyHash === v.topologyHash;
  const wynikiAktualne =
    Boolean(v.resultSnapshotId && v.resultTopologyHash === v.topologyHash &&
      v.resultEnmVersion === v.enmVersion &&
      v.resultScenarioId === v.scenarioId);

  if (!zgodnoscStanu) uwagi.push('Stan z innej wersji ENM lub scenariusza.');
  if (!wynikiAktualne) uwagi.push('Wyniki obliczeniowe nieaktualne lub niedostępne.');
  if (input.jakosc !== 'PRAWIDLOWE') uwagi.push('Brak wiarygodnego bieżącego położenia.');

  const alarm = input.eksploatacja === 'WYZWOLONY' || input.eksploatacja === 'AWARIA'
    || input.wkladka === 'PRZEPALONA';
  const blokada = input.eksploatacja === 'ZABLOKOWANY';
  if (input.rodzaj !== 'LACZNIK') {
    return {
      ramka: 'BRAK_RAMKI',
      stanGeometryczny: 'unknown',
      etykieta: input.rodzaj === 'BEZPIECZNIK'
        ? (input.wkladka === 'PRZEPALONA' ? 'WKŁADKA PRZEPALONA' : input.wkladka === 'SPRAWNA' ? 'WKŁADKA SPRAWNA' : 'STAN WKŁADKI NIEZNANY')
        : 'ELEMENT BEZ STANU ŁĄCZENIOWEGO',
      zrodlo: input.zrodlo, alarm, blokada: false, niespojnosc: false, wynikiAktualne,
      moznaSymulowacZmiane: false, komunikaty: uwagi,
    };
  }

  const niespojnosc = input.eksploatacja === 'WYZWOLONY' && input.polozenie === 'ZAMKNIETY';
  if (niespojnosc) uwagi.push('Stan WYZWOLONY jest sprzeczny z położeniem ZAMKNIĘTY.');
  const pewny = zgodnoscStanu && input.jakosc === 'PRAWIDLOWE' && !niespojnosc;
  const ramka: RodzajRamki = !pewny
    ? 'NIEZNANY'
    : input.polozenie === 'ZAMKNIETY' ? 'ZAMKNIETY'
    : input.polozenie === 'OTWARTY' ? 'OTWARTY'
    : input.polozenie === 'W_PRZELACZANIU' ? 'PRZEJSCIOWY'
    : 'NIEZNANY';
  const stanGeometryczny: ScadaFrameWynik['stanGeometryczny'] =
    ramka === 'ZAMKNIETY' ? 'closed' : ramka === 'OTWARTY' ? 'open' : 'unknown';
  const etykieta = ramka === 'ZAMKNIETY' ? 'ZAMKNIĘTY'
    : ramka === 'OTWARTY' ? 'OTWARTY'
    : ramka === 'PRZEJSCIOWY' ? 'W PRZEŁĄCZANIU' : 'NIEZNANY';

  return {
    ramka, stanGeometryczny, etykieta,
    zrodlo: input.zrodlo, alarm, blokada, niespojnosc, wynikiAktualne,
    // Nie jest pozwoleniem operacyjnym. Inspektor musi odrębnie sprawdzić
    // blokady, EAZ, bezpieczeństwo i wynik kalkulacji przed wykonaniem symulacji.
    moznaSymulowacZmiane: pewny && !blokada
      && (ramka === 'ZAMKNIETY' || ramka === 'OTWARTY'),
    komunikaty: uwagi,
  };
}
