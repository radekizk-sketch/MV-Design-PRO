/*
 * Teksty okna „Import sieci z arkusza (XLSX)" — język inżynierski
 * (po co · z czego · co daje), zero kodenamów, zero terminów technicznych
 * warstwy trwałości.
 */

export const ARKUSZ_STRINGS = {
  tytul: 'Import sieci z arkusza (XLSX)',
  cel: 'Wczytaj dane sieci otrzymane od operatora w arkuszu kalkulacyjnym i utwórz z nich nowy projekt.',
  powrot: 'Powrót',

  formatEyebrow: 'Czego potrzebuje arkusz',
  formatOpis:
    'Wymagane arkusze: „Szyny" (id, nazwa, napięcie_kV) oraz „Linie" (id, szyna_pocz, szyna_kon, typ, długość_km, R_ohm_km, X_ohm_km). Opcjonalnie: „Trafo", „Źródła", „Odbiory". Kolumna „typ_katalogowy" w arkuszu „Linie" wiąże odcinek z typem z katalogu.',

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

  ostrzezeniaTytul: 'Uwagi do danych',
  bezKataloguTytul: 'Odcinki wymagające typu z katalogu',

  raportTytul: 'Wynik importu',
  raportZaimportowano: 'Sieć z arkusza została zapisana jako nowy projekt.',
  raportBramkaKatalogu:
    'Sieć zapisana. Zanim policzysz obliczenia, przypisz typy katalogowe odcinkom wymienionym poniżej.',
  raportOdrzucono: 'Arkusz nie przeszedł walidacji — model nie został zmieniony.',
  raportProjekt: 'Projekt',
  raportMigawka: 'Odcisk modelu',
  raportOtworz: 'Otwórz zaimportowany projekt',
  raportPonow: 'Wczytaj inny arkusz',
  raportNastepnyKrokKatalog:
    'Następny krok: otwórz projekt i uzupełnij typy katalogowe w przestrzeni „Model", a potem sprawdź gotowość obliczeniową.',
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
