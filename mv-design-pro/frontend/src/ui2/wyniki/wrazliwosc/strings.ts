/*
 * Etykiety okna „Wrażliwość" — wyłącznie polskie, bez kodenamów projektowych.
 * Kody wewnętrzne kontraktu (`parameter_id`, `decision`) mapowane na język
 * projektanta TUTAJ (warstwa prezentacji), bez pokazywania surowych kodów
 * poza trybem eksperckim.
 */

export const WRAZLIWOSC_STRINGS = {
  tytul: 'Wrażliwość wyników rozpływu',
  opisWstep:
    'Które parametry modelu najmocniej poruszają profil napięć i marginesy '
    + 'kryteriów — perturbacje ±delta% na bazie zakończonego przebiegu rozpływu.',

  brakPrzebiegu: 'Brak zakończonego przebiegu rozpływu mocy.',
  brakPrzebieguOpis:
    'Analiza wrażliwości czyta wynik rozpływu (napięcia węzłów, przepływy gałęzi). '
    + 'Uruchom obliczenie rozpływu, aby zobaczyć czynniki wpływu.',
  ladowanie: 'Wczytywanie analizy wrażliwości…',
  blad: 'Nie udało się pobrać analizy wrażliwości.',
  bladOpis: 'Spróbuj ponownie; jeśli błąd wraca, sprawdź dziennik backendu.',

  sekcjaLf: 'Czynniki wpływu na profil napięć',
  sekcjaLfOpis:
    'Ranking parametrów (R/X gałęzi, P/Q, napięcie znamionowe), których zmiana o '
    + 'delta% najmocniej zmienia odchyłkę napięcia ΔU węzła.',
  sekcjaOgolna: 'Wrażliwość marginesów kryteriów',
  sekcjaOgolnaOpis:
    'Marginesy kryteriów napięciowych przy perturbacji wielkości obserwowanej '
    + 'o ±delta%.',

  kolWezel: 'Węzeł',
  kolParametr: 'Parametr',
  kolPerturbacja: 'Perturbacja',
  kolZmianaOdchylki: 'Zmiana odchyłki ΔU [p.p.]',
  kolZmianaMarginesu: 'Zmiana marginesu [p.p.]',
  kolDlaczego: 'Interpretacja',
  kolKryterium: 'Kryterium',
  kolMarginesBazowy: 'Margines bazowy',
  kolDecyzjaBazowa: 'Werdykt bazowy',
  kolMinus: 'Margines przy −delta%',
  kolPlus: 'Margines przy +delta%',

  odchylkaBazowa: 'Odchyłka bazowa',
  progOstrzezenia: 'Próg ostrzeżenia',
  progPrzekroczenia: 'Próg przekroczenia',
  brakDanychWpisu: 'Dane niekompletne',
  deltaEtykieta: 'Wielkość perturbacji',
  liczbaWezlow: 'Liczba węzłów profilu',
  liczbaKryteriow: 'Liczba kryteriów',
  kolIdentyfikatorWezla: 'Identyfikator węzła',

  pominieteTytul: 'Źródła pominięte (uczciwy zakres)',
  brakCzynnikow: 'Brak czynników do pokazania dla tego przebiegu.',

  jednProcent: '%',
  kreska: '—',
} as const;

/** Kody kryteriów wrażliwości ogólnej → język projektanta. Zbiór ZAMKNIĘTY
 * builderem `analysis/sensitivity/builder.py` (wyliczenie: `parameter_id=`
 * w kodzie źródłowym) — kompletność przypięta testem `strings.test.ts`;
 * nieznany kod pokazuje się surowo (uczciwość zamiast zgadywania). */
export const KRYTERIA_PL: Readonly<Record<string, string>> = {
  voltage_limit: 'Odchyłka napięcia węzła',
  load_q: 'Obciążenie mocą bierną',
  load_p: 'Obciążenie mocą czynną',
  short_circuit_level: 'Poziom mocy zwarciowej',
  protection_margin: 'Marginesy nastaw zabezpieczeń',
  protection_curve_margin: 'Marginesy krzywych zabezpieczeń',
};

/** Decyzje kontraktu → język projektanta. */
export const DECYZJE_PL: Readonly<Record<string, string>> = {
  PASS: 'spełnione',
  FAIL: 'przekroczone',
  NOT_COMPUTED: 'nieobliczone',
};

export type IstotnoscWrazliwosci = 'ok' | 'warn' | 'err' | 'neutral';

/** Istotność wizualna decyzji (tokeny stylu, zero fizyki). */
export function istotnoscDecyzji(decyzja: string): IstotnoscWrazliwosci {
  if (decyzja === 'PASS') return 'ok';
  if (decyzja === 'FAIL') return 'err';
  return 'neutral';
}

/** Etykieta kryterium: mapa PL, a dla nieznanego kodu surowy kod (uczciwość). */
export function etykietaKryterium(parameterId: string): string {
  return KRYTERIA_PL[parameterId] ?? parameterId;
}

/** Etykieta decyzji: mapa PL, nieznany kod surowo. */
export function etykietaDecyzji(decyzja: string): string {
  return DECYZJE_PL[decyzja] ?? decyzja;
}

/** Format liczby w punktach procentowych (2 miejsca, znak jawny). */
export function fmtPp(wartosc: number): string {
  const znak = wartosc > 0 ? '+' : '';
  return `${znak}${wartosc.toFixed(2)}`;
}

/** Format marginesu (2 miejsca) lub kreska. */
export function fmtMargines(wartosc: number | null): string {
  return wartosc === null ? WRAZLIWOSC_STRINGS.kreska : wartosc.toFixed(2);
}
