/**
 * Znamiona rozdzielnicy SN stacji z aparatury pól (karta JEDNA-SCIEZKA-EDYCJI).
 *
 * Rozdzielnica nie ma w modelu ENM osobnego rekordu znamion — jej prąd znamionowy i prąd
 * zwarciowy znamionowy to znamiona aparatów jej pól (`Bay.apparatus_catalog_ref` → pozycja
 * katalogu aparatury SN). Wartością stacji jest aparat NAJSŁABSZY (ogranicza całą
 * rozdzielnicę) — wybór minimum z danych katalogu, bez rachunku fizycznego.
 *
 * Zasada nr 4: gdy karta aparatu nie podaje prądu cieplnego 1 s, wartością jest propozycja
 * rejestru wartości roboczych backendu (`wartosci_robocze` pozycji, parametr `i_th_ka`) —
 * oznaczona `ESTIMATED` z podstawą. Brak aparatu w polu to brak MODELU (licznik pól bez
 * aparatu), nie powód do wymyślania wartości.
 */

import type { MVApparatusType } from '../../catalog/types';
import type { ZnamieRozdzielnicy } from './cards/StationConfigSnSwitchgearCard';

export interface PoleZAparatem {
  readonly designation: string;
  readonly apparatusCatalogRef: string | null;
}

export interface ZnamionaRozdzielnicy {
  readonly ratedCurrent: ZnamieRozdzielnicy | null;
  readonly ratedShortCircuit: ZnamieRozdzielnicy | null;
  readonly baysWithoutApparatus: number;
}

interface Kandydat {
  readonly znamie: ZnamieRozdzielnicy;
}

function najslabszy(kandydaci: readonly Kandydat[]): ZnamieRozdzielnicy | null {
  let wynik: ZnamieRozdzielnicy | null = null;
  for (const { znamie } of kandydaci) {
    // Remis rozstrzyga kolejność pól (deterministycznie: pierwsze pole wygrywa).
    if (wynik === null || znamie.wartosc < wynik.wartosc) wynik = znamie;
  }
  return wynik;
}

export function znamionaRozdzielnicy(
  pola: readonly PoleZAparatem[],
  aparaty: readonly MVApparatusType[],
): ZnamionaRozdzielnicy {
  const wgId = new Map(aparaty.map((aparat) => [aparat.id, aparat]));
  const prady: Kandydat[] = [];
  const zwarcia: Kandydat[] = [];
  let bezAparatu = 0;
  for (const pole of pola) {
    const aparat = pole.apparatusCatalogRef ? wgId.get(pole.apparatusCatalogRef) : undefined;
    if (!aparat) {
      bezAparatu += 1;
      continue;
    }
    const zrodloPl = `${aparat.name}, pole ${pole.designation}`;
    if (typeof aparat.i_n_a === 'number' && aparat.i_n_a > 0) {
      prady.push({ znamie: { wartosc: aparat.i_n_a, jednostka: 'A', zrodloPl, jakosc: 'DATASHEET' } });
    }
    if (typeof aparat.i_th_ka === 'number' && aparat.i_th_ka > 0) {
      zwarcia.push({ znamie: { wartosc: aparat.i_th_ka, jednostka: 'kA', zrodloPl, jakosc: 'DATASHEET' } });
    } else {
      const robocza = (aparat.wartosci_robocze ?? []).find((p) => p.parametr === 'i_th_ka');
      if (robocza) {
        zwarcia.push({
          znamie: {
            wartosc: robocza.wartosc,
            jednostka: robocza.jednostka,
            zrodloPl,
            jakosc: 'ESTIMATED',
            podstawaPl: robocza.odniesienie,
          },
        });
      }
    }
  }
  return {
    ratedCurrent: najslabszy(prady),
    ratedShortCircuit: najslabszy(zwarcia),
    baysWithoutApparatus: bezAparatu,
  };
}
