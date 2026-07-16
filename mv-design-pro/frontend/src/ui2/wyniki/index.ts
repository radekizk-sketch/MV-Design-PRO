/*
 * Publiczny interfejs przestrzeni „Wyniki" (ui2/wyniki, faza U3). Fundament
 * wszystkich okien wyników: wspólny wzorzec ekranu analizy (`wzorzec`) + pierwsza
 * konkretyzacja (`rozplyw`, karta E8.1) + druga konkretyzacja (`zwarcia`, karta E8.2)
 * + okno „Dowód obliczeń" (`dowod`, karta E9.1 / W-608 — ślad WHITE BOX)
 * + porównanie przebiegów A/B rozpływu (`porownanie`, karta E12.1 / W-609)
 * + okno „Jakość wyników" (`jakosc`, karta E8.4 / W-607 — wiarygodność zwarciowa
 *   + walidacja energetyczna).
 */

export * from './wzorzec';
export * from './rozplyw';
export * from './zwarcia';
export * from './dowod';
export * from './porownanie';
export * from './jakosc';
