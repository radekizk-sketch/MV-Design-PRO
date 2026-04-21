/**
 * DETERMINISTYCZNY GENERATOR IDENTYFIKATORÓW — PR-SLD-03 (N-07)
 *
 * CANONICAL ALIGNMENT:
 * - AUDYT_SLD_CANONICAL.md: N-07 — brak Date.now/Math.random
 * - sld_rules.md § A.1: Bijection (symbol ↔ model element)
 *
 * ZASADY:
 * - Identyfikatory NIE zależą od czasu ani losowości
 * - Ten sam stan wejściowy → te same identyfikatory
 * - Brak kolizji w ramach sesji i wklejenia
 * - Powtarzalność: ten sam schowek + ten sam stan → te same ID
 *
 * ALGORYTM:
 * - Hash z: (typ elementu) + (numer sekwencyjny) + (hash stanu)
 * - Licznik sesji: inkrementowany przy każdym wklejeniu
 * - Hash stanu: obliczany z aktualnych symboli na canvas
 */

/**
 * Kontekst generatora — przechowuje stan sesji.
 */
interface IdGeneratorContext {
  /** Licznik wklejenia w sesji */
  pasteCounter: number;
  /** Hash stanu topologii (dla unikalności między sesjami) */
  topologyHash: string;
}

/**
 * Globalny kontekst generatora (singleton per sesja).
 */
let globalContext: IdGeneratorContext = {
  pasteCounter: 0,
  topologyHash: 'initial',
};

/**
 * Resetuj kontekst generatora (używane w testach).
 */
export function resetIdGeneratorContext(): void {
  globalContext = {
    pasteCounter: 0,
    topologyHash: 'initial',
  };
}

/**
 * Ustaw hash topologii.
 * Wywoływane przy zmianie stanu canvas.
 */
export function setTopologyHash(symbolIds: string[]): void {
  // Deterministyczne sortowanie i łączenie
  const sorted = [...symbolIds].sort();
  globalContext.topologyHash = hashString(sorted.join('|'));
}

/**
 * Inkrementuj licznik wklejenia.
 * Wywoływane na początku każdej operacji wklejenia.
 */
export function incrementPasteCounter(): number {
  globalContext.pasteCounter += 1;
  return globalContext.pasteCounter;
}

/**
 * Pobierz aktualny licznik wklejenia.
 */
export function getPasteCounter(): number {
  return globalContext.pasteCounter;
}

/**
 * Oblicz deterministyczny hash z tekstu.
 *
 * DETERMINISTYCZNY: ten sam input → ten sam output
 * Używa algorytmu DJB2 (szybki, prosty, deterministyczny).
 *
 * @param str - Tekst do hashowania
 * @returns Hash jako string hex (8 znaków)
 */
export function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  // Zamień na dodatni i zwróć jako hex (8 znaków)
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Wygeneruj deterministyczny identyfikator symbolu SLD.
 *
 * Format: sldsym_<typ>_<hash>
 *
 * @param elementType - Typ elementu (Bus, LineBranch, etc.)
 * @param pasteIndex - Indeks w zestawie wklejanym (0, 1, 2, ...)
 * @param pasteCounter - Numer wklejenia w sesji
 * @param topologyHash - Hash aktualnej topologii (opcjonalny)
 * @returns Deterministyczny identyfikator symbolu
 */
export function generateDeterministicSymbolId(
  elementType: string,
  pasteIndex: number,
  pasteCounter?: number,
  topologyHash?: string
): string {
  const pc = pasteCounter ?? globalContext.pasteCounter;
  const th = topologyHash ?? globalContext.topologyHash;

  // Składniki hash: typ + indeks + licznik wklejenia + hash topologii
  const components = `${elementType}|${pasteIndex}|${pc}|${th}`;
  const hash = hashString(components);

  return `sldsym_${elementType.toLowerCase()}_${hash}`;
}

