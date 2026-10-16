/*
 * Panel dolny powłoki (karta K1 POWLOKA, kontrakt UIUX przemysłowy UI-02).
 *
 * Dawniej atrapa („zawartość w kolejnym kroku"). Teraz: zakładki z rejestru
 * (`ZAKLADKI_PANELU_DOLNEGO`, rozszerzalny), realna treść każdej zakładki,
 * regulowana wysokość (uchwyt u góry: przeciąganie, strzałki góra/dół, granice
 * `BOTTOM_MIN…BOTTOM_MAX` z `useShellStore`). Wzorzec ARIA „tabs".
 */

import { useCallback, useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

import { SHELL_STRINGS } from '../strings';
import { BOTTOM_MAX, BOTTOM_MIN, clampBottomHeight } from '../useShellStore';
import type { KontekstPaneluDolnego, ZakladkaPaneluDolnego } from './rejestrZakladek';

const KROK_KLAWIATURY = 24;

export interface PanelDolnyProps extends KontekstPaneluDolnego {
  zakladki: readonly ZakladkaPaneluDolnego[];
  aktywna: string;
  wysokosc: number;
  onWybierzZakladke: (id: string) => void;
  onZmienWysokosc: (wysokosc: number) => void;
  onZamknij: () => void;
}

export function PanelDolny({
  zakladki,
  aktywna,
  wysokosc,
  onWybierzZakladke,
  onZmienWysokosc,
  onZamknij,
  onWybierzElement,
  onPokazWynikiBiegu,
}: PanelDolnyProps) {
  const przeciaganieRef = useRef<{ startY: number; startWysokosc: number } | null>(null);
  const wysokoscPanelu = clampBottomHeight(wysokosc);
  const biezaca = zakladki.find((zakladka) => zakladka.id === aktywna) ?? zakladki[0];

  const naRuch = useCallback(
    (zdarzenie: PointerEvent) => {
      const przeciaganie = przeciaganieRef.current;
      if (!przeciaganie) return;
      onZmienWysokosc(clampBottomHeight(przeciaganie.startWysokosc + (przeciaganie.startY - zdarzenie.clientY)));
    },
    [onZmienWysokosc],
  );

  const koniec = useCallback(() => {
    przeciaganieRef.current = null;
    window.removeEventListener('pointermove', naRuch);
    window.removeEventListener('pointerup', koniec);
  }, [naRuch]);

  const start = (zdarzenie: ReactPointerEvent) => {
    przeciaganieRef.current = { startY: zdarzenie.clientY, startWysokosc: wysokoscPanelu };
    window.addEventListener('pointermove', naRuch);
    window.addEventListener('pointerup', koniec);
  };

  const naKlawiszUchwytu = (zdarzenie: KeyboardEvent) => {
    if (zdarzenie.key === 'ArrowUp') onZmienWysokosc(clampBottomHeight(wysokoscPanelu + KROK_KLAWIATURY));
    if (zdarzenie.key === 'ArrowDown') onZmienWysokosc(clampBottomHeight(wysokoscPanelu - KROK_KLAWIATURY));
  };

  const naKlawiszZakladek = (zdarzenie: KeyboardEvent) => {
    if (zdarzenie.key !== 'ArrowRight' && zdarzenie.key !== 'ArrowLeft') return;
    const indeks = zakladki.findIndex((zakladka) => zakladka.id === biezaca?.id);
    const krok = zdarzenie.key === 'ArrowRight' ? 1 : -1;
    const nastepna = zakladki[(indeks + krok + zakladki.length) % zakladki.length];
    onWybierzZakladke(nastepna.id);
  };

  if (!biezaca) return null;
  const Tresc = biezaca.Tresc;

  return (
    <section
      className="mvd-bottom"
      aria-label={SHELL_STRINGS.bottomPanelLabel}
      style={{ height: `${wysokoscPanelu}px` }}
      data-testid="mvd-bottom-panel"
    >
      <div
        className="mvd-bottom-uchwyt"
        role="separator"
        aria-orientation="horizontal"
        aria-label={SHELL_STRINGS.bottomResizeHint}
        aria-valuemin={BOTTOM_MIN}
        aria-valuemax={BOTTOM_MAX}
        aria-valuenow={wysokoscPanelu}
        tabIndex={0}
        onPointerDown={start}
        onKeyDown={naKlawiszUchwytu}
        data-testid="mvd-bottom-handle"
      />
      <div className="mvd-bottom-tabs" role="tablist" aria-label={SHELL_STRINGS.bottomPanelLabel} onKeyDown={naKlawiszZakladek}>
        {zakladki.map((zakladka) => {
          const wybrana = zakladka.id === biezaca.id;
          return (
            <button
              key={zakladka.id}
              type="button"
              role="tab"
              id={`mvd-bottom-tab-${zakladka.id}`}
              aria-selected={wybrana}
              aria-controls="mvd-bottom-tresc"
              tabIndex={wybrana ? 0 : -1}
              className={wybrana ? 'mvd-bottom-tab mvd-on' : 'mvd-bottom-tab'}
              onClick={() => onWybierzZakladke(zakladka.id)}
              data-testid={`mvd-bottom-tab-${zakladka.id}`}
            >
              {zakladka.etykieta}
            </button>
          );
        })}
        <span className="mvd-grow" />
        <button
          type="button"
          className="mvd-bottom-tab"
          aria-label={SHELL_STRINGS.closeBottom}
          title={SHELL_STRINGS.closeBottom}
          onClick={onZamknij}
          data-testid="mvd-bottom-close"
        >
          ✕
        </button>
      </div>
      <div
        className="mvd-bottom-tresc"
        id="mvd-bottom-tresc"
        role="tabpanel"
        aria-labelledby={`mvd-bottom-tab-${biezaca.id}`}
        data-testid={`mvd-bottom-tresc-${biezaca.id}`}
      >
        <Tresc onWybierzElement={onWybierzElement} onPokazWynikiBiegu={onPokazWynikiBiegu} />
      </div>
    </section>
  );
}
