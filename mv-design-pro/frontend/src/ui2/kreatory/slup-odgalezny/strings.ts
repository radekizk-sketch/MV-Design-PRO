/** Teksty PL kreatora „Słup rozgałęźny SN". Język inżynierski. */

export const SLUP_STRINGS = {
  eyebrow: 'MODEL SIECI · SŁUP ROZGAŁĘŹNY SN',
  cel:
    'Wstaw słup rozgałęźny na odcinku linii napowietrznej SN — tworzy węzeł odczepu (T-off), '
    + 'od którego poprowadzisz odgałęzienie. Słup dzieli odcinek na dwie sekcje; z niego wolno '
    + 'wyprowadzić wyłącznie linię napowietrzną SN.',
  odznaka: 'Nowy słup SN',

  krokKatalog: 'Słup i położenie',
  krokZapis: 'Podsumowanie i zapis',

  typKatalog: 'Typ słupa z katalogu',
  typKatalogPlaceholder: '— wybierz słup rozgałęźny —',
  typBlad: 'Nie udało się pobrać katalogu słupów rozgałęźnych.',
  typPomoc: 'Słup wnosi układ odczepu i (opcjonalnie) łącznik odgałęzienia — z katalogu.',

  nazwa: 'Nazwa słupa',
  nazwaPlaceholder: 'np. Słup odg. linia A',
  polozenie: 'Położenie na odcinku',
  polozeniePomoc: 'Ułamek długości odcinka (0–1): 0,5 = w połowie. Dzieli odcinek na dwie sekcje.',

  paramLacznik: 'Łącznik odgałęzienia',
  paramPrad: 'Prąd znamionowy łącznika',
  paramPorty: 'Porty odgałęzienia',

  downstreamTytul: 'Co to uruchamia',
  downstreamOpis:
    'Ze słupa rozgałęźnego poprowadzisz odgałęzienie linią napowietrzną SN (kolejny krok flow). '
    + 'Węzeł jest bezimpedancyjny — nie zmienia rozpływu, wyznacza tylko punkt odczepu i sekcjonowania.',

  kontrolaTytul: 'Kontrola słupa',
  wierszOdcinek: 'Odcinek',
  wierszTor: 'Tor',
  wierszSlup: 'Słup',
  wierszPolozenie: 'Położenie',

  brakOdcinkaTytul: 'Brak wskazania odcinka',
  brakOdcinkaOpis:
    'Zaznacz na schemacie odcinek linii napowietrznej SN, na którym chcesz wstawić słup '
    + 'rozgałęźny, a następnie uruchom ten krok.',

  wstecz: '← Wstecz',
  dalej: 'Dalej →',
  licznik: (n: number, z: number) => `Krok ${n} z ${z}`,
  zapisz: 'Zapisz słup SN',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny zakres obliczeń przed zapisem słupa.',
  walidacjaStopka: 'Uzupełnij wymagane pola, aby zapisać słup rozgałęźny.',

  // Panel teorii (V12K-066)
  teoriaTytul: 'Teoria: słup rozgałęźny i odczep linii napowietrznej',
  teoriaOpis:
    'Słup rozgałęźny to konstrukcja, na której magistrala napowietrzna SN oddaje odczep (T-off) do '
    + 'odgałęzienia. Elektrycznie jest to węzeł bezimpedancyjny — potencjał węzła jest wspólny dla '
    + 'wszystkich zbiegających się przewodów, a prąd rozdziela się zgodnie z I prawem Kirchhoffa '
    + '$I_{mag} = I_{dalej} + I_{odg}$. Nie wnosi spadku napięcia (impedancja węzła $Z = 0$); rzeczywisty '
    + 'spadek powstaje dopiero na przewodach magistrali i odgałęzienia. Słup może nieść łącznik '
    + '(rozłącznik/odłącznik) do sekcjonowania — jego stan honoruje rozpływ mocy (gałąź otwarta = brak przepływu).',
  teoriaWymog:
    'Przekrój odgałęzienia dobiera się do prądu odczepu $I_{odg}$ i wytrzymałości zwarciowej; łącznik '
    + 'na słupie musi wytrzymać prąd roboczy i zwarciowy odczepu. Konstrukcja słupa (kąt, naciąg) wynika '
    + 'z projektu mechanicznego linii.',
  teoriaPodstawa: 'Podstawa: N SEP-E-003 / PN-EN 50341 (linie napowietrzne), IRiESD (praca sieci SN).',
} as const;
