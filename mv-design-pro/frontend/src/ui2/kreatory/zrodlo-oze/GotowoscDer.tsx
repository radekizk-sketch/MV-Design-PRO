/**
 * K9-A O15: readout osi gotowości wytwórcy PO zapisie — WYŁĄCZNIE odczyt
 * z kanonicznej reguły domenowej (końcówka gotowości wytwórcy). ZERO lokalnej
 * kopii reguł: statusy, etykiety osi i powody przychodzą z modelu w całości.
 */

import { useEffect, useState } from 'react';

import { KreatorInfo, KreatorSekcja } from '../rama';
import { OZE_STRINGS as T } from './strings';

/** Powód blokady osi — treść i miejsce naprawy nazwane przez model. */
export interface BlokadaOsiDer {
  readonly code: string;
  readonly message_pl: string;
  readonly object_ref: string;
  readonly target_screen: string;
  readonly target_tab: string;
}

export interface OsGotowosciDer {
  readonly axis: string;
  readonly label_pl: string;
  readonly status: string;
  readonly blockers: readonly BlokadaOsiDer[];
}

export interface GotowoscDerWidok {
  readonly generator_ref: string;
  readonly osie: readonly OsGotowosciDer[];
  readonly podsumowanie: Record<string, number>;
}

/** Pobierz osie gotowości wytwórcy z modelu (końcówka gotowości wytwórcy). */
export async function fetchGotowoscDer(
  projectId: string,
  caseId: string,
  generatorRef: string,
): Promise<GotowoscDerWidok> {
  const response = await fetch(
    `/api/projects/${projectId}/cases/${caseId}/generators/`
      + `${encodeURIComponent(generatorRef)}/readiness`,
  );
  if (!response.ok) {
    throw new Error(T.gotowoscDerBlad);
  }
  return (await response.json()) as GotowoscDerWidok;
}

export interface GotowoscDerProps {
  projectId: string | null;
  caseId: string | null;
  generatorRef: string | null;
  testid?: string;
}

export function GotowoscDer({
  projectId,
  caseId,
  generatorRef,
  testid = 'mvd-kreator-oze-gotowosc-der',
}: GotowoscDerProps) {
  const [widok, setWidok] = useState<GotowoscDerWidok | null>(null);
  const [blad, setBlad] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !caseId || !generatorRef) return;
    let cancelled = false;
    setWidok(null);
    setBlad(null);
    fetchGotowoscDer(projectId, caseId, generatorRef)
      .then((dane) => {
        if (!cancelled) setWidok(dane);
      })
      .catch((e: unknown) => {
        if (!cancelled) setBlad(e instanceof Error ? e.message : T.gotowoscDerBlad);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, caseId, generatorRef]);

  if (!projectId || !caseId || !generatorRef) return null;

  return (
    <KreatorSekcja tytul={T.gotowoscDerTytul} testid={testid}>
      <KreatorInfo>{T.gotowoscDerOpis}</KreatorInfo>
      {blad ? <p className="mvd-pole-blad">{blad}</p> : null}
      {!widok && !blad ? <KreatorInfo>{T.gotowoscDerLadowanie}</KreatorInfo> : null}
      {widok ? (
        <ul className="mvd-kreator-gotowosc-der" data-testid={`${testid}-osie`}>
          {widok.osie.map((os) => (
            <li key={os.axis} data-testid={`${testid}-os-${os.axis}`} data-status={os.status}>
              <span>{os.label_pl}</span>
              {' — '}
              <strong>{T.gotowoscDerStatus[os.status] ?? os.status}</strong>
              {os.blockers.length > 0 ? (
                <ul>
                  {os.blockers.map((powod) => (
                    <li key={powod.code}>{powod.message_pl}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </KreatorSekcja>
  );
}
