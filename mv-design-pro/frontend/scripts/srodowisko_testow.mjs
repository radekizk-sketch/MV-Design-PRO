// ŚRODOWISKO TESTÓW VITEST WYZNACZANE REGUŁĄ — `node` dla plików bez DOM, `jsdom` dla reszty.
//
// Po co (karta SZYBKIE-TESTY-2, dyrektywa właściciela 2026-10-28). Środowisko `jsdom` dla
// KAŻDEGO pliku testów kosztowało w pełnym biegu 457 s tworzenia środowiska (pomiar
// `/tmp/claude-0/logs/bramka5.log`, 897 plików): każdy plik w świeżym procesie ładuje jsdom
// i buduje okno, także plik, który liczy wyłącznie geometrię albo kontrakt danych. Plik bez
// DOM dostaje środowisko `node` — komentarzem `@vitest-environment node` w pierwszym wierszu,
// wpisywanym przez TEN skrypt, nigdy ręcznie.
//
// REGUŁA (jedno źródło prawdy; test `src/test/__tests__/srodowiskoTestow.test.ts` przypina
// ją iniekcjami i wymaga zgodności komentarza KAŻDEGO pliku testów z jej wynikiem — w obie
// strony). Plik testów biegnie w `node` wtedy i tylko wtedy, gdy w domknięciu jego importów
// lokalnych (import statyczny, `import()`, `require`, `vi.mock`/`vi.doMock`/`vi.importActual`/
// `vi.importMock`; plik testów i każdy osiągnięty moduł `src`):
//   1. żaden identyfikator w pozycji WARTOŚCI (nie typu, nie nazwy właściwości) nie odwołuje
//      się do globalnego, który środowisko jsdom podstawia albo dokłada — zbiór kluczy
//      wyznacza ta sama funkcja vitest, która podstawia je w biegu (`populateGlobal`
//      z `vitest/environments`, wywołana na atrapie globalnego obiektu Node), więc nie ma
//      drugiej, ręcznej listy „nazw DOM”; identyfikator jest globalny, gdy kompilator
//      TypeScript nie wiąże go z deklaracją w pliku (albo wiąże z deklaracją `declare global`);
//   2. nie ma dostępu `globalThis.<klucz>` / `global.<klucz>` / `self.<klucz>` ani dynamicznego
//      `globalThis[…]` i nie ma `import()` z nienapisowym argumentem;
//   3. każdy importowany pakiet należy do listy `PAKIETY_BEZ_DOM` (pakiety, które nie dotykają
//      DOM; `react` bez `react-dom` niczego nie renderuje), a każdy import względny rozwiązuje się
//      na plik.
//   4. WYJĄTEK W DRUGĄ STRONĘ — plik WYMAGA `node`, gdy domknięcie jego importów sięga modułu
//      spoza analizowanego zbioru (`src/**`; np. `vite.config.ts`), który importuje pakiet
//      narzędzi budowania (`IMPORT_NARZEDZI`: `vite`, `vitest/config`, `vitest/node`,
//      `esbuild`, `@vitejs/*`).
//      Taki moduł w jsdom pada przy imporcie (esbuild sprawdza niezmiennik `TextEncoder`
//      ↔ `Uint8Array`, który jsdom łamie), więc warunek 4 wygrywa z przyczynami 1–3.
//      Pomiar 2026-10-29: `src/test/__tests__/plikiBudzetuCzasu.test.ts` (import `vite.config`)
//      w jsdom dał „Invariant violation: new TextEncoder().encode("") instanceof Uint8Array”.
//   5. Plik testów BUDŻETU CZASU PROCESORA (treść importuje `czasProcesora` — predykat
//      `IMPORT_POMOCNIKA_CZASU` z `scripts/budzety_czasu.mjs`, ten sam, którym `vite.config.ts`
//      wybiera krok `--mode budzety`) zostaje w `jsdom` bez względu na warunki 1–3: budżety
//      skalibrowano w `jsdom`, a pomiar 2026-10-29 (krok budżetów, te same pliki, `node` zamiast
//      `jsdom`) dał czasy plików 1,4–1,7 × dłuższe w trzech biegach (np. `buildScene.p1Recenzja`
//      31,1 s → 43,7 / 44,6 / 51,7 s), czyli zjadał zapas budżetu. Zysk z `node` dla siedmiu
//      plików to ~2 s tworzenia środowiska — nie jest wart ruchu kalibracji. Warunek 4 ma
//      pierwszeństwo (taki plik w `jsdom` nie startuje).
// Kierunek błędu reguły jest zawsze bezpieczny: wątpliwość (nierozwiązany import, pakiet spoza
// listy, `typeof window`) daje `jsdom`. Plik `node`, który mimo to sięgnąłby DOM, pada głośno
// (`ReferenceError`), a nie przechodzi po cichu inną ścieżką — gałąź `typeof window` jest
// odwołaniem do klucza i sama wybiera `jsdom`.
//
// Użycie (z katalogu `frontend/`):
//   node scripts/srodowisko_testow.mjs --zapisz    # wpisz/usuń komentarze wg reguły
//   node scripts/srodowisko_testow.mjs --sprawdz   # kod 1, gdy komentarz odbiega od reguły
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { IMPORT_POMOCNIKA_CZASU } from './budzety_czasu.mjs';

