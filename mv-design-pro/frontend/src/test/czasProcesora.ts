/**
 * Czas procesora (użytkownik + system) wykonania funkcji, w milisekundach.
 *
 * Testy budżetu i ilorazów kosztu algorytmu mierzą CZAS PROCESORA, nie czas zegarowy
 * (`performance.now()`, `Date.now()`). Zegar ścienny liczy też czas, w którym proces czeka
 * w kolejce planisty systemu, więc na maszynie współdzielonej (CI, kilka biegów naraz)
 * mierzy obciążenie maszyny, a nie złożoność kodu. Pomiar 2026-09-25 przy obciążeniu ~10
 * na 4 CPU, dziewięć prób bez zmiany kodu: iloraz kosztu planu etykiet sieci podwojonej
 * do bazowej z zegara ściennego 0,28…5,03 (test liniowości z progiem 3 przewracał się
 * losowo), z czasu procesora 2,03…2,28.
 *
 * `process.cpuUsage()` liczy cały proces. Vitest uruchamiamy z `--no-file-parallelism`
 * (`package.json`, workflowy CI), więc w procesie wykonuje się naraz jeden plik testów;
 * wątki pomocnicze V8 (odśmiecanie) liczą się do pomiaru, bo to praca mierzonego kodu.
 */
export function zmierzCzasProcesora<T>(fn: () => T): { wynik: T; ms: number } {
  const start = process.cpuUsage();
  const wynik = fn();
  const roznica = process.cpuUsage(start);
  return { wynik, ms: (roznica.user + roznica.system) / 1000 };
}

/** Sam czas procesora wykonania funkcji, w milisekundach (wynik funkcji pomijany). */
export function czasProcesoraMs(fn: () => unknown): number {
  return zmierzCzasProcesora(fn).ms;
}
