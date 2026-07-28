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
 * `runId` (wzorzec `useZasobJakosci` z `EkranJakosci`); brak odpowiedzi →
 * kolumna z kreskami, tabela działa jak dotąd (uczciwie, bez werdyktu).
 */

import { useEffect, useState } from 'react';
import './rozplyw.css';
import type { AdvancementMode } from '../../shell/modeModel';
import { EkranAnalizy, usePoprawWModelu } from '../wzorzec';
import { fetchWalidacjaEnergetyczna } from '../jakosc/api';
import { rodzajPrzekroczeniaWalidacji, typElementuWalidacji } from '../jakosc/jakoscModel';
import { ROZPLYW_STRINGS } from './strings';
import { useSwiezoscNaglowka } from '../../freshness';
import {
  KLUCZ_GALAZ,
  KOLUMNY_GALEZI,
  naMapeObciazen,
  naSumeStratGalezi,
  naWierszeGalezi,
  naZalozeniaRozplywu,
  useWynikRozplywu,
  type PozycjaObciazenia,
} from './adapters/rozplywAdapter';

/**
 * Pobiera walidację energetyczną przebiegu i buduje mapę `branch_id` → pozycja
 * obciążalności (R3-A). Uczciwe stany: brak `runId`, trwające pobieranie lub
 * błąd/brak odpowiedzi → `null` (kolumna „Obciążenie" pokazuje kreski, bez
 * werdyktu i bez przycisku decyzji). Błąd celowo NIE ustawia stanu — mapa
 * pozostaje `null` z inicjalizacji/resetu, a tabela działa jak przed kartą.
 */
export function useWalidacjaObciazen(
  runId: string | null,
): ReadonlyMap<string, PozycjaObciazenia> | null {
  const [mapa, setMapa] = useState<ReadonlyMap<string, PozycjaObciazenia> | null>(null);

  useEffect(() => {
    setMapa(null); // reset przy zmianie przebiegu (stale werdykty nie przeciekają)
    if (!runId) return;
    let anulowane = false;
    fetchWalidacjaEnergetyczna(runId)
      .then((odpowiedz) => {
        if (!anulowane) setMapa(naMapeObciazen(odpowiedz.items));
      })
      .catch(() => {
        // Brak odpowiedzi walidacji → uczciwie bez werdyktu (mapa pozostaje null).
      });
    return () => {
      anulowane = true;
    };
  }, [runId]);

  return mapa;
}

export interface TabelaGaleziProps {
  trybZaawansowania: AdvancementMode;
  onOtworzDowod: (ref: string) => void;
  onEksport?: () => void;
  /** Preselekcja wiersza (karta D-2, deep-link SLD „Pokaż wyniki"): `branch_id`
   * podświetlanej gałęzi. Prop addytywny — brak = zachowanie 1:1. */
  wybranyWiersz?: string | null;
  /** Wybór wiersza klikiem/klawiaturą (wzorzec `TabelaWynikow.onWybierzWiersz`). */
  onWybierzWiersz?: (klucz: string) => void;
}

export function TabelaGalezi({
  trybZaawansowania,
  onOtworzDowod,
  onEksport,
  wybranyWiersz,
  onWybierzWiersz,
}: TabelaGaleziProps) {
  const { wynik, runId } = useWynikRozplywu();
  // V12K-264/265: znacznik swiezosci + panel przyczyn z JEDNEJ, wspolnej derywacji.
  const swiezosc = useSwiezoscNaglowka(runId);
  const poprawWModelu = usePoprawWModelu();
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
        zalozenia={naZalozeniaRozplywu(wynik)}
        kolumny={KOLUMNY_GALEZI}
        wiersze={naWierszeGalezi(wynik.branch_results, obciazenia)}
        onOtworzDowod={onOtworzDowod}
        onEksport={onEksport}
        trybZaawansowania={trybZaawansowania}
        kluczWiersza={KLUCZ_GALAZ}
        wybranyWiersz={wybranyWiersz}
        onWybierzWiersz={onWybierzWiersz}
        // K1 / F-E6.3 + R3-A: rodzaj i typ elementu z REALNEGO `check_type`
        // pozycji walidacji (reuse mapowań `jakosc/jakoscModel.ts`):
        // BRANCH_LOADING → LineBranch/'obciazalnosc-galezi',
        // TRANSFORMER_LOADING → TransformerBranch/'obciazalnosc-transformatora'.
        // Werdykt (ostrzeżenie z kolumny „Obciążenie") pochodzi wyłącznie z tej
        // walidacji, więc wiersz z przyciskiem ma zawsze pozycję w mapie;
        // defensywny fallback = dotychczasowa akcja gałęzi liniowej (1:1).
        onPoprawWModelu={(ref) => {
          const poz = obciazenia?.get(ref);
          const typ = poz ? typElementuWalidacji(poz.checkType) : null;
          const rodzaj = poz ? rodzajPrzekroczeniaWalidacji(poz.checkType) : null;
          poprawWModelu(ref, typ ?? 'LineBranch', ref, rodzaj ?? 'obciazalnosc-galezi');
        }}
        rodzajWiersza={(ref) => {
          const poz = obciazenia?.get(ref);
          return poz ? rodzajPrzekroczeniaWalidacji(poz.checkType) ?? undefined : undefined;
        }}
      />
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
