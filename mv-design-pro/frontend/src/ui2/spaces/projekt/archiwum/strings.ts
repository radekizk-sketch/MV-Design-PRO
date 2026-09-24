/*
 * Teksty okna „Archiwum projektu (ZIP)" (przestrzeń „Projekt"). Wyłącznie
 * polski język inżynierski (MODEL_INTERAKCJI §2.7), zero identyfikatorów
 * kodowych na pierwszym planie. Centralizacja = jedno źródło etykiet,
 * importowane wprost przez testy jako wartości oczekiwane.
 */

export const ARCHIWUM_STRINGS = {
  tytul: 'Archiwum projektu (ZIP)',
  cel: 'Spakuj projekt do przekazania, odtwórz projekt z otrzymanej paczki, porównaj dwie wersje projektu albo przekaż same zmiany.',
  powrot: '← Wróć do pulpitu',

  // Sekcja eksportu
  eksportEyebrow: 'SPAKUJ PROJEKT',
  // Treść paczki wg formatu 3.0.0 (`domain/project_archive.py`): metadane projektu,
  // model sieci, warianty obliczeniowe i przebiegi obliczeń z ich wynikami. Schematy
  // i dowody NIE są częścią paczki (sekcje skasowane w W1) — dawny opis obiecywał je.
  eksportOpis:
    'Paczka zawiera model sieci, warianty obliczeniowe oraz przebiegi obliczeń z ich wynikami.',
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
  podgladWarianty: 'Warianty obliczeniowe',
  podgladPrzebiegi: 'Przebiegi obliczeń',
  podgladModele: 'Zapisy modelu sieci',

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

  // Porównanie dwóch wersji projektu
  porownanieEyebrow: 'PORÓWNAJ WERSJE',
  porownanieOpis:
    'Sprawdź, co zmieniło się między dwiema paczkami projektu albo między otwartym projektem a innym projektem na serwerze.',
  porownaniePlikA: 'Paczka wcześniejsza (A)',
  porownaniePlikB: 'Paczka późniejsza (B)',
  porownanieAkcjaPliki: 'Porównaj paczki',
  porownanieZaladujProjekty: 'Porównaj otwarty projekt z innym projektem…',
  porownanieProjektInny: 'Porównaj otwarty projekt z projektem',
  porownanieProjektWybierz: '— wybierz projekt —',
  porownanieProjektBrak: 'Na serwerze nie ma innych projektów do porównania.',
  porownanieAkcjaProjekty: 'Porównaj projekty',
  porownanieWToku: 'Porównywanie…',
  porownanieBlad: 'Nie udało się porównać wersji projektu.',
  porownanieListaBlad: 'Nie udało się pobrać listy projektów.',
  wynikTytul: 'Wynik porównania',
  wynikIdentyczne: 'Obie wersje są identyczne — brak różnic.',
  wynikRoznice: 'Wersje różnią się',
  wynikSekcjeZmienione: 'Części zmienione',
  wynikDodane: 'Elementy dodane',
  wynikUsuniete: 'Elementy usunięte',
  wynikZmienione: 'Elementy zmienione',
  wynikBezZmian: 'Bez zmian',
  wynikSekcjaBezRozbicia: 'Treść zmieniona w całości (część bez rozbicia na elementy).',
  statusDodany: 'Dodano',
  statusUsuniety: 'Usunięto',
  statusZmieniony: 'Zmieniono',
  wartoscPusta: '—',

  // Paczka zmian (eksport i import przyrostowy)
  paczkaEyebrow: 'PRZEKAŻ SAME ZMIANY',
  paczkaOpis:
    'Zamiast całej paczki przekaż tylko to, co zmieniło się względem paczki, którą odbiorca już ma. Odbiorca nakłada paczkę zmian na tę samą paczkę bazową i dostaje nowy projekt.',
  paczkaEksportTytul: 'Przygotuj paczkę zmian otwartego projektu',
  paczkaBaza: 'Paczka bazowa (ta, którą odbiorca już ma)',
  paczkaEksportAkcja: 'Pobierz paczkę zmian',
  paczkaEksportWToku: 'Przygotowywanie…',
  paczkaEksportBlad: 'Nie udało się przygotować paczki zmian.',
  paczkaEksportBrakProjektu: 'Paczkę zmian przygotowuje się z otwartego projektu.',
  paczkaSekcjeZmienione: 'Części zmienione',
  paczkaSekcjeNiezmienione: 'Części bez zmian',
  paczkaRozmiar: 'Rozmiar paczki zmian / pełnej',
  paczkaOszczednosc: 'Oszczędność',
  paczkaImportTytul: 'Nałóż otrzymaną paczkę zmian',
  paczkaImportPlik: 'Paczka zmian',
  paczkaImportNazwa: 'Nazwa nowego projektu (opcjonalnie)',
  paczkaImportAkcja: 'Odtwórz projekt z paczki zmian',
  paczkaImportWToku: 'Nakładanie…',
  paczkaImportBlad: 'Nie udało się nałożyć paczki zmian.',
  paczkaImportZastosowane: 'Nałożone części',
  paczkaZlyFormat: 'Wybierz plik z rozszerzeniem .zip (paczka .mvdp.zip albo .mvdp-delta.zip).',
} as const;

/**
 * Nazwa pobieranego pliku: `archiwum-{nazwa}-RRRR-MM-DD.mvdp.zip`.
 * Czysta (data jako argument — bez `Date.now`), deterministyczna; nazwa
 * projektu sprowadzona do bezpiecznych znaków, pusta → sam znacznik daty.
 */
export function nazwaPlikuArchiwum(nazwaProjektu: string | null, data: Date): string {
  return `archiwum-${czlonNazwy(nazwaProjektu, data)}.mvdp.zip`;
}

/** Nazwa pobieranej paczki zmian: `zmiany-{nazwa}-RRRR-MM-DD.mvdp-delta.zip`. */
export function nazwaPlikuPaczkiZmian(nazwaProjektu: string | null, data: Date): string {
  return `zmiany-${czlonNazwy(nazwaProjektu, data)}.mvdp-delta.zip`;
}

/** Człon `{nazwa}-RRRR-MM-DD` (nazwa pusta → sama data) — wspólny dla obu plików. */
function czlonNazwy(nazwaProjektu: string | null, data: Date): string {
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
  return `${czlon}${rrrr}-${mm}-${dd}`;
}

/** Czy nazwa pliku ma rozszerzenie archiwum projektu. */
export function jestPlikiemArchiwum(nazwa: string): boolean {
  const male = nazwa.toLowerCase();
  return male.endsWith('.zip') || male.endsWith('.mvdp.zip');
}

/** Wartość pola w wyniku porównania: tekst/liczba wprost, brak → „—", obiekt → zapis JSON. */
export function formatujWartoscPola(wartosc: unknown): string {
  if (wartosc === null || wartosc === undefined || wartosc === '') return ARCHIWUM_STRINGS.wartoscPusta;
  if (typeof wartosc === 'string') return wartosc;
  if (typeof wartosc === 'number') return String(wartosc);
  if (typeof wartosc === 'boolean') return wartosc ? 'tak' : 'nie';
  return JSON.stringify(wartosc);
}

/** Data z archiwum w czytelnym PL formacie („RRRR-MM-DD GG:MM"); pusta → „—". */
export function formatujDateArchiwum(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.slice(0, 16).replace('T', ' ');
}
