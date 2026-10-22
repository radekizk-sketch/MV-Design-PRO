/**
 * Karta GPZ-H5-SLD etap 2 (wymaganie 1) — stan karty GPZ prawego inspektora: bilans
 * zasilania i odpływów, przeciążenia, tabela pól (rola, automatyka, P/Q/I/U) i jedna
 * zbiorcza informacja o polach bez aparatu w modelu. Te dane do etapu 2 były rysowane
 * w geometrii schematu (belka nagłówka, tabela „Pola GPZ", tła ról pól) i zabierały
 * kadrowi miejsce, którego potrzebuje sam schemat; dziś schemat niesie oznaczenia i stan
 * aparatów, a dane pól — ta karta, otwierana klikiem w nagłówek bloku GPZ (selekcja GPZ).
 *
 * Źródła (bez kopii i bez fizyki):
 * - lista pól — `scene.meta.gpzPola` sceny rozwiniętej (L2) z tej samej pamięci scen co
 *   kanwa (`scenaSld`); ta sama lista karmi rachunek pokrycia wyników
 *   (`resultPointsInGpzPanel`), więc „opisane w karcie GPZ" i wiersze karty mają jedno
 *   źródło;
 * - wartości — wiersze `Bay`/`Substation` z `results/v1` (`buildGpzWynikiOverlay`), z biegu
 *   oglądanego, gdy jest rozpływem, albo z aktywnego biegu rodziny rozpływu
 *   (`payloadWynikowGpz`, karta K8);
 * - świeżość — jeden predykat świeżości biegu (`useSwiezoscBiegu`) dla TEGO biegu, z którego
 *   pochodzą wartości.
 */
import { useMemo } from 'react';

import { useSnapshotStore } from '../../topology/snapshotStore';
import {
  payloadNakladki,
  useAktywnyBieg,
  useNakladkaBieguOgladanego,
  useSwiezoscBiegu,
  useWynikBiegu,
} from '../../../ui2/wyniki/kontekst/kontekstWyniku';
import { scenaSld } from '../../sld/v3/scene/scenaSld';
import {
  buildGpzWynikiOverlay,
  payloadWynikowGpz,
  type GpzWynikiOverlay,
  type WynikiPolaGpz,
} from '../../sld/v3/canvas/gpzWyniki';
import {
  ETYKIETA_ROLI_POLA_PL,
  OPIS_PLAKIETKI_PL,
  TEKST_BRAKU_WARTOSCI,
  TEKST_POLA_BEZ_OZNACZENIA,
  tekstAlarmowGpz,
  tekstOdplywowGpz,
  tekstPolBezAparatuGpz,
  tekstStanuWartosciPolaGpz,
  tekstTytuluTabeliGpz,
  tekstZasilaniaGpz,
  type BilansGpzWartosci,
  type PoleTabeliGpzWejscie,
  type StanDanychPolaGpz,
} from '../../sld/v3/compose/gpzAdnotacje';
import type { GpzStatusFlag, RolaPolaGpz } from '../../sld/v2/canvas/canonicalGpzModel';

export interface PlakietkaKartyGpz {
  readonly kod: GpzStatusFlag;
  readonly opisPl: string;
}

export interface WierszPolaKartyGpz {
  readonly bayRef: string;
  readonly oznaczenie: string;
  readonly rola: RolaPolaGpz;
  readonly rolaPl: string;
  readonly plakietki: readonly PlakietkaKartyGpz[];
  readonly stanDanych: StanDanychPolaGpz | null;
  /** Napis zamiast wartości (pole rezerwowe / bez odpływu / obliczenie niewykonane);
   *  `null` = wiersz pokazuje cztery wartości. */
  readonly napisStanu: string | null;
  /** Wartości P, Q, I, U (gotowe napisy z wyniku backendu; brak wielkości = „brak"). */
  readonly wartosci: Readonly<Record<keyof WynikiPolaGpz, string>> | null;
}

export type StanWynikuKartyGpz = 'brak' | 'aktualny' | 'nieaktualny';

export interface StanKartyGpz {
  readonly gpzRef: string;
  readonly wynik: StanWynikuKartyGpz;
  readonly runId: string | null;
  readonly tytul: string;
  readonly zasilanie: string;
  readonly odplywy: string;
  readonly alarmy: string;
  readonly polaBezAparatu: string | null;
  readonly wiersze: readonly WierszPolaKartyGpz[];
}

const BILANS_BEZ_WIERSZA: BilansGpzWartosci = {
  pZasilaniaMw: null,
  qZasilaniaMvar: null,
  pOdplywowMw: null,
  qOdplywowMvar: null,
};

const KLUCZE_WARTOSCI: readonly (keyof WynikiPolaGpz)[] = ['p', 'q', 'i', 'u'];

