/**
 * Skróty klawiaturowe i tryby ergonomii.
 *
 * Zasady:
 * - opisy są po polsku,
 * - skrót otwiera tylko kanoniczną akcję albo widok,
 * - skróty nie wyciekają historycznych aliasów A/B/C/D ani legacy operacji źródeł.
 */

export interface KeyboardShortcutDef {
  /** Kombinacja klawiszy, np. `Ctrl+Shift+P`. */
  keys: string;
  /** Opis skrótu po polsku. */
  description_pl: string;
  /** Kategoria skrótu. */
  category: KeyboardCategory;
  /** Identyfikator akcji. */
  action_id: string;
  /** Wymagany tryb operacyjny (`null` = dowolny). */
  required_mode: 'MODEL_EDIT' | 'RESULT_VIEW' | null;
}

export type KeyboardCategory =
  | 'NAWIGACJA'
  | 'EDYCJA_MODELU'
  | 'WIDOKI'
  | 'ANALIZA'
  | 'NARZEDZIA';

export const KEYBOARD_SHORTCUTS: readonly KeyboardShortcutDef[] = [
  // Nawigacja
  { keys: 'Ctrl+Home', description_pl: 'Dopasuj widok do zawartości', category: 'NAWIGACJA', action_id: 'fit_to_content', required_mode: null },
  { keys: 'Ctrl+0', description_pl: 'Resetuj powiększenie', category: 'NAWIGACJA', action_id: 'reset_zoom', required_mode: null },
  { keys: '+', description_pl: 'Powiększ', category: 'NAWIGACJA', action_id: 'zoom_in', required_mode: null },
  { keys: '-', description_pl: 'Pomniejsz', category: 'NAWIGACJA', action_id: 'zoom_out', required_mode: null },
  { keys: 'Ctrl+F', description_pl: 'Szukaj elementu...', category: 'NAWIGACJA', action_id: 'search_element', required_mode: null },
  { keys: 'Escape', description_pl: 'Zamknij menu lub anuluj', category: 'NAWIGACJA', action_id: 'cancel', required_mode: null },

  // Edycja modelu
  { keys: 'Ctrl+N', description_pl: 'Dodaj element (szybkie dodawanie)...', category: 'EDYCJA_MODELU', action_id: 'quick_add', required_mode: 'MODEL_EDIT' },
  { keys: 'Delete', description_pl: 'Usuń zaznaczony element...', category: 'EDYCJA_MODELU', action_id: 'delete_selected', required_mode: 'MODEL_EDIT' },
  { keys: 'Enter', description_pl: 'Otwórz właściwości zaznaczonego elementu', category: 'EDYCJA_MODELU', action_id: 'open_properties', required_mode: null },
  { keys: 'Ctrl+D', description_pl: 'Powiel zaznaczony element...', category: 'EDYCJA_MODELU', action_id: 'duplicate', required_mode: 'MODEL_EDIT' },
  { keys: 'F2', description_pl: 'Zmień nazwę elementu', category: 'EDYCJA_MODELU', action_id: 'rename', required_mode: 'MODEL_EDIT' },
  { keys: 'Space', description_pl: 'Przełącz stan łącznika (otwórz/zamknij)', category: 'EDYCJA_MODELU', action_id: 'toggle_switch', required_mode: 'MODEL_EDIT' },

  // Budowa sieci SN
  { keys: 'S', description_pl: 'Dodaj odcinek z pola GPZ albo kontynuuj z aktywnego terminala magistrali', category: 'EDYCJA_MODELU', action_id: 'continue_trunk_segment_sn', required_mode: 'MODEL_EDIT' },
  { keys: 'T', description_pl: 'Wstaw stację SN/nN...', category: 'EDYCJA_MODELU', action_id: 'insert_station_on_segment_sn', required_mode: 'MODEL_EDIT' },
  { keys: 'B', description_pl: 'Dodaj odgałęzienie', category: 'EDYCJA_MODELU', action_id: 'start_branch_segment_sn', required_mode: 'MODEL_EDIT' },
  { keys: 'R', description_pl: 'Wejdź w tryb łączenia końców (rezerwa lub pierścień)', category: 'EDYCJA_MODELU', action_id: 'start_connect_ends', required_mode: 'MODEL_EDIT' },
  { keys: 'N', description_pl: 'Ustaw NOP (punkt normalnie otwarty)', category: 'EDYCJA_MODELU', action_id: 'set_normal_open_point', required_mode: 'MODEL_EDIT' },

  // Źródła nN
  { keys: 'Ctrl+Shift+P', description_pl: 'Dodaj źródło PV...', category: 'EDYCJA_MODELU', action_id: 'add_converter_source_pv', required_mode: 'MODEL_EDIT' },
  { keys: 'Ctrl+Shift+B', description_pl: 'Dodaj źródło BESS...', category: 'EDYCJA_MODELU', action_id: 'add_converter_source_bess', required_mode: 'MODEL_EDIT' },
  { keys: 'Ctrl+Shift+G', description_pl: 'Dodaj agregat...', category: 'EDYCJA_MODELU', action_id: 'add_genset_nn', required_mode: 'MODEL_EDIT' },
  { keys: 'Ctrl+Shift+U', description_pl: 'Dodaj UPS...', category: 'EDYCJA_MODELU', action_id: 'add_ups_nn', required_mode: 'MODEL_EDIT' },

  // Widoki
  { keys: 'Ctrl+1', description_pl: 'Widok: Model sieci', category: 'WIDOKI', action_id: 'mode_model_edit', required_mode: null },
  { keys: 'Ctrl+2', description_pl: 'Otworz warunki obliczen', category: 'WIDOKI', action_id: 'open_case_context', required_mode: null },
  { keys: 'Ctrl+3', description_pl: 'Widok: Analiza i wyniki', category: 'WIDOKI', action_id: 'mode_result_view', required_mode: null },
  { keys: 'Ctrl+G', description_pl: 'Tryb: Tylko gotowość (podświetl blokery)', category: 'WIDOKI', action_id: 'filter_readiness_only', required_mode: null },
  { keys: 'Ctrl+Shift+S', description_pl: 'Tryb: Tylko źródła (filtr wizualny)', category: 'WIDOKI', action_id: 'filter_sources_only', required_mode: null },
  { keys: 'F5', description_pl: 'Odśwież widok', category: 'WIDOKI', action_id: 'refresh_view', required_mode: null },
  { keys: 'Ctrl+I', description_pl: 'Otwórz lub zamknij panel inspektora', category: 'WIDOKI', action_id: 'toggle_inspector', required_mode: null },
  { keys: 'Ctrl+T', description_pl: 'Otwórz lub zamknij drzewo projektu', category: 'WIDOKI', action_id: 'toggle_project_tree', required_mode: null },

  // Analiza
  { keys: 'Ctrl+R', description_pl: 'Uruchom obliczenia...', category: 'ANALIZA', action_id: 'run_calculation', required_mode: 'RESULT_VIEW' },
  { keys: 'Ctrl+W', description_pl: 'Otwórz ślad obliczeń...', category: 'ANALIZA', action_id: 'open_whitebox', required_mode: 'RESULT_VIEW' },
  { keys: 'Ctrl+E', description_pl: 'Eksportuj wyniki...', category: 'ANALIZA', action_id: 'export_results', required_mode: 'RESULT_VIEW' },

  // Narzędzia
  { keys: 'Ctrl+V', description_pl: 'Waliduj model sieci', category: 'NARZEDZIA', action_id: 'validate_model', required_mode: null },
  { keys: 'F1', description_pl: 'Pomoc: lista skrótów klawiaturowych', category: 'NARZEDZIA', action_id: 'show_shortcuts_help', required_mode: null },
  { keys: 'Ctrl+Shift+E', description_pl: 'Eksportuj schemat SLD...', category: 'NARZEDZIA', action_id: 'export_sld', required_mode: null },
] as const;

