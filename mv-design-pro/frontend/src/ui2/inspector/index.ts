/*
 * Publiczny interfejs modułu inspektora kontekstowego (ui2/inspector, karta E1.3).
 * Integracja z AppShell i magistralą zdarzeń = karta zarządcy (nie tutaj).
 *
 * FreshnessBadge jest eksportowany jako JEDYNY współdzielony znacznik świeżości
 * (SPEC_POWIAZANIA §6.2) — do reużycia przez inne okna (wyniki, nakładki, raporty).
 */

export { InspectorPanel } from './InspectorPanel';
export { FreshnessBadge } from './FreshnessBadge';
export { usePinStore } from './pinStore';
export { INSPECTOR_STRINGS, znacznikNieaktualne, pochodzenieLabel } from './strings';
export type {
  InspectorPanelProps,
  ObiektInspektora,
  SekcjaWlasciwosci,
  WierszWlasciwosci,
  WartoscZJednostka,
  PowiazaniaObiektu,
  PozycjaPowiazania,
  PozycjaDowodu,
  SzczegolTechniczny,
  CelNawigacji,
  ZakladkaInspektora,
} from './inspectorModel';
export { czyNieaktualne, ZAKLADKI } from './inspectorModel';
