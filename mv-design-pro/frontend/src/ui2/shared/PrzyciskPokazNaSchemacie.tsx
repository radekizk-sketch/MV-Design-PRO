/*
 * „Pokaż na schemacie" — JEDEN przycisk wejścia na schemat z każdego ekranu
 * (karta SLD-SKALA-I-NAWIGACJA, część W, pkt 5): ta sama etykieta, przycisk z
 * klawiatury, cel wskaźnika ≥ 24 px (WCAG 2.2 kryterium 2.5.8). Klik woła jedyną
 * drogę `pokazElementNaSchemacie`. Elementu nieobecnego w migawce modelu
 * (`elementNaSchemacie` — ten sam predykat co akcja) przycisk NIE pokazuje:
 * brak akcji zamiast martwego kliku.
 */

import './przyciskPokazNaSchemacie.css';
import type { MouseEvent } from 'react';

import { useSnapshotStore } from '../../ui/topology/snapshotStore';
import {
  ETYKIETA_POKAZ_NA_SCHEMACIE,
  elementNaSchemacie,
  pokazElementNaSchemacie,
  type OpcjePokazania,
} from '../shell/zaznaczElementModelu';

export interface PrzyciskPokazNaSchemacieProps {
  /** Ref elementu modelu (z odpowiedzi backendu albo migawki). */
  readonly elementRef: string | null | undefined;
  /** Źródło zdarzenia `selekcja` (np. 'ekran-zwarc'). */
  readonly zrodlo: string;
  /** Czynność ekranu wykonywana PRZED wejściem (np. nakładka rozpływu zwarciowego). */
  readonly przed?: () => void;
  readonly opcje?: OpcjePokazania;
  /** Opis (title) — domyślnie nazwa elementu. */
  readonly opis?: string;
  readonly testId?: string;
  readonly className?: string;
}

export function PrzyciskPokazNaSchemacie({
  elementRef,
  zrodlo,
  przed,
  opcje,
  opis,
  testId,
  className,
}: PrzyciskPokazNaSchemacieProps) {
  // Subskrypcja migawki: przycisk pojawia się/znika razem z elementem modelu.
  useSnapshotStore((s) => s.snapshot);
  const element = elementNaSchemacie(elementRef);
  if (!element || !elementRef) return null;
  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    // Wiersz tabeli bywa sam klikalny (zaznaczenie) — wejście nie wybiera wiersza drugi raz.
    e.stopPropagation();
    przed?.();
    pokazElementNaSchemacie(elementRef, zrodlo, opcje);
  };
  return (
    <button
      type="button"
      className={className ? `mvd-pokaz-na-schemacie ${className}` : 'mvd-pokaz-na-schemacie'}
      data-testid={testId ?? 'mvd-pokaz-na-schemacie'}
      data-element-ref={element.id}
      title={opis ?? `${ETYKIETA_POKAZ_NA_SCHEMACIE}: ${element.name}`}
      onClick={onClick}
    >
      {ETYKIETA_POKAZ_NA_SCHEMACIE}
    </button>
  );
}
