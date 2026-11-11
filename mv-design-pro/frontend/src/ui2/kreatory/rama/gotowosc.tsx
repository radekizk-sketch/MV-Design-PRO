/**
 * Komponenty stanu kreatora: wartość tylko do odczytu (RzadWartosci),
 * podsumowanie obliczone przez backend (KreatorPodsumowanie), lista gotowości
 * (KreatorGotowosc) i sekcja następnego kroku (KreatorNastepnyKrok).
 *
 * ZERO fizyki — wartości podsumowania pochodzą wyłącznie z backendu; ten moduł
 * tylko je prezentuje. Stany braków są uczciwe (nie udają wyliczonych wartości).
 */

import type { ReactNode } from 'react';

import type { StatusPobrania, WierszGotowosci } from './model';
import { TekstZWzorami } from './tekstZWzorami';

// -------------------------------------------------- Rząd wartości (read-only)

export interface RzadWartosciProps {
  etykieta: string;
  wartosc: string;
  ton?: 'ok' | 'warn';
  testid?: string;
}

export function RzadWartosci({ etykieta, wartosc, ton, testid }: RzadWartosciProps) {
  return (
    <div className="mvd-rzad" data-testid={testid}>
      <span className="mvd-rzad-etykieta"><TekstZWzorami tekst={etykieta} /></span>
      <span className="mvd-rzad-wartosc" data-ton={ton}><TekstZWzorami tekst={wartosc} /></span>
    </div>
  );
}

// ----------------------------------------------------- Podsumowanie (backend)

export interface KreatorPodsumowanieProps {
  tytul: string;
  status?: StatusPobrania;
  komunikat?: string | null;
  komunikatTon?: 'warn';
  children: ReactNode;
  testid?: string;
}

export function KreatorPodsumowanie({
  tytul,
  status,
  komunikat,
  komunikatTon,
  children,
  testid,
}: KreatorPodsumowanieProps) {
  return (
    <section className="mvd-podsum" data-testid={testid}>
      <div className="mvd-podsum-head"><TekstZWzorami tekst={tytul} /></div>
      <div className="mvd-podsum-cialo">
        {status === 'loading' ? (
          <p className="mvd-podsum-komunikat">Trwa obliczanie podsumowania z danych wejściowych.</p>
        ) : null}
        {komunikat ? (
          <p className="mvd-podsum-komunikat" data-ton={komunikatTon}><TekstZWzorami tekst={komunikat} /></p>
        ) : null}
        {children}
      </div>
    </section>
  );
}

// --------------------------------------------------------- Lista gotowości

export interface KreatorGotowoscProps {
  tytul: string;
  wiersze: readonly WierszGotowosci[];
  testid?: string;
}

const STAN_ETYKIETA: Record<WierszGotowosci['stan'], string> = {
  kompletne: 'Kompletne',
  ostrzezenie: 'Sprawdź',
  brak: 'Brak',
};

export function KreatorGotowosc({ tytul, wiersze, testid }: KreatorGotowoscProps) {
  return (
    <section className="mvd-gotowosc" data-testid={testid}>
      <div className="mvd-gotowosc-head"><TekstZWzorami tekst={tytul} /></div>
      {wiersze.map((w) => (
        <div className="mvd-gotowosc-wiersz" key={w.etykieta} data-testid={`${testid ?? 'mvd-gotowosc'}-${w.etykieta}`}>
          <span className="mvd-gotowosc-etykieta"><TekstZWzorami tekst={w.etykieta} /></span>
          <span className="mvd-gotowosc-stan" data-stan={w.stan}>
            <span className="mvd-gotowosc-kropka" aria-hidden="true" />
            <TekstZWzorami tekst={w.wartosc || STAN_ETYKIETA[w.stan]} />
          </span>
        </div>
      ))}
    </section>
  );
}

// ------------------------------------------------------- Następny krok (flow)

export interface KreatorNastepnyKrokProps {
  eyebrow?: string;
  opis: string;
  children?: ReactNode;
  testid?: string;
}

export function KreatorNastepnyKrok({
  eyebrow = 'Następny krok',
  opis,
  children,
  testid,
}: KreatorNastepnyKrokProps) {
  return (
    <div className="mvd-kreator-nastepny" data-testid={testid}>
      <span className="mvd-kreator-nastepny-eyebrow"><TekstZWzorami tekst={eyebrow} /></span>
      <p><TekstZWzorami tekst={opis} /></p>
      {children}
    </div>
  );
}
