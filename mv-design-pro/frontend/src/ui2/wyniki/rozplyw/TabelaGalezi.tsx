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
 */

import './rozplyw.css';
import type { AdvancementMode } from '../../shell/modeModel';
import { EkranAnalizy, usePoprawWModelu } from '../wzorzec';
import { ROZPLYW_STRINGS } from './strings';
import {
  KLUCZ_GALAZ,
  KOLUMNY_GALEZI,
  naSumeStratGalezi,
  naWierszeGalezi,
  naZalozeniaRozplywu,
  useWynikRozplywu,
} from './adapters/rozplywAdapter';

export interface TabelaGaleziProps {
  trybZaawansowania: AdvancementMode;
  onOtworzDowod: (ref: string) => void;
  onEksport?: () => void;
}

export function TabelaGalezi({ trybZaawansowania, onOtworzDowod, onEksport }: TabelaGaleziProps) {
  const { wynik, runId } = useWynikRozplywu();
  const poprawWModelu = usePoprawWModelu();

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
        naglowek={{ analizaPL: ROZPLYW_STRINGS.analizaGalezie, runId: runId ?? undefined }}
        zalozenia={naZalozeniaRozplywu(wynik)}
        kolumny={KOLUMNY_GALEZI}
        wiersze={naWierszeGalezi(wynik.branch_results)}
        onOtworzDowod={onOtworzDowod}
        onEksport={onEksport}
        trybZaawansowania={trybZaawansowania}
        kluczWiersza={KLUCZ_GALAZ}
        onPoprawWModelu={(ref) => poprawWModelu(ref, 'LineBranch', ref)}
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
