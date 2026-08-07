/**
 * KARTA S9-10 — wspólny pomocnik UNIKALNOŚCI `testId` (karta następcza
 * nazwana w rejestrze S9-4: „przenieść `unikalnyTestId` do wspólnego
 * pomocnika i użyć go w obu kompozycjach").
 *
 * KLASA DEFEKTU (S9-4, naprawiona wtedy WYŁĄCZNIE w `compose/gpz.ts::
 * buildFieldStack`): formuła `⟨ref pola⟩#⟨symbolId⟩` nadaje DWÓM aparatom
 * tego samego rodzaju w JEDNYM polu ten sam identyfikator — `querySelector`
 * po testId trafia zawsze w pierwszy, a klik w drugi jest nieodróżnialny od
 * kliku w pierwszy (pomiar S9-10: pole z dwoma odłącznikami `v2/ds-bus`/
 * `v2/ds-line` dawało jeden testId dla obu, więc warstwa trafień nie mogła
 * przenieść `deviceRef` drugiego aparatu).
 *
 * KONTRAKT (identyczny z S9-4): PIERWSZE wystąpienie zachowuje identyfikator
 * bazowy bez zmian (istniejące odwołania — testy, e2e, nakładki — zostają
 * ważne), każde powtórzenie dostaje przyrostek porządkowy `-2`, `-3`, …
 * Zakres liczników = jedna fabryka (jedno wywołanie `createUnikalnyTestId`),
 * czyli jedna kompozycja/scena — refy pól są globalnie unikalne, więc
 * kolizje występują wyłącznie wewnątrz tego zakresu.
 */
export function createUnikalnyTestId(): (bazowy: string | undefined) => string | undefined {
  const uzyte = new Map<string, number>();
  return (bazowy) => {
    if (bazowy == null) return undefined;
    const wystapienie = (uzyte.get(bazowy) ?? 0) + 1;
    uzyte.set(bazowy, wystapienie);
    return wystapienie === 1 ? bazowy : `${bazowy}-${wystapienie}`;
  };
}
