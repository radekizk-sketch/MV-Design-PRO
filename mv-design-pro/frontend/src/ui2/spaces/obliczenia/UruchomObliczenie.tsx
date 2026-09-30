/*
 * „Uruchom obliczenie" (karta K6 / H-5 dźwignia 2) — JAWNY start przebiegu
 * w przestrzeni „Obliczenia".
 *
 * BÓL (audyt K6): dziesięć stanów zerowych kierowało inżyniera wskazówką
 * „Przejdź do obliczeń", a w przestrzeni „Obliczenia" NIE BYŁO czym uruchomić
 * biegu — łańcuch kończył się ślepym zaułkiem (bieg dało się odpalić wyłącznie
 * przyciskiem „Oblicz" w pasku tytułowym, dla rodzaju z ustawień aplikacji).
 *
 * Ten komponent zamyka łańcuch: wybór RODZAJU analizy + start przebiegu przez
 * ISTNIEJĄCY tor (`uruchomObliczenie` → `createAndExecuteRun` → oczekiwanie na
 * stan terminalny → wyniki). Zero nowych endpointów, zero fizyki w UI.
 *
 * Zakres wyboru = rozstrzygnięcie karty: zwarcie trójfazowe (SC_3F), rozpływ
 * mocy (LOAD_FLOW) i — od karty W5-D — rozpływ niesymetryczny (PF_UNBALANCED,
 * `rozplyw_niesymetryczny`, solver BFS per faza; wynik czyta ekran „Stan fazowy
 * SN" jako drugie źródło) — rodzaje, dla których cała ścieżka wyników (okna,
 * dowód, werdykt) jest kompletna. Etykiety z rejestru `ANALYSIS_TYPE_LABELS`
 * (jedna prawda nazw analiz w aplikacji).
 *
 * METODA ROZPŁYWU (W3-G1, aneks D2): jedyny, kanoniczny selektor NR/GS/FD w
 * całej aplikacji — solvery GS/FD istniały (FROZEN, `enm/canonical_analysis.py`
 * czyta `options.solver_method`), ale żaden ekran nie wysyłał tej opcji
 * (zdolność bez konsumenta). Widoczny WYŁĄCZNIE dla rodzaju „Rozpływ mocy"
 * (zwarcie trójfazowe nie zna metody NR/GS/FD). Domyślnie NR (zero zmiany
 * zachowania sprzed karty — brak `solver_input` = dotychczasowy tor); GS/FD są
 * wyborem ŚWIADOMYM operatora, z krótkim „po co" pod selektorem — jedyne
 * wejście używane do walidacji krzyżowej metod w ekranie „Jakość"
 * (`SekcjaPorownaniaMetod`).
 */

import { useState } from 'react';

import { ANALYSIS_TYPE_LABELS, type ExecutionAnalysisType } from '../../../ui/study-cases/types';
import { useUruchomObliczenie } from './uruchomObliczenie';
import { PRZYPADKI_STRINGS as T } from './strings';

/** Rodzaje oferowane w wyborze (rozstrzygnięcie karty K6 §0.1 + W5-D). */
const RODZAJE: readonly ExecutionAnalysisType[] = ['SC_3F', 'LOAD_FLOW', 'PF_UNBALANCED'];

/** Token solvera (`enm/canonical_analysis.py::_normalize_power_flow_solver_method`). */
export type MetodaRozplywu = 'newton-raphson' | 'gauss-seidel' | 'fast-decoupled';

const METODY: readonly { wartosc: MetodaRozplywu; etykieta: string; opis: string }[] = [
  { wartosc: 'newton-raphson', etykieta: 'Newtona–Raphsona (NR) — domyślna', opis: T.uruchomMetodaNrOpis },
  { wartosc: 'gauss-seidel', etykieta: 'Gaussa–Seidla (GS)', opis: T.uruchomMetodaGsOpis },
  { wartosc: 'fast-decoupled', etykieta: 'szybka rozprzężona (FD)', opis: T.uruchomMetodaFdOpis },
];

export interface UruchomObliczenieProps {
  /** Wyróżnik testowy — panel bywa osadzony w kilku miejscach przestrzeni. */
  testid?: string;
}

export function UruchomObliczenie({ testid = 'mvd-uruchom-obliczenie' }: UruchomObliczenieProps) {
  const [rodzaj, setRodzaj] = useState<ExecutionAnalysisType>('SC_3F');
  const [metoda, setMetoda] = useState<MetodaRozplywu>('newton-raphson');
  const { uruchom, wToku } = useUruchomObliczenie();

  const jestRozplywem = rodzaj === 'LOAD_FLOW';
  const opisMetody = METODY.find((m) => m.wartosc === metoda)?.opis ?? '';

  return (
    <div className="mvd-uruchom" data-testid={testid}>
      <label className="mvd-uruchom-label" htmlFor={`${testid}-rodzaj`}>
        {T.uruchomRodzaj}
      </label>
      <select
        id={`${testid}-rodzaj`}
        className="mvd-uruchom-select"
        value={rodzaj}
        onChange={(e) => setRodzaj(e.target.value as ExecutionAnalysisType)}
        data-testid={`${testid}-rodzaj`}
      >
        {RODZAJE.map((r) => (
          <option key={r} value={r}>
            {ANALYSIS_TYPE_LABELS[r]}
          </option>
        ))}
      </select>
      {jestRozplywem && (
        <div className="mvd-uruchom-metoda" data-testid={`${testid}-metoda-blok`}>
          <label className="mvd-uruchom-label" htmlFor={`${testid}-metoda`}>
            {T.uruchomMetoda}
          </label>
          <select
            id={`${testid}-metoda`}
            className="mvd-uruchom-select"
            value={metoda}
            onChange={(e) => setMetoda(e.target.value as MetodaRozplywu)}
            title={T.uruchomMetodaOpis}
            data-testid={`${testid}-metoda`}
          >
            {METODY.map((m) => (
              <option key={m.wartosc} value={m.wartosc}>
                {m.etykieta}
              </option>
            ))}
          </select>
          <p className="mvd-uruchom-metoda-opis" data-testid={`${testid}-metoda-opis`}>
            {opisMetody}
          </p>
        </div>
      )}
      <button
        type="button"
        className="mvd-btn mvd-btn-primary"
        disabled={wToku}
        onClick={() => uruchom(rodzaj, jestRozplywem ? { solver_method: metoda } : undefined)}
        title={T.uruchomOpis}
        data-testid={`${testid}-przycisk`}
      >
        {wToku ? T.uruchomWToku : T.uruchom}
      </button>
    </div>
  );
}
