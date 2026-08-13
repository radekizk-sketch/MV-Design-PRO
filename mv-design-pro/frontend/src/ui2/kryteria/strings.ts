/**
 * Etykiety PL czterech kryteriów wyposażenia stacji (karta KD-3).
 *
 * Symbole branżowe (S2obl, ALF, ΔU, β, P0, Pk) są nomenklaturą techniczną i
 * pozostają dozwolone. Kody produkcyjne (identyfikatory gotowości, nazwy
 * wariantów) NIGDY nie trafiają do tekstu — warianty mają etykiety PL poniżej,
 * a kody gotowości opisuje kanon (`rejestrGotowosci`).
 */

export const KRYTERIA_STRINGS = {
  kreska: '—',

  // Bilans CT
  ctTytul: 'Bilans obwodu wtórnego przekładnika prądowego',
  ctOpis:
    'Sprawdza, czy zabezpieczenie zobaczy prąd zwarciowy: obciążenie obwodu wtórnego '
    + 'obniża współczynnik graniczny, przy którym przekładnik się nasyca.',
  ctDlugosc: 'Długość obwodu wtórnego (w jedną stronę)',
  ctPrzekroj: 'Przekrój żyły obwodu',
  ctMocAparatow: 'Moc aparatów w obwodzie',
  ctMocObliczeniowa: 'Moc obliczeniowa obwodu S2obl',
  ctMocPrzewodow: 'w tym moc tracona w przewodach',
  ctMocZnamionowa: 'Moc znamionowa przekładnika Sn',
  ctWykorzystanie: 'Wykorzystanie mocy znamionowej',
  ctRezystancja: 'Rezystancja przewodów Rp',
  ctAlfEfektywny: 'Efektywny współczynnik graniczny ALF',
  ctWariant: 'Wariant rachunku',
  ctWariantPelny: 'pełny (z rezystancją uzwojenia wtórnego)',
  ctWariantUproszczony: 'uproszczony (bez rezystancji uzwojenia — wynik optymistyczny)',
  ctWerdyktObciazenia: 'Werdykt obciążenia',
  ctWerdyktNasycenia: 'Werdykt nasycenia',
  ctPozycja: 'Pozycja katalogowa',

  // Bilans VT
  vtTytul: 'Bilans obwodu wtórnego przekładnika napięciowego',
  vtOpis:
    'Napięcie tracone na przewodach obwodu wtórnego nie dociera do aparatu i wchodzi '
    + 'wprost w uchyb pomiaru — żadna klasa przekładnika tego nie odrobi.',
  vtDlugosc: 'Długość obwodu wtórnego (w jedną stronę)',
  vtPrzekroj: 'Przekrój żyły obwodu',
  vtMocAparatow: 'Moc odbiorników w obwodzie',
  vtUzwojenie: 'Sprawdzane uzwojenie',
  vtUzwojenieOpcje: [
    { id: 'POMIAROWE', etykieta: 'pomiarowe (limit 0,5 %)' },
    { id: 'ZABEZPIECZENIOWE', etykieta: 'zabezpieczeniowe (limit 1,0 %)' },
  ] as const,
  vtMocObliczeniowa: 'Moc obliczeniowa uzwojenia S2obl',
  vtMocZnamionowa: 'Moc znamionowa uzwojenia Sn',
  vtWykorzystanie: 'Wykorzystanie mocy znamionowej',
  vtPrad: 'Prąd obwodu wtórnego',
  vtDeltaU: 'Zmiana napięcia obwodu ΔU',
  vtLimit: 'Limit dla kategorii uzwojenia',
  vtKategoria: 'Kategoria uzwojenia, z której wzięto limit',
  vtKategoriaPomiarowa: 'pomiarowa',
  vtKategoriaZabezpieczeniowa: 'zabezpieczeniowa',
  vtKategoriaNieustalona: 'nieustalona — brak klasy tego uzwojenia w danych katalogowych',
  vtWerdyktObciazenia: 'Werdykt obciążenia',
  vtWerdyktSpadku: 'Werdykt zmiany napięcia',
  vtPozycja: 'Pozycja katalogowa',

  // Starzenie kabla
  kabelTytul: 'Starzenie termiczne izolacji',
  kabelOpis:
    'Obciążalność mówi, co wolno; starzenie mówi, jakim kosztem. Każde +10 °C ponad '
    + 'temperaturę znamionową izolacji podwaja szybkość starzenia.',
  kabelTemperaturaPracy: 'Temperatura pracy żyły',
  kabelTemperaturaZnamionowa: 'Temperatura znamionowa izolacji (katalog)',
  kabelIzolacja: 'Typ izolacji (katalog)',
  kabelRoznica: 'Różnica temperatur ΔT',
  kabelWspolczynnik: 'Współczynnik starzenia',
  kabelZywotnosc: 'Względna żywotność',
  kabelWerdykt: 'Werdykt',

  // Straty transformatora
  trafoTytul: 'Straty i optymalny współczynnik obciążenia',
  trafoOpis:
    'Straty jałowe płyną niezależnie od obciążenia — transformator dobrany z dużym '
    + 'zapasem płaci je przez cały czas pracy.',
  trafoBeta: 'Współczynnik obciążenia β',
  trafoStratyJalowe: 'Straty jałowe P0 (katalog)',
  trafoStratyObciazeniowe: 'Straty obciążeniowe przy β',
  trafoStratyCalkowite: 'Straty całkowite ΔP(β)',
  trafoBetaOpt: 'Optymalny współczynnik obciążenia',
  trafoStratyOpt: 'Straty w punkcie optymalnym',
  trafoUdzialJalowych: 'Udział strat jałowych',
  trafoWerdykt: 'Stan rachunku',

  // Krzywe koordynacji dobranego przekaźnika (powiązanie kanon ↔ biblioteka)
  krzyweTytul: 'Charakterystyki dobranego zabezpieczenia',
  krzyweOpis:
    'Funkcje i charakterystyki czasowo-prądowe wyrobu wskazanego w katalogu — te same, '
    + 'których użyje koordynacja zabezpieczeń.',
  krzyweFunkcje: 'Funkcje zabezpieczeniowe',
  krzyweLista: 'Charakterystyki czasowo-prądowe',

  // Wspólne
  werdyktPass: 'spełnione',
  werdyktFail: 'przekroczenie',
  werdyktNiedostepny: 'brak podstawy do oceny',
  zalozeniaTytul: 'Założenia rachunku',
  wzorTytul: 'Wzór odniesienia',
  ladowanie: 'Liczenie kryterium…',
  bladLiczenia: 'Nie udało się policzyć kryterium — spróbuj ponownie.',
  brakPozycji: 'Wskaż pozycję katalogową, żeby zobaczyć kryterium.',
  brakDanych: 'Uzupełnij dane, żeby zobaczyć wynik:',
} as const;

