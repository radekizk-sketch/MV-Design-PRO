/*
 * TabelaSzyn — pierwsza konkretyzacja wspólnego wzorca ekranu analizy (karta E8.1):
 * napięcia szyn z wyniku rozpływu mocy, z wykresem profilu napięcia. Read-only
 * dowód użycia wzorca `EkranAnalizy`: mapuje REALNY kształt `PowerFlowResultV1`
 * (adapter) → propsy wzorca. Zero fizyki, zero mutacji; store czytany wyłącznie
 * do odczytu (`useWynikRozplywu`). Ograniczenia świeżości/dowodu per-szyna:
 * TODO-KARTA w `adapters/rozplywAdapter.ts`.
 */

import './rozplyw.css';
import type { AdvancementMode } from '../../shell/modeModel';
import { EkranAnalizy, usePoprawWModelu } from '../wzorzec';
import { ProfilNapiecChart } from './ProfilNapiecChart';
import { ROZPLYW_STRINGS } from './strings';
import {
  KLUCZ_SZYNA,
  KOLUMNY_SZYN,
  naProfilNapiec,
  naWierszeSzyn,
  naZalozeniaRozplywu,
  useWynikRozplywu,
} from './adapters/rozplywAdapter';

export interface TabelaSzynProps {
  trybZaawansowania: AdvancementMode;
  onOtworzDowod: (ref: string) => void;
  onEksport?: () => void;
}

export function TabelaSzyn({ trybZaawansowania, onOtworzDowod, onEksport }: TabelaSzynProps) {
  const { wynik, runId } = useWynikRozplywu();
  const poprawWModelu = usePoprawWModelu();

  if (!wynik) {
    return (
      <div className="mvd-wyn" data-testid="mvd-rozplyw-szyny">
        <div className="mvd-rozplyw-pusty">
          <p className="mvd-rozplyw-pusty-title">{ROZPLYW_STRINGS.brakWyniku}</p>
          <p className="mvd-rozplyw-pusty-desc">{ROZPLYW_STRINGS.brakWynikuOpis}</p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="mvd-rozplyw-szyny">
      <EkranAnalizy
        naglowek={{ analizaPL: ROZPLYW_STRINGS.analiza, runId: runId ?? undefined }}
        zalozenia={naZalozeniaRozplywu(wynik)}
        kolumny={KOLUMNY_SZYN}
        wiersze={naWierszeSzyn(wynik.bus_results)}
        wykres={<ProfilNapiecChart punkty={naProfilNapiec(wynik.bus_results)} />}
        onOtworzDowod={onOtworzDowod}
        onEksport={onEksport}
        trybZaawansowania={trybZaawansowania}
        kluczWiersza={KLUCZ_SZYNA}
        onPoprawWModelu={(ref) => poprawWModelu(ref, 'Bus', ref)}
      />
    </div>
  );
}
