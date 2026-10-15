/**
 * engineerTooltips — bazowa biblioteka tooltipów inżynierskich (Phase 1 kryterium 4).
 *
 * "Tooltipy inżynierskie (opis PL + odniesienie do normy)"
 *
 * Każdy tooltip ma:
 * - text: opis PL po ludzku
 * - norm: odniesienie do normy (PN-EN, IEC, IRiESD)
 *
 * Konsumowane przez HelpTooltip komponent w formularzach.
 *
 * ZASADA (decyzja właściciela 2026-10-15, V12K-352): podpowiedź NIE podaje uniwersalnej
 * liczby jako faktu o właściwości konkretnego urządzenia, nastawy albo kryterium projektu
 * („~10-12× I_n", „typowo 5-100 Ω", „limit zwykle ≤5 %"). Taka wartość pochodzi z karty
 * katalogowej / charakterystyki producenta, dokumentacji przekaźnika albo wymagań OSD —
 * podpowiedź mówi, SKĄD ją wziąć. Wolno podać wartości normatywne (typoszereg napięć
 * PN-EN 60038, oznaczenia klas przekładników IEC 61869). Pilnuje test
 * `__tests__/engineerTooltips.test.ts`.
 */

export interface EngineerTooltip {
  text: string;
  norm?: string;
}

