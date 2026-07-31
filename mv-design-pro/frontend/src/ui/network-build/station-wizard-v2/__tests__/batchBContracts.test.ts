/**
 * Kontrakt Batch B — Kreator KOMPLETNY kroki 11/12/14:
 *   Krok 11 — Źródła OZE (PV stringi + BESS + FW)
 *   Krok 12 — Jakość energii (THD/flicker/hosting capacity)
 *   Krok 14 — NC RfG (P(f) + grid-forming + reverse)
 */
import { describe, expect, it } from 'vitest';

import {
  EN_50160_HARMONIC_LIMITS,
  EN_50160_THDU_LIMIT_PCT,
  FLICKER_PST_LIMIT,
  FLICKER_PLT_LIMIT,
  VOLTAGE_CHANGE_DMAX_PCT,
} from '../powerQualityContract';
import {
  selectNcRfgModule,
  NC_RFG_REQUIREMENTS,
  getRequirementsForModule,
  OSD_PROFILES,
  computePfReduction,
  summarizeNcRfgCompliance,
} from '../ncRfgContract';

// ============================================================================
// Krok 11 — DER Sources
// ============================================================================

// ============================================================================
// Krok 11 — Źródła OZE: RACHUNKI USUNIĘTE (K7-B, 2026-07-31)
// ============================================================================
//
// Stały tu asercje na `checkPvString` (Voc stringu z poprawką temperaturową
// modułu), `projectBessLifetime` (degradacja cykliczna + kalendarzowa) oraz
// `computeWindTurbinePower` / `computeRotorSweptArea` (krzywa mocy turbiny
// P(v) ∝ (v−v_cut_in)³ i pole zataczane wirnika). Cały moduł
// `derSourcesContract.ts` nie miał konsumenta produkcyjnego — poza tym plikiem
// nikt go nie importował. Fizyka źródła OZE należy do backendu: katalogi
// (`network_model/catalog/wind_turbines/`, `mv_converter_catalog`) oraz
// `network_model/solvers/der_selection_preview.py` z pełnym śladem.

describe('PN-EN 50160 harmonic limits', () => {
  it('15 rzędów harmonicznych ma określone limity', () => {
    expect(EN_50160_HARMONIC_LIMITS.length).toBe(15);
  });

  it('5. harmoniczna: limit 6.0%', () => {
    const h5 = EN_50160_HARMONIC_LIMITS.find((h) => h.order === 5);
    expect(h5?.voltageLimitPct).toBe(6.0);
  });

  it('THDU limit = 8% (PN-EN 50160 § 4.2.2)', () => {
    expect(EN_50160_THDU_LIMIT_PCT).toBe(8.0);
  });
});

// RACHUNKI JAKOŚCI ENERGII — USUNIĘTE (K7-B, 2026-07-31).
// Stały tu asercje na `checkHarmonicCompliance` (THDu = √(Σ Uh²) + naruszenia
// per rząd), `checkFlickerCompliance` oraz `computeHostingCapacity`. Żadna z tych
// funkcji nie miała konsumenta produkcyjnego, a `computeHostingCapacity` liczyła
// moc przyłączeniową na stałych dobranych „na oko" (granica termiczna = Sk/10).
// Limity normy (`EN_50160_*`, `FLICKER_*`, `VOLTAGE_CHANGE_DMAX_PCT`) zostają —
// to dane katalogowe normy, nie rachunek; ich asercje są wyżej.
// Zdolności backendu: `api/quality_analysis_runs.py`, solver V12.6 (THD),
// `api/oze_analysis_runs.py` + `validate-hosting-capacity-export`.

describe('selectNcRfgModule — wybór modułu na podstawie mocy + napięcia', () => {
  it('100 kW → moduł A', () => {
    expect(selectNcRfgModule(100, 0.4)).toBe('A');
  });

  it('1 MW na MV (15 kV) → moduł B', () => {
    expect(selectNcRfgModule(1000, 15)).toBe('B');
  });

  it('30 MW na HV (110 kV) → moduł C', () => {
    expect(selectNcRfgModule(30_000, 110)).toBe('C');
  });

  it('60 MW → moduł C', () => {
    expect(selectNcRfgModule(60_000, 110)).toBe('C');
  });

  it('100 MW → moduł D', () => {
    expect(selectNcRfgModule(100_000, 220)).toBe('D');
  });
});

