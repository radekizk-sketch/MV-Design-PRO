/**
 * QET-SCADA Frame 2.0 — zatwierdzony kontrakt właścicielski.
 *
 * SYMBOLE ŁĄCZNIKÓW MAJĄ DOKŁADNIE DWIE REPREZENTACJE:
 *   ZAMKNIĘTY → czerwona ramka + styk zamknięty;
 *   OTWARTY   → zielona ramka + styk otwarty.
 *
 * Brak stanu / stan sprzeczny / zła jakość danych → BŁĄD WALIDACJI,
 * brak ramki i brak sugerowanego położenia. Nie tworzyć trzeciego symbolu.
 * Stan napięciowy, przepływ, alarm, blokada i wyniki nie wpływają na barwę.
 *
 * Moduł nie steruje rzeczywistą SCADA ani nie wywołuje solvera.
 * Źródłem prawdy pozostaje wersjonowany ENM/scenariusz.
 */
export type PolozenieMechaniczne = 'OTWARTY' | 'ZAMKNIETY';
export type StanEksploatacyjny = 'NORMALNY' | 'WYZWOLONY' | 'ZABLOKOWANY' | 'AWARIA';
export type JakoscDanych = 'PRAWIDLOWE' | 'PRZESTARZALE' | 'NIEWIARYGODNE' | 'BRAK';
export type ZrodloStanu = 'TELEMETRIA' | 'ENM' | 'SYMULACJA';
export type StanZasilenia = 'POD_NAPIECIEM' | 'BEZ_NAPIECIA' | 'NIEUSTALONY';
export type StanWkladki = 'SPRAWNA' | 'PRZEPALONA' | 'NIEZNANY';
export type RodzajAparatu = 'LACZNIK' | 'BEZPIECZNIK' | 'ELEMENT_STALY';
export type RodzajRamki = 'ZAMKNIETY' | 'OTWARTY' | 'BRAK_RAMKI';

export interface KontraktWersjiSld {
  readonly scenarioId: string;
  readonly enmVersion: string;
  readonly topologyHash: string;
  readonly resultSnapshotId?: string | null;
  readonly resultTopologyHash?: string | null;
  readonly resultEnmVersion?: string | null;
  readonly resultScenarioId?: string | null;
}

/** Stan poszczególnych biegunów z ENM; PE i PEN nie są przełączane. */
export interface BiegunLacznika {
  readonly faza: 'L1' | 'L2' | 'L3' | 'N';
  readonly polozenie: PolozenieMechaniczne | null;
}

export interface ScadaFrameInput {
  readonly elementRef: string;
  readonly rodzaj: RodzajAparatu;
  /** Puste położenie jest błędem danych, NIE trzecim stanem łączeniowym. */
  readonly polozenie: PolozenieMechaniczne | null;
  /** Opcjonalny jawny kontrakt wielobiegunowy, nigdy zgadywany z nazwy. */
  readonly bieguny?: readonly BiegunLacznika[];
  readonly eksploatacja: StanEksploatacyjny;
  readonly jakosc: JakoscDanych;
  readonly zrodlo: ZrodloStanu;
  readonly zasilenie: StanZasilenia;
  readonly wkladka?: StanWkladki;
  readonly wersjaStanu: KontraktWersjiSld;
  readonly wersjaWidoku: KontraktWersjiSld;
}

export interface ScadaFrameWynik {
  readonly ramka: RodzajRamki;
  /** null oznacza niepoprawny model, nie trzeci wariant graficzny. */
  readonly stanGeometryczny: 'closed' | 'open' | null;
  readonly etykieta: string;
  readonly zrodlo: ZrodloStanu;
  /** Metadane inspektora; nie powstaje z nich oznaczenie na SLD. */
  readonly alarm: boolean;
  readonly blokada: boolean;
  readonly niespojnosc: boolean;
  readonly wynikiAktualne: boolean;
  readonly poprawnyDlaTopologii: boolean;
  readonly moznaSymulowacZmiane: boolean;
  readonly komunikaty: readonly string[];
}

