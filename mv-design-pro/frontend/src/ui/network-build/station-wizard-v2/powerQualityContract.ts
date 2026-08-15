/**
 * Power Quality Contract — krok 12 Kreatora KOMPLETNEGO.
 *
 * Standardy:
 *   PN-EN 50160 — Jakość energii elektrycznej w sieciach publicznych
 *   IEEE 519 — Recommended Practice for Harmonic Control
 *   IEC 61000-3-7 — Flicker (PST/PLT) limits
 *   IEC 61000-2-4 — Compatibility levels w sieci HV/MV
 *
 * Limity dla SN (15-20 kV) per PN-EN 50160:
 *   THDu ≤ 8% (Total Harmonic Distortion napięcia)
 *   THDi ≤ 5% (prądowe — limity per IEEE 519 zależne od Isc/IL ratio)
 *   PST ≤ 1.0 (Short-term flicker, 10-min)
 *   PLT ≤ 0.8 (Long-term flicker, 2-h)
 *   ΔU < 4% (skoki napięcia przy załączeniu DER)
 *   Asymetria napięcia < 2%
 */

/** Profil rzędu harmonicznej per PN-EN 50160 Table 1. */
export interface HarmonicProfile {
  /** Rząd harmonicznej (2, 3, 5, ...). */
  readonly order: number;
  /** Limit napięciowy U_h/U1 (%). */
  readonly voltageLimitPct: number;
}

/** Limity PN-EN 50160 Table 1 — sieci publiczne (LV/MV). */
export const EN_50160_HARMONIC_LIMITS: readonly HarmonicProfile[] = [
  { order: 2, voltageLimitPct: 2.0 },
  { order: 3, voltageLimitPct: 5.0 },
  { order: 4, voltageLimitPct: 1.0 },
  { order: 5, voltageLimitPct: 6.0 },
  { order: 6, voltageLimitPct: 0.5 },
  { order: 7, voltageLimitPct: 5.0 },
  { order: 9, voltageLimitPct: 1.5 },
  { order: 11, voltageLimitPct: 3.5 },
  { order: 13, voltageLimitPct: 3.0 },
  { order: 15, voltageLimitPct: 0.5 },
  { order: 17, voltageLimitPct: 2.0 },
  { order: 19, voltageLimitPct: 1.5 },
  { order: 21, voltageLimitPct: 0.5 },
  { order: 23, voltageLimitPct: 1.5 },
  { order: 25, voltageLimitPct: 1.5 },
];

/** THDu limit per PN-EN 50160 § 4.2.2. */
export const EN_50160_THDU_LIMIT_PCT = 8.0;

/** Flicker PST limit per IEC 61000-3-7. */
export const FLICKER_PST_LIMIT = 1.0;

/** Flicker PLT limit per IEC 61000-3-7. */
export const FLICKER_PLT_LIMIT = 0.8;

/** Voltage change limit przy załączeniu DER (PN-EN 50160). */
export const VOLTAGE_CHANGE_DMAX_PCT = 4.0;

/*
 * RACHUNKI JAKOŚCI ENERGII — USUNIĘTE (K7-B, 2026-07-31).
 *
 * Stały tu trzy funkcje bez konsumenta produkcyjnego (poza własnym testem grep = 0);
 * kreator stacji importuje z tego pliku wyłącznie tablicę limitów normy:
 *
 *   • `checkHarmonicCompliance` — THDu = √(Σ Uh²) z pomiarów rzędów 2..50 wraz
 *     z werdyktem wobec limitów PN-EN 50160;
 *   • `checkFlickerCompliance` — porównanie Pst/Plt z limitami IEC 61000-3-7;
 *   • `computeHostingCapacity` — najgorsza z trzech granic mocy przyłączeniowej.
 *     Ta ostatnia była nie tylko fizyką w przeglądarce, ale i fizyką ZMYŚLONĄ:
 *     własne komentarze nazywały ją „aproksymacją", granica termiczna dzieliła moc
 *     zwarciową przez stałą 10 („uproszczone × 1000 (representative)"), a granica
 *     napięciowa zastępowała ΔU=(P·R+Q·X)/U² iloczynem marginesu i Sk. Liczba
 *     kilowatów przyłączenia powstawała ze stałych dobranych na oko.
 *
 * Zdolności w backendzie: `api/quality_analysis_runs.py` (jakość energii),
 * solver akademicki V12.6 (`network_model/solvers/v126_academic.py` — THD),
 * a dla mocy przyłączeniowej OZE `api/oze_analysis_runs.py` + walidacja eksportu
 * `POST /api/v1/catalog/audit2/validate-hosting-capacity-export`.
 */
