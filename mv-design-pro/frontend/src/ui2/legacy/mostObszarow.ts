/**
 * MOST TRAS LEGACY → KANON 7 PRZESTRZENI (decyzja D1,
 * `docs/uiux/DECYZJE_ARCHITEKTONICZNE_2026-08.md`).
 *
 * JEDYNE miejsce, w którym trasa hash jest tłumaczona na powłokę. Jeden wiersz
 * tabeli niesie OBIE projekcje trasy (przestrzeń kanoniczna + obszar panelu
 * kontekstu), bo dotąd żyły osobno: przestrzeń ustawiał orkiestrator dla
 * czterech tras, a obszar — równoległy stan `activeArea` w `app-state/store`
 * (druga nawigacja, rejestr `ui/navigation/areaRegistry` z własnymi
 * etykietami, ikonami i skrótami Ctrl+1–9). Dwa niezależne warunki, które
 * „dziś się zgadzają", to defekt czekający na dane brzegowe — dlatego wejście
 * i wyjście mostu pochodzą z JEDNEGO wiersza (reguła KLASA-NIE-INSTANCJA §3).
 *
 * Pomiar przed przebudową (karta NAWIGACJA-JEDEN-KANON §0.2):
 *  - `AREA_DEFINITIONS` (9 pozycji z `labelFull`/`icon`/`shortcut`/`testId`)
 *    NIE miały ANI JEDNEGO konsumenta produkcyjnego — żaden komponent nie
 *    renderował tej nawigacji, żaden handler nie obsługiwał Ctrl+1–9
 *    (jedyne wystąpienia `ctrlKey` w repo: Ctrl+K/B/I powłoki ui2, Ctrl+Z/Y,
 *    Ctrl+F, Ctrl+,). Skróty istniały wyłącznie jako napis w tooltipie.
 *  - Żywy był wyłącznie `AreaId` jako KLUCZ panelu kontekstu (`AreaContextPanel`)
 *    oraz `normalizeAreaId` w store. To nie jest nawigacja — to projekcja trasy.
 *
 * Zero fizyki, zero mutacji modelu — wyłącznie tłumaczenie adresu na powłokę.
 */

import { ALIAS_ROUTES, ROUTES } from '../../ui/navigation';
import type { SpaceId } from '../shell/spaces';

/**
 * Obszar panelu kontekstu (lewy dok) — dawny `AreaId`. Lista ZAMKNIĘTA:
 * odpowiada gałęziom `AreaContextPanel`. Przypięta testem
 * `mostObszarow.test.ts` („każdy obszar ma gałąź panelu").
 */
export const OBSZARY_KONTEKSTU = [
  'MODEL_SIECI',
  'SCHEMAT_TOPOLOGIA',
  'STUDIA_OBLICZENIOWE',
  'WYNIKI_ANALIZY',
  'ZABEZPIECZENIA_AUTOMATYKA',
  'ZRODLA_PRZYLACZENIA',
  'KATALOGI_TECHNICZNE',
  'RAPORTY_UZASADNIENIA',
  'HISTORIA_AUDYT',
] as const;

export type ObszarKontekstu = (typeof OBSZARY_KONTEKSTU)[number];

export interface WpisTrasy {
  /**
   * Przestrzeń kanoniczna (jedna z siedmiu), w której ląduje ta trasa.
   * `null` = adres bez trasy (sam kontekst): o zawartości decyduje przestrzeń
   * wybrana w powłoce, więc most jej NIE przestawia.
   */
  przestrzen: SpaceId | null;
  /** Obszar panelu kontekstu renderowanego w lewym doku dla tej trasy. */
  obszar: ObszarKontekstu;
  /** Zakładka warsztatu „Wyniki” wymuszana przez trasę (gdy trasa jest do niej adresem). */
  zakladkaWynikow?: string;
  /**
   * Trasa NADRZĘDNA: `LegacyWarsztat` renderuje jej zawartość PRZED zawartością
   * przestrzeni, więc jawne przejście do przestrzeni bez własnej trasy musi ją
   * wyczyścić (inaczej ekran zostaje na poprzednim widoku — defekt K4-E2).
   */
  nadrzedna?: boolean;
  /**
   * Trasa WYGASZONA (K8): jej dostawcą jest okno ui2, nie powierzchnia mostu.
   * Orkiestrator odtwarza kontekst adresu, ale NIE otwiera powierzchni trasowej
   * (zalegająca powierzchnia przykryłaby okno albo zajęła prawy panel).
   */
  wygaszona?: boolean;
}

/**
 * Tabela kanoniczna tras. Klucze pochodzą WYŁĄCZNIE z `ui/navigation/routes`
 * (jedyne miejsce literałów tras hash w `frontend/src`, pilnowane przez
 * `scripts/nawigacja_jeden_kanon_guard.py` regułą A).
 *
 * Mapowanie obszar → przestrzeń wg tabeli C.2 audytu Phase A–D (D1):
 * MODEL_SIECI→Model · SCHEMAT_TOPOLOGIA→Schemat · STUDIA_OBLICZENIOWE→Obliczenia
 * · WYNIKI_ANALIZY→Wyniki · ZABEZPIECZENIA_AUTOMATYKA→Wyniki (powierzchnia)
 * · ZRODLA_PRZYLACZENIA→Model · KATALOGI_TECHNICZNE→helper (Model)
 * · RAPORTY_UZASADNIENIA→Dokumentacja · HISTORIA_AUDYT→Dokumentacja.
 *
 * Wyjątek świadomy: `#enm-inspector` ląduje w przestrzeni „Model sieci”, bo tam
 * (i tylko tam) żyje dostawca tej zdolności — zakładka „Diagnostyka” warsztatu
 * modelu w trybie eksperckim (`ui2/spaces/model/ModelWarsztat`); obszar panelu
 * zostaje HISTORIA_AUDYT zgodnie z C.2.
 */
