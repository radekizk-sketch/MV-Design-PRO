// ZBIÓR TESTÓW BUDŻETU CZASU PROCESORA — jeden predykat dla dwóch odbiorców (karta SZYBKIE-TESTY-2).
//
// `vite.config.ts` (`plikiBudzetuCzasu`) wybiera nim pliki osobnego kroku `vitest run --mode budzety`,
// a reguła środowiska testów (`scripts/srodowisko_testow.mjs`) zostawia tym plikom środowisko
// `jsdom`, w którym budżety skalibrowano. Dwa niezależne wzorce, które „dziś się zgadzają”, byłyby
// defektem czekającym na pierwszy plik budżetu zapisany inaczej — stąd jeden moduł.

/** Import pomocnika pomiaru czasu procesora (`src/test/czasProcesora.ts`) w treści pliku testów. */
export const IMPORT_POMOCNIKA_CZASU = /from\s+['"][^'"]*\/czasProcesora['"]/;