/** Komentarz środowiska w pierwszym wierszu pliku `node` (składany, żeby vitest nie czytał go z tego pliku). */
export const ZNACZNIK_NODE = '// @' + 'vitest-environment node';
/** Przyczyna `jsdom` pliku budżetu czasu procesora (warunek 5 reguły). */
export const PRZYCZYNA_BUDZETU = 'plik budżetu czasu procesora — środowisko kalibracji budżetów (jsdom)';
/** Każdy komentarz środowiska vitest/jest — usuwany z plików, którym reguła daje `jsdom`. */
const ZNACZNIK_DOWOLNY = new RegExp('^//\\s*@(?:vitest|jest)-' + 'environment\\s+\\S+\\s*$');

/**
 * Pakiety bez DOM (nazwa pakietu albo wbudowany moduł Node bez `node:`). Pakiet spoza listy
 * daje `jsdom`. `zustand` i `react` — wyłącznie wejście główne (`zustand/middleware` niesie
 * `persist` z `localStorage`, `react-dom` renderuje do DOM).
 */
export const PAKIETY_BEZ_DOM = new Set([
  'vitest',
  'assert',
  'child_process',
  'crypto',
  'fs',
  'module',
  'os',
  'path',
  'url',
  'util',
  'worker_threads',
  'clsx',
  'tailwind-merge',
  'zod',
  'zustand',
  'katex',
  'react',
]);
const WEJSCIE_GLOWNE_TYLKO = new Set(['zustand', 'react']);
/** Import pakietu narzędzi budowania w module spoza analizowanego zbioru (warunek 4 reguły). */
const IMPORT_NARZEDZI =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)['"](vite|vitest\/config|vitest\/node|esbuild|@vitejs\/[^'"]+)['"]/m;
const DOPUSZCZONE_PODSCIEZKI = new Set(['react/jsx-runtime', 'react/jsx-dev-runtime']);
const ZASOBY_BEZ_KODU = /\.(css|scss|svg|png|jpe?g|gif|woff2?)(\?.*)?$/;
const PLIK_TESTU = /\.(test|spec)\.tsx?$/;
const ROZSZERZENIA = ['', '.ts', '.tsx', '.js', '.mjs', '.json', '/index.ts', '/index.tsx', '/index.js'];

function plikiZrodel(katalog) {
  return readdirSync(katalog, { withFileTypes: true }).flatMap((wpis) => {
    const sciezka = join(katalog, wpis.name);
    if (wpis.isDirectory()) return wpis.name === 'node_modules' ? [] : plikiZrodel(sciezka);
    return /\.tsx?$/.test(wpis.name) && !wpis.name.endsWith('.d.ts') ? [sciezka] : [];
  });
}

