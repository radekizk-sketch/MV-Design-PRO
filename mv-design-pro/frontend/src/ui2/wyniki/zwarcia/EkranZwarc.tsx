/*
 * EkranZwarc — druga konkretyzacja wspólnego wzorca ekranu analizy (karta E8.2):
 * okno „Wyniki zwarciowe" (W-604). Mapuje REALNY kształt `ShortCircuitResults`
 * (adapter `zwarciaModel`) → propsy wzorca `EkranAnalizy`: nagłówek → ZAŁOŻENIA
 * (metoda IEC 60909, współczynnik c, czas cieplny) → TABELA punktów zwarciowych
 * (Ik", ip, Ith, Sk" zawsze razem) → WYKRES słupkowy Ik". Pod ekranem — wybór
 * punktu zwarcia i sekcja WKŁADÓW dla wybranego punktu.
 *
 * Zero fizyki, zero mutacji; store czytany wyłącznie do odczytu
 * (`useWynikZwarciowy`). Wybór punktu zwarcia: NATYWNY wybór wiersza tabeli
 * (delta API wzorca zrealizowana — scalenie U3 #4 zamyka TODO-KARTĘ E8.2 A);
 * wiersz wybrany steruje sekcją wkładów.
 */

import { useMemo, useState } from 'react';
import './zwarcia.css';
import type { AdvancementMode } from '../../shell/modeModel';
import { EkranAnalizy } from '../wzorzec';
import { useWkladyZwarciowe } from './api';
import { WkladyZwarciowe } from './WkladyZwarciowe';
import { WykresIkssChart } from './WykresIkssChart';
import { ZWARCIA_STRINGS } from './strings';
import {
  KLUCZ_PUNKT,
  KOLUMNY_ZWARC,
  naSlupkiIkss,
  naWierszeZwarc,
  naZalozeniaZwarc,
  useWynikZwarciowy,
  type WkladZwarciowy,
} from './zwarciaModel';

export interface EkranZwarcProps {
  trybZaawansowania: AdvancementMode;
  onOtworzDowod: (ref: string) => void;
  onEksport?: () => void;
  /** Współczynnik napięciowy c z konfiguracji przebiegu (TODO-KARTA 3). */
  wspolczynnikC?: number;
  /** Czas cieplny [s] z konfiguracji przebiegu (TODO-KARTA 3). */
  czasCieplnyS?: number;
  /**
   * Wkłady źródeł per punkt zwarcia (klucz = target_id). Brak wpisu → sekcja
   * wkładów pokazuje stan „dane niedostępne" (dane spoza kontraktu read-only —
   * TODO-KARTA 1 w `zwarciaModel.ts`).
   */
  wklady?: Record<string, WkladZwarciowy[]>;
}

export function EkranZwarc({
  trybZaawansowania,
  onOtworzDowod,
  onEksport,
  wspolczynnikC,
  czasCieplnyS,
  wklady,
}: EkranZwarcProps) {
  const { wynik, runId } = useWynikZwarciowy();
  const rows = wynik?.rows ?? [];
  const [wybranyPunkt, setWybranyPunkt] = useState<string | null>(null);

  // Domyślnie wybrany pierwszy punkt (deterministycznie, kolejność źródłowa).
  const aktywnyPunkt = useMemo(() => {
    if (rows.length === 0) return null;
    if (wybranyPunkt && rows.some((r) => r.target_id === wybranyPunkt)) return wybranyPunkt;
    return rows[0].target_id;
  }, [rows, wybranyPunkt]);

  // R3-B (K3-G3): realny dostawca wkładów — rozbicie maszynowe z backendu
  // (endpoint SC3F contributions). Props `wklady` (test/nadpisanie) ma
  // pierwszeństwo — wtedy hook nie pobiera (punkt=null).
  const wkladyPobrane = useWkladyZwarciowe(wklady ? null : aktywnyPunkt);

  if (!wynik || rows.length === 0) {
    return (
      <div className="mvd-wyn" data-testid="mvd-zwarcia-ekran-pusty">
        <div className="mvd-zwarcia-pusty">
          <p className="mvd-zwarcia-pusty-title">{ZWARCIA_STRINGS.brakWyniku}</p>
          <p className="mvd-zwarcia-pusty-desc">{ZWARCIA_STRINGS.brakWynikuOpis}</p>
        </div>
      </div>
    );
  }

  const wierszAktywny = rows.find((r) => r.target_id === aktywnyPunkt) ?? rows[0];
  const nazwaAktywnego = wierszAktywny.target_name ?? wierszAktywny.target_id;
  const wkladyAktywne =
    aktywnyPunkt && wklady ? wklady[aktywnyPunkt] ?? null : wkladyPobrane;

  return (
    <div data-testid="mvd-zwarcia-ekran">
      <EkranAnalizy
        naglowek={{ analizaPL: ZWARCIA_STRINGS.analiza, runId: runId ?? undefined }}
        zalozenia={naZalozeniaZwarc(wspolczynnikC, czasCieplnyS)}
        kolumny={KOLUMNY_ZWARC}
        wiersze={naWierszeZwarc(rows)}
        wykres={<WykresIkssChart slupki={naSlupkiIkss(rows)} />}
        onOtworzDowod={onOtworzDowod}
        onEksport={onEksport}
        trybZaawansowania={trybZaawansowania}
        kluczWiersza={KLUCZ_PUNKT}
        onWybierzWiersz={setWybranyPunkt}
        wybranyWiersz={aktywnyPunkt}
      />

      <WkladyZwarciowe
        punktNazwa={nazwaAktywnego}
        wklady={wkladyAktywne}
        trybZaawansowania={trybZaawansowania}
        onOtworzDowod={onOtworzDowod}
      />
    </div>
  );
}
