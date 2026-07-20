/**
 * Prymitywy pól kreatorów ui2 — wyłącznie prezentacja i callbacki, ZERO fizyki.
 * Wspólne dla wszystkich kreatorów budowy sieci. Stylowanie tokenami --mvd-*.
 *
 * Zasada FLOW §0.3 (język inżynierski): każde pole może nieść widoczną pomoc
 * (po co / z czego / co daje) zamiast ukrytego tooltipa.
 */

import type { ReactNode } from 'react';

import type { OpcjaWyboru, StatusPobrania } from './model';

interface PolakoszulkaProps {
  etykieta: string;
  jednostka?: string;
  wymagane?: boolean;
  blad?: string;
  pomoc?: string;
  htmlFor?: string;
  children: ReactNode;
}

/** Koszulka pola: etykieta + jednostka + gwiazdka + błąd + pomoc. */
function Polakoszulka({
  etykieta,
  jednostka,
  wymagane,
  blad,
  pomoc,
  htmlFor,
  children,
}: PolakoszulkaProps) {
  return (
    <div className="mvd-pole">
      <label className="mvd-pole-etykieta" htmlFor={htmlFor}>
        {etykieta}
        {jednostka ? <span className="mvd-pole-jednostka">[{jednostka}]</span> : null}
        {wymagane ? <span className="mvd-pole-gwiazdka" aria-hidden="true">*</span> : null}
      </label>
      {children}
      {pomoc ? <p className="mvd-pole-pomoc">{pomoc}</p> : null}
      {blad ? <p className="mvd-pole-blad" role="alert">{blad}</p> : null}
    </div>
  );
}

// ------------------------------------------------------------- Pole tekstowe

export interface PoleTekstoweProps {
  etykieta: string;
  wartosc: string;
  onZmiana?: (wartosc: string) => void;
  placeholder?: string;
  wymagane?: boolean;
  blad?: string;
  pomoc?: string;
  tylkoOdczyt?: boolean;
  testid?: string;
}

export function PoleTekstowe({
  etykieta,
  wartosc,
  onZmiana,
  placeholder,
  wymagane,
  blad,
  pomoc,
  tylkoOdczyt,
  testid,
}: PoleTekstoweProps) {
  return (
    <Polakoszulka etykieta={etykieta} wymagane={wymagane} blad={blad} pomoc={pomoc}>
      <input
        type="text"
        className="mvd-pole-input"
        value={wartosc}
        placeholder={placeholder}
        readOnly={tylkoOdczyt}
        disabled={tylkoOdczyt}
        aria-invalid={blad ? 'true' : undefined}
        data-testid={testid}
        onChange={onZmiana ? (e) => onZmiana(e.target.value) : undefined}
      />
    </Polakoszulka>
  );
}

// ------------------------------------------------------------- Pole liczbowe

export interface PoleLiczboweProps {
  etykieta: string;
  jednostka?: string;
  wartosc: number | null;
  onZmiana: (wartosc: number | null) => void;
  krok?: number;
  min?: number;
  max?: number;
  placeholder?: string;
  wymagane?: boolean;
  blad?: string;
  pomoc?: string;
  wylaczone?: boolean;
  testid?: string;
}

export function PoleLiczbowe({
  etykieta,
  jednostka,
  wartosc,
  onZmiana,
  krok,
  min,
  max,
  placeholder,
  wymagane,
  blad,
  pomoc,
  wylaczone,
  testid,
}: PoleLiczboweProps) {
  return (
    <Polakoszulka etykieta={etykieta} jednostka={jednostka} wymagane={wymagane} blad={blad} pomoc={pomoc}>
      <input
        type="number"
        className="mvd-pole-input"
        value={wartosc === null ? '' : wartosc}
        step={krok}
        min={min}
        max={max}
        placeholder={placeholder ?? 'Wprowadź wartość'}
        disabled={wylaczone}
        aria-invalid={blad ? 'true' : undefined}
        data-testid={testid}
        onChange={(e) => {
          if (e.target.value === '') {
            onZmiana(null);
            return;
          }
          const n = Number(e.target.value);
          onZmiana(Number.isNaN(n) ? null : n);
        }}
      />
    </Polakoszulka>
  );
}

// -------------------------------------------------------------- Pole wyboru

export interface PoleWyboruProps {
  etykieta: string;
  wartosc: string;
  onZmiana: (wartosc: string) => void;
  opcje: readonly OpcjaWyboru[];
  wymagane?: boolean;
  blad?: string;
  pomoc?: string;
  wylaczone?: boolean;
  testid?: string;
}

