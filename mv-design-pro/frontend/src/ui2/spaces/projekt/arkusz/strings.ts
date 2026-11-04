/*
 * Teksty okna „Import sieci z arkusza (XLSX)" — język inżynierski
 * (po co · z czego · co daje), zero kodenamów, zero terminów technicznych
 * warstwy trwałości.
 */

export const ARKUSZ_STRINGS = {
  tytul: 'Import sieci z arkusza (XLSX)',
  cel: 'Wczytaj dane sieci otrzymane od operatora w arkuszu kalkulacyjnym i utwórz z nich nowy projekt z gotowym modelem sieci.',
  powrot: 'Powrót',

  formatEyebrow: 'Czego potrzebuje arkusz',
  // Nazwy kolumn arkusza to IDENTYFIKATORY, które projektant wpisuje w nagłówku — ekran pokazuje
  // je jako kod (`<code>`), nie w prozie (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, commit 5: dawny
  // jeden akapit niósł `szyna_pocz, szyna_kon, …` jak zapis matematyczny bez składu). Kolumny
  // zgodne z `backend/src/application/xlsx_import/importer.py` (BUS_COLUMNS, LINE_COLUMNS).
  formatWstep: 'Arkusz wymagany ma kolumny w pierwszym wierszu, dokładnie pod tymi nazwami:',
  formatArkusze: [
    { nazwa: 'Szyny', kolumny: ['id', 'nazwa', 'napięcie_kV'] },
    { nazwa: 'Linie', kolumny: ['id', 'szyna_pocz', 'szyna_kon', 'typ', 'długość_km'] },
  ],
  formatOpcjonalne: 'Arkusze opcjonalne: „Trafo”, „Źródła”, „Odbiory”.',
  formatTyp:
    'Każdy odcinek i transformator wiąże się z typem na jeden z dwóch sposobów: kolumna '
    + '„typ_katalogowy” (typ z katalogu) albo pełna tabliczka w wierszu. Z tabliczki powstaje typ '
    + 'w katalogu projektu — bez wartości domyślnych.',
  formatTabliczki: [
    {
      nazwa: 'Tabliczka odcinka',
      kolumny: ['rodzaj (LINIA/KABEL)', 'R_ohm_km', 'X_ohm_km', 'B_uS_km lub C_nF_km', 'Un_kV', 'I_dop_A'],
    },
    { nazwa: 'Tabliczka transformatora', kolumny: ['Sn_MVA', 'uk_pct', 'Pk_kW', 'grupa', 'zaczepy'] },
  ],

  wyborEyebrow: 'Plik z danymi',
  wybierz: 'Wybierz plik arkusza',
  brakPliku: 'Nie wybrano pliku. Wskaż arkusz .xlsx z danymi sieci.',
  zlyFormat: 'Wybrany plik nie jest arkuszem .xlsx ani .xlsm.',
  nazwaProjektu: 'Nazwa nowego projektu',
  nazwaPodpowiedz: 'Puste = nazwa pliku',

  podgladAkcja: 'Sprawdź zawartość',
  podgladWToku: 'Sprawdzanie…',
  importAkcja: 'Importuj do nowego projektu',
  importWToku: 'Importowanie…',
  bladOgolny: 'Nie udało się przetworzyć arkusza.',

  podgladTytul: 'Co wejdzie do modelu',
  podgladNiepoprawny: 'Arkusz wymaga poprawek — poniżej lista miejsc do sprawdzenia.',
  podgladSzyny: 'Szyny',
  podgladOdcinki: 'Odcinki linii i kabli',
  podgladTransformatory: 'Transformatory',
  podgladZrodla: 'Źródła zasilania',
  podgladOdbiory: 'Odbiory',

  zastrzezeniaTytul: 'Miejsca do poprawy w arkuszu',
  zastrzezenieArkusz: 'Arkusz',
  zastrzezenieWiersz: 'Wiersz',
  zastrzezenieKolumna: 'Kolumna',
  zastrzezenieCalyArkusz: 'cały arkusz',
  zastrzezenieCalyWiersz: 'cały wiersz',
  /** Zastrzeżenie kompilatora/walidatora modelu (`arkusz === 'model'`). */
  zastrzezenieModel: 'cały model',

  ostrzezeniaTytul: 'Uwagi do danych',
  typyProjektuTytul: 'Elementy z typem z tabliczki arkusza (typ projektu, niezweryfikowany)',

  raportTytul: 'Wynik importu',
  raportZaimportowano:
    'Sieć z arkusza została zapisana jako nowy projekt z gotowym modelem i wariantem bazowym.',
  raportOdrzucono: 'Arkusz nie przeszedł walidacji — model nie został zmieniony.',
  raportProjekt: 'Projekt',
  raportOdcisk: 'Odcisk modelu',
  raportOtworz: 'Otwórz zaimportowany projekt',
  raportPonow: 'Wczytaj inny arkusz',
  raportNastepnyKrokTypy:
    'Następny krok: otwórz projekt, zweryfikuj typy z arkusza w katalogu projektu (przestrzeń „Model"), a potem sprawdź schemat i gotowość obliczeniową.',
  raportNastepnyKrok:
    'Następny krok: otwórz projekt i sprawdź schemat oraz gotowość obliczeniową przed uruchomieniem analiz.',
} as const;

/** Czy nazwa pliku wskazuje arkusz obsługiwany przez backend (`_ROZSZERZENIA`). */
export function jestPlikiemArkusza(nazwa: string): boolean {
  const dolna = nazwa.toLowerCase();
  return dolna.endsWith('.xlsx') || dolna.endsWith('.xlsm');
}

/** Nazwa projektu domyślnie proponowana z nazwy pliku (parytet z backendem). */
export function nazwaZPliku(nazwa: string): string {
  const rdzen = nazwa.split('/').pop() ?? nazwa;
  return rdzen.replace(/\.(xlsx|xlsm)$/i, '').trim();
}
