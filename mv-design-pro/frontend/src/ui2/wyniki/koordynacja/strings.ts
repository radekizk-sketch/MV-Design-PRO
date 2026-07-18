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
} as const;
