/*
 * Publiczne API modułu `ui2/search` (karta E1.5). Integracja z powłoką
 * (AppShell ma już skrót Ctrl+K) to osobna karta zarządcy — tu wyłącznie
 * eksport czystego komponentu, modelu danych i budowy indeksu.
 */

export {
  CommandPalette,
  resetHistoriiWyszukiwania,
  type CommandPaletteProps,
} from './CommandPalette';

export {
  KOLEJNOSC_GRUP,
  trybWystarczajacy,
  type GrupaWyszukiwania,
  type PozycjaWyszukiwania,
  type TrybZaawansowania,
} from './searchModel';

export {
  zbudujIndeksWyszukiwania,
  type AkcjeIndeksu,
  type BudowaIndeksuOpcje,
  type ObiektDoIndeksu,
  type ProviderObiektow,
} from './searchIndex';

export {
  dopasuj,
  filtrujISortuj,
  porownajDopasowania,
  znormalizuj,
  type TypDopasowania,
  type WynikDopasowania,
} from './fuzzy';

export { SEARCH_STRINGS, brakWynikowLabel, etykietaGrupy, etykietaTrybu, potwierdzTrybLabel } from './strings';
