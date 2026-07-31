/*
 * Panel „Przebiegi obliczeń" (przestrzeń „Obliczenia", okno W-503, karta E7.2).
 * Historia i stan przebiegów aktywnego przypadku obliczeniowego: tabela
 * (analiza PL, status PL tagiem, początek, czas trwania, rewizja modelu) +
 * szczegóły przebiegu (parametry wejściowe = odtwarzalność WHITE BOX) + akcja
 * „Pokaż wyniki" (callback `onPokazWyniki(runId)` — przejście do przestrzeni
 * „Wyniki" wykonuje integrator, wzorzec `PanelGotowosci.onSelekcja`).
 * Zastępuje most `MostHistoriiPrzebiegow` (`ui2/legacy/LegacySurface.tsx:52`;
 * podmiana w rejestrze legacy = karta integracyjna zarządcy, poza zakresem
 * plików tej karty).
 *
 * DEKLARACJA POWIĄZAŃ (SPEC_POWIAZANIA_WARSTW §5):
 *   Subskrybuje: `wyniki-gotowe` → odświeżenie listy przez ISTNIEJĄCĄ akcję
 *     `runStore.loadRuns` (bez remount — stan lokalny selekcji zachowany;
 *     adapter `useOdswiezaniePrzebiegow`); `wyniki-niewazne` → ogłoszenie
 *     ARIA-live (dane przebiegów nie zmieniają się — Case Immutability Rule,
 *     status świeżości WYNIKÓW niesie przestrzeń „Wyniki", nie historia
 *     przebiegów).
 *   Emituje: nic bezpośrednio — akcja „Pokaż wyniki" przez prop
 *     `onPokazWyniki(runId)` (integrator woła `setActiveRun` + zmianę
 *     przestrzeni, jak most `MostHistoriiPrzebiegow` przed wygaszeniem).
 *   Rewizja: rekord przebiegu nie niesie rewizji modelu z chwili liczenia
 *     (TODO-KARTA adaptera #2) — kolumna „Rewizja modelu" uczciwie „wkrótce".
 *   Nawigacja: wchodzące — przestrzeń „Obliczenia" (zakładka przebiegów);
 *     wychodzące — `onPokazWyniki` (przestrzeń „Wyniki i dowody").
 *
 * Zero fizyki, zero mutacji NetworkModelu, zero wołań API bezpośrednio
 * (read-only runStore + istniejąca akcja `loadRuns` — karta §2).
 */

import { useState } from 'react';
import type { AdvancementMode } from '../../../shell/modeModel';
import {
  useOdswiezaniePrzebiegow,
  useStanPrzebiegow,
  useWierszePrzebiegow,
} from './adapters/przebiegiAdapter';
import { WierszPrzebiegu } from './WierszPrzebiegu';
import { SzczegolyPrzebiegu } from './SzczegolyPrzebiegu';
import { UruchomObliczenie } from '../UruchomObliczenie';
import { PRZEBIEGI_STRINGS as T } from './strings';
import './przebiegi.css';

export interface PrzebiegiPanelProps {
  /** Tryb zaawansowania powłoki — koduje widoczność identyfikatorów (§2.7). */
  trybZaawansowania: AdvancementMode;
  /** Akcja „Pokaż wyniki" — integrator aktywuje przebieg i otwiera Wyniki. */
  onPokazWyniki: (runId: string) => void;
}

export function PrzebiegiPanel({ trybZaawansowania, onPokazWyniki }: PrzebiegiPanelProps) {
  const stan = useStanPrzebiegow();
  const wiersze = useWierszePrzebiegow();
  const ogloszenie = useOdswiezaniePrzebiegow();
  const [zaznaczonyId, setZaznaczonyId] = useState<string | null>(null);

  if (stan === 'brak-przypadku') {
    return (
      <div className="mvd-przebiegi-pusto" data-testid="mvd-przebiegi-brak-przypadku">
        <p>{T.brakPrzypadku}</p>
        <p>{T.brakPrzypadkuOpis}</p>
      </div>
    );
  }
  if (stan === 'ladowanie') {
    return (
      <div className="mvd-przebiegi-pusto" role="status" data-testid="mvd-przebiegi-ladowanie">
        {T.ladowanie}
      </div>
    );
  }
  if (stan === 'blad') {
    return (
      <div className="mvd-przebiegi-pusto" role="alert" data-testid="mvd-przebiegi-blad">
        {T.blad}
      </div>
    );
  }

  const zaznaczony = wiersze.find((w) => w.id === zaznaczonyId) ?? null;

  return (
    <div className="mvd-przebiegi" data-testid="mvd-przebiegi">
      <span className="mvd-sr-only" role="status" aria-live="polite" data-testid="mvd-przebiegi-live">
        {ogloszenie}
      </span>

      <header className="mvd-przebiegi-naglowek">
        <div className="mvd-przebiegi-naglowek-tekst">
          <h2 className="mvd-przebiegi-tytul">{T.tytul}</h2>
          <p className="mvd-przebiegi-podtytul">{T.podtytul}</p>
        </div>
        {/* K6 / H-5 dźwignia 2: jawny start przebiegu w przestrzeni „Obliczenia" —
            zamyka ślepy zaułek wskazówek „Przejdź do obliczeń". */}
        <UruchomObliczenie />
      </header>

      <div className="mvd-przebiegi-tresc">
        <section className="mvd-przebiegi-lista" aria-label={T.tytul}>
          {wiersze.length === 0 ? (
            <div className="mvd-przebiegi-puste" data-testid="mvd-przebiegi-lista-pusta">
              <p>{T.brakPrzebiegow}</p>
              <UruchomObliczenie testid="mvd-przebiegi-uruchom-pusty" />
            </div>
          ) : (
            <div className="mvd-przebiegi-scroll">
              <table className="mvd-przebiegi-tabela">
                <thead>
                  <tr>
                    <th>{T.kolAnaliza}</th>
                    <th>{T.kolStatus}</th>
                    <th>{T.kolPoczatek}</th>
                    <th>{T.kolCzasTrwania}</th>
                    <th>{T.kolRewizja}</th>
                  </tr>
                </thead>
                <tbody>
                  {wiersze.map((w) => (
                    <WierszPrzebiegu
                      key={w.id}
                      przebieg={w}
                      zaznaczony={zaznaczonyId === w.id}
                      onKlik={() => setZaznaczonyId(w.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mvd-przebiegi-szczegoly" aria-label={T.sekcjaParametry}>
          <SzczegolyPrzebiegu
            przebieg={zaznaczony}
            trybEkspercki={trybZaawansowania === 'expert'}
            onPokazWyniki={onPokazWyniki}
          />
        </section>
      </div>
    </div>
  );
}