describe('NC RfG Requirements — 12+ wymagań', () => {
  it('Lista zawiera ≥ 12 wymagań NC RfG', () => {
    expect(NC_RFG_REQUIREMENTS.length).toBeGreaterThanOrEqual(12);
  });

  it('Każde wymaganie ma artykuł, tytuł, mandatory flag, notki PL', () => {
    for (const req of NC_RFG_REQUIREMENTS) {
      expect(req.article).toMatch(/^Art\.\s*\d/);
      expect(req.title).toBeTruthy();
      expect(typeof req.mandatory).toBe('boolean');
      expect(req.notesPl).toBeTruthy();
      expect(req.appliesToModules.length).toBeGreaterThan(0);
    }
  });

  it('LVRT (Art. 15.2) dotyczy modułów B/C/D (nie A)', () => {
    const lvrt = NC_RFG_REQUIREMENTS.find((r) => r.article === 'Art. 15.2');
    expect(lvrt).toBeDefined();
    expect(lvrt?.appliesToModules).not.toContain('A');
    expect(lvrt?.appliesToModules).toContain('B');
  });

  it('Black-start (Art. 21) tylko dla modułu D', () => {
    const bs = NC_RFG_REQUIREMENTS.find((r) => r.article === 'Art. 21');
    expect(bs?.appliesToModules).toEqual(['D']);
  });
});

describe('getRequirementsForModule — filtrowanie per moduł', () => {
  it('Moduł A → mniej wymagań niż D', () => {
    const a = getRequirementsForModule('A');
    const d = getRequirementsForModule('D');
    expect(a.length).toBeLessThan(d.length);
  });

  it('Moduł A zawiera anti-islanding (Art. 24)', () => {
    const a = getRequirementsForModule('A');
    expect(a.some((r) => r.article === 'Art. 24')).toBe(true);
  });
});

describe('OSD_PROFILES — 5 operatorów polskich', () => {
  it('5 profili: PSE, Energa, Tauron, Enea, PGE', () => {
    expect(OSD_PROFILES.length).toBe(5);
    const refs = OSD_PROFILES.map((p) => p.operatorRef);
    expect(refs).toEqual(['PSE', 'Energa', 'Tauron', 'Enea', 'PGE']);
  });

  it('Każdy profil ma pełen P(f) + Q(U) + LVRT', () => {
    for (const p of OSD_PROFILES) {
      expect(p.pfDroop.activationFreqHz).toBeGreaterThanOrEqual(50);
      expect(p.pfDroop.droopPct).toBeGreaterThan(0);
      expect(p.quSlope).toBeGreaterThan(0);
      expect(p.lvrtZeroVoltageMs).toBeGreaterThan(0);
    }
  });
});

describe('computePfReduction — redukcja mocy przy nadczęstotliwości', () => {
  it('f = aktywacja → ΔP = 0', () => {
    const r = computePfReduction(OSD_PROFILES[0].pfDroop, 50.2);
    expect(r).toBe(0);
  });

  it('f = 51.0 Hz, droop 5% → ΔP/Pn ≈ 32%', () => {
    const r = computePfReduction(OSD_PROFILES[0].pfDroop, 51.0);
    // ΔP/Pn = (51-50.2)/50 / 0.05 × 100 = 0.016/0.05×100 = 32%.
    expect(r).toBeCloseTo(32, 0);
  });

  it('f < activation → ΔP = 0 (brak redukcji)', () => {
    expect(computePfReduction(OSD_PROFILES[0].pfDroop, 49.5)).toBe(0);
  });
});

describe('summarizeNcRfgCompliance — podsumowanie per moduł', () => {
  it('Moduł A: mniej requirements, ale anti-islanding mandatory', () => {
    const s = summarizeNcRfgCompliance('A');
    expect(s.module).toBe('A');
    expect(s.applicableRequirementsCount).toBeGreaterThan(0);
    expect(s.mandatoryCount).toBeGreaterThan(0);
    expect(s.profilesAvailable).toBe(5);
  });

  it('Moduł D: max requirements', () => {
    const a = summarizeNcRfgCompliance('A');
    const d = summarizeNcRfgCompliance('D');
    expect(d.applicableRequirementsCount).toBeGreaterThan(a.applicableRequirementsCount);
  });
});
