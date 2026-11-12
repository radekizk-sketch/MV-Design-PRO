/*
 * Wejścia na schemat z przeglądu zbiorczego („Kontrola techniczna układu").
 *
 * Przed kartą SLD-SKALA-I-NAWIGACJA każda z sześciu tabel wysyłała zdarzenie DOM
 * DOM „wyśrodkuj schemat na elemencie”, którego nikt nie słuchał (martwy klik). Teraz:
 * - klik wiersza = PRZEGLĄDANIE (`zaznaczElementModelu`): zaznaczenie w store
 *   selekcji, kadr kotwiczony bez zmiany skali, gdy kanwa jest za oknem;
 * - przycisk „Pokaż na schemacie" w wierszu = JAWNE WEJŚCIE: zamyka okno, pokazuje
 *   element i zapisuje powrót, który ponownie otwiera okno na tej samej zakładce.
 * Kontekst dostarcza `MassReviewPanel` (zamknięcie + opis ekranu powrotu).
 */

import { createContext, useContext } from 'react';

import { PrzyciskPokazNaSchemacie } from '../../../ui2/shared/PrzyciskPokazNaSchemacie';
import type { EkranPowrotu } from '../../../ui2/shell/powrotZeSchematu';
import { zaznaczElementModelu } from '../../../ui2/shell/zaznaczElementModelu';
import type { SelectedElement } from '../../types';

export const ZRODLO_PRZEGLADU = 'przeglad-zbiorczy';

export interface KontekstPrzegladu {
  /** Zamknięcie okna przed wejściem na schemat. */
  readonly zamknij: () => void;
  /** Ekran powrotu: okno na bieżącej zakładce. */
  readonly powrot: EkranPowrotu;
}

export const KontekstPrzegladuZbiorczego = createContext<KontekstPrzegladu | null>(null);

/**
 * Klik wiersza: przeglądanie. Opis zastępczy — tylko tam, gdzie wiersz zna typ
 * elementu (tabela gotowości zna wyłącznie ref, więc nie zgaduje typu).
 */
export function przegladajElement(cel: string | SelectedElement): void {
  if (typeof cel === 'string') zaznaczElementModelu(cel, ZRODLO_PRZEGLADU);
  else zaznaczElementModelu(cel.id, ZRODLO_PRZEGLADU, { zastepczy: cel });
}

export interface PokazZPrzegladuProps {
  readonly elementRef: string | null | undefined;
}

/** Przycisk „Pokaż na schemacie" wiersza przeglądu. */
export function PokazZPrzegladu({ elementRef }: PokazZPrzegladuProps) {
  const kontekst = useContext(KontekstPrzegladuZbiorczego);
  return (
    <PrzyciskPokazNaSchemacie
      elementRef={elementRef}
      zrodlo={ZRODLO_PRZEGLADU}
      przed={kontekst?.zamknij}
      opcje={kontekst ? { powrot: kontekst.powrot } : undefined}
      testId={elementRef ? `mass-review-pokaz-${elementRef}` : undefined}
    />
  );
}