function rozwiazWzgledny(zrodlo, specyfikator) {
  for (const rozszerzenie of ROZSZERZENIA) {
    const sciezka = resolve(dirname(zrodlo), specyfikator + rozszerzenie);
    if (existsSync(sciezka) && statSync(sciezka).isFile()) return sciezka;
  }
  return null;
}

/** Klucze globalne, które środowisko jsdom vitest podstawia albo dokłada (`populateGlobal`). */
export async function kluczeJsdom(korzen) {
  const wymagaj = createRequire(join(korzen, 'package.json'));
  const { JSDOM } = wymagaj('jsdom');
  const { populateGlobal } = await import(
    pathToFileURL(join(korzen, 'node_modules', 'vitest', 'dist', 'environments.js')).href
  );
  // Atrapa globalnego obiektu CZYSTEGO procesu Node (osobny proces): w procesie, który już ma
  // środowisko jsdom (np. ten test pod vitest), globalny obiekt niesie podstawione klucze
  // i `populateGlobal` pominąłby je jako „obecne w Node”.
  const nazwyNode = JSON.parse(
    execFileSync(process.execPath, ['-p', 'JSON.stringify(Object.getOwnPropertyNames(globalThis))'], {
      encoding: 'utf-8',
    }),
  );
  const atrapa = {};
  for (const klucz of nazwyNode) atrapa[klucz] = true;
  // Te same opcje okna co środowisko `jsdom` vitest (adres — `localStorage` wymaga pochodzenia).
  const okno = new JSDOM('<!DOCTYPE html>', { pretendToBeVisual: true, url: 'http://localhost:3000' })
    .window;
  const { keys } = populateGlobal(atrapa, okno, { bindFunctions: true });
  okno.close();
  return new Set(keys);
}

/**
 * Klasyfikacja plików testów `src/**`: ścieżka względna (separator `/`) → `null` (środowisko
 * `node`) albo łańcuch przyczyny `jsdom` (plik testów → … → moduł → przyczyna).
 */