export type VisualFilterMode =
  | 'ALL'
  | 'READINESS_ONLY'
  | 'SOURCES_ONLY'
  | 'NN_ONLY'
  | 'PROTECTION_ONLY';

export interface VisualFilterDef {
  mode: VisualFilterMode;
  label_pl: string;
  description_pl: string;
  shortcut: string | null;
}

export const VISUAL_FILTERS: readonly VisualFilterDef[] = [
  {
    mode: 'ALL',
    label_pl: 'Wszystkie elementy',
    description_pl: 'Wyświetl wszystkie elementy sieci bez filtrowania.',
    shortcut: null,
  },
  {
    mode: 'READINESS_ONLY',
    label_pl: 'Tylko gotowość',
    description_pl: 'Podświetl elementy z problemami gotowości: blokery na czerwono, ostrzeżenia na żółto.',
    shortcut: 'Ctrl+G',
  },
  {
    mode: 'SOURCES_ONLY',
    label_pl: 'Tylko źródła',
    description_pl: 'Pokaż tylko źródła energii, a pozostałe elementy wyszarz.',
    shortcut: 'Ctrl+Shift+S',
  },
  {
    mode: 'NN_ONLY',
    label_pl: 'Tylko nN',
    description_pl: 'Pokaż tylko elementy rozdzielni nN, a sieć SN wyszarz.',
    shortcut: null,
  },
  {
    mode: 'PROTECTION_ONLY',
    label_pl: 'Tylko zabezpieczenia',
    description_pl: 'Pokaż tylko zabezpieczenia i ich powiązania z łącznikami.',
    shortcut: null,
  },
] as const;

export function groupShortcutsByCategory(): Map<KeyboardCategory, KeyboardShortcutDef[]> {
  const map = new Map<KeyboardCategory, KeyboardShortcutDef[]>();
  for (const shortcut of KEYBOARD_SHORTCUTS) {
    const list = map.get(shortcut.category) ?? [];
    list.push(shortcut);
    map.set(shortcut.category, list);
  }
  return map;
}

export const CATEGORY_LABELS: Record<KeyboardCategory, string> = {
  NAWIGACJA: 'Nawigacja',
  EDYCJA_MODELU: 'Edycja modelu',
  WIDOKI: 'Widoki i tryby',
  ANALIZA: 'Analiza i wyniki',
  NARZEDZIA: 'Narzędzia',
};
