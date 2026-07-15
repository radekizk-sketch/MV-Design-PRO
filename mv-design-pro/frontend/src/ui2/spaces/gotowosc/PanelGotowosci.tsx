/*
 * Panel gotowości wg celów (W-401/W-402, karta E6.1). Zastępuje most
 * `EngineeringReadinessPanel` w przestrzeni „Gotowość" (aktualizacja
 * `legacyRegistry` = karta integracyjna zarządcy, poza zakresem plików tej
 * karty). Braki pogrupowane wg celu inżyniera, z postępem per cel, filtrami
 * (waga/cel/gałąź) i akcją naprawczą per wiersz.
 *
 * DEKLARACJA POWIĄZAŃ (SPEC_POWIAZANIA_WARSTW §5):
 *   Subskrybuje: `model-zmieniony` → odświeża ogłoszenie ARIA-live (treść
 *     zawsze czytana ze store'u przez adapter — magistrala jest sygnałem
 *     „coś realnie się zmieniło", nie drugim źródłem danych: lista problemów
 *     i tak reaguje na `useSnapshotStore` bezpośrednio, patrz
 *     `adapters/gotowoscAdapter.ts`); `gotowosc-zmieniona` → to samo (druga
 *     ścieżka sygnału, dla spójności z kartą E15.1).
 *   Emituje: `selekcja` — POŚREDNIO, przez prop `onSelekcja` (wzorzec z
 *     `ui2/AppRoot.tsx`: każda przestrzeń woła prop, integrator wywołuje
 *     `emituj({ typ: 'selekcja', obiektId, zrodlo: 'panel-gotowosci' })` —
 *     ta karta nie importuje `ui2/events` do zapisu, aby nie dublować
 *     odpowiedzialności integracyjnej).
 *   Rewizja: ND — gotowość nie jest daną pochodną z osobną rewizją
 *     (FreshnessBadge NIE dotyczy, karta §3) — zawsze aktualna względem
 *     bieżącego `useSnapshotStore.readiness`.
 *   Nawigacja: wchodzące — kafel „Gotowość do analiz" (pulpit, W-101) i pasek
 *     nawigacji przestrzeni; wychodzące — `onSelekcja`/`onAkcjaNaprawcza`
 *     otwierają właściwy edytor (karta integracyjna).
 */

import { useMemo, useState } from 'react';
import './gotowosc.css';
import type { AdvancementMode } from '../../shell/modeModel';
import { useBusEvent } from '../../events';
import {
  KOLEJNOSC_CELOW,
  grupujProblemyWgCelu,
  type CelGotowosci,
  type ProblemGotowosci,
} from './grupowanieCelow';
import { FILTRY_PUSTE, czyFiltrPusty, filtrujProblemy, type FiltryGotowosci } from './filtry';
import { useProblemyGotowosci, useStanGotowosci } from './adapters/gotowoscAdapter';
import { SekcjaCelu } from './SekcjaCelu';
import { GOTOWOSC_STRINGS } from './strings';
import { ETYKIETA_CELU } from './grupowanieCelow';

export interface PanelGotowosciProps {
  /** Tryb zaawansowania powłoki — koduje widoczny kod techniczny (karta §2.7). */
  trybZaawansowania: AdvancementMode;
  /** Klik wiersza problemu → selekcja globalna (integrator emituje na magistralę). */
  onSelekcja: (elementRef: string) => void;
  /** Klik „Napraw…" → wykonanie fix-action (integrator otwiera właściwy edytor). */
  onAkcjaNaprawcza: (problem: ProblemGotowosci) => void;
}

