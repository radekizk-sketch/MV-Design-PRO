/**
 * DER Engineering Configurator v2 — kontrakt 10 sekcji + 22-osiowa
 * macierz gotowości obliczeniowej.
 *
 * Źródło designu: `project/redesign/DER Engineering Configurator v2.html`
 * z bundle KWranPTVtVOehZptDdObrA. Zastępuje płaską listę pickerów
 * obecnego `DerConfigurator` strukturą sidebarem 10-sekcyjną z
 * rozbudowaną macierzą gotowości (22 osie zamiast 13).
 *
 * Wymaganie #5 z `/goal` (konfiguratory inżynierskie OZE) — fundament
 * struktury dla pełnego rebuildu w kolejnych sesjach.
 *
 * STATUS: ten plik to KONTRAKT (data structure). Pełen UI per sekcja
 * (P-Q curve, FRT diagram SVG, ANSI 50/51/27/59 nastawy, model dynamiczny)
 * wymaga osobnej implementacji każdej sekcji — patrz § 8 dokumentu
 * `docs/audit/DESIGN_IMPL_2026-05-19_KWranPTV.md`.
 */

/** Identyfikator sekcji konfiguratora — stabilny, używany w URL/state. */
export type DerConfiguratorSectionId =
  | 'ident'        // 1.  Identyfikacja (ENM ref_id, PTPiREE doc, moduł NC RfG)
  | 'params'       // 2.  Parametry elektryczne (Pn/Pmax/Sn/Un/In/η + typ-specific)
  | 'pcc'          // 3.  Punkt PCC (topology diagram, Sk"/R/X)
  | 'ncrfg'        // 4.  NC RfG (artykuły 13–24 per moduł A/B/C/D)
  | 'regulation'   // 5.  Regulacja Q(U)/P(f)/cosφ
  | 'frt'          // 6.  FRT (LVRT/HVRT z krzywą + iniekcja Iq)
  | 'protection'   // 7.  Zabezpieczenia (ANSI 27/59/59N/81U/81O/...)
  | 'dynamic'      // 8.  Model dynamiczny (IEC 61400-27)
  | 'readiness'    // 9.  Gotowość obliczeniowa (22-osiowa macierz)
  | 'gaps';        // 10. Gap analysis (braki w aplikacji do rozbudowy)

/** Typ DER — determinuje pola Parametry elektryczne. */
export type DerKind = 'PV' | 'BESS' | 'FW';

/** Definicja jednej sekcji konfiguratora. */
export interface DerConfiguratorSectionDefinition {
  readonly id: DerConfiguratorSectionId;
  readonly n: number;
  readonly label: string;
  readonly icon: string;
}

export const DER_CONFIGURATOR_SECTIONS: readonly DerConfiguratorSectionDefinition[] = [
  { id: 'ident',      n: 1,  label: 'Identyfikacja',          icon: '📋' },
  { id: 'params',     n: 2,  label: 'Parametry elektryczne',  icon: '⚡' },
  { id: 'pcc',        n: 3,  label: 'Punkt PCC',              icon: '⏚' },
  { id: 'ncrfg',      n: 4,  label: 'NC RfG',                 icon: '🇪🇺' },
  { id: 'regulation', n: 5,  label: 'Regulacja Q/P(f)',       icon: '〜' },
  { id: 'frt',        n: 6,  label: 'FRT (LVRT/HVRT)',        icon: '📉' },
  { id: 'protection', n: 7,  label: 'Zabezpieczenia',         icon: '🛡' },
  { id: 'dynamic',    n: 8,  label: 'Model dynamiczny',       icon: '🔬' },
  { id: 'readiness',  n: 9,  label: 'Gotowość obliczeniowa',  icon: '✓' },
  { id: 'gaps',       n: 10, label: 'Gap analysis',           icon: '⚠' },
];

// ============================================================================
// Macierz gotowości obliczeniowej — 22 osie w 5 kategoriach
// ============================================================================

/** Kategoria osi gotowości. */
export type DerReadinessCategory =
  | 'Obliczenia'      // SC 3F/1F/2F, ΔU, NR, thermal — analiza elektryczna
  | 'OZE / NC RfG'    // Q(U), P(f), FRT, NC RfG full, dynamiczny — zgodność OZE
  | 'Ochrona'         // Zabezpieczenia DER, selektywność, antywyspowość
  | 'Jakość energii'  // Harmoniczne, flicker, voltage_change
  | 'Raportowanie';   // OSD, techniczne, WhiteBox

/** Pojedyncza oś gotowości — co musi być spełnione by uruchomić obliczenie/raport. */
export interface DerReadinessAxis {
  readonly id: string;
  readonly label: string;
  readonly group: DerReadinessCategory;
}

