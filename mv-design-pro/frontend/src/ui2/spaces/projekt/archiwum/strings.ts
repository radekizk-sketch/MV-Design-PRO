/*
 * Teksty okna „Archiwum projektu (ZIP)" (przestrzeń „Projekt"). Wyłącznie
 * polski język inżynierski (MODEL_INTERAKCJI §2.7), zero identyfikatorów
 * kodowych na pierwszym planie. Centralizacja = jedno źródło etykiet,
 * importowane wprost przez testy jako wartości oczekiwane.
 */

export const ARCHIWUM_STRINGS = {
  tytul: 'Archiwum projektu (ZIP)',
  cel: 'Spakuj projekt do przekazania albo odtwórz projekt z otrzymanej paczki.',
  powrot: '← Wróć do pulpitu',

  // Sekcja eksportu
  eksportEyebrow: 'SPAKUJ PROJEKT',
  eksportOpis:
    'Paczka zawiera model sieci, schematy, warianty obliczeniowe, wyniki i dowody obliczeń.',
  eksportProjekt: 'Projekt',
  eksportAkcja: 'Pobierz paczkę',
  eksportWToku: 'Pakowanie…',
  eksportBrakProjektu: 'Nie otwarto projektu',
  eksportBrakProjektuOpis:
    'Paczkę tworzy się z otwartego projektu. Otwórz projekt albo odtwórz go z archiwum poniżej.',
  eksportGotowe: 'Paczka pobrana i zapisana w dokumentach projektu.',
  eksportBlad: 'Nie udało się wyeksportować projektu.',

  // Sekcja importu
  importEyebrow: 'ODTWÓRZ Z PACZKI',
  importOpis:
    'Wczytana paczka trafia do nowego projektu — otwarty projekt pozostaje nietknięty.',
  importWybierz: 'Plik archiwum',
  importBrakPliku: 'Nie wybrano pliku.',
  importZlyFormat: 'Wybierz plik z rozszerzeniem .zip albo .mvdp.zip.',
  importNazwa: 'Nazwa odtworzonego projektu (opcjonalnie)',
  importNazwaPodpowiedz: 'Puste pole = nazwa z paczki',
  importWeryfikuj: 'Sprawdź sumę kontrolną paczki',
  importPodgladAkcja: 'Sprawdź zawartość',
  importPodgladWToku: 'Sprawdzanie…',
  importAkcja: 'Odtwórz projekt',
  importWToku: 'Odtwarzanie…',
  importBlad: 'Nie udało się zaimportować archiwum.',

  // Podgląd zawartości
  podgladTytul: 'Zawartość paczki',
  podgladNiepoprawna: 'Paczka jest niepoprawna.',
  podgladWersja: 'Wersja zapisu',
  podgladData: 'Data spakowania',
  podgladOdcisk: 'Odcisk paczki',
  podgladWezly: 'Węzły',
  podgladGalezie: 'Gałęzie',
  podgladZrodla: 'Źródła',
  podgladOdbiory: 'Odbiory',
  podgladSchematy: 'Schematy',
  podgladWarianty: 'Warianty obliczeniowe',
  podgladPrzebiegi: 'Przebiegi obliczeń',
  podgladWyniki: 'Wyniki',
  podgladDowody: 'Dowody obliczeń',

  // Raport wyniku importu
  raportTytul: 'Wynik odtworzenia',
  raportSukces: 'Projekt odtworzony z paczki.',
  raportCzesciowy: 'Projekt odtworzony częściowo — sprawdź ostrzeżenia.',
  raportBramkaKatalogu: 'Projekt odtworzony — elementy poniżej wymagają wskazania typu z katalogu.',
  raportNiepowodzenie: 'Odtworzenie nie powiodło się.',
  raportOstrzezenia: 'Ostrzeżenia',
  raportBledy: 'Błędy',
  raportMigracja: 'Zapis przeniesiony z wersji',
  raportBezKatalogu: 'Elementy bez typu katalogowego',
  raportOtworz: 'Otwórz odtworzony projekt',
  raportPonow: 'Wybierz inną paczkę',
  raportNastepnyKrok: 'Następny krok: otwórz odtworzony projekt i sprawdź gotowość do obliczeń.',
} as const;

/**
 * Nazwa pobieranego pliku: `archiwum-{nazwa}-RRRR-MM-DD.mvdp.zip`.
 * Czysta (data jako argument — bez `Date.now`), deterministyczna; nazwa
 * projektu sprowadzona do bezpiecznych znaków, pusta → sam znacznik daty.
 */
export function nazwaPlikuArchiwum(nazwaProjektu: string | null, data: Date): string {
  const rrrr = data.getFullYear().toString().padStart(4, '0');
  const mm = (data.getMonth() + 1).toString().padStart(2, '0');
  const dd = data.getDate().toString().padStart(2, '0');
  const bezpieczna = (nazwaProjektu ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  const czlon = bezpieczna ? `${bezpieczna}-` : '';
  return `archiwum-${czlon}${rrrr}-${mm}-${dd}.mvdp.zip`;
}

/** Czy nazwa pliku ma rozszerzenie archiwum projektu. */
export function jestPlikiemArchiwum(nazwa: string): boolean {
  const male = nazwa.toLowerCase();
  return male.endsWith('.zip') || male.endsWith('.mvdp.zip');
}

/** Data z archiwum w czytelnym PL formacie („RRRR-MM-DD GG:MM"); pusta → „—". */
export function formatujDateArchiwum(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.slice(0, 16).replace('T', ' ');
}
