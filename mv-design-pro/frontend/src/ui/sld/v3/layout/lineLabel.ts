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
 * Um, np. 20 kV) formatujemy „Un=20 kV" (S9-8, oznacznik jednoznaczności — patrz
 * `formatRatedVoltageKv`); pary U0/U (np. „12/20 kV") NIE fabrykujemy, bo katalog
 * jej tu nie niesie.
 *
 * HIERARCHIA LOD (§7): L0 = sama relacja (kotwica/tożsamość, składana przez
 * wołającego z pary końców); L1 = typ + długość; L2 = PEŁNE dane
 * „relacja · typ żyły×przekrój · Un · długość". Ten moduł składa CZŁON
 * TECHNICZNY (bez relacji — relację dokleja wołający w `buildScene.ts`, bo tylko
 * on zna kody obu końców z terminali §16).
 *
 * §6 ROZRÓŻNIENIE ZAKOŃCZEŃ: rodzaj przęsła (kabel vs linia napowietrzna) jest
 * już zakodowany w etykiecie typu z katalogu („Kabel SN …" ⇒ głowica; „Linia
 * napowietrzna …" ⇒ przyłącze napowietrzne). MUFA/punkt przejścia dopisywana
 * TYLKO gdy ENM niesie złącza kablowe (`cable_joints` niepuste) — inaczej
 * pominięta (jawny brak, zero zgadywania rodzaju zakończenia).
 */

// Jedyna zależność: konwencja zapisu liczby rysunku (`core/text.ts`) — też czysta
// funkcja, bez DOM i bez `toLocaleString`, więc determinizm modułu zostaje.
import { liczbaRysunkuPl } from '../core/text';

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

/**
 * Formatuje napięcie znamionowe kabla [kV] wg katalogu: liczba całkowita bez
 * miejsc (20 → „Un=20 kV"), ułamkowa z przecinkiem („Un=10,5 kV").
 * `null`/≤0 ⇒ `null` (człon pominięty).
 *
 * S9-8 (audyt, „jednoznaczne oznaczenie napięcia znamionowego kabla przy
 * przęśle"): oznacznik `Un` DOPISANY. Do tej karty człon brzmiał samo „20 kV" i
 * stał w łańcuchu rozdzielonym tym samym separatorem, co wszystkie pozostałe
 * człony („S04 ↔ S05 · YAKXS 3×120/16 · 20 kV · l = 135 m") — czytelnik nie ma
 * z czego rozstrzygnąć, czy to napięcie IZOLACJI KABLA (dana katalogowa, którą
 * dobiera się do sieci), czy napięcie PRACY SIECI w tym miejscu (dana modelu).
 * Na tym samym rysunku obie liczby bywają różne (kabel 20 kV w sieci 15 kV), a
 * pomyłka prowadzi do fałszywego wniosku o poprawności doboru.
 *
 * DLACZEGO „Un=" BEZ SPACJI, a nie „Un = " jak przy długości. Zapis ze spacjami
 * jest o dwa glify dłuższy, a etykieta przęsła jest REZERWACJĄ szerokości
 * kolumny stacji (`requiredSegmentLabelWidth`, `layout/measure.ts`) — pomiar na
 * sieci fixturowej (długi ciąg, 40 przęseł kablowych): „Un = " podnosi wysokość
 * arkusza o 488 px (dodatkowe wiersze pasma B1 z `colorSegmentLabelRows`), sumę
 * pionów o 2 536 px i OBNIŻA gęstość tuszu na przeglądzie z 2,03 % do 1,94 %;
 * „Un=" kosztuje 32 px wysokości i zostawia gęstość na 2,03 %. Skoro karta S9-7
 * walczy o gęstość tuszu, oznacznik bierzemy w postaci zwartej — „Un=20 kV" to
 * powszechna forma polskiego zapisu rysunkowego, więc nic nie tracimy poza
 * symetrią ze zwyczajem `l = `.
 */
export function formatRatedVoltageKv(ratedVoltageKv: number | null | undefined): string | null {
  if (typeof ratedVoltageKv !== 'number' || !Number.isFinite(ratedVoltageKv) || ratedVoltageKv <= 0) {
    return null;
  }
  // Zapis liczby — jedna konwencja rysunku (`liczbaRysunkuPl`, core/text.ts).
  // Dwa miejsca dziesiętne zamiast jednego: katalogowe 20/30 kV wychodzą tak samo,
  // a wartość ułamkowa nie traci cyfry przez zaokrąglenie zapisu.
  return `Un=${liczbaRysunkuPl(ratedVoltageKv)} kV`;
}

/**
 * Składa CZŁON TECHNICZNY etykiety linii (§7 L2, bez relacji): „⟨typ⟩ · ⟨Un=… kV⟩
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
