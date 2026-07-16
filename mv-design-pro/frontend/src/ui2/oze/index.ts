/*
 * Moduł OZE nowej powłoki (ui2/oze) — strumień OZE/NC RfG (dyrektywa 2026-07-15).
 * Powierzchnie: macierz wymogów NC RfG per moduł (karta P39) i pulpit instalacji
 * OZE (karta P47). Wspólny stan biegu: `ncRfgStore`.
 */

export * from './macierz';
export * from './pulpit';
export { useNcRfgStore } from './ncRfgStore';
export type { NcRfgStoreState, StatusBieguNcRfg } from './ncRfgStore';
