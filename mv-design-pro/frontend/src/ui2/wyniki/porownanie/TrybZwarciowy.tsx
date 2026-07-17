/*
 * TrybZwarciowy — tryb ZWARCIOWY okna „Porównanie przebiegów" (karta E12.2).
 * Wybór dwóch zakończonych przebiegów zwarciowych (runStore, filtr SC_* / DONE),
 * JAWNE uruchomienie porównania („Porównaj przebiegi") i tabela punktów zwarcia
 * z wielkościami A · B · Δ (Ik", ip, Ith, Sk).
 *
 * Granice (NOT-A-SOLVER / karta §2.1): fronton NIE liczy fizyki. Wartości A i B
 * pochodzą z backendu (per-punktowe wyniki zwarciowe każdego przebiegu); jedyne
 * działanie liczbowe w UI to prezentacyjna różnica B−A (patrz `zwarciePorownanieModel`
 * — rozstrzygnięcie RECON i uzasadnienie). Zero automatyzmu: porównanie rusza
 * wyłącznie po kliknięciu. Brak dowodów per komórka w tym kontrakcie → pusta akcja.
 */

import { useCallback, useMemo, useState } from 'react';

import './porownanie.css';
import { isModeAtLeast, type AdvancementMode } from '../../shell/modeModel';
import { TabelaWynikow } from '../wzorzec';
import { fetchShortCircuitResults } from '../../../ui/results-inspector/api';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useStudyCasesStore } from '../../../ui/study-cases/store';
import type { ExecutionRun } from '../../../ui/study-cases/types';
import type { WierszTabeli } from '../wzorzec';
import { ZWARCIA_POROWNANIE_STRINGS as SZ } from './strings';
import {
  KOLUMNY_PUNKTOW_ZWARCIOWYCH,
  etykietaPrzebieguZwarciowego,
  naWierszePunktowZwarciowych,
  przebiegiZwarciowe,
} from './zwarciePorownanieModel';

/** Brak dowodów per komórka w kontrakcie porównania — stabilna pusta akcja. */
const BEZ_DOWODU = (): void => {};

type StanPorownania = 'bezczynny' | 'wtrakcie' | 'blad';

export interface TrybZwarciowyProps {
  trybZaawansowania: AdvancementMode;
}

