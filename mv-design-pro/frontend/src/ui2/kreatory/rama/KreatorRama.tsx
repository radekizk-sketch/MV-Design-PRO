/**
 * KreatorRama — wspólna rama prowadząca wszystkich kreatorów budowy sieci
 * (FLOW §0.3: cel jednym zdaniem · tor pracy · uczciwe stany · jawny następny
 * krok · język inżynierski). Ekran-neutralna: logikę i teksty wnosi moduł.
 *
 * Układ: nagłówek (eyebrow · tytuł · cel · odznaka · opcjonalny pasek kroków) →
 * ciało (sekcje, z opcjonalnym banerem błędu) → stopka (jedno wskazanie braku przy próbie
 * zapisu albo powód blokady + akcje). W trakcie pracy stopka milczy (kontrakt prowadzenia
 * projektanta: KONFIGURACJA_W_TOKU nigdy nie jest ostrzeżeniem).
 * Stylowanie wyłącznie tokenami --mvd-* (oba motywy z automatu).
 */

import { useEffect, useRef, type ChangeEvent, type ReactNode } from 'react';

import './kreatory.css';
import type { KrokKreatora } from './model';
import type { BlokadaZapisu, BrakDoOperacji } from './prowadzenie';
import { WskazanieKontekst } from './wskazanieKontekst';

/** Akcja nawigacji kroków (Wstecz/Dalej) — wyszarzana wyłącznie na krańcach toru kroków. */
export interface AkcjaKreatora {
  readonly etykieta: string;
  readonly onClick: () => void;
  readonly zablokowana?: boolean;
  readonly testid?: string;
}

/**
 * Akcja zapisu kreatora. NIE ma pola „zablokowana”: brak danych nie wyszarza zapisu
 * (kontrakt prowadzenia projektanta — brak to BRAK_DO_OPERACJI przy kliknięciu, z jednym
 * wskazaniem parametru). Wyszarzenie dopuszcza wyłącznie zamknięta lista `BlokadaZapisu`.
 */
export interface AkcjaZapisu {
  readonly etykieta: string;
  readonly onClick: () => void;
  readonly blokada?: BlokadaZapisu | null;
  readonly testid?: string;
}

/** Zdanie stopki dla blokady zapisu — jedno brzmienie we wszystkich kreatorach. */
const TEKST_BLOKADY: Readonly<Record<BlokadaZapisu, string>> = {
  ladowanie: 'Wczytywanie katalogu — zapis będzie dostępny po wczytaniu.',
  zapis_w_toku: 'Trwa zapis…',
};

/** Pierwsza kontrolka, na którą da się przenieść fokus (samo pole albo jego wnętrze). */
function kontrolkaFokusu(element: Element): HTMLElement | null {
  const wybieralne = 'input, select, textarea, button, [tabindex]';
  if (element instanceof HTMLElement && element.matches(wybieralne)) return element;
  return element.querySelector<HTMLElement>(wybieralne);
}

export interface KreatorRamaProps {
  eyebrow: string;
  tytul: string;
  cel: string;
  odznaka?: string;
  kroki?: readonly KrokKreatora[];
  krokAktywny?: string;
  onKrok?: (id: string) => void;
  bladGlobalny?: string | null;
  /**
   * BRAK_DO_OPERACJI wskazany przy próbie zapisu (`useProwadzenie`). Rama przechodzi do
   * kontrolki `pole`, ustawia na niej fokus i pokazuje JEDNO zdanie w stopce.
   */
  wskazanie?: BrakDoOperacji | null;
  /** Zdjęcie wskazania — rama woła je, gdy projektant zmieni wskazaną kontrolkę. */
  onZgasWskazanie?: () => void;
  akcjaGlowna: AkcjaZapisu;
  akcjaAnuluj: AkcjaKreatora;
  children: ReactNode;
  testid?: string;
  /** Wariant pełnoekranowy: układ dwukolumnowy (kroki+pola | stała kolumna boczna). */
  pelny?: boolean;
  /** Stała kolumna boczna (podsumowanie + gotowość) — tylko w wariancie pełnym. */
  aside?: ReactNode;
  /** Nawigacja kroków w stopce (wstecz/dalej). */
  krokWstecz?: AkcjaKreatora;
  krokDalej?: AkcjaKreatora;
  /** Etykieta licznika kroków, np. „Krok 2 z 7". */
  licznikKrokow?: string;
  /*
   * Sygnał gotowości (`data-status` korzenia, karta E2E-S95) NIE jest już osobną
   * właściwością: rama wyprowadza go z TEGO SAMEGO pola, które wyszarza zapis
   * (`akcjaGlowna.blokada`) — jedno źródło prawdy, dwa nie mogą się rozjechać
   * (reguła KLASA NIE INSTANCJA, „Predykaty parami”): `ladowanie` ⇔ katalog w drodze,
   * `zablokowany` ⇔ zapis w toku, `gotowy` ⇔ przycisk zapisu klikalny.
   */
}