export const ENGINEER_TOOLTIPS: Record<string, EngineerTooltip> = {
  // Wielowartościowe parametry sieci SN/WN
  voltage_sn: {
    text: 'Napięcie znamionowe sieci średniego napięcia — wartość z typoszeregu PN-EN 60038 (w Polsce 6, 10, 15, 20, 30 kV).',
    norm: 'PN-EN 60038',
  },
  voltage_nn: {
    text: 'Napięcie niskie — wartość znormalizowana 400 V międzyprzewodowe / 230 V fazowe.',
    norm: 'PN-EN 60038',
  },
  voltage_wn: {
    text: 'Napięcie wysokie — 110 kV (sieć dystrybucyjna WN operatorów OSD) oraz 220 i 400 kV (sieć przesyłowa PSE).',
    norm: 'PN-EN 60038',
  },

  // Transformator
  transformer_rated_power: {
    text: 'Moc znamionowa transformatora (S_n) — maksymalna moc ciągła w warunkach normalnych.',
    norm: 'PN-EN 60076-1',
  },
  transformer_vector_group: {
    text: 'Grupa wektorowa transformatora — np. Dyn11 = trójkąt-gwiazda z przesunięciem 330°.',
    norm: 'PN-EN 60076-1 § 6',
  },
  transformer_tap_changer: {
    text: 'Przełącznik zaczepów — reguluje przekładnię transformatora; zakres regulacji i liczbę stopni podaje karta katalogowa transformatora.',
    norm: 'PN-EN 60214-1',
  },
  transformer_inrush: {
    text: 'Prąd załączania (udar magnesujący) — krótkotrwały prąd przy załączeniu nieobciążonego transformatora. Jego wartość szczytowa i czas zaniku zależą od konstrukcji transformatora (rdzeń, indukcja, remanencja) i warunków załączenia (kąt napięcia, impedancja źródła); podaje je producent konkretnej jednostki, nie ma wartości uniwersalnej.',
    norm: 'IEC 60076-1',
  },

  // Kabel
  cable_cross_section: {
    text: 'Przekrój żyły kabla — wartość z typoszeregu przekrojów znamionowych; dobór z obciążalności, spadku napięcia i wytrzymałości zwarciowej.',
    norm: 'PN-HD 605 S2',
  },
  cable_length: {
    text: 'Długość trasy kabla — z projektu trasy; wpływa na impedancję, spadek napięcia i pojemność doziemną linii.',
  },
  cable_ampacity: {
    text: 'Obciążalność długotrwała w warunkach standardowych. Należy stosować deratingi (grupowanie, temperatura).',
    norm: 'PN-IEC 60287',
  },

  // Zabezpieczenia
  protection_ct_class: {
    text: 'Klasa przekładnika prądowego: 0.5/0.2 (pomiarowe), 5P10/5P20 (zabezpieczeniowe).',
    norm: 'IEC 61869-2',
  },
  protection_vt_class: {
    text: 'Klasa przekładnika napięciowego: 0.5/0.2 (rozliczeniowe), 3P/6P (zabezpieczeniowe).',
    norm: 'IEC 61869-3',
  },
  protection_alf: {
    text: 'ALF (Accuracy Limit Factor) — maksymalna krotność I_p przy której CT zachowuje klasę.',
    norm: 'IEC 61869-2 § 5.5',
  },
  protection_tms: {
    text: 'Mnożnik czasowy charakterystyki zależnej (TMS) — zakres i krok nastawy podaje dokumentacja przekaźnika.',
    norm: 'IEC 60255-151',
  },
  protection_cti: {
    text: 'Stopień selektywności czasowej — odstęp czasów zadziałania kolejnych zabezpieczeń; wynika z czasu własnego wyłącznika, uchybów przekaźników i zapasu przyjętego w projekcie.',
    norm: 'IEC 60255-151',
  },

  // OZE
  oze_frt: {
    text: 'Fault Ride Through — wymóg pozostania DER przyłączonym podczas zaniku napięcia.',
    norm: 'NC RfG Annex II, IRiESD',
  },
  oze_anti_islanding: {
    text: 'Zabezpieczenie przed pracą wyspową — zestaw funkcji (27/59/81U/81O/81R) i ich nastawy określają wymagania OSD.',
    norm: 'IEC 62116, NC RfG',
  },
  oze_cos_phi: {
    text: 'Charakterystyka cos φ(P) — sterowanie współczynnikiem mocy zależnie od mocy czynnej.',
    norm: 'NC RfG Art. 21',
  },
  oze_q_of_u: {
    text: 'Charakterystyka Q(U) — sterowanie mocą bierną zależnie od napięcia (Volt-Var).',
    norm: 'NC RfG Art. 21',
  },

  // Uziemienie
  earthing_tn: {
    text: 'TN — system z bezpośrednim uziemieniem punktu neutralnego (TN-S: rozdzielony PE/N).',
    norm: 'PN-HD 60364-1 § 312',
  },
  earthing_petersen: {
    text: 'Dławik gaszący (cewka Petersena) — kompensacja pojemnościowego prądu doziemnego w sieci SN.',
    norm: 'PN-EN 50522',
  },
  earthing_resistor: {
    text: 'Uziemienie przez rezystor R_n — ogranicza prąd doziemny; rezystancję dobiera się z docelowego prądu doziemienia i wymagań OSD.',
    norm: 'PN-EN 50522',
  },

  // Obliczenia
  short_circuit_current: {
    text: 'Prąd zwarciowy I_k — wartość ustalona prądu w miejscu zwarcia. I_k3 dla 3-fazowego, I_k1 dla 1-fazowego.',
    norm: 'IEC 60909',
  },
  short_circuit_peak: {
    text: 'Wartość szczytowa prądu zwarciowego i_p = κ × √2 × I_k. Stosowana do weryfikacji obciążalności dynamicznej.',
    norm: 'IEC 60909 § 4.3.1',
  },
  power_flow_tolerance: {
    text: 'Tolerancja zbieżności obliczeń rozpływu — największe dopuszczalne niezbilansowanie mocy w węzłach na zakończenie iteracji.',
  },
  voltage_drop: {
    text: 'Spadek napięcia — liczony przez obliczenia rozpływu; dopuszczalną wartość określają wymagania OSD i założenia projektu.',
  },

  // Aparatura pola SN — rozróżnienie funkcjonalne
  apparatus_breaker: {
    text: 'Wyłącznik — łączy i przerywa prądy robocze ORAZ zwarciowe (pełna zdolność łączeniowa Icu/Ics). Wymagany w polach z funkcją zabezpieczeniową.',
    norm: 'PN-EN 62271-100',
  },
  apparatus_disconnector: {
    text: 'Odłącznik — zapewnia widoczną przerwę izolacyjną, łączy TYLKO przy zaniku prądu (bez zdolności wyłączania prądu obciążenia). Funkcja bezpieczeństwa/separacji.',
    norm: 'PN-EN 62271-102',
  },
  apparatus_load_switch: {
    text: 'Rozłącznik — łączy i przerywa prądy robocze (obciążenia), ale NIE prądy zwarciowe. Często łączony z bezpiecznikami (rozłącznik bezpiecznikowy).',
    norm: 'PN-EN 62271-103',
  },
};

export function getTooltip(key: string): EngineerTooltip | null {
  return ENGINEER_TOOLTIPS[key] ?? null;
}

export function listTooltipKeys(): string[] {
  return Object.keys(ENGINEER_TOOLTIPS);
}

export function hasNormReference(tooltip: EngineerTooltip): boolean {
  return Boolean(tooltip.norm);
}
