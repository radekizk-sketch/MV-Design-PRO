/**
 * sld-editor/types — minimalny kontrakt typów symboli SLD (TYLKO typy).
 *
 * Przywraca zależność `import type` deklarowaną przez `sld/core/topologyInputReader.ts`
 * (most migracyjny `readTopologyFromSymbols`). Pełny moduł `sld-editor` (komponenty,
 * runtime) jest poza tym worktree — ten plik dostarcza WYŁĄCZNIE kształty typów,
 * dokładnie wg pól odczytywanych przez czytnik (zero zgadywania, zero runtime).
 *
 * Jeśli pełny `sld-editor` zostanie wprowadzony do worktree, jego `types` zastąpi ten
 * plik (kontrakt musi pozostać kompatybilny z polami używanymi przez czytnik).
 */

/** Wspólne pola każdego symbolu SLD odczytywane przez czytnik. */
interface SldSymbolBase {
  readonly id: string;
  readonly elementId: string;
  readonly elementName: string;
  readonly inService: boolean;
}

export interface BusSymbol extends SldSymbolBase {
  readonly elementType: 'Bus';
}

export interface BranchSymbol extends SldSymbolBase {
  readonly elementType: 'LineBranch' | 'TransformerBranch';
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly branchType?: 'CABLE' | 'LINE';
}

export interface SwitchSymbol extends SldSymbolBase {
  readonly elementType: 'Switch';
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly switchType: 'BREAKER' | 'DISCONNECTOR' | 'LOAD_SWITCH' | 'FUSE';
  readonly switchState: 'OPEN' | 'CLOSED';
}

export interface SourceSymbol extends SldSymbolBase {
  readonly elementType: 'Source';
  readonly connectedToNodeId: string;
}

export interface LoadSymbol extends SldSymbolBase {
  readonly elementType: 'Load';
  readonly connectedToNodeId: string;
}

/** Unia wszystkich symboli SLD (most migracyjny). */
export type AnySldSymbol =
  | BusSymbol
  | BranchSymbol
  | SwitchSymbol
  | SourceSymbol
  | LoadSymbol;
