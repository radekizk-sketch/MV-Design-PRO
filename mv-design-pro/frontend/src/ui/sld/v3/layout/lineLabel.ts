/**
 * SLD V3 — formatter ETYKIETY TECHNICZNEJ LINII (W3-KABLE-ETYKIETY, RECENZJA_L2_
 * POLA_WYPOSAZENIE_2026-07 §7 „Etykiety techniczne linii" + §6 „rozróżnienie
 * zakończeń", P0). Czysta funkcja, deterministyczna (P7: zero Date/losowości/
 * DOM/locale — formatowanie liczb RĘCZNE, bez `toLocaleString`, żeby wynik był
 * bajt-identyczny niezależnie od środowiska).
 *
 * ZERO FABRYKACJI (§0 karty): każda składowa etykiety pochodzi WYŁĄCZNIE z
 * modelu/katalogu; brakująca dana jest POMIJANA (nie zgadywana). W szczególności
 * napięcie znamionowe kabla emitujemy TYLKO gdy katalog je niesie
 * (`voltage_rating_kv` w `materialized_params`) — na dostępnej danej (pojedyncze
 * Um, np. 20 kV) formatujemy „20 kV"; pary U0/U (np. „12/20 kV") NIE fabrykujemy,
 * bo katalog jej tu nie niesie.
 *
 * HIERARCHIA LOD (§7): L0 = sama relacja (kotwica/tożsamość, składana przez
 * wołającego z pary końców); L1 = typ + długość; L2 = PEŁNE dane
 * „relacja · typ żyły×przekrój · napięcie · długość". Ten moduł składa CZŁON
 * TECHNICZNY (bez relacji — relację dokleja wołający w `buildScene.ts`, bo tylko
 * on zna kody obu końców z terminali §16).
 *
 * §6 ROZRÓŻNIENIE ZAKOŃCZEŃ: rodzaj przęsła (kabel vs linia napowietrzna) jest
 * już zakodowany w etykiecie typu z katalogu („Kabel SN …" ⇒ głowica; „Linia
 * napowietrzna …" ⇒ przyłącze napowietrzne). MUFA/punkt przejścia dopisywana
 * TYLKO gdy ENM niesie złącza kablowe (`cable_joints` niepuste) — inaczej
 * pominięta (jawny brak, zero zgadywania rodzaju zakończenia).
 */

/** Wejście formattera — WYŁĄCZNIE realne dane z modelu/katalogu (adapter v2
 *  przenosi je 1:1 do `SldCableRun.segmentLabels`). */
export interface LineTechnicalLabelInput {
  /** Etykieta typu z katalogu WŁĄCZNIE z żyły×przekrój (np. „YAKXS 3×1×240 mm²",
   *  „Kabel SN XLPE Al 3×120 mm²", „Linia napowietrzna AFL 120 mm²") — bez
   *  długości. `null` ⇒ brak typu katalogowego (człon pominięty). */
  readonly typeLabel: string | null;
  /** Napięcie znamionowe kabla [kV] z katalogu (`voltage_rating_kv`). `null` ⇒
   *  katalog nie niesie — człon napięcia pominięty (zero fabrykacji). */
  readonly ratedVoltageKv: number | null;
  /** Długość odcinka [km] z ENM (`length_km`). `null`/≤0 ⇒ człon długości
   *  pominięty. */
  readonly lengthKm: number | null;
  /** Czy ENM niesie złącze kablowe (mufę) na tym odcinku (`cable_joints`
   *  niepuste). `false`/brak ⇒ brak muf (nie dopisujemy). */
  readonly hasJoint?: boolean;
}

/**
 * Formatuje długość odcinka wg §7: „l = 680 m" dla <1000 m, „l = 1,24 km" dla
 * ≥1000 m. Separator dziesiętny = przecinek (konwencja PL), bez zbędnych zer
 * (1,2 km nie „1,20 km"; 1 km nie „1,00 km"). Deterministyczne (bez locale).
 * `null`/≤0 ⇒ `null` (człon pominięty).
 */
export function formatLineLengthPl(lengthKm: number | null | undefined): string | null {
  if (typeof lengthKm !== 'number' || !Number.isFinite(lengthKm) || lengthKm <= 0) return null;
  const meters = lengthKm * 1000;
  if (meters < 1000) {
    return `l = ${Math.round(meters)} m`;
  }
  const km = Math.round(lengthKm * 100) / 100; // 2 miejsca
  const intPart = Math.trunc(km);
  const frac = Math.round((km - intPart) * 100); // 0..99
  if (frac === 0) return `l = ${intPart} km`;
  const fracStr = frac % 10 === 0 ? String(frac / 10) : String(frac).padStart(2, '0');
  return `l = ${intPart},${fracStr} km`;
}

/** Formatuje napięcie znamionowe kabla [kV] wg katalogu: liczba całkowita bez
 *  miejsc (20 → „20 kV"), ułamkowa z przecinkiem („10,5 kV"). `null`/≤0 ⇒
 *  `null` (człon pominięty). */
export function formatRatedVoltageKv(ratedVoltageKv: number | null | undefined): string | null {
  if (typeof ratedVoltageKv !== 'number' || !Number.isFinite(ratedVoltageKv) || ratedVoltageKv <= 0) {
    return null;
  }
  const rounded = Math.round(ratedVoltageKv * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',');
  return `${text} kV`;
}

/**
 * Składa CZŁON TECHNICZNY etykiety linii (§7 L2, bez relacji): „⟨typ⟩ · ⟨U kV⟩
 * · ⟨l = …⟩ [· mufa]". Człony obecne tylko gdy dane realne (zero fabrykacji);
 * kolejność stała (determinizm). `null`, gdy ŻADNA składowa nie jest dostępna
 * (wołający degraduje do samej relacji — uczciwy brak).
 */
export function formatLineTechnicalLabel(input: LineTechnicalLabelInput): string | null {
  const parts: string[] = [];
  if (input.typeLabel && input.typeLabel.trim()) parts.push(input.typeLabel.trim());
  const voltage = formatRatedVoltageKv(input.ratedVoltageKv);
  if (voltage) parts.push(voltage);
  const length = formatLineLengthPl(input.lengthKm);
  if (length) parts.push(length);
  if (input.hasJoint) parts.push('mufa');
  if (parts.length === 0) return null;
  return parts.join(' · ');
}
