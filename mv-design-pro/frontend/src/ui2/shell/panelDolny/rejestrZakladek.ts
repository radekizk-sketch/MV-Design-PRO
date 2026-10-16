/*
 * Rejestr zakładek panelu dolnego (karta K1 POWLOKA) — ROZSZERZALNY: kolejna
 * karta dokłada zakładkę wpisem do listy (np. „Wyniki"), bez zmiany powłoki.
 * Kolejność listy = kolejność zakładek; identyfikator jest kluczem stanu
 * powłoki (`useShellStore.bottomPanelTab`) i sufiksem testidów.
 */

import type { ComponentType } from 'react';

import { SHELL_STRINGS } from '../strings';
import { ZakladkaProblemy } from './ZakladkaProblemy';
import { ZakladkaPrzebiegi } from './ZakladkaPrzebiegi';
import { ZakladkaDziennik } from './ZakladkaDziennik';

/** Akcje powłoki dostępne treści zakładek (realne cele, bez stanu lokalnego kopii). */
export interface KontekstPaneluDolnego {
  /** Zaznaczenie elementu modelu (schemat + inspektor). */
  onWybierzElement: (ref: string) => void;
  /** Wejście w wyniki zakończonego biegu (lądowisko przestrzeni „Wyniki"). */
  onPokazWynikiBiegu?: (runId: string) => void;
}

export interface ZakladkaPaneluDolnego {
  id: string;
  etykieta: string;
  Tresc: ComponentType<KontekstPaneluDolnego>;
}

export const ZAKLADKI_PANELU_DOLNEGO: readonly ZakladkaPaneluDolnego[] = [
  { id: 'problemy', etykieta: SHELL_STRINGS.bottomProblemy, Tresc: ZakladkaProblemy },
  { id: 'przebiegi', etykieta: SHELL_STRINGS.bottomPrzebiegi, Tresc: ZakladkaPrzebiegi },
  { id: 'dziennik', etykieta: SHELL_STRINGS.bottomDziennik, Tresc: ZakladkaDziennik },
];