export function PoleWyboru({
  etykieta,
  wartosc,
  onZmiana,
  opcje,
  wymagane,
  blad,
  pomoc,
  wylaczone,
  testid,
}: PoleWyboruProps) {
  return (
    <Polakoszulka etykieta={etykieta} wymagane={wymagane} blad={blad} pomoc={pomoc}>
      <select
        className="mvd-pole-select"
        value={wartosc}
        disabled={wylaczone}
        aria-invalid={blad ? 'true' : undefined}
        data-testid={testid}
        onChange={(e) => onZmiana(e.target.value)}
      >
        {opcje.map((o) => (
          <option key={o.id} value={o.id}>{o.etykieta}</option>
        ))}
      </select>
    </Polakoszulka>
  );
}

// -------------------------------------------------- Przełącznik segmentowy

export interface PolePrzelacznikProps {
  etykieta?: string;
  opcje: readonly OpcjaWyboru[];
  wartosc: string;
  onZmiana: (id: string) => void;
  ariaLabel?: string;
  testid?: string;
}

export function PolePrzelacznik({
  etykieta,
  opcje,
  wartosc,
  onZmiana,
  ariaLabel,
  testid,
}: PolePrzelacznikProps) {
  const grupa = (
    <div className="mvd-przelacznik" role="group" aria-label={ariaLabel ?? etykieta} data-testid={testid}>
      {opcje.map((o) => {
        const aktywna = o.id === wartosc;
        return (
          <button
            key={o.id}
            type="button"
            className={aktywna ? 'mvd-przelacznik-opcja mvd-on' : 'mvd-przelacznik-opcja'}
            aria-pressed={aktywna}
            data-testid={testid ? `${testid}-${o.id}` : undefined}
            onClick={() => onZmiana(o.id)}
          >
            {o.etykieta}
          </button>
        );
      })}
    </div>
  );
  if (!etykieta) return grupa;
  return (
    <div className="mvd-pole">
      <span className="mvd-pole-etykieta">{etykieta}</span>
      {grupa}
    </div>
  );
}

// -------------------------------------------------- Przełącznik binarny

export interface PolePrzelacznikBinarnyProps {
  etykieta: string;
  wlaczone: boolean;
  onZmiana: (wlaczone: boolean) => void;
  opis?: string;
  testid?: string;
}

export function PolePrzelacznikBinarny({
  etykieta,
  wlaczone,
  onZmiana,
  opis,
  testid,
}: PolePrzelacznikBinarnyProps) {
  return (
    <label className="mvd-przelacznik-bin">
      <input
        type="checkbox"
        checked={wlaczone}
        data-testid={testid}
        onChange={(e) => onZmiana(e.target.checked)}
      />
      <span className="mvd-przelacznik-bin-tekst">
        <span className="mvd-przelacznik-bin-etykieta">{etykieta}</span>
        {opis ? <span className="mvd-przelacznik-bin-opis">{opis}</span> : null}
      </span>
    </label>
  );
}

// --------------------------------------------------------- Pole katalogu

export interface PoleKataloguProps {
  etykieta: string;
  wartosc: string | null;
  onZmiana: (id: string | null) => void;
  opcje: readonly OpcjaWyboru[];
  status: StatusPobrania;
  placeholder: string;
  placeholderLadowanie?: string;
  wymagane?: boolean;
  blad?: string;
  komunikatBledu?: string | null;
  pomoc?: string;
  testid?: string;
}

/**
 * Pole wyboru typu z katalogu (katalog-first). Prezentuje status pobrania i
 * uczciwy komunikat błędu; NIE fabrykuje opcji przy błędzie katalogu.
 */
export function PoleKatalogu({
  etykieta,
  wartosc,
  onZmiana,
  opcje,
  status,
  placeholder,
  placeholderLadowanie,
  wymagane,
  blad,
  komunikatBledu,
  pomoc,
  testid,
}: PoleKataloguProps) {
  return (
    <Polakoszulka etykieta={etykieta} wymagane={wymagane} blad={blad} pomoc={pomoc}>
      <select
        className="mvd-pole-select"
        value={wartosc ?? ''}
        disabled={status === 'loading'}
        aria-invalid={blad ? 'true' : undefined}
        data-testid={testid}
        onChange={(e) => onZmiana(e.target.value === '' ? null : e.target.value)}
      >
        <option value="">
          {status === 'loading' ? (placeholderLadowanie ?? 'Ładowanie katalogu…') : placeholder}
        </option>
        {opcje.map((o) => (
          <option key={o.id} value={o.id}>{o.etykieta}</option>
        ))}
      </select>
      {status === 'error' ? (
        <p className="mvd-pole-blad" role="alert">
          {komunikatBledu ?? 'Nie udało się pobrać katalogu.'}
        </p>
      ) : null}
    </Polakoszulka>
  );
}
