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
 * Zakres wyboru = rozstrzygnięcie karty: zwarcie trójfazowe (SC_3F) i rozpływ
 * mocy (LOAD_FLOW) — dwa rodzaje, dla których cała ścieżka wyników (okna,
 * dowód, werdykt) jest kompletna. Etykiety z rejestru `ANALYSIS_TYPE_LABELS`
 * (jedna prawda nazw analiz w aplikacji).
 */

import { useState } from 'react';

import { ANALYSIS_TYPE_LABELS, type ExecutionAnalysisType } from '../../../ui/study-cases/types';
import { useUruchomObliczenie } from './uruchomObliczenie';
import { PRZYPADKI_STRINGS as T } from './strings';

/** Rodzaje oferowane w wyborze (rozstrzygnięcie karty K6 §0.1). */
const RODZAJE: readonly ExecutionAnalysisType[] = ['SC_3F', 'LOAD_FLOW'];

export interface UruchomObliczenieProps {
  /** Wyróżnik testowy — panel bywa osadzony w kilku miejscach przestrzeni. */
  testid?: string;
}

export function UruchomObliczenie({ testid = 'mvd-uruchom-obliczenie' }: UruchomObliczenieProps) {
  const [rodzaj, setRodzaj] = useState<ExecutionAnalysisType>('SC_3F');
  const { uruchom, wToku } = useUruchomObliczenie();

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
      <button
        type="button"
        className="mvd-btn mvd-btn-primary"
        disabled={wToku}
        onClick={() => uruchom(rodzaj)}
        title={T.uruchomOpis}
        data-testid={`${testid}-przycisk`}
      >
        {wToku ? T.uruchomWToku : T.uruchom}
      </button>
    </div>
  );
}
