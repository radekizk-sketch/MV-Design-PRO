/**
 * KreatorRama — wspólna rama prowadząca wszystkich kreatorów budowy sieci
 * (FLOW §0.3: cel jednym zdaniem · tor pracy · uczciwe stany · jawny następny
 * krok · język inżynierski). Ekran-neutralna: logikę i teksty wnosi moduł.
 *
 * Układ: nagłówek (eyebrow · tytuł · cel · odznaka · opcjonalny pasek kroków) →
 * ciało (sekcje, z opcjonalnym banerem błędu) → stopka (walidacja + akcje).
 * Stylowanie wyłącznie tokenami --mvd-* (oba motywy z automatu).
 */

import type { ReactNode } from 'react';

import './kreatory.css';
import type { KrokKreatora } from './model';

export interface AkcjaKreatora {
  readonly etykieta: string;
  readonly onClick: () => void;
  readonly zablokowana?: boolean;
  readonly testid?: string;
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
  walidacja?: string | null;
  akcjaGlowna: AkcjaKreatora;
  akcjaAnuluj: AkcjaKreatora;
  children: ReactNode;
  testid?: string;
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
  walidacja,
  akcjaGlowna,
  akcjaAnuluj,
  children,
  testid,
}: KreatorRamaProps) {
  return (
    <div className="mvd-kreator" data-testid={testid}>
      <header className="mvd-kreator-head">
        <div className="mvd-kreator-head-gora">
          <div>
            <span className="mvd-kreator-eyebrow">{eyebrow}</span>
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

      <div className="mvd-kreator-cialo">
        {bladGlobalny ? (
          <p className="mvd-kreator-blad" role="alert" data-testid="mvd-kreator-blad">
            {bladGlobalny}
          </p>
        ) : null}
        {children}
      </div>

      <footer className="mvd-kreator-stopka">
        {walidacja ? (
          <span className="mvd-kreator-stopka-walidacja" data-testid="mvd-kreator-walidacja">
            {walidacja}
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
          disabled={akcjaGlowna.zablokowana}
          data-testid={akcjaGlowna.testid}
          onClick={akcjaGlowna.onClick}
        >
          {akcjaGlowna.etykieta}
        </button>
      </footer>
    </div>
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
