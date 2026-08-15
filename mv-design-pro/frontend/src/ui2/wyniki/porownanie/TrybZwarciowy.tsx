/*
 * TrybZwarciowy — tryb ZWARCIOWY okna „Porównanie przebiegów" (karta E12.2).
 * Wybór dwóch zakończonych przebiegów zwarciowych (runStore, filtr SC_* / DONE),
 * JAWNE uruchomienie porównania („Porównaj przebiegi") i tabela punktów zwarcia
 * z wielkościami A · B · Δ (Ik", ip, Ith, Sk).
 *
 * Granice (NOT-A-SOLVER): fronton NIE liczy NICZEGO. Wartości A i B ORAZ delty
 * (bezwzględne i względne) pochodzą z jednej końcówki porównania
 * `POST /api/short-circuit-comparisons` — karta KD-3 poz. 11 przeniosła rachunek
 * różnic do domeny (dług V12K-290; wcześniej ekran odejmował i dzielił sam).
 * Zero automatyzmu: porównanie rusza wyłącznie po kliknięciu.
 *
 * Dowody (R3-C / K3-G2): wartość z kolumny A otwiera dowód przebiegu A,
 * z kolumny B — przebiegu B, przez deep-link z kontekstem
 * `setWynikiTab('dowod', runId)` (mechanizm R2-B); strona koduje się w
 * `dowodRef` komórki (`dowodPorownania.ts`), a para przebiegów pochodzi ze
 * stanu UŻYTEGO w porównaniu (nie z selektorów — te mogły się zmienić).
 * Kolumny Δ bez dowodu — różnica nie ma pojedynczego wywodu WHITE BOX.
 *
 * RÓŻNICE NA SCHEMACIE (domknięcie łańcucha „porównanie → schemat"): po
 * wykonanym porównaniu pojawia się akcja „Pokaż różnice na schemacie". Pobiera
 * ona nakładkę różnic dla TEJ SAMEJ pary przebiegów
 * (`POST /api/short-circuit-comparisons/sld-overlay` — ten sam wynik domeny,
 * inna postać) i przechodzi na schemat, gdzie warstwa wynikowa rysuje Δ per
 * punkt zwarcia. Akcja jest widoczna dopiero, gdy jest co pokazać: bez
 * porównania nie ma jej wcale, a przy zerze punktów wspólnych zamiast niej
 * stoi zdanie wyjaśniające (zero martwego kliku).
 */

import { useCallback, useMemo, useState } from 'react';