/** Stan karty GPZ — czysta funkcja listy pól i wyników (test iloczynu bez magazynów). */
export function stanKartyGpz(
  gpzRef: string,
  pola: readonly PoleTabeliGpzWejscie[],
  wyniki: GpzWynikiOverlay | null,
  runId: string | null = null,
): StanKartyGpz {
  const maWynik = wyniki !== null;
  const nieaktualny = wyniki?.nieaktualny ?? false;
  const stacja = wyniki?.stacje[gpzRef] ?? null;
  const wiersze = pola.map((pole): WierszPolaKartyGpz => {
    const wartosciPola = wyniki?.pola[pole.bayRef] ?? null;
    const maWartosci = wartosciPola !== null && KLUCZE_WARTOSCI.some((k) => wartosciPola[k] !== null);
    const napisStanu = tekstStanuWartosciPolaGpz(pole.stanDanych, maWynik, maWartosci);
    return {
      bayRef: pole.bayRef,
      oznaczenie: pole.oznaczenie ?? TEKST_POLA_BEZ_OZNACZENIA,
      rola: pole.rola,
      rolaPl: ETYKIETA_ROLI_POLA_PL[pole.rola],
      plakietki: pole.plakietki.map((kod) => ({ kod, opisPl: OPIS_PLAKIETKI_PL[kod] })),
      stanDanych: pole.stanDanych,
      napisStanu,
      wartosci:
        napisStanu === null && maWynik
          ? {
              p: wartosciPola?.p ?? TEKST_BRAKU_WARTOSCI,
              q: wartosciPola?.q ?? TEKST_BRAKU_WARTOSCI,
              i: wartosciPola?.i ?? TEKST_BRAKU_WARTOSCI,
              u: wartosciPola?.u ?? TEKST_BRAKU_WARTOSCI,
            }
          : null,
    };
  });
  return {
    gpzRef,
    wynik: !maWynik ? 'brak' : nieaktualny ? 'nieaktualny' : 'aktualny',
    runId: maWynik ? runId : null,
    tytul: tekstTytuluTabeliGpz(maWynik, nieaktualny, wyniki?.zBieguSpozaWidoku ?? false),
    // Wynik jest, ale bez wiersza stacji: bilans mówi „brak wyniku źródła / kompletu pól”,
    // a nie „brak wyniku rozpływu mocy” (to drugie znaczy, że biegu nie ma).
    zasilanie: tekstZasilaniaGpz(maWynik ? stacja?.bilans ?? BILANS_BEZ_WIERSZA : null),
    odplywy: tekstOdplywowGpz(maWynik ? stacja?.bilans ?? BILANS_BEZ_WIERSZA : null),
    alarmy: tekstAlarmowGpz(stacja?.liczbaPrzeciazen ?? null, maWynik, nieaktualny),
    polaBezAparatu: tekstPolBezAparatuGpz(pola),
    wiersze,
  };
}

/**
 * Stan karty GPZ dla selekcji `ref`; `null`, gdy wskazany obiekt nie jest GPZ rysowanym
 * na schemacie (scena bez GPZ albo inny obiekt).
 */
export function useStanKartyGpz(ref: string | null): StanKartyGpz | null {
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const nakladka = useNakladkaBieguOgladanego();
  const biegRozplywu = useAktywnyBieg('rozplyw');
  const wynikRozplywu = useWynikBiegu(biegRozplywu?.id ?? null);
  const payloadRozplywu = useMemo(
    () =>
      wynikRozplywu?.rodzaj === 'gotowe' && wynikRozplywu.wynik.runId === biegRozplywu?.id
        ? payloadNakladki(wynikRozplywu.wynik)
        : null,
    [biegRozplywu?.id, wynikRozplywu],
  );
  const zrodlo = useMemo(() => payloadWynikowGpz(nakladka.payload, payloadRozplywu), [nakladka.payload, payloadRozplywu]);
  const biegZrodla = zrodlo.payload === null ? null : zrodlo.zBieguSpozaWidoku ? biegRozplywu : nakladka.bieg;
  const swiezosc = useSwiezoscBiegu(biegZrodla);
  return useMemo(() => {
    if (!snapshot || ref === null) return null;
    const scena = scenaSld(snapshot, 2);
    if (!scena.meta.gpzId || scena.meta.gpzId !== ref || !scena.meta.gpzPola) return null;
    const wyniki = buildGpzWynikiOverlay(zrodlo.payload, zrodlo.zBieguSpozaWidoku);
    const zeSwiezoscia = wyniki ? { ...wyniki, nieaktualny: swiezosc?.stan === 'nieaktualny' } : null;
    return stanKartyGpz(ref, scena.meta.gpzPola, zeSwiezoscia, zrodlo.payload?.run_id ?? null);
  }, [ref, snapshot, swiezosc?.stan, zrodlo]);
}
