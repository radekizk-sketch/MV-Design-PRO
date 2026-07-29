/*
 * EkranZwarc — druga konkretyzacja wspólnego wzorca ekranu analizy (karta E8.2):
 * okno „Wyniki zwarciowe" (W-604). Mapuje REALNY kształt `ShortCircuitResults`
 * (adapter `zwarciaModel`) → propsy wzorca `EkranAnalizy`: nagłówek → ZAŁOŻENIA
 * (metoda IEC 60909, współczynnik c, czas cieplny) → TABELA punktów zwarciowych
 * (Ik", ip, Ith, Sk" zawsze razem) → WYKRES słupkowy z przełącznikiem wielkości
 * (Ik"/ip/Ith/Sk"/I²t — karta W-A F2). Pod ekranem — wybór punktu zwarcia
 * i sekcja WKŁADÓW dla wybranego punktu.
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
import { BilansIEC } from './BilansIEC';
import { usePokazZwarcieNaSchemacie } from './pokazNaSchemacie';
import { RozplywZwarciowy } from './RozplywZwarciowy';
import { WkladyZwarciowe } from './WkladyZwarciowe';
import { WykresZwarc } from './WykresZwarc';
import { ZWARCIA_STRINGS } from './strings';
import { useSwiezoscNaglowka } from '../../freshness';
import {
  KLUCZ_PUNKT,
  KOLUMNY_ZWARC,
  naWierszeZwarc,
  naZalozeniaZwarc,
  rozplywDlaWiersza,
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
  // V12K-264/265: znacznik swiezosci + panel przyczyn z JEDNEJ, wspolnej derywacji.
  const swiezosc = useSwiezoscNaglowka(runId);
  const rows = wynik?.rows ?? [];
  const [wybranyPunkt, setWybranyPunkt] = useState<string | null>(null);
  // Karta W-C pkt 6: selekcja + centrowanie + nawigacja + overlay rozpływu
  // (reużycie wzorca V12K-073 — wspólny store selekcji, produkcyjny store overlay).
  const pokazNaSchemacie = usePokazZwarcieNaSchemacie();

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
    aktywnyPunkt && wklady ? wklady[aktywnyPunkt] ?? null : wkladyPobrane?.wklady ?? null;
  // Wywod {tekst, latex} z backendu (zasada KaTeX) — tylko od realnego dostawcy;
  // przy wkladach z props (testy/nadpisanie) wywodu brak (zero fabrykacji).
  const wywodWkladow = wklady ? [] : wkladyPobrane?.wywod ?? [];
  // ZWARCIA-PRO F3: wywod sekcyjny + checklista walidacji IEC (addytywne pola
  // odpowiedzi contributions) — takze wylacznie od realnego dostawcy.
  const wywodSekcjeWkladow = wklady ? [] : wkladyPobrane?.wywodSekcje ?? [];
  const walidacjaIecWkladow = wklady ? [] : wkladyPobrane?.walidacjaIec ?? [];

  return (
    <div data-testid="mvd-zwarcia-ekran">
      <EkranAnalizy
        naglowek={{ analizaPL: ZWARCIA_STRINGS.analiza, runId: runId ?? undefined, ...swiezosc }}
        zalozenia={naZalozeniaZwarc(wspolczynnikC, czasCieplnyS)}
        kolumny={KOLUMNY_ZWARC}
        wiersze={naWierszeZwarc(rows)}
        wykres={<WykresZwarc rows={rows} />}
        onOtworzDowod={onOtworzDowod}
        onEksport={onEksport}
        trybZaawansowania={trybZaawansowania}
        kluczWiersza={KLUCZ_PUNKT}
        onWybierzWiersz={setWybranyPunkt}
        wybranyWiersz={aktywnyPunkt}
      />

      <div className="mvd-zwarcia-akcje" data-testid="mvd-zwarcia-akcje">
        <button
          type="button"
          className="mvd-zwarcia-wykres-btn"
          data-testid="mvd-zwarcia-pokaz-sld"
          onClick={() => pokazNaSchemacie(wierszAktywny, runId)}
        >
          {ZWARCIA_STRINGS.pokazNaSchemacie}
        </button>
      </div>

      <BilansIEC row={wierszAktywny} punktNazwa={nazwaAktywnego} />

      <RozplywZwarciowy
        punktNazwa={nazwaAktywnego}
        flows={rozplywDlaWiersza(wierszAktywny)}
        trybZaawansowania={trybZaawansowania}
        onOtworzDowod={onOtworzDowod}
      />

      <WkladyZwarciowe
        punktNazwa={nazwaAktywnego}
        wklady={wkladyAktywne}
        wywod={wywodWkladow}
        wywodSekcje={wywodSekcjeWkladow}
        walidacjaIec={walidacjaIecWkladow}
        trybZaawansowania={trybZaawansowania}
        onOtworzDowod={onOtworzDowod}
      />
    </div>
  );
}