export function KreatorRama({
  eyebrow,
  tytul,
  cel,
  odznaka,
  kroki,
  krokAktywny,
  onKrok,
  bladGlobalny,
  wskazanie,
  onZgasWskazanie,
  akcjaGlowna,
  akcjaAnuluj,
  children,
  testid,
  pelny,
  aside,
  krokWstecz,
  krokDalej,
  licznikKrokow,
}: KreatorRamaProps) {
  const korzen = useRef<HTMLDivElement>(null);
  const blokada = akcjaGlowna.blokada ?? null;
  const status = blokada === 'ladowanie' ? 'ladowanie' : blokada ? 'zablokowany' : 'gotowy';

  // Fokus na wskazanym parametrze — po zatwierdzeniu renderu, więc krok z polem jest już
  // na ekranie (kreator przestawia krok i wskazanie w tym samym zdarzeniu kliknięcia).
  useEffect(() => {
    if (!wskazanie?.pole || !korzen.current) return;
    const element = korzen.current.querySelector(`[data-testid="${wskazanie.pole}"]`);
    if (!element) return;
    const kontrolka = kontrolkaFokusu(element);
    if (kontrolka && typeof kontrolka.scrollIntoView === 'function') {
      kontrolka.scrollIntoView({ block: 'center' });
    }
    kontrolka?.focus();
  }, [wskazanie]);

  // Zmiana WSKAZANEJ kontrolki zdejmuje wskazanie — zdanie o braku nie wisi nad polem,
  // które projektant właśnie wypełnia. Zmiana innej kontrolki go nie zdejmuje.
  const onZmianaWKreatorze = (zdarzenie: ChangeEvent<HTMLDivElement>) => {
    if (!wskazanie?.pole || !onZgasWskazanie) return;
    const cel = zdarzenie.target as Element | null;
    if (cel?.closest?.(`[data-testid="${wskazanie.pole}"]`)) onZgasWskazanie();
  };

  return (
    <WskazanieKontekst.Provider value={wskazanie?.pole ?? null}>
    <div
      ref={korzen}
      className={pelny ? 'mvd-kreator mvd-kreator--pelny' : 'mvd-kreator'}
      data-testid={testid}
      data-status={status}
      onChange={onZmianaWKreatorze}
    >
      <header className="mvd-kreator-head">
        <div className="mvd-kreator-head-gora">
          <div>
            {/* Nadtytuł tylko, gdy niesie inną treść niż tytuł — 13 kreatorów podawało ten
                sam napis dwa razy z rzędu (oględziny 2026-10-15). */}
            {eyebrow !== tytul ? <span className="mvd-kreator-eyebrow">{eyebrow}</span> : null}
            <h2 className="mvd-kreator-tytul">{tytul}</h2>
          </div>
          {odznaka ? <span className="mvd-kreator-odznaka">{odznaka}</span> : null}
        </div>
        <p className="mvd-kreator-cel">{cel}</p>
        {kroki && kroki.length > 0 ? (
          <ol className="mvd-kreator-kroki" data-testid="mvd-kreator-kroki">
            {kroki.map((krok, i) => {
              const aktywny = krok.id === krokAktywny;
              return (
                <li key={krok.id}>
                  <button
                    type="button"
                    className={aktywny ? 'mvd-kreator-krok mvd-on' : 'mvd-kreator-krok'}
                    aria-current={aktywny ? 'step' : undefined}
                    tabIndex={aktywny ? 0 : -1}
                    data-testid={`mvd-kreator-krok-${krok.id}`}
                    onClick={onKrok ? () => onKrok(krok.id) : undefined}
                  >
                    <span className="mvd-kreator-krok-numer">{i + 1}</span>
                    <span>{krok.tytul}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : null}
      </header>

      {pelny ? (
        <div className="mvd-kreator-plansza">
          <div className="mvd-kreator-plansza-wnetrze">
            <div className="mvd-kreator-glowna">
              {bladGlobalny ? (
                <p className="mvd-kreator-blad" role="alert" data-testid="mvd-kreator-blad">
                  {bladGlobalny}
                </p>
              ) : null}
              {children}
            </div>
            {aside ? <aside className="mvd-kreator-aside" data-testid="mvd-kreator-aside">{aside}</aside> : null}
          </div>
        </div>
      ) : (
        <div className="mvd-kreator-cialo">
          {bladGlobalny ? (
            <p className="mvd-kreator-blad" role="alert" data-testid="mvd-kreator-blad">
              {bladGlobalny}
            </p>
          ) : null}
          {children}
        </div>
      )}

      <footer className="mvd-kreator-stopka">
        {krokWstecz || krokDalej || licznikKrokow ? (
          <div className="mvd-kreator-stopka-nawigacja">
            {krokWstecz ? (
              <button
                type="button"
                className="mvd-kreator-btn"
                disabled={krokWstecz.zablokowana}
                data-testid={krokWstecz.testid}
                onClick={krokWstecz.onClick}
              >
                {krokWstecz.etykieta}
              </button>
            ) : null}
            {licznikKrokow ? <span className="mvd-kreator-stopka-licznik">{licznikKrokow}</span> : null}
            {krokDalej ? (
              <button
                type="button"
                className="mvd-kreator-btn"
                disabled={krokDalej.zablokowana}
                data-testid={krokDalej.testid}
                onClick={krokDalej.onClick}
              >
                {krokDalej.etykieta}
              </button>
            ) : null}
          </div>
        ) : null}
        {wskazanie ? (
          <span
            className="mvd-kreator-stopka-wskazanie"
            role="alert"
            id="mvd-kreator-wskazanie"
            data-testid="mvd-kreator-wskazanie"
          >
            {wskazanie.komunikat}
          </span>
        ) : blokada ? (
          <span className="mvd-kreator-stopka-blokada" data-testid="mvd-kreator-blokada">
            {TEKST_BLOKADY[blokada]}
          </span>
        ) : null}
        <button
          type="button"
          className="mvd-kreator-btn"
          data-testid={akcjaAnuluj.testid}
          onClick={akcjaAnuluj.onClick}
        >
          {akcjaAnuluj.etykieta}
        </button>
        <button
          type="button"
          className="mvd-kreator-btn mvd-kreator-btn--glowna"
          disabled={blokada !== null}
          data-testid={akcjaGlowna.testid}
          onClick={akcjaGlowna.onClick}
        >
          {akcjaGlowna.etykieta}
        </button>
      </footer>
    </div>
    </WskazanieKontekst.Provider>
  );
}

// --------------------------------------------------------------- Sekcja

export interface KreatorSekcjaProps {
  tytul: string;
  nota?: string;
  children: ReactNode;
  testid?: string;
}

export function KreatorSekcja({ tytul, nota, children, testid }: KreatorSekcjaProps) {
  return (
    <section className="mvd-kreator-sekcja" data-testid={testid}>
      <div className="mvd-kreator-sekcja-head">
        <span className="mvd-kreator-sekcja-tytul">{tytul}</span>
        {nota ? <span className="mvd-kreator-sekcja-nota">{nota}</span> : null}
      </div>
      <div className="mvd-kreator-sekcja-cialo">{children}</div>
    </section>
  );
}

/** Pasek informacyjny (kontekst/objaśnienie) — nie sekcja z polami. */
export function KreatorInfo({ children, testid }: { children: ReactNode; testid?: string }) {
  return (
    <p className="mvd-kreator-sekcja--info" data-testid={testid}>
      {children}
    </p>
  );
}

/** Responsywna siatka pól: 1, 2 lub 3 kolumny (zwija się na wąskim panelu). */
export function KreatorSiatka({
  kolumny = 2,
  children,
}: {
  kolumny?: 1 | 2 | 3;
  children: ReactNode;
}) {
  const klasa = kolumny === 3 ? 'mvd-kreator-siatka mvd-kol-3'
    : kolumny === 2 ? 'mvd-kreator-siatka mvd-kol-2'
    : 'mvd-kreator-siatka';
  return <div className={klasa}>{children}</div>;
}
