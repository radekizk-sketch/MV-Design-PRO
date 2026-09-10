/**
 * Odpowiednik `Array.prototype.at()` (ES2022) dla testów.
 *
 * `frontend/tsconfig.json` ma `lib` zamrożone na `ES2020` (zasięg bramki typów,
 * `scripts/tsconfig_gate_guard.py`) — `tsc` nie widzi `.at()` w typach tablic,
 * mimo że Node (środowisko uruchamiające testy Vitest) implementuje tę metodę
 * realnie. Testy używają tej funkcji zamiast `.at(...)`, żeby nie zmieniać
 * `lib` całego projektu wyłącznie na potrzeby testów.
 */
export function at<T>(items: readonly T[], index: number): T | undefined {
  const resolved = index < 0 ? items.length + index : index;
  return resolved >= 0 && resolved < items.length ? items[resolved] : undefined;
}
