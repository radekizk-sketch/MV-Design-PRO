/*
 * Teksty PL okna „Serie przebiegów" (przestrzeń „Obliczenia", karta
 * BATCH-ROUTER) — wyłącznie polski język techniczny (MODEL_INTERAKCJI §2.7).
 * Etykiety statusów serii i typów analiz NIE są duplikowane — importowane
 * z kontraktu (`ui/study-cases/types.ts`) i wspólnych strings przebiegów
 * („importuj, nie duplikuj").
 */

import type { BatchStatus } from '../../../../ui/study-cases/types';
import { BATCH_STATUS_LABELS } from '../../../../ui/study-cases/types';

export { BATCH_STATUS_LABELS };

export const SERIE_STRINGS = {
  tytul: 'Serie przebiegów',
  cel: 'Policz wiele scenariuszy zwarciowych jednym uruchomieniem — każdy scenariusz dostaje własny, pełnoprawny przebieg z wynikami i śladem obliczeń.',

  // Stany zerowe (uczciwe, z akcją)
  brakPrzypadku: 'Bez aktywnego przypadku obliczeniowego nie ma czego uruchamiać w serii.',
  brakPrzypadkuAkcja: 'Wybierz przypadek na liście powyżej',
  brakScenariuszy:
    'Ten przypadek nie ma jeszcze scenariuszy zwarciowych — seria potrzebuje co najmniej jednego.',
  brakScenariuszyAkcja: 'Przejdź do scenariuszy',
  brakSerii: 'Nie uruchomiono jeszcze żadnej serii dla tego przypadku.',
  ladowanie: 'Wczytywanie serii przebiegów…',
  blad: 'Nie udało się wczytać serii przebiegów',

  // Tworzenie serii
  sekcjaNowa: 'Nowa seria',
  sekcjaNowaOpis:
    'Zaznacz scenariusze do policzenia (wszystkie jednego rodzaju zwarcia) i uruchom je jako jedną serię.',
  uruchomSerie: 'Uruchom serię',
  wykonywanie: 'Wykonywanie serii…',
  zaznaczWszystkie: 'Zaznacz wszystkie',
  odznaczWszystkie: 'Odznacz wszystkie',
  nicNieZaznaczono: 'Zaznacz co najmniej jeden scenariusz, aby uruchomić serię.',

  // Lista serii
  sekcjaLista: 'Wykonane serie',
  kolUtworzona: 'Utworzona',
  kolRodzaj: 'Rodzaj analizy',
  kolScenariusze: 'Scenariusze',
  kolStatus: 'Status',
  kolBiegi: 'Przebiegi serii',
  etykietaOdcisk: 'Odcisk serii (SHA-256)',
  etykietaBledy: 'Błędy serii',
  pokazWyniki: 'Pokaż wyniki',
  wykonaj: 'Wykonaj',
  biegNiedostepny: 'Przebieg jeszcze bez wyniku',

  // Ogłoszenia po wykonaniu
  seriaZakonczona: 'Seria zakończona — wyniki przebiegów są dostępne poniżej.',
  seriaNieudana: 'Seria zakończona błędem — treść błędu przy serii.',
} as const;

export function etykietaStatusuSerii(status: BatchStatus): string {
  return BATCH_STATUS_LABELS[status];
}