export const TRASY_KANONICZNE: Readonly<Record<string, WpisTrasy>> = {
  [ROUTES.DASHBOARD.hash]: { przestrzen: 'projekt', obszar: 'MODEL_SIECI', nadrzedna: true },
  [ROUTES.SLD.hash]: { przestrzen: 'schemat', obszar: 'SCHEMAT_TOPOLOGIA', nadrzedna: true },
  [ROUTES.SLD_VIEW.hash]: { przestrzen: 'schemat', obszar: 'SCHEMAT_TOPOLOGIA', nadrzedna: true },
  [ROUTES.ANALYSIS.hash]: { przestrzen: 'wyniki', obszar: 'WYNIKI_ANALIZY' },
  [ALIAS_ROUTES.RESULTS]: { przestrzen: 'wyniki', obszar: 'WYNIKI_ANALIZY' },
  [ALIAS_ROUTES.PROOF]: { przestrzen: 'wyniki', obszar: 'WYNIKI_ANALIZY' },
  [ALIAS_ROUTES.COMPARE]: { przestrzen: 'wyniki', obszar: 'WYNIKI_ANALIZY' },
  // K8: obie trasy mają pełnoprawnego dostawcę w warsztacie „Wyniki”, więc most
  // nie otwiera już generycznej powierzchni E-35 — wpis niesie zakładkę.
  [ALIAS_ROUTES.POWER_FLOW_RESULTS]: {
    przestrzen: 'wyniki',
    obszar: 'WYNIKI_ANALIZY',
    zakladkaWynikow: 'rozplyw',
    wygaszona: true,
  },
  [ALIAS_ROUTES.PROTECTION_RESULTS]: {
    przestrzen: 'wyniki',
    obszar: 'WYNIKI_ANALIZY',
    zakladkaWynikow: 'koordynacja',
    wygaszona: true,
  },
  [ROUTES.REPORT.hash]: { przestrzen: 'dokumentacja', obszar: 'RAPORTY_UZASADNIENIA' },
  [ROUTES.VARIANTS.hash]: {
    przestrzen: 'obliczenia',
    obszar: 'STUDIA_OBLICZENIOWE',
    wygaszona: true,
  },
  [ROUTES.CASE_CONFIG.hash]: {
    przestrzen: 'obliczenia',
    obszar: 'STUDIA_OBLICZENIOWE',
    wygaszona: true,
  },
  [ROUTES.FAULT_SCENARIOS.hash]: {
    przestrzen: 'obliczenia',
    obszar: 'STUDIA_OBLICZENIOWE',
    nadrzedna: true,
  },
  [ROUTES.ENM_INSPECTOR.hash]: { przestrzen: 'model', obszar: 'HISTORIA_AUDYT', nadrzedna: true },
  [ROUTES.CATALOG.hash]: { przestrzen: 'model', obszar: 'KATALOGI_TECHNICZNE' },
};

/**
 * Adres BEZ trasy (zimny start `/`, albo sam kontekst `#?run=…`). Panel
 * kontekstu idzie za schematem — dokładnie jak `getRouteByHash('')`, które
 * zwraca trasę schematu — ale przestrzeni NIE narzucamy: o zawartości decyduje
 * wtedy wybór użytkownika w powłoce.
 */
const BRAK_TRASY: WpisTrasy = { przestrzen: null, obszar: 'SCHEMAT_TOPOLOGIA' };

/** Wpis tabeli dla trasy (null = trasa spoza kanonu, np. literówka w adresie). */
export function wpisTrasy(route: string): WpisTrasy | null {
  if (route === '') {
    return BRAK_TRASY;
  }
  return TRASY_KANONICZNE[route] ?? null;
}

/** Przestrzeń kanoniczna trasy (null = brak mapowania — powłoka nie przeskakuje). */
export function przestrzenDlaTrasy(route: string): SpaceId | null {
  return wpisTrasy(route)?.przestrzen ?? null;
}

/** Wpis trasy WYGASZONEJ (null = trasa nadal obsługiwana powierzchnią mostu). */
export function wpisTrasyWygaszonej(route: string): WpisTrasy | null {
  const wpis = wpisTrasy(route);
  return wpis?.wygaszona === true ? wpis : null;
}

/**
 * Obszar panelu kontekstu dla trasy. Trasa spoza kanonu daje MODEL_SIECI —
 * dokładnie ta sama wartość domyślna, którą zwracał `normalizeAreaId` dla
 * nierozpoznanego wejścia (parytet zachowania, nie nowa semantyka).
 */
export function obszarDlaTrasy(route: string): ObszarKontekstu {
  return wpisTrasy(route)?.obszar ?? 'MODEL_SIECI';
}

/** Czy trasa nadpisuje zawartość przestrzeni w `LegacyWarsztat`. */
export function trasaNadrzedna(route: string): boolean {
  return wpisTrasy(route)?.nadrzedna === true;
}