export function TrybZwarciowy({ trybZaawansowania }: TrybZwarciowyProps) {
  const trybEkspercki = isModeAtLeast(trybZaawansowania, 'expert');

  // Lista przebiegów zwarciowych — read-only ze store'u przebiegów (runStore),
  // filtr SC_*/DONE. Store zasilany przez szerszy przepływ aplikacji (zero
  // automatyzmu/ładowania z tego okna).
  const runs = useExecutionRunsStore((s) => s.runs);
  const przebiegi = useMemo(() => przebiegiZwarciowe(runs), [runs]);

  // Nazwa przypadku po `study_case_id` — read-only ze store'u przypadków.
  const przypadki = useStudyCasesStore((s) => s.cases);
  const nazwyPrzypadkow = useMemo(
    () => new Map(przypadki.map((c) => [c.id, c.name])),
    [przypadki],
  );

  const [runA, setRunA] = useState('');
  const [runB, setRunB] = useState('');

  const [wiersze, setWiersze] = useState<WierszTabeli[] | null>(null);
  const [stan, setStan] = useState<StanPorownania>('bezczynny');
  const [blad, setBlad] = useState<string | null>(null);

  const porownaj = useCallback(async () => {
    if (!runA || !runB) {
      setBlad(SZ.walidacjaBrakAB);
      return;
    }
    if (runA === runB) {
      setBlad(SZ.walidacjaTeSame);
      return;
    }
    setStan('wtrakcie');
    setBlad(null);
    setWiersze(null);
    try {
      const [wynikA, wynikB] = await Promise.all([
        fetchShortCircuitResults(runA),
        fetchShortCircuitResults(runB),
      ]);
      setWiersze(naWierszePunktowZwarciowych(wynikA.rows, wynikB.rows));
      setStan('bezczynny');
    } catch (err) {
      setBlad(err instanceof Error ? err.message : SZ.bladPorownania);
      setStan('blad');
    }
  }, [runA, runB]);

  const przyciskZablokowany = !runA || !runB || stan === 'wtrakcie';

  return (
    <div className="mvd-por" data-testid="mvd-porz-ekran">
      <header className="mvd-por-head">
        <div className="mvd-por-head-main">
          <p className="mvd-por-sub">{SZ.podtytul}</p>
        </div>
      </header>

      <section
        className="mvd-por-wybor"
        data-testid="mvd-porz-wybor"
        aria-label={SZ.wyborTytul}
      >
        <h3 className="mvd-por-wybor-tytul">{SZ.wyborTytul}</h3>
        {przebiegi.length === 0 ? (
          <div className="mvd-por-pusty" data-testid="mvd-porz-brak-przebiegow">
            <p className="mvd-por-pusty-title">{SZ.brakPrzebiegow}</p>
            <p className="mvd-por-pusty-desc">{SZ.brakPrzebiegowOpis}</p>
          </div>
        ) : (
          <>
            <div className="mvd-por-selektory">
              <SelektorPrzebiegu
                etykieta={SZ.wyborA}
                testId="mvd-porz-select-a"
                przebiegi={przebiegi}
                wybrany={runA}
                trybEkspercki={trybEkspercki}
                nazwyPrzypadkow={nazwyPrzypadkow}
                onZmiana={setRunA}
              />
              <SelektorPrzebiegu
                etykieta={SZ.wyborB}
                testId="mvd-porz-select-b"
                przebiegi={przebiegi}
                wybrany={runB}
                trybEkspercki={trybEkspercki}
                nazwyPrzypadkow={nazwyPrzypadkow}
                onZmiana={setRunB}
              />
            </div>
            <button
              type="button"
              className="mvd-btn mvd-por-przycisk"
              onClick={() => void porownaj()}
              disabled={przyciskZablokowany}
              data-testid="mvd-porz-przycisk"
            >
              {stan === 'wtrakcie' ? SZ.porownajWTrakcie : SZ.porownaj}
            </button>
          </>
        )}
        {blad && (
          <p className="mvd-por-blad" data-testid="mvd-porz-blad">
            {blad}
          </p>
        )}
      </section>

      {stan === 'wtrakcie' && (
        <p className="mvd-por-info" data-testid="mvd-porz-wtrakcie">
          {SZ.wTrakcie}
        </p>
      )}

      {wiersze && stan !== 'wtrakcie' && (
        <div className="mvd-wyn" data-testid="mvd-porz-wynik">
          {wiersze.length === 0 ? (
            <p className="mvd-por-pusto" data-testid="mvd-porz-puste">
              {SZ.brakPunktow}
            </p>
          ) : (
            <TabelaWynikow
              kolumny={KOLUMNY_PUNKTOW_ZWARCIOWYCH}
              wiersze={wiersze}
              onOtworzDowod={BEZ_DOWODU}
              trybZaawansowania={trybZaawansowania}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface SelektorPrzebieguProps {
  etykieta: string;
  testId: string;
  przebiegi: ExecutionRun[];
  wybrany: string;
  trybEkspercki: boolean;
  nazwyPrzypadkow: Map<string, string>;
  onZmiana: (id: string) => void;
}

function SelektorPrzebiegu({
  etykieta,
  testId,
  przebiegi,
  wybrany,
  trybEkspercki,
  nazwyPrzypadkow,
  onZmiana,
}: SelektorPrzebieguProps) {
  return (
    <label className="mvd-por-pole">
      <span className="mvd-por-pole-etyk">{etykieta}</span>
      <select
        className="mvd-por-select"
        value={wybrany}
        onChange={(e) => onZmiana(e.target.value)}
        data-testid={testId}
      >
        <option value="">{SZ.wyborPusty}</option>
        {przebiegi.map((run) => (
          <option key={run.id} value={run.id}>
            {etykietaPrzebieguZwarciowego(
              run,
              trybEkspercki,
              nazwyPrzypadkow.get(run.study_case_id) ?? null,
            )}
          </option>
        ))}
      </select>
    </label>
  );
}