export async function klasyfikujTesty(korzen, { pliki = null } = {}) {
  const wymagaj = createRequire(join(korzen, 'package.json'));
  const ts = wymagaj('typescript');
  const klucze = await kluczeJsdom(korzen);
  const wszystkie = pliki ?? plikiZrodel(join(korzen, 'src'));
  const analizowane = new Set(wszystkie.map((p) => resolve(p)));
  const program = ts.createProgram(wszystkie, {
    noLib: true,
    noResolve: true,
    types: [],
    jsx: ts.JsxEmit.ReactJSX,
    allowJs: false,
  });
  const sprawdzacz = program.getTypeChecker();

  const wGlobalnymRozszerzeniu = (deklaracja) => {
    for (let w = deklaracja; w; w = w.parent) {
      if (ts.isModuleDeclaration(w) && (w.flags & ts.NodeFlags.GlobalAugmentation) !== 0) return true;
    }
    return false;
  };
  // Identyfikator jest globalny, gdy nie wiąże się z deklaracją pliku: brak symbolu, symbol
  // wbudowany kompilatora bez deklaracji (`globalThis`) albo deklaracja w `declare global`.
  const globalnySymbol = (symbol) =>
    symbol === undefined ||
    (symbol.declarations ?? []).length === 0 ||
    symbol.declarations.some((d) => wGlobalnymRozszerzeniu(d));
  const wPozycjiTypu = (wezel) => {
    for (let w = wezel.parent; w; w = w.parent) {
      if (ts.isTypeNode(w) || ts.isInterfaceDeclaration(w) || ts.isTypeAliasDeclaration(w)) return true;
      if (ts.isHeritageClause(w)) return w.token === ts.SyntaxKind.ImplementsKeyword;
      if (ts.isExpressionWithTypeArguments(w)) continue;
      if (ts.isExpression(w) || ts.isStatement(w) || ts.isSourceFile(w)) return false;
    }
    return false;
  };
  const nazwaNieodwolanie = (id) => {
    const r = id.parent;
    return (
      ((ts.isPropertyAccessExpression(r) || ts.isPropertyAccessChain?.(r)) && r.name === id) ||
      ((ts.isPropertyAssignment(r) ||
        ts.isPropertyDeclaration(r) ||
        ts.isPropertySignature(r) ||
        ts.isMethodDeclaration(r) ||
        ts.isMethodSignature(r) ||
        ts.isGetAccessorDeclaration(r) ||
        ts.isSetAccessorDeclaration(r) ||
        ts.isEnumMember(r)) &&
        r.name === id) ||
      (ts.isBindingElement(r) && r.propertyName === id) ||
      (ts.isQualifiedName(r) && r.right === id) ||
      ts.isJsxAttribute(r) ||
      ts.isImportSpecifier(r) ||
      ts.isExportSpecifier(r) ||
      ts.isImportClause(r) ||
      ts.isNamespaceImport(r) ||
      ts.isLabeledStatement(r) ||
      ts.isBreakOrContinueStatement(r)
    );
  };
  const OBIEKTY_GLOBALNE = new Set(['globalThis', 'global', 'self', 'window']);

  /** Przyczyny `jsdom` WŁASNE pliku i jego zależności lokalne (bez domknięcia). */
  const analizuj = (plikZrodla) => {
    const przyczyny = [];
    const zaleznosci = [];
    const wymagaNode = [];
    const miejsce = (wezel) =>
      `${relative(korzen, plikZrodla.fileName).split(sep).join('/')}:${
        plikZrodla.getLineAndCharacterOfPosition(wezel.getStart(plikZrodla)).line + 1
      }`;
    const specyfikator = (tekst, wezel) => {
      if (tekst.startsWith('.')) {
        const cel = rozwiazWzgledny(plikZrodla.fileName, tekst);
        const narzedzia =
          cel !== null && !analizowane.has(cel) && /\.(tsx?|mjs|js)$/.test(cel)
            ? IMPORT_NARZEDZI.exec(readFileSync(cel, 'utf-8'))
            : null;
        if (narzedzia !== null) {
          wymagaNode.push(
            `moduł „${relative(korzen, cel).split(sep).join('/')}” importuje „${narzedzia[1]}” (${miejsce(wezel)})`,
          );
        } else if (cel !== null) {
          if (/\.tsx?$/.test(cel)) zaleznosci.push(cel);
          else if (!cel.endsWith('.json')) przyczyny.push(`moduł poza analizą „${tekst}” (${miejsce(wezel)})`);
        } else if (!ZASOBY_BEZ_KODU.test(tekst)) {
          przyczyny.push(`nierozwiązany import „${tekst}” (${miejsce(wezel)})`);
        }
        return;
      }
      const bezNode = tekst.startsWith('node:') ? tekst.slice(5) : tekst;
      const pakiet = bezNode.startsWith('@')
        ? bezNode.split('/').slice(0, 2).join('/')
        : bezNode.split('/')[0];
      const dopuszczony =
        PAKIETY_BEZ_DOM.has(pakiet) &&
        (!WEJSCIE_GLOWNE_TYLKO.has(pakiet) || bezNode === pakiet || DOPUSZCZONE_PODSCIEZKI.has(bezNode));
      if (!dopuszczony) przyczyny.push(`pakiet „${tekst}” (${miejsce(wezel)})`);
    };
    const idz = (wezel) => {
      if (ts.isImportDeclaration(wezel) || ts.isExportDeclaration(wezel)) {
        const tylkoTypy = ts.isImportDeclaration(wezel) ? wezel.importClause?.isTypeOnly : wezel.isTypeOnly;
        if (!tylkoTypy && wezel.moduleSpecifier && ts.isStringLiteral(wezel.moduleSpecifier)) {
          specyfikator(wezel.moduleSpecifier.text, wezel);
        }
        return;
      }
      if (ts.isImportEqualsDeclaration(wezel)) {
        przyczyny.push(`import = (${miejsce(wezel)})`);
        return;
      }
      if (ts.isCallExpression(wezel)) {
        const wolany = wezel.expression;
        const nazwa =
          wolany.kind === ts.SyntaxKind.ImportKeyword
            ? 'import'
            : ts.isIdentifier(wolany) || ts.isPropertyAccessExpression(wolany)
              ? wolany.getText(plikZrodla)
              : '';
        if (['import', 'require', 'vi.mock', 'vi.doMock', 'vi.importActual', 'vi.importMock'].includes(nazwa)) {
          const argument = wezel.arguments[0];
          if (argument !== undefined && ts.isStringLiteralLike(argument)) specyfikator(argument.text, wezel);
          else przyczyny.push(`${nazwa}() z nienapisowym argumentem (${miejsce(wezel)})`);
        }
      }
      if (ts.isIdentifier(wezel) && klucze.has(wezel.text) && !nazwaNieodwolanie(wezel) && !wPozycjiTypu(wezel)) {
        const symbol = ts.isShorthandPropertyAssignment(wezel.parent)
          ? sprawdzacz.getShorthandAssignmentValueSymbol(wezel.parent)
          : sprawdzacz.getSymbolAtLocation(wezel);
        if (globalnySymbol(symbol)) przyczyny.push(`globalny „${wezel.text}” środowiska jsdom (${miejsce(wezel)})`);
      }
      if (
        ts.isIdentifier(wezel) &&
        OBIEKTY_GLOBALNE.has(wezel.text) &&
        !nazwaNieodwolanie(wezel) &&
        !wPozycjiTypu(wezel) &&
        globalnySymbol(sprawdzacz.getSymbolAtLocation(wezel))
      ) {
        // Obiekt globalny: wolno wyłącznie odczytać z niego nazwę spoza kluczy jsdom
        // (`(globalThis as …).WeakRef`). Klucz, dostęp dynamiczny i każde inne użycie (alias
        // `const g = globalThis`, przekazanie dalej) wybierają jsdom.
        let uzycie = wezel;
        while (
          ts.isParenthesizedExpression(uzycie.parent) ||
          ts.isAsExpression(uzycie.parent) ||
          ts.isTypeAssertionExpression(uzycie.parent) ||
          ts.isNonNullExpression(uzycie.parent) ||
          ts.isSatisfiesExpression(uzycie.parent)
        ) {
          uzycie = uzycie.parent;
        }
        const rodzic = uzycie.parent;
        if (ts.isPropertyAccessExpression(rodzic) && rodzic.expression === uzycie) {
          if (klucze.has(rodzic.name.text)) {
            przyczyny.push(`${wezel.text}.${rodzic.name.text} (${miejsce(wezel)})`);
          }
        } else if (ts.isElementAccessExpression(rodzic) && rodzic.expression === uzycie) {
          przyczyny.push(`dynamiczny dostęp ${wezel.text}[…] (${miejsce(wezel)})`);
        } else {
          przyczyny.push(`${wezel.text} jako wartość (${miejsce(wezel)})`);
        }
      }
      ts.forEachChild(wezel, idz);
    };
    idz(plikZrodla);
    return { przyczyny, zaleznosci, wymagaNode };
  };

  const analiza = new Map();
  for (const plikZrodla of program.getSourceFiles()) analiza.set(resolve(plikZrodla.fileName), analizuj(plikZrodla));

  const przyczynaJsdom = (plik, odwiedzone) => {
    if (odwiedzone.has(plik)) return null;
    odwiedzone.add(plik);
    const wynik = analiza.get(plik);
    if (wynik === undefined) return [`plik poza analizą: ${relative(korzen, plik)}`];
    if (wynik.przyczyny.length > 0) return [wynik.przyczyny[0]];
    for (const zaleznosc of wynik.zaleznosci) {
      const lancuch = przyczynaJsdom(zaleznosc, odwiedzone);
      if (lancuch !== null) return [relative(korzen, zaleznosc).split(sep).join('/'), ...lancuch];
    }
    return null;
  };
  // Warunek 4: domknięcie lokalnych zależności sięga modułu narzędzi budowania — `node`.
  const wymagaNode = (plik, odwiedzone) => {
    if (odwiedzone.has(plik)) return false;
    odwiedzone.add(plik);
    const wynik = analiza.get(plik);
    if (wynik === undefined) return false;
    return wynik.wymagaNode.length > 0 || wynik.zaleznosci.some((z) => wymagaNode(z, odwiedzone));
  };
  const wynik = new Map();
  for (const plik of wszystkie.filter((p) => PLIK_TESTU.test(p)).sort()) {
    const sciezka = resolve(plik);
    let przyczyna;
    if (wymagaNode(sciezka, new Set())) przyczyna = null;
    else if (IMPORT_POMOCNIKA_CZASU.test(readFileSync(sciezka, 'utf-8'))) przyczyna = [PRZYCZYNA_BUDZETU];
    else przyczyna = przyczynaJsdom(sciezka, new Set());
    wynik.set(relative(korzen, plik).split(sep).join('/'), przyczyna);
  }
  return wynik;
}

