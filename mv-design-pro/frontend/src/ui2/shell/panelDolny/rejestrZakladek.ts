/*
 * Rejestr zakładek panelu dolnego (karta K1 POWLOKA, karta UI-02 PANEL-DOLNY) —
 * ROZSZERZALNY: kolejna karta dokłada zakładkę wpisem do listy, bez zmiany powłoki.
 * Kolejność listy = kolejność zakładek; identyfikator jest kluczem stanu
 * powłoki (`useShellStore.bottomPanelTab`) i sufiksem testidów. `Licznik` (opcjonalny)
 * to komponent liczby przy etykiecie zakładki — renderuje `null`, gdy liczby nie ma
 * (dane nieustalone), zamiast pokazywać zero zastępcze.
 */

import type { ComponentType } from 'react';

import { SHELL_STRINGS } from '../strings';
import { LicznikProblemow, ZakladkaProblemy } from './ZakladkaProblemy';
import { LicznikPrzebiegow, ZakladkaPrzebiegi } from './ZakladkaPrzebiegi';
import { LicznikWynikow, ZakladkaWyniki } from './ZakladkaWyniki';
import { LicznikDowodow, ZakladkaDowody } from './ZakladkaDowody';
import { ZakladkaDziennik } from './ZakladkaDziennik';

/** Akcje powłoki dostępne treści zakładek (realne cele, bez stanu lokalnego kopii). */
export interface KontekstPaneluDolnego {
  /** Zaznaczenie elementu modelu (schemat + inspektor). */
  onWybierzElement: (ref: string) => void;
  /** Wejście w wyniki zakończonego biegu (lądowisko przestrzeni „Wyniki"). */
  onPokazWynikiBiegu?: (runId: string) => void;
  /** Wejście w dowód obliczeń TEGO biegu (przestrzeń „Wyniki", zakładka „Dowód obliczeń"). */
  onOtworzDowodBiegu?: (runId: string) => void;
}

export interface ZakladkaPaneluDolnego {
  id: string;
  etykieta: string;
  Tresc: ComponentType<KontekstPaneluDolnego>;
  Licznik?: ComponentType;
}

export const ZAKLADKI_PANELU_DOLNEGO: readonly ZakladkaPaneluDolnego[] = [
  { id: 'problemy', etykieta: SHELL_STRINGS.bottomProblemy, Tresc: ZakladkaProblemy, Licznik: LicznikProblemow },
  { id: 'wyniki', etykieta: SHELL_STRINGS.bottomWyniki, Tresc: ZakladkaWyniki, Licznik: LicznikWynikow },
  { id: 'dowody', etykieta: SHELL_STRINGS.bottomDowody, Tresc: ZakladkaDowody, Licznik: LicznikDowodow },
  { id: 'przebiegi', etykieta: SHELL_STRINGS.bottomPrzebiegi, Tresc: ZakladkaPrzebiegi, Licznik: LicznikPrzebiegow },
  { id: 'dziennik', etykieta: SHELL_STRINGS.bottomDziennik, Tresc: ZakladkaDziennik },
];