/**
 * Pełna macierz 22 osi gotowości obliczeniowej (vs 13 w v1).
 * Źródło: `DER Engineering Configurator v2.html` linie 108-129.
 *
 * Wymagane do uruchomienia danego typu analizy / wygenerowania danego
 * raportu. Każda oś musi mieć stan: 'ready' / 'partial' / 'blocked' /
 * 'no_module' (gdy brak implementacji w app — gap dla dewelopera).
 */
export const DER_READINESS_AXES: readonly DerReadinessAxis[] = [
  // Obliczenia (7 osi)
  { id: 'equipment',     label: 'Aparatura i katalog',              group: 'Obliczenia' },
  { id: 'sc_3f',         label: 'Zwarcie 3F (IEC 60909)',           group: 'Obliczenia' },
  { id: 'sc_1f',         label: 'Zwarcie 1F doziemne',              group: 'Obliczenia' },
  { id: 'sc_2f',         label: 'Zwarcie 2F / 2FG',                 group: 'Obliczenia' },
  { id: 'vdrop',         label: 'Spadek napięcia ΔU',               group: 'Obliczenia' },
  { id: 'power_flow',    label: 'Rozpływ mocy (Newton-Raphson)',    group: 'Obliczenia' },
  { id: 'thermal',       label: 'Obciążalność termiczna',           group: 'Obliczenia' },
  // OZE / NC RfG (6 osi)
  { id: 'q_u',           label: 'Charakterystyka Q(U)',             group: 'OZE / NC RfG' },
  { id: 'pf',            label: 'Regulacja P(f)',                   group: 'OZE / NC RfG' },
  { id: 'frt',           label: 'LVRT (podnapięciowe FRT)',         group: 'OZE / NC RfG' },
  { id: 'hvrt',          label: 'HVRT (przepięciowe FRT)',          group: 'OZE / NC RfG' },
  { id: 'nc_rfg',        label: 'Zgodność NC RfG (pełna)',          group: 'OZE / NC RfG' },
  { id: 'dynamic',       label: 'Model dynamiczny (stabilność)',    group: 'OZE / NC RfG' },
  // Ochrona (3 osi)
  { id: 'protection',     label: 'Zabezpieczenia DER',              group: 'Ochrona' },
  { id: 'prot_sel',       label: 'Selektywność z GPZ',              group: 'Ochrona' },
  { id: 'prot_anti_isl',  label: 'Antywyspowość (LoM)',             group: 'Ochrona' },
  // Jakość energii (3 osi)
  { id: 'harmonics',      label: 'Harmoniczne (THDi/THDu)',         group: 'Jakość energii' },
  { id: 'flicker',        label: 'Flicker (PST/PLT)',               group: 'Jakość energii' },
  { id: 'voltage_change', label: 'Skoki napięcia d(Umax)',          group: 'Jakość energii' },
  // Raportowanie (3 osi)
  { id: 'report_osd',     label: 'Raport OSD (wniosek przyłączeniowy)', group: 'Raportowanie' },
  { id: 'report_tech',    label: 'Uzasadnienie techniczne',         group: 'Raportowanie' },
  { id: 'report_proof',   label: 'Pakiet dowodowy WhiteBox',        group: 'Raportowanie' },
];

/** Kanoniczna lista kategorii w kolejności wizualnej. */
export const DER_READINESS_CATEGORIES: readonly DerReadinessCategory[] = [
  'Obliczenia',
  'OZE / NC RfG',
  'Ochrona',
  'Jakość energii',
  'Raportowanie',
];

// ============================================================================
// Helpers
// ============================================================================

export function getDerSection(
  id: DerConfiguratorSectionId,
): DerConfiguratorSectionDefinition {
  const s = DER_CONFIGURATOR_SECTIONS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown DER configurator section: ${id}`);
  return s;
}

export function getAxesInCategory(
  category: DerReadinessCategory,
): readonly DerReadinessAxis[] {
  return DER_READINESS_AXES.filter((a) => a.group === category);
}

export function getNextDerSection(
  current: DerConfiguratorSectionId,
): DerConfiguratorSectionId | null {
  const idx = DER_CONFIGURATOR_SECTIONS.findIndex((s) => s.id === current);
  if (idx === -1 || idx === DER_CONFIGURATOR_SECTIONS.length - 1) return null;
  return DER_CONFIGURATOR_SECTIONS[idx + 1].id;
}

export function getPrevDerSection(
  current: DerConfiguratorSectionId,
): DerConfiguratorSectionId | null {
  const idx = DER_CONFIGURATOR_SECTIONS.findIndex((s) => s.id === current);
  if (idx <= 0) return null;
  return DER_CONFIGURATOR_SECTIONS[idx - 1].id;
}