/** Etykieta PL werdyktu (kod statusu NIGDY nie trafia do tekstu). */
export function etykietaWerdyktu(status: string): string {
  if (status === 'PASS') return KRYTERIA_STRINGS.werdyktPass;
  if (status === 'FAIL') return KRYTERIA_STRINGS.werdyktFail;
  return KRYTERIA_STRINGS.werdyktNiedostepny;
}

/**
 * Etykieta PL kategorii uzwojenia, Z KTÓREJ wzięty jest limit ΔU — razem z klasą
 * dokładności tego uzwojenia.
 *
 * DLACZEGO STOI OBOK LIMITU. Kategoria przychodziła w odpowiedzi, ale nie była
 * renderowana nigdzie: nad readoutem widniała etykieta wybranego uzwojenia
 * („pomiarowe (limit 0,5 %)"), a wiersz niżej pokazywał limit 1,0 % — ekran
 * przeczył sam sobie i nie tłumaczył dlaczego. Kategoria widoczna przy limicie
 * sprawia, że żadna niezgodność nie jest już niewidoczna.
 */
export function etykietaKategoriiUzwojenia(
  kategoria: string | null,
  klasa: string | null,
): string {
  let nazwa: string | null = null;
  if (kategoria === 'POMIAROWE') nazwa = KRYTERIA_STRINGS.vtKategoriaPomiarowa;
  if (kategoria === 'ZABEZPIECZENIOWE') nazwa = KRYTERIA_STRINGS.vtKategoriaZabezpieczeniowa;
  if (nazwa === null) return KRYTERIA_STRINGS.vtKategoriaNieustalona;
  return klasa ? `${nazwa} (klasa ${klasa.replace('.', ',')})` : nazwa;
}

/** Etykieta PL wariantu rachunku ALF (nazwa wariantu jest kodem, nie tekstem). */
export function etykietaWariantuAlf(wariant: string | null): string {
  if (wariant === 'PELNY_IEC61869_2') return KRYTERIA_STRINGS.ctWariantPelny;
  if (wariant === 'UPROSZCZONY_BEZ_RCT') return KRYTERIA_STRINGS.ctWariantUproszczony;
  return KRYTERIA_STRINGS.kreska;
}

/**
 * Formatowanie liczby w zapisie polskim z jednostką. FORMATOWANIE, nie rachunek:
 * wartość przychodzi gotowa z backendu, tu zmienia się tylko jej zapis.
 */
export function fmtLiczba(
  wartosc: number | null | undefined,
  jednostka: string,
  miejsca = 3,
): string {
  if (typeof wartosc !== 'number' || !Number.isFinite(wartosc)) return KRYTERIA_STRINGS.kreska;
  const zapis = wartosc.toFixed(miejsca).replace('.', ',');
  return jednostka ? `${zapis} ${jednostka}` : zapis;
}
