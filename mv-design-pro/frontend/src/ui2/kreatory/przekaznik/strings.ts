/** Teksty PL kreatora „Zabezpieczenie pola SN" (add_relay). Język inżynierski. */

import type { OpcjaWyboru } from '../rama';

export const PRZEKAZNIK_STRINGS = {
  eyebrow: 'MODEL SIECI · ZABEZPIECZENIE POLA SN',
  tytul: 'Zabezpieczenie pola SN',
  cel:
    'Przypisz zabezpieczenie do pola SN — dobierasz rodzinę ochrony i typ katalogowy przekaźnika, '
    + 'a system wiąże go z wyłącznikiem wykonawczym oraz przekładnikami pomiarowymi pola. '
    + 'Nastawy (progi, charakterystyki, zwłoki) wpisujesz potem w edytorze nastaw — backend '
    + 'przelicza je przez przekładnię i sprawdza z zakresami katalogu.',
  odznaka: 'Nowe zabezpieczenie',

  krokPole: 'Pole i aparat',
  krokZapis: 'Podsumowanie i zapis',

  // Pole SN
  poleTytul: 'Kontekst pola',
  polePomoc: 'Pole SN chronione przekaźnikiem — przekaźnik mierzy prąd z CT pola i wyłącza wyłącznik pola.',
  poleSn: 'Pole SN',
  poleSnPlaceholder: '— wybierz pole SN —',
  aparat: 'Wyłącznik wykonawczy',
  aparatPlaceholder: '— bez powiązania —',
  aparatPomoc: 'Aparat, do którego przekaźnik wysyła sygnał wyłączenia. Gdy pominięty, '
    + 'system dobiera pierwszy wyłącznik pola.',
  rodzina: 'Rodzina ochrony',
  rodzinaPlaceholder: '— wybierz rodzinę ochrony —',
  rodzinaOpcje: [
    { id: 'NADPRADOWY', etykieta: 'Nadprądowy (50/51)' },
    { id: 'ZIEMNOZWARCIOWY', etykieta: 'Ziemnozwarciowy (50N/51N)' },
    { id: 'KIERUNKOWY_NADPRADOWY', etykieta: 'Kierunkowy nadprądowy (67)' },
    { id: 'ODLEGLOSCIOWY', etykieta: 'Odległościowy (21)' },
    { id: 'ROZNICOWY', etykieta: 'Różnicowy (87)' },
    { id: 'NIESTANDARDOWY', etykieta: 'Niestandardowy' },
  ] as readonly OpcjaWyboru[],

  // Katalog
  katalogTytul: 'Typ katalogowy przekaźnika',
  katalog: 'Zabezpieczenie z katalogu',
  katalogPlaceholder: '— wybierz przekaźnik —',
  katalogBlad: 'Nie udało się pobrać katalogu zabezpieczeń.',
  katalogPomoc: 'Typ przekaźnika z katalogu — producent, zakresy nastaw i charakterystyki z karty.',

  nazwa: 'Nazwa zabezpieczenia',
  nazwaPlaceholder: 'np. Zabezp. pola liniowego A',

  // Readout pola
  readStacja: 'Stacja',
  readSzyna: 'Szyna',
  readPomiar: 'Pomiar pola',

  // Kontrola gotowości
  kontrolaTytul: 'Kontrola zabezpieczenia',
  wierszPole: 'Pole SN',
  wierszRodzina: 'Rodzina ochrony',
  wierszKatalog: 'Typ katalogowy',
  wierszCt: 'Przekładnik CT',
  // Karta BIEG-ZABEZPIECZEN-Z-MODELU: zabezpieczenie wyłącznika liniowego (bez pola).
  wierszWylacznik: 'Wyłącznik liniowy',
  wylacznikBrak: 'wyłącznik nie występuje w modelu',
  wylacznikPomoc: 'Wyłącznik liniowy w odcinku SN chroniony przekaźnikiem — stopień selektywności magistrali.',

  // Ostrzeżenie o braku CT (dla nadprądowych)
  brakCt: 'Ta rodzina mierzy prąd — przekaźnik zadziała po dodaniu przekładnika prądowego CT w tym polu.',
  ctDoDodania: 'CT do dodania',
  brakRodzinyWalid: 'Wybierz rodzinę ochrony — od niej zależą funkcje i nastawy zabezpieczenia.',

  downstreamTytul: 'Co to uruchamia',
  downstreamOpis:
    'Zabezpieczenie powstaje bez nastaw — wpisz je w edytorze nastaw (ekran „Zabezpieczenia i '
    + 'automatyka" albo karta elementu). Potem wchodzi do oceny zabezpieczeń, koordynacji (TCC) '
    + 'i czasów wyłączenia; backend liczy czasy wg IEC 60255.',

  // Stany zerowe
  brakPolTytul: 'Brak pola SN',
  brakPolOpis: 'Najpierw dodaj pole SN (z wyłącznikiem i przekładnikiem CT), aby przypisać zabezpieczenie.',

  wstecz: '← Wstecz',
  dalej: 'Dalej →',
  licznik: (n: number, z: number) => `Krok ${n} z ${z}`,
  zapisz: 'Zapisz zabezpieczenie',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny przypadek obliczeniowy — zapis zabezpieczenia unieważnia jego wyniki.',
  brakPolaWalid: 'Wybierz pole SN — zabezpieczenie chroni tor tego pola.',
  brakWylacznikaWalid:
    'Wskazanego wyłącznika liniowego nie ma w modelu — otwórz kreator ponownie z istniejącego wyłącznika.',
  brakKatalogu: 'Wybierz typ zabezpieczenia z katalogu — zakresy nastaw i charakterystyki pochodzą z karty.',
  bladDodania: 'Nie udało się dodać zabezpieczenia.',

  // Panel teorii (V12K-066)
  teoriaTytul: 'Teoria: charakterystyki czasowo-prądowe IEC 60255',
  teoriaOpis:
    'Zabezpieczenie nadprądowe zwłoczne (IDMT) wyłącza pole tym szybciej, im większy prąd zwarcia. '
    + 'Czas zadziałania wyznacza charakterystyka odwrotnie zależna: $t = TMS \\cdot \\dfrac{k}{(I/I_s)^{\\alpha} - 1}$, '
    + 'gdzie $I_s$ to prąd rozruchowy (nastawa), $TMS$ to mnożnik czasowy, a stałe $k,\\ \\alpha$ definiują '
    + 'kształt krzywej: standardowa odwrotna (SI: $k=0{,}14,\\ \\alpha=0{,}02$), silnie odwrotna '
    + '(VI: $k=13{,}5,\\ \\alpha=1$) i skrajnie odwrotna (EI: $k=80,\\ \\alpha=2$). Charakterystyka niezależna '
    + '(DT) daje stały czas powyżej progu. Dobór rodziny i $TMS$ zapewnia selektywność: zabezpieczenie bliżej '
    + 'odbioru działa szybciej niż nadrzędne, ze schodkiem czasowym $\\Delta t \\approx 0{,}3\\ \\mathrm{s}$.',
  teoriaWymog:
    'Prąd rozruchowy dobiera się powyżej prądu roboczego i poniżej minimalnego prądu zwarciowego '
    + 'chronionego odcinka; charakterystykę i $TMS$ — tak, by zachować selektywność wobec zabezpieczeń '
    + 'nadrzędnych i podrzędnych. Wynik (czasy, prądy) liczy backend — UI pokazuje kształt prawa.',
  teoriaPodstawa: 'Podstawa: PN-EN 60255-151 (przekaźniki nadprądowe), IRiESD (koordynacja zabezpieczeń SN).',

} as const;
