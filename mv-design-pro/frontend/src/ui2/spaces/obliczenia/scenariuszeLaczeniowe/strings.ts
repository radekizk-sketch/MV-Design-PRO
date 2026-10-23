/**
 * Teksty PL panelu „Scenariusze łączeniowe” (karta GPZ-H5-APARATURA, defekt 5).
 */

import type { StanLacznika } from './api';

export const SCENARIUSZE_LACZENIOWE_STRINGS = {
  tytul: 'Scenariusze łączeniowe',
  cel:
    'Zapisz stan łączeniowy do policzenia bez zmiany modelu: inne położenie łączników ' +
    '(np. otwarty wyłącznik pola SN transformatora, zamknięty łącznik sekcji szyn) albo ' +
    'wyłączenie elementu z eksploatacji (np. utrata linii zasilającej lub transformatora). ' +
    'Scenariusz wybierasz w „Uruchom obliczenie” jako stan łączeniowy biegu.',
  brakPrzypadku: 'Bez aktywnego przypadku obliczeniowego nie ma gdzie zapisać scenariusza.',
  brakModelu: 'Model sieci nie jest wczytany — nie ma łączników ani elementów do wyboru.',
  brakScenariuszy:
    'Brak scenariuszy łączeniowych — obliczenia liczą stan normalny modelu. Dodaj scenariusz, ' +
    'żeby policzyć np. utratę linii zasilającej albo transformatora.',
  ladowanie: 'Wczytywanie scenariuszy łączeniowych…',
  nowy: 'Nowy scenariusz łączeniowy',
  edytuj: 'Edytuj',
  anuluj: 'Anuluj',
  zapisz: 'Zapisz scenariusz',
  zapisano: (nazwa: string, rewizja: number) =>
    `Zapisano scenariusz „${nazwa}” (rewizja ${rewizja}) — wybierz go w „Uruchom obliczenie”.`,
  poleNazwa: 'Nazwa scenariusza',
  brakNazwy: 'Podaj nazwę scenariusza.',
  poleFiltr: 'Filtruj elementy (nazwa lub identyfikator)',
  sekcjaLaczniki: 'Położenie łączników',
  sekcjaLacznikiOpis:
    '„Jak w modelu” zostawia położenie z modelu; wybór zamknięty/otwarty przestawia łącznik ' +
    'tylko w tym scenariuszu.',
  sekcjaWylaczenia: 'Elementy wyłączone z eksploatacji',
  sekcjaWylaczeniaOpis:
    'Zaznaczony element jest nieobecny w sieci liczonej ze scenariuszem (stan N-1).',
  sekcjaNieznane: 'Wpisy scenariusza bez elementu w obecnym modelu',
  sekcjaNieznaneOpis:
    'Model zmienił się od zapisu scenariusza — usuń wpis albo przywróć element w modelu, ' +
    'inaczej zapis zostanie odrzucony.',
  usunWpis: 'Usuń wpis',
  kolNazwa: 'Nazwa',
  kolRewizja: 'Rewizja',
  kolZmiany: 'Zmiany względem modelu',
  kolAkcje: 'Akcje',
  kolLacznik: 'Łącznik',
  kolWModelu: 'W modelu',
  kolWScenariuszu: 'W scenariuszu',
  jakWModelu: (stan: StanLacznika) => `jak w modelu (${STAN_LACZNIKA_PL[stan]})`,
  wylaczony: (nazwa: string) => `wyłączony: ${nazwa}`,
  brakWModelu: (ref: string) => `${ref} (brak w modelu)`,
  brakZmian: 'brak zmian',
} as const;

export const STAN_LACZNIKA_PL: Record<StanLacznika, string> = {
  closed: 'zamknięty',
  open: 'otwarty',
};
