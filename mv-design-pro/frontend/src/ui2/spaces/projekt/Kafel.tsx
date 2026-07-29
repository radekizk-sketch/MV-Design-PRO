/*
 * Wspólna powłoka kafla pulpitu (W-101). W pełni sterowana propsami. Kafel
 * klikalny (z `onKlik`) renderuje się jako `<button>` z głębokim linkiem do
 * przestrzeni (gramatyka MODEL_INTERAKCJI §2: kafel → nawigacja); bez `onKlik`
 * to statyczny kontener (np. kafel „wkrótce").
 */

import type { ReactNode } from 'react';

interface KafelProps {
  tytul: string;
  onKlik?: () => void;
  wyszarzony?: boolean;
  ariaLabel?: string;
  children?: ReactNode;
}

export function Kafel({ tytul, onKlik, wyszarzony, ariaLabel, children }: KafelProps) {
  const klasa = `mvd-kafel${wyszarzony ? ' mvd-kafel-mut' : ''}`;
  const zawartosc = (
    <>
      <h3 className="mvd-kafel-title">{tytul}</h3>
      {children}
    </>
  );

  if (onKlik) {
    return (
      <button type="button" className={klasa} onClick={onKlik} aria-label={ariaLabel}>
        {zawartosc}
      </button>
    );
  }
  return <div className={klasa}>{zawartosc}</div>;
}

/** Wiersz klucz–wartość w kaflu. */
export function KafelWiersz({
  etykieta,
  children,
}: {
  etykieta: string;
  children: ReactNode;
}) {
  return (
    <div className="mvd-kafel-kv-row">
      <span className="mvd-kafel-kv-label">{etykieta}</span>
      <span className="mvd-kafel-kv-value">{children}</span>
    </div>
  );
}

export type WariantTagu = 'ok' | 'warn' | 'err' | 'mut';

/** Tag statusu (spójny z makietą U0.6): kolor przez token, treść przez props. */
export function Tag({
  wariant,
  children,
}: {
  wariant: WariantTagu;
  children: ReactNode;
}) {
  return <span className={`mvd-tag mvd-tag-${wariant}`}>{children}</span>;
}
