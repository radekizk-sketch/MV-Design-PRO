/*
 * Teksty ekranu „Nowy / otwórz projekt" (przestrzeń „Projekt", okno W-102,
 * karta E2.2) — wyłącznie polski język techniczny (MODEL_INTERAKCJI §2.7).
 * Dokładne stringi pierwszoplanowe wg karty §3: „Co projektujesz?", „Nowa
 * sieć SN", „Przyłączenie źródła OZE", „Rozbudowa istniejącej sieci",
 * „Audyt istniejącej sieci", „Zacznij od gotowego przykładu", „Istniejące
 * projekty", „Otwórz", „Nazwa", „Ostatnia zmiana".
 *
 * Centralizacja tekstu = jedno źródło etykiet (importowane wprost przez testy
 * jako oczekiwane wartości) oraz brak literałów w JSX (zgodność z guardem
 * terminologii UI, który skanuje tekst JSX).
 */

export const OTWORZ_STRINGS = {
  // Nagłówek okna (rejestr okien: W-102 „Nowy projekt / otwórz projekt")
  tytul: 'Nowy projekt / otwórz projekt',

  // Sekcja „Cel projektu" (audyt W-102: „start od celu")
  celTytul: 'Co projektujesz?',
  celKonsekwencja: 'Wybór ustawia domyślną przestrzeń i tryb.',
  celNowaSiec: 'Nowa sieć SN',
  celNowaSiecOpis:
    'Pusty model — kreator prowadzi krok po kroku przez GPZ, magistralę i stacje SN/nn.',
  celPrzylaczenieOze: 'Przyłączenie źródła OZE',
  celPrzylaczenieOzeOpis:
    'Model sieci plus nowe źródło (PV, wiatr, magazyn) i punkt przyłączenia — pod wniosek do OSD.',
  celRozbudowa: 'Rozbudowa istniejącej sieci',
  celRozbudowaOpis:
    'Wczytujesz istniejący model i dodajesz nowe elementy do sieci już w eksploatacji.',
  celAudyt: 'Audyt istniejącej sieci',
  celAudytOpis:
    'Analiza istniejącego modelu bez zmian topologii — obliczenia, diagnostyka, zgodność normatywna.',

  // Sekcja „Gotowe przykłady" (SPEC_KREATORY §4, Z3)
  przykladyTytul: 'Zacznij od gotowego przykładu',

  // Sekcja „Istniejące projekty"
  projektyTytul: 'Istniejące projekty',
  kolNazwa: 'Nazwa',
  kolOstatniaZmiana: 'Ostatnia zmiana',
  otworz: 'Otwórz',
  brakProjektow: 'Brak istniejących projektów',
  ladowanieProjektow: 'Wczytywanie listy projektów…',

  // Parytet z mostem #dashboard (karta KD-1, luki L-2…L-5)
  odswiezListe: 'Odśwież listę',
  usunProjekt: 'Usuń projekt',
  usunTytul: 'Usunąć projekt?',
  usunPytanie: (nazwa: string) =>
    `Projekt „${nazwa}" zostanie trwale usunięty razem z modelem sieci, wariantami obliczeń i historią przebiegów.`,
  usunNieodwracalne: 'Operacji nie można cofnąć.',
  usunPotwierdz: 'Usuń projekt',
  anuluj: 'Anuluj',
  usunieto: (nazwa: string) => `Usunięto projekt „${nazwa}".`,
  bladUsuwania: 'Nie udało się usunąć projektu.',

  // Nowy projekt z własną nazwą i opisem (L-3)
  wlasnaNazwa: 'Nazwij projekt samodzielnie',
  nowyTytul: 'Nowy projekt',
  nowyNazwa: 'Nazwa projektu',
  nowyNazwaPodpis: 'np. GPZ Wschód — magistrala miejska',
  nowyOpis: 'Opis (opcjonalnie)',
  nowyOpisPodpis: 'Zakres opracowania, numer zlecenia, uwagi projektowe',
  nowyUtworz: 'Utwórz projekt',
  bladNazwaPusta: 'Podaj nazwę projektu.',

  // Zmiana projektu przy otwartym projekcie (L-5)
  zmianaTytul: 'Zmienić otwarty projekt?',
  zmianaPytanie: (biezacy: string, nowy: string) =>
    `Zamkniesz projekt „${biezacy}" i otworzysz „${nowy}". Niezapisane ustawienia widoku bieżącego projektu zostaną porzucone.`,
  zmianaSkutek: 'Model, warianty obliczeń i wyniki bieżącego projektu pozostaną nienaruszone na serwerze.',
  zmianaPotwierdz: 'Otwórz wskazany projekt',
  wrocDoPulpitu: 'Wróć do pulpitu projektu',
} as const;

/** Gotowy przykład galerii startowej (SPEC_KREATORY_2026-07.md §4, tabela P-01…P-05). */
export interface PrzykladDane {
  id: string;
  nazwa: string;
  opis: string;
}

export const PRZYKLADY: readonly PrzykladDane[] = [
  {
    id: 'P-01',
    nazwa: 'Magistrala miejska 15 kV',
    opis: 'GPZ 110/15, 7 stacji przelotowych, kable XRUHAKXS, odbiory komunalne.',
  },
  {
    id: 'P-02',
    nazwa: 'Pierścień z NOP',
    opis: '2 magistrale, domknięcie, NOP, łączniki sekcyjne — gotowy wariant N-1.',
  },
  {
    id: 'P-03',
    nazwa: 'Przyłączenie PV 2,5 MW',
    opis: 'Magistrala + PV (10 falowników, TR blokowy, Q(U), FRT) — pod wniosek do OSD.',
  },
  {
    id: 'P-04',
    nazwa: 'PV + BESS (magazyn)',
    opis: 'Jak P-03 + BESS 1 MWh z trybami ładowania/rozładowania i pracą wyspową.',
  },
  {
    id: 'P-05',
    nazwa: 'Sieć wiejska napowietrzna',
    opis: 'GPZ, linia AFL, stacje słupowe, odgałęzienia, agregat rezerwowy.',
  },
] as const;