export function PanelGotowosci({
  trybZaawansowania,
  onSelekcja,
  onAkcjaNaprawcza,
}: PanelGotowosciProps) {
  const stan = useStanGotowosci();
  const issues = useProblemyGotowosci();
  const trybEkspercki = trybZaawansowania === 'expert';

  const grupyPelne = useMemo(() => grupujProblemyWgCelu(issues), [issues]);
  const [filtry, setFiltry] = useState<FiltryGotowosci>(FILTRY_PUSTE);
  const [zwiniete, setZwiniete] = useState<ReadonlySet<CelGotowosci>>(() => new Set());
  const [ogloszenie, setOgloszenie] = useState('');

  const blokadyCalkowite = grupyPelne.reduce((acc, g) => acc + g.blokady, 0);
  const ostrzezeniaCalkowite = grupyPelne.reduce((acc, g) => acc + g.ostrzezenia, 0);

  useBusEvent('model-zmieniony', () => {
    setOgloszenie(GOTOWOSC_STRINGS.ariaZmianaGotowosci(blokadyCalkowite, ostrzezeniaCalkowite));
  });
  useBusEvent('gotowosc-zmieniona', () => {
    setOgloszenie(GOTOWOSC_STRINGS.ariaZmianaGotowosci(blokadyCalkowite, ostrzezeniaCalkowite));
  });

  const przelaczSekcje = (cel: CelGotowosci) => {
    setZwiniete((poprzednie) => {
      const nastepne = new Set(poprzednie);
      if (nastepne.has(cel)) nastepne.delete(cel);
      else nastepne.add(cel);
      return nastepne;
    });
  };

  if (stan === 'brak-projektu') {
    return (
      <div className="mvd-gotowosc">
        <div className="mvd-gotowosc-state">
          <p className="mvd-gotowosc-state-title">{GOTOWOSC_STRINGS.brakProjektu}</p>
          <p className="mvd-gotowosc-state-desc">{GOTOWOSC_STRINGS.brakProjektuOpis}</p>
        </div>
      </div>
    );
  }

  if (stan === 'ladowanie') {
    return (
      <div className="mvd-gotowosc">
        <div className="mvd-gotowosc-state" role="status">
          <p className="mvd-gotowosc-state-desc">{GOTOWOSC_STRINGS.ladowanie}</p>
        </div>
      </div>
    );
  }

  if (stan === 'blad') {
    return (
      <div className="mvd-gotowosc">
        <div className="mvd-gotowosc-state" role="alert">
          <p className="mvd-gotowosc-state-title">{GOTOWOSC_STRINGS.blad}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mvd-gotowosc" data-testid="mvd-gotowosc-panel">
      <span className="mvd-sr-only" role="status" aria-live="polite" data-testid="mvd-gotowosc-live">
        {ogloszenie}
      </span>

      <header className="mvd-gotowosc-head">
        <h2 className="mvd-gotowosc-title">{GOTOWOSC_STRINGS.tytul}</h2>
        <p className="mvd-gotowosc-sub">{GOTOWOSC_STRINGS.podtytul}</p>
        <div className="mvd-gotowosc-podsumowanie" data-testid="mvd-gotowosc-podsumowanie">
          <span className="mvd-problem-tag mvd-problem-tag-blokada">
            {GOTOWOSC_STRINGS.podsumowanieBlokady}:{' '}
            <span className="mvd-num" data-testid="mvd-gotowosc-blokady-calkowite">
              {blokadyCalkowite}
            </span>
          </span>
          <span className="mvd-problem-tag mvd-problem-tag-ostrzezenie">
            {GOTOWOSC_STRINGS.podsumowanieOstrzezenia}:{' '}
            <span className="mvd-num" data-testid="mvd-gotowosc-ostrzezenia-calkowite">
              {ostrzezeniaCalkowite}
            </span>
          </span>
        </div>
      </header>

      {stan === 'wszystko-gotowe' ? (
        <div className="mvd-gotowosc-ok" data-testid="mvd-gotowosc-ok">
          <p className="mvd-gotowosc-ok-title">{GOTOWOSC_STRINGS.wszystkoGotowe}</p>
          <p className="mvd-gotowosc-ok-desc">{GOTOWOSC_STRINGS.wszystkoGotoweOpis}</p>
        </div>
      ) : (
        <>
          <FiltryPasek filtry={filtry} onZmien={setFiltry} grupyPelne={grupyPelne} />

          <div className="mvd-gotowosc-lista">
            {grupyPelne.map((grupa) => (
              <SekcjaCelu
                key={grupa.cel}
                grupa={grupa}
                problemyWidoczne={filtrujProblemy(grupa.problemy, filtry)}
                rozwinieta={!zwiniete.has(grupa.cel)}
                onPrzelacz={() => przelaczSekcje(grupa.cel)}
                trybEkspercki={trybEkspercki}
                onKlikWiersza={onSelekcja}
                onNaprawa={onAkcjaNaprawcza}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FiltryPasek({
  filtry,
  onZmien,
  grupyPelne,
}: {
  filtry: FiltryGotowosci;
  onZmien: (filtry: FiltryGotowosci) => void;
  grupyPelne: ReturnType<typeof grupujProblemyWgCelu>;
}) {
  const celeObecne = grupyPelne.map((g) => g.cel);

  return (
    <div className="mvd-gotowosc-filtry" aria-label={GOTOWOSC_STRINGS.filtrTytul}>
      <select
        aria-label={GOTOWOSC_STRINGS.filtrWagaEtykieta}
        className="mvd-select"
        value={filtry.waga ?? ''}
        onChange={(e) =>
          onZmien({
            ...filtry,
            waga: e.target.value === '' ? null : (e.target.value as FiltryGotowosci['waga']),
          })
        }
      >
        <option value="">{GOTOWOSC_STRINGS.filtrWagaWszystkie}</option>
        <option value="BLOKADA">{GOTOWOSC_STRINGS.wagaBlokada}</option>
        <option value="OSTRZEZENIE">{GOTOWOSC_STRINGS.wagaOstrzezenie}</option>
      </select>

      <select
        aria-label={GOTOWOSC_STRINGS.filtrCelEtykieta}
        className="mvd-select"
        value={filtry.cel ?? ''}
        onChange={(e) =>
          onZmien({
            ...filtry,
            cel: e.target.value === '' ? null : (e.target.value as CelGotowosci),
          })
        }
      >
        <option value="">{GOTOWOSC_STRINGS.filtrCelWszystkie}</option>
        {KOLEJNOSC_CELOW.filter((cel) => celeObecne.includes(cel)).map((cel) => (
          <option key={cel} value={cel}>
            {ETYKIETA_CELU[cel]}
          </option>
        ))}
      </select>

      <input
        type="text"
        className="mvd-input"
        aria-label={GOTOWOSC_STRINGS.filtrSzukajEtykieta}
        placeholder={GOTOWOSC_STRINGS.filtrSzukajPlaceholder}
        value={filtry.fraza}
        onChange={(e) => onZmien({ ...filtry, fraza: e.target.value })}
      />

      {!czyFiltrPusty(filtry) && (
        <button type="button" className="mvd-btn" onClick={() => onZmien(FILTRY_PUSTE)}>
          {GOTOWOSC_STRINGS.filtrWyczysc}
        </button>
      )}
    </div>
  );
}
