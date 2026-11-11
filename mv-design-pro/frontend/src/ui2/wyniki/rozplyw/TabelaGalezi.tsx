/*
 * TabelaGalezi — dopełnienie okna rozpływu (karta E8.3, W-603): przepływy mocy
 * P/Q z obu końców gałęzi oraz straty, jako druga konkretyzacja wspólnego
 * wzorca ekranu analizy (obok `TabelaSzyn`, karta E8.1). Read-only: mapuje
 * REALNY kształt `PowerFlowResultV1.branch_results` (adapter) → propsy wzorca.
 * Zero fizyki, zero mutacji; store czytany wyłącznie do odczytu
 * (`useWynikRozplywu`, reużyty z tabeli szyn).
 *
 * Wiersz sumy strat (Σ P i Q) renderowany POD tabelą wzorca — poza propsami
 * `EkranAnalizy` (wzorzec nie niesie koncepcji wiersza podsumowania), wyłącznie
 * gdy wynik ma choć jedną gałąź (uczciwy stan pusty: brak gałęzi → sama
 * tabela pokazuje komunikat wzorca „Brak wyników do wyświetlenia.”, bez sumy).
 *
 * R3-A (K1-G2): kolumna „Obciążenie [%]" z werdyktem obciążalności. Kontrakt
 * `PowerFlowBranchResult` (FROZEN) nie niesie obciążenia — werdykt KONSUMUJEMY
 * z istniejącego endpointu walidacji energetycznej (`fetchWalidacjaEnergetyczna`,
 * reuse klienta `jakosc/api.ts` — bez duplikacji). Pobranie on-demand po
 * `runId` (wzorzec `useZasobJakosci` z `EkranJakosci`); odczyt w toku / błąd →
 * stan odczytu w komórkach i nota pod tabelą (odczyt ≠ brak pozycji), brak
 * pozycji → kreska bez werdyktu.
 */

import { useEffect, useState } from 'react';
import './rozplyw.css';
import { EkranAnalizy, useNazwaObiektu, usePoprawWModelu } from '../wzorzec';
import { fetchWalidacjaEnergetyczna } from '../jakosc/api';
import { rodzajPrzekroczeniaWalidacji, typElementuWalidacji } from '../jakosc/jakoscModel';
import { ROZPLYW_STRINGS } from './strings';
import { useSwiezoscNaglowka } from '../../freshness';
import {
  KLUCZ_ID_GALEZI,
  KOLUMNY_GALEZI,
  naMapeObciazen,
  naSumeStratGalezi,
  naWierszeGalezi,
  naZalozeniaRozplywu,
  pozycjaObciazenia,
  useWynikRozplywu,
  type StanObciazen,
} from './adapters/rozplywAdapter';

/**
 * Pobiera walidację energetyczną przebiegu i buduje mapę `branch_id` → pozycja
 * obciążalności (R3-A). Stany rozłączne (`StanObciazen`): brak `runId` →
 * `niezlecony`; zapytanie w toku → `wczytywanie`; błąd → `blad`; odpowiedź →
 * `gotowe` z mapą. Wpis należy do przebiegu, z którego powstał: zmiana `runId`
 * natychmiast wraca do `wczytywanie` (werdykty innego biegu nie przeciekają).
 */
export function useWalidacjaObciazen(runId: string | null): StanObciazen {
  const [wpis, setWpis] = useState<{ readonly runId: string; readonly stan: StanObciazen } | null>(
    null,
  );

  useEffect(() => {
    if (!runId) return;
    let anulowane = false;
    fetchWalidacjaEnergetyczna(runId)
      .then((odpowiedz) => {
        if (!anulowane)
          setWpis({ runId, stan: { odczyt: 'gotowe', mapa: naMapeObciazen(odpowiedz.items) } });
      })
      .catch(() => {
        // Błąd ROZPOZNANY (stan `blad`) — nie wchłonięty w „brak pozycji" (kreski).
        if (!anulowane) setWpis({ runId, stan: { odczyt: 'blad' } });
      });
    return () => {
      anulowane = true;
    };
  }, [runId]);

  if (!runId) return { odczyt: 'niezlecony' };
  return wpis?.runId === runId ? wpis.stan : { odczyt: 'wczytywanie' };
}

export interface TabelaGaleziProps {
  szczegolyAudytowe: boolean;
  onOtworzDowod: (ref: string) => void;
  onEksport?: () => void;
  /** Preselekcja wiersza (karta D-2, deep-link SLD „Pokaż wyniki"): `branch_id`
   * podświetlanej gałęzi. Prop addytywny — brak = zachowanie 1:1. */
  wybranyWiersz?: string | null;
  /** Wybór wiersza klikiem/klawiaturą (wzorzec `TabelaWynikow.onWybierzWiersz`). */
  onWybierzWiersz?: (klucz: string) => void;
}

