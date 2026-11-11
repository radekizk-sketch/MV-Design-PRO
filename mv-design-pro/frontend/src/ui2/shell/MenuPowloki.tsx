/*
 * Menu rozwijane powłoki (pasek projektu: menu „Projekt" i „Widok").
 *
 * Wzorzec ARIA „menu button": przycisk `aria-haspopup="menu"` + lista
 * `role="menu"`; pozycje `menuitem` albo `menuitemcheckbox` (`aria-checked`).
 * Zamknięcie: wybór pozycji, Escape (fokus wraca na przycisk), klik poza menu.
 * Strzałki góra/dół przenoszą fokus między pozycjami.
 *
 * Klasy `mvd-menu-powloki*` są własnością tego komponentu — dawna klasa
 * `.mvd-menu` kolidowała z menu kontekstowym przypadków (`przypadki.css`),
 * przez co kontener „Widok" stawał się `position: fixed` i przykrywał nazwę
 * projektu (POMIAR_POWLOKA §1). Strażnik `scripts/css_kolizje_klas_guard.py`
 * pilnuje, żeby globalna klasa nie miała reguł w dwóch arkuszach.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

export interface PozycjaMenuPowloki {
  id: string;
  etykieta: string;
  /** Opis pozycji (podpowiedź `title`) — np. skrót klawiszowy. */
  opis?: string;
  /** Skrót klawiszowy pokazany przy pozycji (opisowo — obsługę ma powłoka). */
  skrot?: string;
  /** Pozycja przełącznika (`menuitemcheckbox`) — stan zaznaczenia. */
  zaznaczona?: boolean;
  /** Wartość pokazana po prawej (np. bieżący motyw). */
  wartosc?: string;
  testId: string;
  onWybierz: () => void;
}

interface MenuPowlokiProps {
  /** Treść przycisku otwierającego. */
  przycisk: ReactNode;
  /** Dostępna nazwa przycisku. */
  etykietaPrzycisku: string;
  tytulPrzycisku?: string;
  testIdPrzycisku: string;
  klasaPrzycisku?: string;
  pozycje: readonly PozycjaMenuPowloki[];
  /** Wyrównanie listy do prawej krawędzi przycisku (menu przy prawym brzegu). */
  doPrawej?: boolean;
}

export function MenuPowloki({
  przycisk,
  etykietaPrzycisku,
  tytulPrzycisku,
  testIdPrzycisku,
  klasaPrzycisku = 'mvd-btn',
  pozycje,
  doPrawej = false,
}: MenuPowlokiProps) {
  const [otwarte, setOtwarte] = useState(false);
  const idListy = useId();
  const korzenRef = useRef<HTMLDivElement>(null);
  const przyciskRef = useRef<HTMLButtonElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const zamknij = useCallback((zwrocFokus: boolean) => {
    setOtwarte(false);
    if (zwrocFokus) przyciskRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!otwarte) return;
    const pierwsza = listaRef.current?.querySelector<HTMLElement>('[role^="menuitem"]');
    pierwsza?.focus();
    const poza = (zdarzenie: PointerEvent) => {
      if (!korzenRef.current?.contains(zdarzenie.target as Node)) setOtwarte(false);
    };
    document.addEventListener('pointerdown', poza);
    return () => document.removeEventListener('pointerdown', poza);
  }, [otwarte]);

  const naKlawiszListy = (zdarzenie: KeyboardEvent<HTMLDivElement>) => {
    if (zdarzenie.key === 'Escape') {
      zdarzenie.preventDefault();
      zdarzenie.stopPropagation();
      zamknij(true);
      return;
    }
    if (zdarzenie.key !== 'ArrowDown' && zdarzenie.key !== 'ArrowUp') return;
    zdarzenie.preventDefault();
    const elementy = Array.from(
      listaRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [],
    );
    if (elementy.length === 0) return;
    const biezacy = elementy.indexOf(document.activeElement as HTMLElement);
    const krok = zdarzenie.key === 'ArrowDown' ? 1 : -1;
    const nastepny = (biezacy + krok + elementy.length) % elementy.length;
    elementy[nastepny].focus();
  };

  return (
    <div className="mvd-menu-powloki" ref={korzenRef}>
      <button
        ref={przyciskRef}
        type="button"
        className={klasaPrzycisku}
        aria-haspopup="menu"
        aria-expanded={otwarte}
        aria-controls={otwarte ? idListy : undefined}
        aria-label={etykietaPrzycisku}
        title={tytulPrzycisku}
        onClick={() => setOtwarte((stan) => !stan)}
        data-testid={testIdPrzycisku}
      >
        {przycisk}
      </button>
      {otwarte && (
        <div
          ref={listaRef}
          className={
            doPrawej ? 'mvd-menu-powloki-lista mvd-menu-powloki-prawa' : 'mvd-menu-powloki-lista'
          }
          id={idListy}
          role="menu"
          aria-label={etykietaPrzycisku}
          onKeyDown={naKlawiszListy}
        >
          {pozycje.map((pozycja) => (
            <button
              key={pozycja.id}
              type="button"
              role={pozycja.zaznaczona === undefined ? 'menuitem' : 'menuitemcheckbox'}
              aria-checked={pozycja.zaznaczona}
              className="mvd-menu-powloki-pozycja"
              title={pozycja.opis}
              tabIndex={-1}
              onClick={() => {
                zamknij(false);
                pozycja.onWybierz();
              }}
              data-testid={pozycja.testId}
            >
              <span className="mvd-menu-powloki-znacznik" aria-hidden="true">
                {pozycja.zaznaczona ? '✓' : ''}
              </span>
              <span className="mvd-menu-powloki-etykieta">{pozycja.etykieta}</span>
              {pozycja.wartosc ? (
                <span className="mvd-menu-powloki-wartosc">{pozycja.wartosc}</span>
              ) : null}
              {pozycja.skrot ? <kbd className="mvd-menu-powloki-skrot">{pozycja.skrot}</kbd> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
