/*
 * Menedżer przypadków obliczeniowych (przestrzeń „Obliczenia", okno W-501,
 * karta E7.1). Scala most CaseConfigPage + RunHistoryPanel: lista przypadków z
 * konfiguracją i statusem wyników + karta przypadku (z jawnymi założeniami) +
 * porównanie konfiguracji + tworzenie/klonowanie.
 *
 * Gramatyka MODEL_INTERAKCJI §2: klik = selekcja + szczegóły (karta), 2× klik =
 * aktywacja przypadku, prawy przycisk = menu (Aktywuj / Klonuj / Porównaj).
 * Aktywacja przechodzi przez ISTNIEJĄCĄ, atomową dla całej powłoki akcję store
 * (`useAppStateStore.setActiveCase` przez adapter — SPEC_POWIAZANIA_WARSTW §3.2).
 * Zero fizyki, zero mutacji NetworkModelu.
 */

import { useMemo, useState } from 'react';
import {
  useAktywujPrzypadek,
  usePelnePrzypadki,
  useStanListy,
  useWiersze,
  type PrzypadekWiersz,
} from './adapters/przypadkiAdapter';
import { KartaPrzypadku } from './KartaPrzypadku';
import { PorownanieKonfiguracji } from './PorownanieKonfiguracji';
import { NowyPrzypadek } from './NowyPrzypadek';
import {
  PRZYPADKI_STRINGS as T,
  STATUS_WYNIKOW_LABEL,
  formatCzas,
} from './strings';
import type { StudyCaseResultStatus } from '../../../ui/study-cases/types';
import './przypadki.css';

const WARIANT_STATUSU: Record<StudyCaseResultStatus, string> = {
  NONE: 'mvd-tag-mut',
  FRESH: 'mvd-tag-ok',
  OUTDATED: 'mvd-tag-warn',
};

type Widok = 'karta' | 'porownanie';

interface MenuStan {
  wiersz: PrzypadekWiersz;
  x: number;
  y: number;
}

