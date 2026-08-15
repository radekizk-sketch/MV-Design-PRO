/**
 * Network Build Forms — barrel export.
 *
 * Po kartach P-4/P-5 (FLOW PROJEKTANTA, 2026-07-22) wszystkie legacy
 * formularze operacji domenowych zostaly zastapione kreatorami ui2
 * (`ui2/kreatory/**`).
 *
 * K7-B (2026-07-31): usunięty został ostatni eksport tego barrela —
 * `CableValidationBanner` wraz z `cableAmpacityValidator`. Baner nie był
 * renderowany nigdzie w aplikacji (grep po całym `src/` poza własnym testem = 0
 * — komentarz „reużywany przez kreatory przez własny import bezpośredni" nie
 * odpowiadał już stanowi kodu), a walidator liczył w przeglądarce dobór
 * przekroju: obciążalność po deratingu oraz minimalny przekrój zwarciowy
 * S_min = I·√t / k (IEC 60949) na własnej tablicy stałych materiałowych k.
 * Ta zdolność ma w backendzie pełnego, białoskrzynkowego dostawcę z kodami
 * gotowości zamiast wartości zastępczych:
 * `network_model/solvers/conductor_thermal_withstand.py` +
 * `application/analyses/wytrzymalosc_cieplna_przewodow.py`.
 *
 * Razem z nim odeszły trzy inne martwe rachunki tego katalogu (żaden bez
 * konsumenta produkcyjnego): `cableThermalAgingHelper` (starzenie termiczne
 * izolacji wg reguły Montsingera 2^(ΔT/10)), `transformerLossesCalculator`
 * (straty transformatora i optymalny współczynnik obciążenia √(P0/Pk)) oraz
 * `measurementBurdenValidator` (bilans mocy wtórnej CT/VT, R = 2ρL/s).
 * Szczegóły i wskazanie zdolności backendu: `docs/uiux/DLUG_FIZYKA_W_UI_2026-07.md` §7.
 */

export {};
