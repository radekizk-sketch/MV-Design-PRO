/**
 * Teksty PL ekranu „Koordynacja zabezpieczeń" (rama prowadząca ui2, karta F-E5b).
 * Wyłącznie polski język techniczny; zero surowych identyfikatorów w strefie
 * pierwszoplanowej. Zdanie celu jest cytatem z karty §0.2 (FLOW §0.3 „kontrakt
 * ekranu prowadzącego").
 */

export const KOORDYNACJA_STRINGS = {
  eyebrow: 'KOORDYNACJA ZABEZPIECZEŃ',
  // Cel jednym zdaniem (cytat z karty F-E5b §0.2).
  cel: 'Dobór nastaw i selektywność zabezpieczeń nadprądowych: werdykty par '
    + 'PASS/MARGINAL/FAIL, marginesy CTI i krzywe czasowo-prądowe — z przebiegu '
    + 'zwarciowego i biblioteki zabezpieczeń.',

  // Stan zerowy — brak aktywnego projektu.
  brakProjektuTytul: 'Brak aktywnego projektu',
  brakProjektuOpis: 'Koordynacja zabezpieczeń pracuje na modelu sieci i bibliotece '
    + 'zabezpieczeń wybranego projektu. Bez aktywnego projektu nie ma z czego dobrać '
    + 'nastaw ani policzyć marginesów selektywności.',
  brakProjektuAkcja: 'Wybierz projekt',

  // Stan zerowy — brak zakończonego przebiegu zwarciowego.
  brakZwarciaTytul: 'Brak zakończonego przebiegu zwarciowego',
  brakZwarciaOpis: 'Krzywe czasowo-prądowe i marginesy selektywności czyta się z prądów '
    + 'zwarciowych (IEC 60909) zakończonego przebiegu. Uruchom przebieg zwarciowy dla '
    + 'wybranego wariantu, aby dobrać nastawy na tle rzeczywistych prądów zwarcia.',
  brakZwarciaAkcja: 'Przejdź do obliczeń',

  // Sekcja nastaw z analizy (karta F-K5, dług V12K-189). Nastawa bez danych jest
  // NIEDOSTĘPNA — nazywamy stan i mówimy, co uzupełnić, zamiast zostawiać puste pole.
  nastawyTytul: 'Nastawy wyznaczone z analizy',
  nastawyOpis: 'Nastawy pochodzą z analizy nastaw nadprądowych (prąd znamionowy pola + '
    + 'prądy zwarciowe z przebiegu). Nastawa, której nie da się wyznaczyć z danych '
    + 'projektu, jest pokazana jako NIEDOSTĘPNA — liczba zastępcza trafiłaby wprost do '
    + 'przekaźnika, więc jej tu nie ma.',
  nastawyBrakBieguTytul: 'Brak analizy nastaw',
  nastawyBrakBieguOpis: 'Dla tego przypadku nie uruchomiono jeszcze analizy nastaw '
    + 'nadprądowych. Uruchom ją, aby zobaczyć nastawy I> / I>> / Io> / Io>> wraz z '
    + 'informacją, których danych brakuje.',
  nastawyBrakBieguAkcja: 'Przejdź do obliczeń',
  nastawyBlad: 'Nie udało się wczytać nastaw',
  nastawyLadowanie: 'Wczytywanie nastaw z analizy…',
  nastawyKolumnaNastawa: 'Nastawa',
  nastawyKolumnaWartosc: 'Wartość',
  nastawyKolumnaStan: 'Stan',
  nastawyStanDostepna: 'Wyznaczona',
  nastawyUzupelnijDane: 'Uzupełnij dane',
} as const;