import './porownanie.css';
import { isModeAtLeast, type AdvancementMode } from '../../shell/modeModel';
import { useShellStore } from '../../shell/useShellStore';
import { PrzyciskAkcjiStanu, TabelaWynikow, useAkcjaUruchomObliczenie } from '../wzorzec';
import { stronaDowodu } from './dowodPorownania';
import { pobierzPorownanieZwarciowe } from './zwarciaPorownanieApi';
import { navigateToSld } from '../../../ui/navigation/routes';
import { useSldDeltaOverlayStore } from '../../../ui/sld-overlay/sldDeltaOverlayStore';
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
  // K6 / H-5: brak przebiegów zwarciowych do porównania → uruchom bieg.
  const akcjaBiegu = useAkcjaUruchomObliczenie('SC_3F');

  // Nazwa przypadku po `study_case_id` — read-only ze store'u przypadków.
  const przypadki = useStudyCasesStore((s) => s.cases);
  const nazwyPrzypadkow = useMemo(
    () => new Map(przypadki.map((c) => [c.id, c.name])),
    [przypadki],
  );

  const [runA, setRunA] = useState('');
  const [runB, setRunB] = useState('');

  const [wiersze, setWiersze] = useState<WierszTabeli[] | null>(null);
  // Para przebiegów UŻYTA w widocznym porównaniu (R3-C) — cel dowodów A/B
  // oraz nakładki różnic na schemacie. Trzymana osobno od selektorów, bo te
  // można przestawić po porównaniu.
  const [paraPorownana, setParaPorownana] = useState<{ a: string; b: string } | null>(null);
  // Ile punktów ma odpowiednik po obu stronach — tylko dla nich RÓŻNICA
  // istnieje, więc ta liczba decyduje, czy jest co nanosić na schemat.
  // Pochodzi WPROST z odpowiedzi backendu (ekran nie zlicza).
  const [punktowWspolnych, setPunktowWspolnych] = useState<number | null>(null);
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
    setParaPorownana(null);
    setPunktowWspolnych(null);
    try {
      // KD-3 poz. 11: delty liczy BACKEND — ekran odczytuje gotowe pola.
      const porownanie = await pobierzPorownanieZwarciowe(runA, runB);
      setWiersze(naWierszePunktowZwarciowych(porownanie.punkty));
      setParaPorownana({ a: runA, b: runB });
      setPunktowWspolnych(porownanie.liczba_punktow_wspolnych);
      setStan('bezczynny');
    } catch (err) {
      setBlad(err instanceof Error ? err.message : SZ.bladPorownania);
      setStan('blad');
    }
  }, [runA, runB]);

  // Różnice na schemacie: nakładkę liczy backend dla TEJ SAMEJ pary przebiegów,
  // która stoi w tabeli (nie z selektorów — te mogły się zmienić po porównaniu).
  const wczytajRoznice = useSldDeltaOverlayStore((s) => s.wczytajRoznice);
  const nakladkaWTrakcie = useSldDeltaOverlayStore((s) => s.wTrakcie);
  const bladNakladki = useSldDeltaOverlayStore((s) => s.blad);
  const pokazNaSchemacie = useCallback(async () => {
    if (!paraPorownana) return;
    await wczytajRoznice(paraPorownana.a, paraPorownana.b);
    // Przejście na schemat TYLKO po udanym pobraniu — inaczej operator trafiłby
    // na pusty schemat bez wyjaśnienia; komunikat błędu zostaje przy akcji.
    if (useSldDeltaOverlayStore.getState().nakladka) {
      navigateToSld();
    }
  }, [paraPorownana, wczytajRoznice]);

  // R3-C: 2×klik na wartości kolumny A/B → dowód WŁAŚCIWEGO przebiegu przez
  // deep-link z kontekstem (`setWynikiTab('dowod', runId)` — mechanizm R2-B).
  const setWynikiTab = useShellStore((s) => s.setWynikiTab);
  const otworzDowodPrzebiegu = useCallback(
    (ref: string) => {
      if (!paraPorownana) return;
      const strona = stronaDowodu(ref);
      if (strona === null) return;
      setWynikiTab('dowod', strona === 'A' ? paraPorownana.a : paraPorownana.b);
    },
    [paraPorownana, setWynikiTab],
  );

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
            <PrzyciskAkcjiStanu akcja={akcjaBiegu} testid="mvd-porz-brak-przebiegow" />
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
              onOtworzDowod={otworzDowodPrzebiegu}
              trybZaawansowania={trybZaawansowania}
            />
          )}
        </div>
      )}

      {/* Różnice na schemacie — akcja obecna dopiero po porównaniu. Bez punktów
        * wspólnych nie ma różnic do naniesienia: zamiast wyszarzonego przycisku
        * stoi zdanie mówiące DLACZEGO (uczciwy stan zerowy). */}
      {paraPorownana && stan !== 'wtrakcie' && (
        <section className="mvd-por-schemat" data-testid="mvd-porz-schemat">
          {punktowWspolnych === 0 ? (
            <p className="mvd-por-pusto" data-testid="mvd-porz-schemat-brak">
              {SZ.brakPunktowWspolnych}
            </p>
          ) : (
            <>
              <button
                type="button"
                className="mvd-btn mvd-por-przycisk"
                onClick={() => void pokazNaSchemacie()}
                disabled={nakladkaWTrakcie}
                data-testid="mvd-porz-schemat-przycisk"
              >
                {nakladkaWTrakcie ? SZ.pokazNaSchemacieWTrakcie : SZ.pokazNaSchemacie}
              </button>
              <p className="mvd-por-schemat-opis">{SZ.pokazNaSchemacieOpis}</p>
            </>
          )}
          {bladNakladki && (
            <p className="mvd-por-blad" data-testid="mvd-porz-schemat-blad">
              {bladNakladki}
            </p>
          )}
        </section>
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