/**
 * Wygeneruj deterministyczny identyfikator elementu modelu.
 *
 * Format: elem_<typ>_<hash>
 *
 * @param elementType - Typ elementu (Bus, LineBranch, etc.)
 * @param pasteIndex - Indeks w zestawie wklejanym (0, 1, 2, ...)
 * @param pasteCounter - Numer wklejenia w sesji
 * @param topologyHash - Hash aktualnej topologii (opcjonalny)
 * @returns Deterministyczny identyfikator elementu modelu
 */
export function generateDeterministicElementId(
  elementType: string,
  pasteIndex: number,
  pasteCounter?: number,
  topologyHash?: string
): string {
  const pc = pasteCounter ?? globalContext.pasteCounter;
  const th = topologyHash ?? globalContext.topologyHash;

  // Składniki hash: typ + indeks + licznik + hash topologii + prefix
  const components = `model|${elementType}|${pasteIndex}|${pc}|${th}`;
  const hash = hashString(components);

  return `elem_${elementType.toLowerCase()}_${hash}`;
}

/**
 * Wygeneruj deterministyczne identyfikatory dla zestawu symboli.
 *
 * DETERMINIZM: Ten sam schowek + ten sam stan canvas = te same ID.
 *
 * @param elementTypes - Tablica typów elementów do wklejenia
 * @param existingSymbolIds - ID istniejących symboli (dla hash topologii)
 * @returns Mapa: indeks → { symbolId, elementId }
 */
export function generatePasteIdentifiers(
  elementTypes: string[],
  existingSymbolIds: string[]
): Map<number, { symbolId: string; elementId: string }> {
  // Ustaw hash topologii
  setTopologyHash(existingSymbolIds);

  // Inkrementuj licznik wklejenia
  const pasteNum = incrementPasteCounter();

  const result = new Map<number, { symbolId: string; elementId: string }>();

  // Deterministyczne sortowanie typów (dla powtarzalności)
  const sortedIndices = elementTypes.map((_, i) => i);
  // Nie sortujemy - zachowujemy kolejność ze schowka (już deterministyczna)

  for (const index of sortedIndices) {
    const elementType = elementTypes[index];
    const symbolId = generateDeterministicSymbolId(
      elementType,
      index,
      pasteNum,
      globalContext.topologyHash
    );
    const elementId = generateDeterministicElementId(
      elementType,
      index,
      pasteNum,
      globalContext.topologyHash
    );

    result.set(index, { symbolId, elementId });
  }

  return result;
}

/**
 * Wygeneruj deterministyczny identyfikator komendy.
 *
 * UWAGA: Dla komend UNDO/REDO używamy licznika sesji, nie czasu.
 *
 * @param commandType - Typ komendy (paste, move, etc.)
 * @returns Deterministyczny identyfikator komendy
 */
export function generateDeterministicCommandId(commandType: string): string {
  const pc = globalContext.pasteCounter;
  const th = globalContext.topologyHash;

  const components = `cmd|${commandType}|${pc}|${th}`;
  const hash = hashString(components);

  return `cmd_${commandType}_${hash}`;
}

/**
 * Weryfikuj deterministyczność generatora.
 *
 * @returns true jeśli generator jest deterministyczny
 */
export function verifyIdGeneratorDeterminism(): boolean {
  // Reset kontekstu
  const savedContext = { ...globalContext };
  resetIdGeneratorContext();

  // Test 1: Ten sam input = ten sam output
  const id1 = generateDeterministicSymbolId('Bus', 0, 1, 'test');
  resetIdGeneratorContext();
  const id2 = generateDeterministicSymbolId('Bus', 0, 1, 'test');

  // Test 2: Różne inputy = różne outputy
  const id3 = generateDeterministicSymbolId('Bus', 1, 1, 'test');
  const id4 = generateDeterministicSymbolId('LineBranch', 0, 1, 'test');

  // Przywróć kontekst
  globalContext = savedContext;

  return id1 === id2 && id1 !== id3 && id1 !== id4 && id3 !== id4;
}
