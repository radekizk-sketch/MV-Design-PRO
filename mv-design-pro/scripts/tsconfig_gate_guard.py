#!/usr/bin/env python3
"""Guard KLASY „kod poza zasięgiem bramki typów”.

DŁUG, KTÓRY TO PRZYPINA (karta TYPY-POZA-BRAMKA)
------------------------------------------------
`npm run type-check` sprawdza DOKŁADNIE to, co stoi w `frontend/tsconfig.json`
w polach `include`/`exclude` — ani pliku więcej. Kod spoza tego zasięgu nie ma
ŻADNEJ wyroczni typów, a wygląda jak pilnowany, bo bramka w CI świeci na zielono.

POMIAR NA HEAD PRZED NAPRAWĄ (2026-08-08): pod `include: ["src"]` i pięcioma
wykluczeniami żyły 133 błędy typów, których nie widział nikt:
  * `scripts/` — CAŁY katalog poza `include` (37 błędów w skryptach renderu
    dowodowego; jeden z nich podawał do renderu aparaty pola z `deviceRef ===
    undefined`, bo skrypt budował kształt ENM zamiast kontraktu widoku);
  * `e2e/` — CAŁY katalog poza `include` (51 błędów; w SIEDMIU specyfikacjach
    rzutowanie `as typeof readiness` celowało w typ zawężony do `null`, więc
    odpowiedź backendu wchodziła do testu jako `null`, a cały blok domykania
    blokerów gotowości był nietypowany);
  * `src/ui/sld/core/**` + `src/ui/sld/inspector/**` + `src/ui/sld/*.ts` — 52
    błędy w martwej wyspie, której 22 błędy to ZEPSUTE IMPORTY (moduły
    nieistniejące w repozytorium). Kod, którego nie da się zaimportować, żył
    latami, bo wykluczenie zdejmowało z niego wyrocznię;
  * `src/ui/results-inspector/ResultsInspectorPage.tsx` — wykluczenie na
    POJEDYNCZYM PLIKU, który importował nieistniejący moduł;
  * `playwright.config.ts` — plik w korzeniu `frontend/`, nieobjęty ŻADNYM
    projektem TypeScriptu.
Trzy fikstury sceny miały ZŁĄ liczbę segmentów `../` w `import type` — błąd
niewidoczny podwójnie (esbuild kasuje `import type` przed rozwiązaniem ścieżki,
a tsconfig wyklucza testy).

DLACZEGO ŻADEN ISTNIEJĄCY GUARD TEGO NIE WIDZIAŁ
------------------------------------------------
Bo wszystkie pytały narzędzia, a nie o ZASIĘG narzędzia. `npm run type-check`
melduje zieleń zgodnie z prawdą — po prostu na zbiorze węższym, niż każdy
zakładał. To ta sama klasa co „router zdefiniowany, nigdy niezamontowany”
(`router_mount_guard`) i „mypy skonfigurowany, nigdy nieuruchamiany”
(`mypy_ratchet_guard`): zdolność istnieje, tylko nie działa na tym zbiorze, na
którym wszyscy myślą, że działa.

REGUŁA
------
1. KAŻDY katalog/plik źródłowy `.ts`/`.tsx` we `frontend/` jest albo objęty
   `include`, albo stoi na jawnej liście `POZA_BRAMKA` z uzasadnieniem
   MERYTORYCZNYM i ZMIERZONYM długiem.
2. `exclude` jest ZAMROŻONE (`DOPUSZCZONE_WYKLUCZENIA`). Nowy wpis = naruszenie;
   wykluczenie NIE JEST naprawą błędu typów.
3. Opcje rygoru (`strict`, `noUnusedLocals`, …) są ZAMROŻONE — inaczej dług
   dałoby się „naprawić” rozbrojeniem kompilatora, czego licznik błędów by nie
   zauważył (zobaczyłby SPADEK i poprosił o obniżenie progu).
4. Skrypt `type-check` w `package.json` jest ZAMROŻONY — bramka przekierowana na
   inny projekt przestaje być tą bramką, którą opisuje ten guard.
5. Dług typów POZA bramką ma ZAMROŻONY budżet; błędy WEWNĄTRZ bramki są
   naruszeniem twardym, niezależnie od budżetu.

ZAPADKA W OBIE STRONY (wzór: `mypy_ratchet_guard` — próg liczby błędów;
`router_mount_guard` — zamrożona lista świadomie odstawionych + budżet).
Gdy dług UROŚNIE — czerwono. Gdy ZMALEJE — też czerwono, z żądaniem obniżenia
progu: bez utrwalenia poprawy dług wraca po cichu pod tym samym adresem.

PUSTY SKAN JEST BŁĘDEM, NIE SUKCESEM. Guard, który nie znalazł plików albo nie
zdołał uruchomić `tsc`, kończy się błędem — nigdy zielenią.

FORMY, KTÓRYCH TEN GUARD NIE WYKRYWA — nazwane wprost
-----------------------------------------------------
Granica opisana jest granicą; granica przemilczana jest dziurą.

  1. **Poszerzenie typu do `any`/`unknown` w kodzie źródłowym.** Licznik błędów
     spadnie, guard poprosi o obniżenie progu i utrwali fikcję. Statycznie
     nierozróżnialne od prawdziwej naprawy — pilnuje tego RECENZJA, nie skrypt.
     Wykrywalny jest tylko wariant jawny: `@ts-expect-error`/`@ts-ignore`/
     `@ts-nocheck` ma osobny, zamrożony budżet (`BUDZET_WYCISZEN`).
  2. **Nowy plik konfiguracyjny TypeScriptu** (`tsconfig.*.json`) z luźniejszymi
     opcjami — dlatego zbiór plików `tsconfig*.json` jest ZAMROŻONY
     (`DOPUSZCZONE_TSCONFIG`), a nie skanowany „na oko”.
  3. **Kod pod rozszerzeniem, którego `tsc` nie czyta** (`.js`, `.mjs`, `.cjs`
     bez `allowJs`). Katalog `frontend/scripts` ma 20 plików `.mjs` — one NIE SĄ
     sprawdzane i ten guard tego nie zmienia; zmienia to dopiero `allowJs`
     albo przepisanie na `.ts`. Nazwane, nie przemilczane.
  4. **Rygor spoza `compilerOptions`** (np. `skipLibCheck` ukrywa błędy w
     `node_modules/@types`). Świadomie poza zakresem: to dług cudzych paczek.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
TSCONFIG = FRONTEND / "tsconfig.json"
PACKAGE_JSON = FRONTEND / "package.json"

#: Zasięg bramki. Zmiana tej listy wymaga zmiany `tsconfig.json` — i odwrotnie
#: (pilnuje tego `test_zamrozenia_zgadzaja_sie_z_plikiem_repozytorium`).
WYMAGANY_INCLUDE = ("src", "scripts", "e2e", "playwright.config.ts")

#: JEDYNE dopuszczone wykluczenia. Uzasadnienie stoi w `tsconfig.json` przy polu
#: `exclude`; tu jest zamrożenie. Nowy wpis = naruszenie.
DOPUSZCZONE_WYKLUCZENIA = (
    "src/**/*.test.ts",
    "src/**/*.test.tsx",
    "src/**/__tests__/**/*",
)

#: Opcje rygoru, które muszą pozostać włączone. `strict` implikuje
#: `noImplicitAny`/`strictNullChecks`; wypisane osobno te, które łatwo zdjąć
#: „przy okazji”.
WYMAGANE_OPCJE = {
    "strict": True,
    "noUnusedLocals": True,
    "noUnusedParameters": True,
    "noFallthroughCasesInSwitch": True,
    "noEmit": True,
}

#: Bramka wywoływana przez CI (`.github/workflows/frontend-checks.yml`, krok
#: „Type check”). Przekierowanie tego skryptu na inny projekt unieważnia pomiar.
WYMAGANY_SKRYPT_TYPE_CHECK = "tsc --noEmit"

#: Zamrożony zbiór projektów TypeScriptu we `frontend/`.
DOPUSZCZONE_TSCONFIG = ("tsconfig.json", "tsconfig.node.json")

#: Katalogi/pliki źródłowe ŚWIADOMIE poza bramką — z uzasadnieniem MERYTORYCZNYM
#: i zmierzonym długiem. „Poza zakresem karty” NIE jest uzasadnieniem.
POZA_BRAMKA: dict[str, str] = {
    "vite.config.ts": (
        "objety OSOBNYM projektem `tsconfig.node.json` (referencja z `tsconfig.json`), "
        "bo wymaga `allowSyntheticDefaultImports` i typow Node, ktorych projekt aplikacji "
        "nie wlacza. Zero bledow. UWAGA: `tsc --noEmit` z korzenia NIE buduje referencji "
        "(potrzebne `tsc -b`), wiec byl to projekt, ktorego nikt nie uruchamial — dlatego "
        "ten guard odpala go osobno (`zmierz_projekt_node`) i traktuje kazdy blad jako "
        "naruszenie twarde."
    ),
}

#: Katalogi bez kodu zrodlowego projektu — pomijane w skanie zasięgu.
POMIJANE_KATALOGI = {
    "node_modules",
    "dist",
    "coverage",
    "playwright-report",
    "test-results",
    ".vite",
}

# --------------------------------------------------------------------------
# ZAMROŻONY DŁUG TYPÓW POZA BRAMKĄ (pomiar 2026-08-08, karta TYPY-POZA-BRAMKA).
# Ta liczba MA MALEĆ. Podniesienie wymaga uzasadnienia w commicie i wpisu w
# rejestrze — inaczej zapadka przestaje być zapadką.
#
# STAN W CHWILI ZAŁOŻENIA: 133 błędy poza bramką zdjęte U ŹRÓDŁA (kasacja
# martwej wyspy SLD, naprawy w `scripts/`, fiksturach sceny i `e2e/`), zostaje
# WYŁĄCZNIE dług testów jednostkowych:
#   * `src/**/__tests__` + `*.test.ts(x)`: 531 błędów (pomiar 2026-08-14 po
#     karcie SLD-GEN-POLA; wcześniej 532 po PULPIT-NBA, 552 w 161 plikach).
#     Spadek o 1: fikstury szablonów pól (`BayTemplatePicker.test.tsx`,
#     `SwitchgearTemplateStepper.test.tsx`) niosą teraz wymagane przez kontrakt
#     `base_template`, więc przestały być niezgodne z typem.
# `e2e/` i `playwright.config.ts` weszły DO bramki (0 błędów) — nie są już
# długiem, tylko zasięgiem.
BUDZET_BLEDOW_POZA_BRAMKA = 531

#: Jawne wyciszenia błędów typu. Zamrożone, żeby nie dało się „obniżyć progu”
#: przez dopisanie komentarza zamiast naprawy. Pomiar 2026-08-08: 35 wystąpień,
#: WSZYSTKIE w plikach testowych.
BUDZET_WYCISZEN = 35

#: Zapadka na pusty skan: `frontend/src` to tysiące modułów. Mniej niż tyle
#: znaczy, że zmienił się układ katalogów, a nie że kodu ubyło.
MIN_PLIKOW_ZRODLOWYCH = 500

WZORZEC_BLEDU = re.compile(r"^(?P<plik>[^(\s][^(]*\.tsx?)\((?P<wiersz>\d+),\d+\): error TS")
WZORZEC_WYCISZENIA = re.compile(r"@ts-(expect-error|ignore|nocheck)")


def wczytaj_jsonc(sciezka: Path) -> dict:
    """Wczytaj `tsconfig.json` — TypeScript dopuszcza w nim komentarze.

    Komentarze zdejmuje AUTOMAT ZE STANEM, a nie wyrażenie regularne. Powód jest
    zmierzony, nie teoretyczny: pierwsza wersja używała `re.sub(r"/\\*.*?\\*/")`
    i zjadała fragment glob-a `src/**/__tests__/**/*`, bo `/**/` jest poprawnym
    komentarzem blokowym. Guard meldował wtedy, że z `exclude` zniknęły wpisy,
    które stały w pliku — czyli wyrocznia kłamała o dokumencie, który czytała.
    """
    tekst = sciezka.read_text(encoding="utf-8")
    wynik: list[str] = []
    i = 0
    w_napisie = False
    while i < len(tekst):
        znak = tekst[i]
        if w_napisie:
            wynik.append(znak)
            if znak == "\\" and i + 1 < len(tekst):
                wynik.append(tekst[i + 1])
                i += 2
                continue
            if znak == '"':
                w_napisie = False
            i += 1
            continue
        if znak == '"':
            w_napisie = True
            wynik.append(znak)
            i += 1
            continue
        if tekst.startswith("//", i):
            koniec = tekst.find("\n", i)
            i = len(tekst) if koniec == -1 else koniec
            continue
        if tekst.startswith("/*", i):
            koniec = tekst.find("*/", i + 2)
            i = len(tekst) if koniec == -1 else koniec + 2
            continue
        wynik.append(znak)
        i += 1
    return json.loads("".join(wynik))


def pliki_zrodlowe() -> list[Path]:
    """Wszystkie `.ts`/`.tsx` we `frontend/`, poza katalogami narzędziowymi."""
    znalezione: list[Path] = []
    for sciezka in FRONTEND.rglob("*"):
        if sciezka.suffix not in (".ts", ".tsx"):
            continue
        if any(czesc in POMIJANE_KATALOGI for czesc in sciezka.relative_to(FRONTEND).parts):
            continue
        znalezione.append(sciezka)
    return znalezione


def korzenie_zrodel(pliki: list[Path]) -> set[str]:
    """Pierwszy segment ścieżki każdego pliku źródłowego względem `frontend/`.

    Dla pliku w korzeniu (`vite.config.ts`) segmentem jest sama nazwa pliku —
    dzięki temu skan wykrywa TAK SAMO nowy katalog poza `include`, jak i nowy
    plik konfiguracyjny w korzeniu.
    """
    return {p.relative_to(FRONTEND).parts[0] for p in pliki}


def w_bramce(sciezka_wzgledna: str) -> bool:
    """Czy plik (ścieżka względem `frontend/`) jest w zasięgu bramki typów."""
    czesci = Path(sciezka_wzgledna).parts
    if not czesci or czesci[0] not in WYMAGANY_INCLUDE:
        return False
    if "__tests__" in czesci:
        return False
    nazwa = czesci[-1]
    return not (nazwa.endswith(".test.ts") or nazwa.endswith(".test.tsx"))


def zmierz_dlug() -> tuple[int, int, str]:
    """Uruchom `tsc` na PEŁNYM zbiorze; zwróć (błędy w bramce, poza bramką, wyjście).

    Pomiar musi odróżnić „zmierzono dług” od „nie udało się zmierzyć” — dokładnie
    ta sama pułapka, na której `mypy_ratchet_guard` raz już się przewrócił
    (przerwany bieg wyglądał jak spektakularny spadek długu i kończył się
    propozycją TRWAŁEGO rozbrojenia zapadki). Dlatego brak `tsc`, brak
    `node_modules` albo wyjście bez ani jednej rozpoznanej linii przy niezerowym
    kodzie wyjścia to BŁĄD, nie pomiar.
    """
    with tempfile.TemporaryDirectory() as katalog:
        konfiguracja = Path(katalog) / "tsconfig.pomiar.json"
        konfiguracja.write_text(
            json.dumps(
                {
                    "extends": str(TSCONFIG),
                    "include": [
                        str(FRONTEND / "src"),
                        str(FRONTEND / "scripts"),
                        str(FRONTEND / "e2e"),
                        str(FRONTEND / "playwright.config.ts"),
                    ],
                    "exclude": [],
                    "references": [],
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        wynik = subprocess.run(
            ["npx", "tsc", "-p", str(konfiguracja), "--noEmit"],
            cwd=FRONTEND,
            capture_output=True,
            text=True,
            check=False,
        )

    wyjscie = wynik.stdout + wynik.stderr
    w_bramce_bledy: list[str] = []
    poza_bramka_bledy: list[str] = []
    for linia in wyjscie.splitlines():
        dopasowanie = WZORZEC_BLEDU.match(linia)
        if dopasowanie is None:
            continue
        if w_bramce(dopasowanie.group("plik")):
            w_bramce_bledy.append(linia)
        else:
            poza_bramka_bledy.append(linia)

    if wynik.returncode != 0 and not (w_bramce_bledy or poza_bramka_bledy):
        raise SystemExit(
            "tsconfig_gate_guard: `tsc` zakonczyl sie kodem "
            f"{wynik.returncode}, ale nie zameldowal ANI JEDNEGO bledu w "
            "rozpoznawalnym formacie — pomiar dlugu NIE POWSTAL.\n"
            "Najczestsza przyczyna: srodowisko bez zaleznosci frontendu "
            "(`cd mv-design-pro/frontend && npm ci`).\n"
            f"Wyjscie:\n{wyjscie[-2000:]}"
        )

    globals()["_BLEDY_W_BRAMCE"] = w_bramce_bledy
    globals()["_BLEDY_POZA_BRAMKA"] = poza_bramka_bledy
    return len(w_bramce_bledy), len(poza_bramka_bledy), wyjscie


def zmierz_projekt_node() -> tuple[int, str]:
    """Sprawdź `tsconfig.node.json` — projekt referencyjny, którego `tsc --noEmit`
    z korzenia NIE buduje (referencje wymagają `tsc -b`). Bez tego `vite.config.ts`
    byłby „objęty projektem, którego nikt nie uruchamia”."""
    with tempfile.TemporaryDirectory() as katalog:
        # `tsconfig.node.json` ma `composite: true`, więc `tsc` zapisuje pamięć
        # podręczną kompilacji przyrostowej NAWET z `--noEmit`. Bez przekierowania
        # każdy bieg guarda zostawiałby w repozytorium `tsconfig.node.tsbuildinfo`
        # — wyrocznia, która brudzi drzewo robocze, uczy ignorować `git status`.
        wynik = subprocess.run(
            [
                "npx",
                "tsc",
                "-p",
                "tsconfig.node.json",
                "--noEmit",
                "--tsBuildInfoFile",
                str(Path(katalog) / "node.tsbuildinfo"),
            ],
            cwd=FRONTEND,
            capture_output=True,
            text=True,
            check=False,
        )
    wyjscie = wynik.stdout + wynik.stderr
    return sum(1 for linia in wyjscie.splitlines() if WZORZEC_BLEDU.match(linia)), wyjscie


def policz_wyciszenia(pliki: list[Path]) -> int:
    razem = 0
    for plik in pliki:
        try:
            razem += len(WZORZEC_WYCISZENIA.findall(plik.read_text(encoding="utf-8")))
        except (UnicodeDecodeError, PermissionError):
            continue
    return razem


def main() -> int:  # noqa: C901 — jedna sekwencja kontroli, rozbicie ukryłoby porządek
    naruszenia: list[str] = []

    if not TSCONFIG.exists():
        print(f"BLAD: brak {TSCONFIG}", file=sys.stderr)
        return 1
    konfiguracja = wczytaj_jsonc(TSCONFIG)

    # 1. Zasieg `include`.
    include = list(konfiguracja.get("include", []))
    if sorted(include) != sorted(WYMAGANY_INCLUDE):
        naruszenia.append(
            f"[zasieg-include] `tsconfig.json` `include` = {include}, oczekiwano "
            f"{list(WYMAGANY_INCLUDE)}. Zmiana zasiegu bramki wymaga zmiany "
            "`WYMAGANY_INCLUDE` w tym guardzie i uzasadnienia w commicie."
        )

    # 2. Zamrozone wykluczenia.
    exclude = sorted(konfiguracja.get("exclude", []))
    if exclude != sorted(DOPUSZCZONE_WYKLUCZENIA):
        nadmiarowe = sorted(set(exclude) - set(DOPUSZCZONE_WYKLUCZENIA))
        brakujace = sorted(set(DOPUSZCZONE_WYKLUCZENIA) - set(exclude))
        if nadmiarowe:
            naruszenia.append(
                f"[wykluczenie-poza-lista] nowe wykluczenia w `tsconfig.json`: "
                f"{nadmiarowe}. WYKLUCZENIE NIE JEST NAPRAWA — blad typow zdejmuje "
                "sie u zrodla (CLAUDE.md, Zero-Debt pkt 1)."
            )
        if brakujace:
            naruszenia.append(
                f"[wykluczenie-zdjete] z `tsconfig.json` zniknely wykluczenia "
                f"{brakujace} — jesli dlug naprawde zmalal, zdejmij je takze z "
                "`DOPUSZCZONE_WYKLUCZENIA` i obniz `BUDZET_BLEDOW_POZA_BRAMKA`."
            )

    # 3. Zamrozony rygor kompilatora.
    opcje = konfiguracja.get("compilerOptions", {})
    for nazwa, oczekiwana in WYMAGANE_OPCJE.items():
        if opcje.get(nazwa) != oczekiwana:
            naruszenia.append(
                f"[rygor-rozbrojony] `compilerOptions.{nazwa}` = "
                f"{opcje.get(nazwa)!r}, oczekiwano {oczekiwana!r}. Rozbrojenie "
                "kompilatora obniza licznik bledow bez naprawy — zapadka "
                "zobaczylaby SPADEK dlugu i utrwalila fikcje."
            )

    # 4. Zamrozony skrypt bramki i zbior projektow.
    skrypty = json.loads(PACKAGE_JSON.read_text(encoding="utf-8")).get("scripts", {})
    if skrypty.get("type-check") != WYMAGANY_SKRYPT_TYPE_CHECK:
        naruszenia.append(
            f"[bramka-przekierowana] `package.json` `type-check` = "
            f"{skrypty.get('type-check')!r}, oczekiwano "
            f"{WYMAGANY_SKRYPT_TYPE_CHECK!r} — CI wola ten skrypt, wiec jego "
            "podmiana unieważnia caly pomiar."
        )
    projekty = sorted(p.name for p in FRONTEND.glob("tsconfig*.json"))
    if projekty != sorted(DOPUSZCZONE_TSCONFIG):
        naruszenia.append(
            f"[nowy-projekt-ts] pliki `tsconfig*.json` we frontend/: {projekty}, "
            f"zamrozony zbior: {list(DOPUSZCZONE_TSCONFIG)}. Nowy projekt z "
            "luzniejszymi opcjami to obejscie tej bramki."
        )

    # 5. Skan zasiegu: kazdy korzen zrodel objety albo jawnie odstawiony.
    pliki = pliki_zrodlowe()
    if len(pliki) < MIN_PLIKOW_ZRODLOWYCH:
        print(
            f"BLAD: skan znalazl {len(pliki)} plikow zrodlowych (oczekiwane co "
            f"najmniej {MIN_PLIKOW_ZRODLOWYCH}) — PUSTY SKAN JEST BLEDEM, nie "
            "sukcesem.",
            file=sys.stderr,
        )
        return 1
    for korzen in sorted(korzenie_zrodel(pliki)):
        if korzen in WYMAGANY_INCLUDE or korzen in POZA_BRAMKA:
            continue
        naruszenia.append(
            f"[korzen-poza-bramka] `frontend/{korzen}` zawiera kod .ts/.tsx, a nie "
            "jest ani w `include`, ani w `POZA_BRAMKA` z uzasadnieniem. To DOKLADNIE "
            "ta klasa, ktora ten guard zaklada: kod bez wyroczni typow, wygladajacy "
            "na pilnowany."
        )
    nieaktualne = sorted(set(POZA_BRAMKA) - korzenie_zrodel(pliki))
    if nieaktualne:
        naruszenia.append(
            f"[odstawione-nieaktualne] wpisy `POZA_BRAMKA` bez kodu w repozytorium: "
            f"{nieaktualne} — usun je, inaczej nieaktualny wpis zamienia sie w ciche "
            "wykluczenie czekajace na przyszly plik pod tym samym adresem."
        )

    # 6. Zamrozony budzet jawnych wyciszen.
    wyciszenia = policz_wyciszenia(pliki)
    if wyciszenia > BUDZET_WYCISZEN:
        naruszenia.append(
            f"[wyciszenia-urosly] `@ts-expect-error`/`@ts-ignore`/`@ts-nocheck`: "
            f"{wyciszenia} (budzet {BUDZET_WYCISZEN}). Wyciszenie nie jest naprawa."
        )
    elif wyciszenia < BUDZET_WYCISZEN:
        naruszenia.append(
            f"[wyciszenia-zmalaly] wyciszen jest {wyciszenia} (budzet "
            f"{BUDZET_WYCISZEN}) — obniz `BUDZET_WYCISZEN` do {wyciszenia}."
        )

    # 7. Pomiar dlugu + zapadka w obie strony.
    w_bramce_bledy, poza_bramka_bledy, _ = zmierz_dlug()
    bledy_node, wyjscie_node = zmierz_projekt_node()

    print(
        f"tsconfig_gate_guard: {len(pliki)} plikow zrodlowych, "
        f"{w_bramce_bledy} bledow W BRAMCE, {poza_bramka_bledy} POZA BRAMKA "
        f"(budzet {BUDZET_BLEDOW_POZA_BRAMKA}), {bledy_node} w projekcie node, "
        f"{wyciszenia} wyciszen (budzet {BUDZET_WYCISZEN})"
    )

    if w_bramce_bledy:
        naruszenia.append(
            f"[bramka-czerwona] {w_bramce_bledy} bledow typow W ZASIEGU bramki — "
            "`npm run type-check` jest czerwony. To naruszenie TWARDE, niezalezne "
            "od budzetu."
        )
        for linia in globals()["_BLEDY_W_BRAMCE"][:15]:
            naruszenia.append(f"    {linia}")

    if bledy_node:
        naruszenia.append(
            f"[projekt-node-czerwony] {bledy_node} bledow w `tsconfig.node.json` "
            "(vite.config.ts). `tsc --noEmit` z korzenia NIE buduje referencji, "
            "wiec bez tego kroku byl to projekt, ktorego nikt nie uruchamia."
        )
        for linia in wyjscie_node.splitlines()[:10]:
            naruszenia.append(f"    {linia}")

    if poza_bramka_bledy > BUDZET_BLEDOW_POZA_BRAMKA:
        naruszenia.append(
            f"[dlug-urosl] dlug typow POZA bramka urosl o "
            f"{poza_bramka_bledy - BUDZET_BLEDOW_POZA_BRAMKA} "
            f"({BUDZET_BLEDOW_POZA_BRAMKA} -> {poza_bramka_bledy}). Napraw u "
            "zrodla; podniesienie progu wymaga uzasadnienia w commicie."
        )
        for linia in globals()["_BLEDY_POZA_BRAMKA"][:15]:
            naruszenia.append(f"    {linia}")
    elif poza_bramka_bledy < BUDZET_BLEDOW_POZA_BRAMKA:
        naruszenia.append(
            f"[dlug-zmalal] dlug typow POZA bramka zmalal "
            f"({BUDZET_BLEDOW_POZA_BRAMKA} -> {poza_bramka_bledy}) — obniz "
            f"`BUDZET_BLEDOW_POZA_BRAMKA` do {poza_bramka_bledy}. Zapadka dziala "
            "w obie strony: bez utrwalenia poprawy dlug wraca po cichu."
        )

    if naruszenia:
        print(f"\nFAILED: {len(naruszenia)} naruszen bramki typow:\n", file=sys.stderr)
        for naruszenie in naruszenia:
            print(f"  {naruszenie}", file=sys.stderr)
        return 1

    print("OK: caly kod frontendu jest w zasiegu bramki typow albo jawnie odstawiony.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