export function MenedzerPrzypadkow() {
  const stanListy = useStanListy();
  const wiersze = useWiersze();
  const aktywuj = useAktywujPrzypadek();

  const [zaznaczonyId, setZaznaczonyId] = useState<string | null>(null);
  const [zbiorPorownania, setZbiorPorownania] = useState<Set<string>>(new Set());
  const [widok, setWidok] = useState<Widok>('karta');
  const [menu, setMenu] = useState<MenuStan | null>(null);
  const [dialogOtwarty, setDialogOtwarty] = useState(false);
  const [klonZ, setKlonZ] = useState<string | null>(null);

  const idsPorownania = useMemo(() => [...zbiorPorownania], [zbiorPorownania]);
  const szczegoly = usePelnePrzypadki(zaznaczonyId ? [zaznaczonyId] : []);
  const porownanie = usePelnePrzypadki(widok === 'porownanie' ? idsPorownania : []);

  function przelaczPorownanie(id: string) {
    setZbiorPorownania((poprz) => {
      const nowy = new Set(poprz);
      if (nowy.has(id)) nowy.delete(id);
      else nowy.add(id);
      return nowy;
    });
  }

  function otworzMenu(e: React.MouseEvent, wiersz: PrzypadekWiersz) {
    e.preventDefault();
    setMenu({ wiersz, x: e.clientX, y: e.clientY });
  }

  function otworzNowy(zrodlo: string | null) {
    setKlonZ(zrodlo);
    setDialogOtwarty(true);
    setMenu(null);
  }

  if (stanListy === 'brak-projektu') {
    return (
      <div className="mvd-przypadki-pusto" data-testid="mvd-przypadki-brak-projektu">
        {T.bladBrakProjektu}
      </div>
    );
  }
  if (stanListy === 'ladowanie') {
    return (
      <div className="mvd-przypadki-pusto" data-testid="mvd-przypadki-ladowanie">
        {T.porownanieLadowanie}
      </div>
    );
  }

  return (
    <div className="mvd-przypadki" data-testid="mvd-przypadki">
      <header className="mvd-przypadki-naglowek">
        <div>
          <h2 className="mvd-przypadki-tytul">{T.tytul}</h2>
          <p className="mvd-przypadki-podtytul">{T.podtytul}</p>
        </div>
        <div className="mvd-przypadki-narzedzia">
          <button
            type="button"
            className="mvd-btn"
            disabled={zbiorPorownania.size < 2}
            onClick={() => setWidok('porownanie')}
            data-testid="mvd-przypadki-porownaj"
          >
            {`${T.porownajZaznaczone} (${zbiorPorownania.size})`}
          </button>
          <button
            type="button"
            className="mvd-btn mvd-btn-primary"
            onClick={() => otworzNowy(null)}
            data-testid="mvd-przypadki-nowy"
          >
            {T.nowyPrzypadek}
          </button>
        </div>
      </header>

      <div className="mvd-przypadki-tresc">
        <section className="mvd-przypadki-lista" aria-label={T.tytul}>
          {wiersze.length === 0 ? (
            <p className="mvd-cases-empty" data-testid="mvd-przypadki-lista-pusta">
              {T.brakPrzypadkow}
            </p>
          ) : (
            <div className="mvd-cases-scroll">
              <table className="mvd-cases-table">
                <thead>
                  <tr>
                    <th aria-label={T.menuPorownaj} />
                    <th>{T.kolPrzypadek}</th>
                    <th>{T.kolKonfiguracja}</th>
                    <th>{T.kolWyniki}</th>
                    <th>{T.kolZmieniono}</th>
                  </tr>
                </thead>
                <tbody>
                  {wiersze.map((w) => (
                    <tr
                      key={w.id}
                      className={`mvd-cases-row${zaznaczonyId === w.id ? ' mvd-on' : ''}`}
                      aria-selected={zaznaczonyId === w.id}
                      onClick={() => {
                        setZaznaczonyId(w.id);
                        setWidok('karta');
                      }}
                      onDoubleClick={() => aktywuj(w)}
                      onContextMenu={(e) => otworzMenu(e, w)}
                    >
                      <td className="mvd-cases-check">
                        <input
                          type="checkbox"
                          aria-label={`${T.menuPorownaj}: ${w.nazwa}`}
                          checked={zbiorPorownania.has(w.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => przelaczPorownanie(w.id)}
                          data-testid={`mvd-przypadki-porownaj-${w.id}`}
                        />
                      </td>
                      <td>
                        <span className="mvd-cases-name">{w.nazwa}</span>
                        {w.aktywny && (
                          <span className="mvd-cases-active">{T.aktywny}</span>
                        )}
                      </td>
                      <td>{w.konfiguracja}</td>
                      <td>
                        <span className={`mvd-tag ${WARIANT_STATUSU[w.statusWynikow]}`}>
                          {STATUS_WYNIKOW_LABEL[w.statusWynikow]}
                        </span>
                      </td>
                      <td className="mvd-cases-time">{formatCzas(w.zmienionoISO)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mvd-przypadki-szczegoly" aria-label={T.wrocDoKarty}>
          {widok === 'porownanie' ? (
            <>
              <button
                type="button"
                className="mvd-btn mvd-przypadki-wroc"
                onClick={() => setWidok('karta')}
                data-testid="mvd-przypadki-wroc"
              >
                {T.wrocDoKarty}
              </button>
              <PorownanieKonfiguracji
                przypadki={porownanie.przypadki}
                ladowanie={porownanie.ladowanie}
                blad={porownanie.blad}
              />
            </>
          ) : (
            <KartaPrzypadku
              przypadek={szczegoly.przypadki[0] ?? null}
              ladowanie={szczegoly.ladowanie}
              blad={szczegoly.blad}
            />
          )}
        </section>
      </div>

      {menu && (
        <>
          <div
            className="mvd-menu-scrim"
            data-testid="mvd-menu-scrim"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu(null);
            }}
          />
          <ul
            role="menu"
            aria-label={T.menuTytul}
            className="mvd-menu"
            style={{ left: menu.x, top: menu.y }}
            data-testid="mvd-menu"
          >
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className="mvd-menu-item"
                onClick={() => {
                  aktywuj(menu.wiersz);
                  setMenu(null);
                }}
                data-testid="mvd-menu-aktywuj"
              >
                {T.menuAktywuj}
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className="mvd-menu-item"
                onClick={() => otworzNowy(menu.wiersz.id)}
                data-testid="mvd-menu-klonuj"
              >
                {T.menuKlonuj}
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className="mvd-menu-item"
                onClick={() => {
                  przelaczPorownanie(menu.wiersz.id);
                  setMenu(null);
                }}
                data-testid="mvd-menu-porownaj"
              >
                {T.menuPorownaj}
              </button>
            </li>
          </ul>
        </>
      )}

      {dialogOtwarty && (
        <NowyPrzypadek
          wiersze={wiersze}
          zrodloPoczatkowe={klonZ}
          onZamknij={() => setDialogOtwarty(false)}
          onUtworzono={(id) => {
            setZaznaczonyId(id);
            setWidok('karta');
          }}
        />
      )}
    </div>
  );
}
