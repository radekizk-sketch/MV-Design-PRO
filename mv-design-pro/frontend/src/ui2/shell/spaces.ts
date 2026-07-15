/*
 * Siedem przestrzeni roboczych powłoki (okno W-110), stała kolejność =
 * przepływ pracy inżyniera: Projekt → Model → Schemat → Gotowość →
 * Obliczenia → Wyniki → Dokumentacja (SPEC_UKLAD_PANELI §1.1, skróty 1–7).
 *
 * UWAGA (decyzja wykonawcza, patrz raport): jest to NOWA taksonomia 7 przestrzeni
 * wg makiety U0.6 v6 i różni się od zastanego rejestru `ui/navigation/areaRegistry`
 * (9 obszarów, inna semantyka). Powłoka utrzymuje aktywną przestrzeń we własnym
 * stanie prezentacji; drzewa kontekstowe i ewentualne mapowanie do zastanych
 * obszarów są zakresem karty E1.2 (TODO-KARTA).
 */

import { SHELL_STRINGS } from './strings';

export type SpaceId =
  | 'projekt'
  | 'model'
  | 'schemat'
  | 'gotowosc'
  | 'obliczenia'
  | 'wyniki'
  | 'dokumentacja';

export interface SpaceDefinition {
  id: SpaceId;
  label: string;
  /** Skrót klawiaturowy 1–7. */
  shortcut: string;
}

export const SPACES: readonly SpaceDefinition[] = [
  { id: 'projekt', label: 'Projekt', shortcut: '1' },
  { id: 'model', label: 'Model sieci', shortcut: '2' },
  { id: 'schemat', label: 'Schemat (SLD)', shortcut: '3' },
  { id: 'gotowosc', label: 'Gotowość', shortcut: '4' },
  { id: 'obliczenia', label: 'Obliczenia', shortcut: '5' },
  { id: 'wyniki', label: 'Wyniki i dowody', shortcut: '6' },
  { id: 'dokumentacja', label: 'Dokumentacja', shortcut: '7' },
] as const;

export const SPACE_IDS: readonly SpaceId[] = SPACES.map((space) => space.id);

export const DEFAULT_SPACE: SpaceId = 'projekt';

export function isSpaceId(value: string): value is SpaceId {
  return (SPACE_IDS as readonly string[]).includes(value);
}

/** Nagłówek grupy przestrzeni w nawigacji. */
export const SPACES_HEADING = SHELL_STRINGS.spacesHeading;
