// @vitest-environment node
/*
 * Znacznik ostrzeżenia rankingu N-1 z REKORDU kategorii (karta WERDYKT-MIGRACJA-190).
 *
 * Dawniej komórka zapalała znacznik z `licznik > 0` (próg okna bez kryterium i podstawy),
 * a licznik zero przy pominiętym kryterium wyglądał jak „w normie”. Teraz znacznik czyta
 * status rekordu kategorii kontyngencji o tym samym `element_ref`.
 *
 * Iloczyn cech: kategoria (odbiory, przeciążenia, napięcia) × rekord (naruszony / nie)
 * × licznik (0 / dodatni). Wariant „licznik dodatni, rekord nienaruszony” i „licznik 0, rekord
 * naruszony” rozróżnia odczyt rekordu od porównania licznika — reguła licznikowa nie przejdzie.
 */
import { describe, expect, it } from 'vitest';

import type { Kontyngencja, OcenyKontyngencji, PozycjaRankingu } from '../api';
import { naWierszeRankingu } from '../model';
import { MACIERZ, OCENY } from './fixtures';

type Kategoria = keyof OcenyKontyngencji;
const KOLUMNA: Record<Kategoria, 'odbiory' | 'przeciazenia' | 'napiecia'> = {
  odbiory_bez_zasilania: 'odbiory',
  przeciazenia: 'przeciazenia',
  naruszenia_napiecia: 'napiecia',
};
const KATEGORIE = Object.keys(KOLUMNA) as Kategoria[];

/** Rekord naruszony i nienaruszony danej kategorii — z realnych wariantów backendu. */
function rekord(kategoria: Kategoria, naruszony: boolean): OcenyKontyngencji[Kategoria] {
  if (kategoria === 'odbiory_bez_zasilania') {
    return naruszony ? OCENY.odbiory_odciete.odbiory_bez_zasilania : OCENY.bazowy.odbiory_bez_zasilania;
  }
  if (kategoria === 'przeciazenia') {
    return naruszony ? OCENY.z_przeciazeniem.przeciazenia : OCENY.bazowy.przeciazenia;
  }
  // Rekord naruszenia napięcia: rekord przeciążeń o statusie naruszonym niesie ten sam kształt
  // W — test sprawdza odczyt statusu, nie treść kryterium.
  return naruszony ? OCENY.z_przeciazeniem.przeciazenia : OCENY.bazowy.naruszenia_napiecia;
}

const ZRODLO = MACIERZ.kontyngencje.find((k) => k.element_ref === 'ka_magistrala') as Kontyngencja;
const POZYCJA = MACIERZ.ranking.find((p) => p.element_ref === 'ka_magistrala') as PozycjaRankingu;

describe('naWierszeRankingu — znacznik z rekordu kategorii', () => {
  const przypadki = KATEGORIE.flatMap((kategoria) =>
    [true, false].flatMap((naruszony) =>
      [0, 3].map((licznik) => [kategoria, naruszony, licznik] as const),
    ),
  );

  it.each(przypadki)('%s · rekord naruszony=%s · licznik=%s', (kategoria, naruszony, licznik) => {
    const kontyngencja: Kontyngencja = {
      ...ZRODLO,
      oceny: { ...OCENY.bazowy, [kategoria]: rekord(kategoria, naruszony) },
    };
    const pozycja: PozycjaRankingu = {
      ...POZYCJA,
      dotkliwosc: { ...POZYCJA.dotkliwosc, [kategoria]: licznik },
    };
    const [wiersz] = naWierszeRankingu([pozycja], [kontyngencja]);
    const komorka = wiersz[KOLUMNA[kategoria]];
    expect(komorka.ostrzezenie).toBe(naruszony);
    // Licznik zostaje wartością komórki (fakt biegu), nie werdyktem.
    expect(komorka.wartosc).toBe(String(licznik));
  });

  it('pozycja bez kontyngencji o tym samym element_ref nie dostaje znacznika', () => {
    const [wiersz] = naWierszeRankingu([POZYCJA], []);
    for (const kategoria of KATEGORIE) {
      expect(wiersz[KOLUMNA[kategoria]].ostrzezenie).toBe(false);
    }
  });
});

describe('fikstura ekranu — rekord kategorii zgodny z licznikiem wariantu', () => {
  const warianty = [
    ['bazowy', MACIERZ.przypadek_bazowy] as const,
    ...MACIERZ.kontyngencje.map((k) => [k.element_ref, k] as const),
  ];
  it.each(warianty)('%s', (_nazwa, wariant) => {
    for (const kategoria of KATEGORIE) {
      const licznik = wariant.dotkliwosc[kategoria];
      const status = wariant.oceny[kategoria].status_maszynowy;
      if (licznik === null) {
        expect(['NIE_OCENIONO', 'NIE_DOTYCZY']).toContain(status);
      } else {
        expect(status === 'NIE_SPELNIA').toBe(licznik > 0);
      }
    }
  });
});