export function TabelaGalezi({
  szczegolyAudytowe,
  onOtworzDowod,
  onEksport,
  wybranyWiersz,
  onWybierzWiersz,
}: TabelaGaleziProps) {
  const { wynik, runId } = useWynikRozplywu();
  // V12K-264/265: znacznik swiezosci + panel przyczyn z JEDNEJ, wspolnej derywacji.
  const swiezosc = useSwiezoscNaglowka(runId);
  const poprawWModelu = usePoprawWModelu();
  const nazwaObiektu = useNazwaObiektu();
  const obciazenia = useWalidacjaObciazen(runId);

  if (!wynik) {
    return (
      <div className="mvd-wyn" data-testid="mvd-rozplyw-galezie">
        <div className="mvd-rozplyw-pusty">
          <p className="mvd-rozplyw-pusty-title">{ROZPLYW_STRINGS.brakWyniku}</p>
          <p className="mvd-rozplyw-pusty-desc">{ROZPLYW_STRINGS.brakWynikuOpis}</p>
        </div>
      </div>
    );
  }

  const maGalezie = wynik.branch_results.length > 0;
  const suma = maGalezie ? naSumeStratGalezi(wynik.branch_results) : null;

  return (
    <div data-testid="mvd-rozplyw-galezie">
      <EkranAnalizy
        naglowek={{ analizaPL: ROZPLYW_STRINGS.analizaGalezie, runId: runId ?? undefined, ...swiezosc }}
        zalozenia={naZalozeniaRozplywu(wynik, nazwaObiektu)}
        kolumny={KOLUMNY_GALEZI}
        wiersze={naWierszeGalezi(wynik.branch_results, nazwaObiektu, obciazenia)}
        onOtworzDowod={onOtworzDowod}
        onEksport={onEksport}
        szczegolyAudytowe={szczegolyAudytowe}
        kluczWiersza={KLUCZ_ID_GALEZI}
        nazwaElementuWiersza={(ref) => nazwaObiektu(ref)}
        wybranyWiersz={wybranyWiersz}
        onWybierzWiersz={onWybierzWiersz}
        // Karta UI2 p.6: typ elementu DLA SYNCHRONIZACJI Z SLD — reużywa
        // DOKŁADNIE tę samą mapę obciążeń/`typElementuWalidacji` co akcja
        // „Popraw w modelu" niżej (jedno źródło prawdy o typie gałęzi w tej
        // tabeli). Gałąź bez pozycji walidacji → `undefined` (zero zgadywania
        // Line vs Transformer bez realnych danych).
        typElementuWiersza={(ref) => {
          const poz = pozycjaObciazenia(obciazenia, ref);
          return poz ? typElementuWalidacji(poz.checkType) ?? undefined : undefined;
        }}
        // K1 / F-E6.3 + R3-A: rodzaj i typ elementu z REALNEGO `check_type`
        // pozycji walidacji (reuse mapowań `jakosc/jakoscModel.ts`):
        // BRANCH_LOADING → LineBranch/'obciazalnosc-galezi',
        // TRANSFORMER_LOADING → TransformerBranch/'obciazalnosc-transformatora'.
        // Werdykt (ostrzeżenie z kolumny „Obciążenie") pochodzi wyłącznie z tej
        // walidacji, więc wiersz z przyciskiem ma zawsze pozycję w mapie;
        // defensywny fallback = dotychczasowa akcja gałęzi liniowej (1:1).
        onPoprawWModelu={(ref) => {
          const poz = pozycjaObciazenia(obciazenia, ref);
          const typ = poz ? typElementuWalidacji(poz.checkType) : null;
          const rodzaj = poz ? rodzajPrzekroczeniaWalidacji(poz.checkType) : null;
          poprawWModelu(ref, typ ?? 'LineBranch', nazwaObiektu(ref), rodzaj ?? 'obciazalnosc-galezi');
        }}
        rodzajWiersza={(ref) => {
          const poz = pozycjaObciazenia(obciazenia, ref);
          return poz ? rodzajPrzekroczeniaWalidacji(poz.checkType) ?? undefined : undefined;
        }}
      />
      {obciazenia.odczyt === 'wczytywanie' || obciazenia.odczyt === 'blad' ? (
        <p
          className="mvd-rozplyw-pusty-desc"
          data-testid="mvd-rozplyw-obciazenia-odczyt"
          data-odczyt={obciazenia.odczyt}
          aria-busy={obciazenia.odczyt === 'wczytywanie'}
          role={obciazenia.odczyt === 'blad' ? 'alert' : undefined}
        >
          {obciazenia.odczyt === 'wczytywanie'
            ? ROZPLYW_STRINGS.obciazeniaWczytywanieNota
            : ROZPLYW_STRINGS.obciazeniaBladNota}
        </p>
      ) : null}
      {suma && (
        <div className="mvd-rozplyw-suma-strat" data-testid="mvd-rozplyw-suma-strat">
          <span className="mvd-rozplyw-suma-etykieta">{ROZPLYW_STRINGS.sumaStrat}</span>
          <span className="mvd-num" data-testid="mvd-rozplyw-suma-p">
            {suma.stratyPKw}
            <span className="mvd-wyn-unit">{ROZPLYW_STRINGS.jednKW}</span>
          </span>
          <span className="mvd-num" data-testid="mvd-rozplyw-suma-q">
            {suma.stratyQKvar}
            <span className="mvd-wyn-unit">{ROZPLYW_STRINGS.jednKvar}</span>
          </span>
        </div>
      )}
    </div>
  );
}