export function ocenStanRamki(input: ScadaFrameInput): ScadaFrameWynik {
  const uwagi: string[] = [];
  const v = input.wersjaWidoku;
  const s = input.wersjaStanu;
  const zgodnoscStanu = s.scenarioId === v.scenarioId &&
    s.enmVersion === v.enmVersion && s.topologyHash === v.topologyHash;
  const wynikiAktualne = Boolean(v.resultSnapshotId &&
    v.resultTopologyHash === v.topologyHash &&
    v.resultEnmVersion === v.enmVersion &&
    v.resultScenarioId === v.scenarioId);

  if (!zgodnoscStanu) uwagi.push('Stan niezgodny z wersją ENM lub scenariusza.');
  if (!wynikiAktualne) uwagi.push('Wyniki obliczeniowe nieaktualne lub niedostępne.');
  if (input.jakosc !== 'PRAWIDLOWE') uwagi.push('Brak wiarygodnego położenia aparatu.');

  const alarm = input.eksploatacja === 'WYZWOLONY' ||
    input.eksploatacja === 'AWARIA' || input.wkladka === 'PRZEPALONA';
  const blokada = input.eksploatacja === 'ZABLOKOWANY';

  if (input.rodzaj !== 'LACZNIK') {
    return {
      ramka: 'BRAK_RAMKI',
      stanGeometryczny: null,
      etykieta: input.rodzaj === 'BEZPIECZNIK'
        ? (input.wkladka === 'PRZEPALONA' ? 'WKŁADKA PRZEPALONA' :
          input.wkladka === 'SPRAWNA' ? 'WKŁADKA SPRAWNA' : 'BRAK DANYCH WKŁADKI')
        : 'ELEMENT BEZ ŁĄCZNIKA',
      zrodlo: input.zrodlo, alarm, blokada: false,
      niespojnosc: false, wynikiAktualne,
      poprawnyDlaTopologii: true,
      moznaSymulowacZmiane: false, komunikaty: uwagi,
    };
  }

  if (input.polozenie !== 'ZAMKNIETY' && input.polozenie !== 'OTWARTY')
    uwagi.push('Nie określono położenia łącznika: OTWARTY lub ZAMKNIĘTY.');
  const niespojnoscWyzwolenia =
    input.eksploatacja === 'WYZWOLONY' && input.polozenie === 'ZAMKNIETY';
  if (niespojnoscWyzwolenia)
    uwagi.push('Sprzeczność: wyzwolony wyłącznik wskazuje położenie ZAMKNIĘTY.');

  let niespojnoscBiegunow = false;
  if (input.bieguny !== undefined) {
    const fazy = new Set<string>();
    if (input.bieguny.length === 0) niespojnoscBiegunow = true;
    for (const biegun of input.bieguny) {
      if (fazy.has(biegun.faza) || biegun.polozenie === null ||
        biegun.polozenie !== input.polozenie) niespojnoscBiegunow = true;
      fazy.add(biegun.faza);
    }
    if (niespojnoscBiegunow) {
      uwagi.push('Niespójne położenia biegunów — nie można nadać jednej ramki.');
    }
  }

  const niespojnosc = niespojnoscWyzwolenia || niespojnoscBiegunow;
  const poprawnyDlaTopologii = zgodnoscStanu &&
    input.jakosc === 'PRAWIDLOWE' &&
    (input.polozenie === 'ZAMKNIETY' || input.polozenie === 'OTWARTY') &&
    !niespojnosc;
  const ramka: RodzajRamki = !poprawnyDlaTopologii ? 'BRAK_RAMKI' :
    input.polozenie === 'ZAMKNIETY' ? 'ZAMKNIETY' : 'OTWARTY';

  return {
    ramka,
    stanGeometryczny: ramka === 'ZAMKNIETY' ? 'closed' :
      ramka === 'OTWARTY' ? 'open' : null,
    etykieta: ramka === 'ZAMKNIETY' ? 'ZAMKNIĘTY' :
      ramka === 'OTWARTY' ? 'OTWARTY' : 'BŁĄD WALIDACJI',
    zrodlo: input.zrodlo, alarm, blokada, niespojnosc,
    wynikiAktualne, poprawnyDlaTopologii,
    moznaSymulowacZmiane: poprawnyDlaTopologii && !blokada && !alarm,
    komunikaty: uwagi,
  };
}

/** Bramka prezentacji wyników dla pełnego zestawu aparatów z kanonicznego ENM.
 * Wywołujący musi dostarczyć KOMPLETNĄ listę łączników scenariusza.
 * Bramka nie zastępuje walidacji topologii i fizyki w backendzie.
 */
export function zweryfikujPolozeniaDoObliczen(
  aparatyZEnm: readonly ScadaFrameInput[],
): { readonly moznaObliczac: boolean; readonly bledy: readonly string[] } {
  const bledy: string[] = [];
  for (const aparat of aparatyZEnm) {
    if (aparat.rodzaj !== 'LACZNIK') continue;
    const wynik = ocenStanRamki(aparat);
    if (!wynik.poprawnyDlaTopologii)
      bledy.push(...wynik.komunikaty
        .filter(uwaga => !uwaga.startsWith('Wyniki obliczeniowe'))
        .map(uwaga => `${aparat.elementRef}: ${uwaga}`));
  }
  return { moznaObliczac: bledy.length === 0, bledy };
}