/** Treść pliku z komentarzem środowiska zgodnym z klasyfikacją (`node` = pierwszy wiersz). */
export function trescZeZnacznikiem(tresc, srodowiskoNode) {
  const wiersze = tresc.split('\n');
  const bez = ZNACZNIK_DOWOLNY.test(wiersze[0] ?? '') ? wiersze.slice(1) : wiersze;
  return (srodowiskoNode ? [ZNACZNIK_NODE, ...bez] : bez).join('\n');
}

/** Rozbieżności komentarzy plików z regułą: lista `[plik, oczekiwane, przyczyna]`. */
export function rozbieznosci(korzen, klasyfikacja) {
  const lista = [];
  for (const [plik, przyczyna] of klasyfikacja) {
    const tresc = readFileSync(join(korzen, plik), 'utf-8');
    if (trescZeZnacznikiem(tresc, przyczyna === null) !== tresc) {
      lista.push([plik, przyczyna === null ? 'node' : 'jsdom', przyczyna]);
    }
  }
  return lista;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const korzen = process.cwd();
  const tryb = process.argv[2];
  if (tryb !== '--zapisz' && tryb !== '--sprawdz') {
    console.error('użycie: node scripts/srodowisko_testow.mjs --zapisz|--sprawdz');
    process.exit(2);
  }
  const klasyfikacja = await klasyfikujTesty(korzen);
  const lista = rozbieznosci(korzen, klasyfikacja);
  if (tryb === '--zapisz') {
    for (const [plik, oczekiwane] of lista) {
      const sciezka = join(korzen, plik);
      writeFileSync(sciezka, trescZeZnacznikiem(readFileSync(sciezka, 'utf-8'), oczekiwane === 'node'));
    }
  }
  const node = [...klasyfikacja.values()].filter((p) => p === null).length;
  console.log(`plików testów: ${klasyfikacja.size}, node: ${node}, jsdom: ${klasyfikacja.size - node}`);
  console.log(`${tryb === '--zapisz' ? 'zapisane' : 'rozbieżne'}: ${lista.length}`);
  for (const [plik, oczekiwane, przyczyna] of lista) {
    console.log(`  ${plik} → ${oczekiwane}${przyczyna ? `  [${przyczyna.join(' ← ')}]` : ''}`);
  }
  process.exit(tryb === '--sprawdz' && lista.length > 0 ? 1 : 0);
}
