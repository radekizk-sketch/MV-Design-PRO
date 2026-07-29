/*
 * EkranRozplywu — kompozycja okna „Rozpływ mocy" (karta E8.3, dopełnienie
 * W-603): podzakładki Szyny/Gałęzie NAD dwiema konkretyzacjami wspólnego
 * wzorca ekranu analizy (`TabelaSzyn` karta E8.1, `TabelaGalezi` karta E8.3).
 * Roving tabindex — wzór zakładek `ui2/spaces/wyniki/WynikiWarsztat.tsx`.
 *
 * `TabelaSzyn` pozostaje NIETKNIĘTY i eksportowany osobno (zgodność z
 * istniejącymi testami, które renderują go samodzielnie bez podzakładek);
 * ten komponent jest NOWĄ nadrzędną kompozycją — decyzja wykonawcy karty §3
 * („najlepiej nowy komponent nadrzędny”). Domyślna podzakładka: Szyny (bez
 * zaskakującego przełączania względem zachowania sprzed karty E8.3).
 *
 * PRESELEKCJA ELEMENTU (karta D-2, decyzja właściciela): akcja menu SLD
 * „Pokaż wyniki" niesie deep-linkiem ref elementu klikniętego na schemacie
 * (`useShellStore.wynikiTabElement`, wzorzec P-1 `show-ncrfg`). Dopasowanie
 * jest LITERALNE do realnego identyfikatora wyniku rozpływu — `bus_id` →
 * podzakładka Szyny, `branch_id` → podzakładka Gałęzie — zero tabeli
 * mapowań „rodzaj elementu SLD → zakładka" (zero fabrykacji: nie zgadujemy,
 * po prostu sprawdzamy, czy ref występuje w realnym wyniku). Brak dopasowania
 * w żadnej z tabel = zostajemy na aktualnej podzakładce bez podświetlenia
 * (uczciwy stan — element bez własnego wiersza w wyniku rozpływu, np. pole/
 * aparat/stacja/ZK SN/słup, patrz `sldActionExecutor.ts`).
 */

import { useEffect, useRef, useState } from 'react';
import type { AdvancementMode } from '../../shell/modeModel';
import { TabelaGalezi } from './TabelaGalezi';
import { TabelaSzyn } from './TabelaSzyn';
import { ROZPLYW_STRINGS } from './strings';
import { useWynikRozplywu } from './adapters/rozplywAdapter';
import './rozplyw.css';

const PODZAKLADKI = [
  { id: 'szyny', etykieta: ROZPLYW_STRINGS.podzakladkaSzyny },
  { id: 'galezie', etykieta: ROZPLYW_STRINGS.podzakladkaGalezie },
] as const;

type PodzakladkaId = (typeof PODZAKLADKI)[number]['id'];

export interface EkranRozplywuProps {
  trybZaawansowania: AdvancementMode;
  onOtworzDowod: (ref: string) => void;
  onEksport?: () => void;
  /**
   * Preselekcja elementu z deep-linku SLD (karta D-2): `bus_id` albo
   * `branch_id` klikniętego elementu. Prop addytywny — brak = zachowanie 1:1
   * (ręczny wybór podzakładki/wiersza, jak przed kartą D-2).
   */
  preselekcjaElementu?: string | null;
  /** Sygnał konsumpcji pre-selekcji (żądanie jednorazowe — rodzic czyści,
   *  wzorzec `EkranKompensacji.onPreselekcjaSkonsumowana`). */
  onPreselekcjaSkonsumowana?: () => void;
}

export function EkranRozplywu({
  trybZaawansowania,
  onOtworzDowod,
  onEksport,
  preselekcjaElementu = null,
  onPreselekcjaSkonsumowana,
}: EkranRozplywuProps) {
  const [podzakladka, setPodzakladka] = useState<PodzakladkaId>('szyny');
  const [wybranaSzyna, setWybranaSzyna] = useState<string | null>(null);
  const [wybranaGalaz, setWybranaGalaz] = useState<string | null>(null);
  const { wynik } = useWynikRozplywu();

  // Pre-selekcja z deep-linku (D-2) — konsumowana dopiero, gdy wynik rozpływu
  // jest dostępny (analogicznie `EkranKompensacji`: czekamy na dane zamiast
  // odrzucać żądanie przedwcześnie). Jednorazowość lokalna (ref) — po
  // konsumpcji ten sam ref nie nadpisuje ponownie ręcznego wyboru wiersza.
  const skonsumowanaPreselekcja = useRef<string | null>(null);
  useEffect(() => {
    if (preselekcjaElementu === null || preselekcjaElementu === '') {
      skonsumowanaPreselekcja.current = null; // rodzic wyczyścił — gotowość na kolejne żądanie
      return;
    }
    if (preselekcjaElementu === skonsumowanaPreselekcja.current) return; // już skonsumowane
    if (!wynik) return; // wynik jeszcze niedostępny — czekamy (nie tracimy żądania)

    const wBusach = wynik.bus_results.some((r) => r.bus_id === preselekcjaElementu);
    if (wBusach) {
      setPodzakladka('szyny');
      setWybranaSzyna(preselekcjaElementu);
    } else {
      const wGaleziach = wynik.branch_results.some((r) => r.branch_id === preselekcjaElementu);
      if (wGaleziach) {
        setPodzakladka('galezie');
        setWybranaGalaz(preselekcjaElementu);
      }
      // Brak dopasowania w żadnej tabeli: zero fabrykacji — zostajemy bez
      // podświetlenia (np. pole/aparat/stacja/ZK SN/słup bez własnego wiersza).
    }
    skonsumowanaPreselekcja.current = preselekcjaElementu;
    onPreselekcjaSkonsumowana?.();
  }, [preselekcjaElementu, wynik, onPreselekcjaSkonsumowana]);

  return (
    <div className="mvd-rozplyw-ekran" data-testid="mvd-rozplyw-ekran">
      <div
        role="tablist"
        aria-label={ROZPLYW_STRINGS.ariaPodzakladki}
        className="mvd-rozplyw-podzakladki"
      >
        {PODZAKLADKI.map((z) => (
          <button
            key={z.id}
            role="tab"
            type="button"
            aria-selected={podzakladka === z.id}
            tabIndex={podzakladka === z.id ? 0 : -1}
            className={
              podzakladka === z.id
                ? 'mvd-rozplyw-podzakladka mvd-on'
                : 'mvd-rozplyw-podzakladka'
            }
            data-testid={`mvd-rozplyw-podzakladka-${z.id}`}
            onClick={() => setPodzakladka(z.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const idx = PODZAKLADKI.findIndex((x) => x.id === podzakladka);
                const krok = e.key === 'ArrowRight' ? 1 : PODZAKLADKI.length - 1;
                setPodzakladka(PODZAKLADKI[(idx + krok) % PODZAKLADKI.length].id);
              }
            }}
          >
            {z.etykieta}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mvd-rozplyw-podzakladki-tresc">
        {podzakladka === 'szyny' && (
          <TabelaSzyn
            trybZaawansowania={trybZaawansowania}
            onOtworzDowod={onOtworzDowod}
            onEksport={onEksport}
            wybranyWiersz={wybranaSzyna}
            onWybierzWiersz={setWybranaSzyna}
          />
        )}
        {podzakladka === 'galezie' && (
          <TabelaGalezi
            trybZaawansowania={trybZaawansowania}
            onOtworzDowod={onOtworzDowod}
            onEksport={onEksport}
            wybranyWiersz={wybranaGalaz}
            onWybierzWiersz={setWybranaGalaz}
          />
        )}
      </div>
    </div>
  );
}
