#!/usr/bin/env python3
"""Zapadka: opis struktury w `CLAUDE.md` i `.claude/rules/` musi zgadzac sie z REPOZYTORIUM.

DLACZEGO TEN GUARD ISTNIEJE. `CLAUDE.md` jest plikiem WIAZACYM — czyta go kazdy
agent przed praca i wyprowadza z niego, gdzie co lezy. Ta sama klasa defektu
wyszla z niego TRZY RAZY:

1. lista "krytycznych testow kontraktowych SLD" wymieniala szesc plikow w
   `sld/core/__tests__/`, z ktorych NIE ISTNIAL ANI JEDEN (naprawione 2026-08-08),
2. blok struktury wymienial `frontend/src/designer/` juz po jego kasacji,
3. blok struktury wymienial OSIEMNASCIE modulow UI bez ani jednego pliku w gicie
   (`wizard/`, `case-manager/`, `results-workspace/`, `protection-results/`, …),
   a jednoczesnie NIE WYMIENIAL warstwy `ui2/`, w ktorej toczy sie biezaca praca —
   `ui2` wystepowalo w calym pliku RAZ, w opisie innego guarda.

Tekst poprawiony recznie zgnije po raz czwarty, bo nic go nie trzyma przy repo.
Dlatego pin: jesli katalog zniknie albo powstanie, ten guard czerwienieje i
zmusza do aktualizacji dokumentu W TYM SAMYM commicie co zmiana kodu.

MIEJSCE DRZEWA (karta CLAUDE-MD-ANTHROPIC, 2026-11-11). `CLAUDE.md` skrocono do
< 200 linii wg dokumentacji Claude Code „memory"; drzewo frontendu przeszlo do
reguly sciezkowej `.claude/rules/frontend.md` (frontmatter `paths`, laduje sie
przy pracy na `mv-design-pro/frontend/**`). Guard czyta drzewo STAMTAD — zmiana
miejsca, nie oslabienie: ta sama para (widmo / przemilczenie) na tym samym zbiorze.
Podzial na `CLAUDE.md` + reguly otwiera nowa klase tej samej fikcji — dokument
wskazuje plik reguly, ktorego nie ma, albo regula lezy bez wpisu w mapie; regula
ze wzorcem `paths`, ktory nie trafia w zaden plik, nie zaladuje sie NIGDY, czyli
jej tresc jest martwa po cichu. Stad dwie kolejne pary ponizej.

CO SPRAWDZAMY (obie strony pary — reguła "predykaty parami",
`.claude/rules/klasa-nie-instancja.md` pkt 3):
* KAZDY katalog wymieniony w bloku struktury dla `frontend/src/ui`,
  `frontend/src/ui2` (w `.claude/rules/frontend.md`) i `backend/src`
  (w `.claude/rules/backend.md`) MA pliki sledzone przez git —
  inaczej dokument opisuje byt, ktorego nie ma,
* KAZDY katalog istniejacy w repo JEST wymieniony — inaczej dokument milczy o
  zywej warstwie (dokladnie przypadek `ui2/`),
* KAZDY plik `.claude/rules/**/*.md` wymieniony w mapie regul `CLAUDE.md` ISTNIEJE,
  a KAZDY istniejacy plik regul JEST wymieniony w mapie,
* ZADEN plik regul nie jest ignorowany przez gita (inaczej istnieje tylko na dysku autora),
* KAZDY wzorzec `paths` z frontmatter reguly trafia w co najmniej jeden plik
  sledzony przez git, a frontmatter nie niesie pol innych niz `paths` (to jedyne
  pole, ktore Claude Code czyta z reguly — kazde inne byloby deklaracja bez skutku).

CZEGO NIE SPRAWDZAMY (nazwane wprost, zeby zielen nie znaczyla wiecej, niz znaczy):
* trafnosci OPISU po `#` — to zdanie po polsku, nie da sie go zweryfikowac
  maszynowo; pilnuje recenzja,
* podkatalogow glebszych niz pierwszy poziom pod naglowkiem bloku (`network_model/core/`,
  `analysis/*` wypisane w komentarzu wiersza) ani drzew `backend/tests` i `docs/` —
  te stoja jako listy w komentarzach albo jako wybor katalogow, nie jako pelne drzewo;
  ich trafnosc, jak opis po `#`, pilnuje recenzja.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

KORZEN = Path(__file__).resolve().parents[2]
CLAUDE_MD = KORZEN / "CLAUDE.md"
KATALOG_REGUL = KORZEN / ".claude" / "rules"
#: Regula sciezkowa niosaca drzewo `ui/` + `ui2/` (przeniesione z `CLAUDE.md` 2026-11-11).
PLIK_STRUKTURY = KATALOG_REGUL / "frontend.md"

#: Sciezka w repo -> (plik regul z drzewem, nazwa katalogu w drzewie, ZNACZNIK
#: jednoznaczny w wierszu).
#:
#: Znacznik jest KONIECZNY, nie ozdobny: sama nazwa `ui/` wystepuje w drzewie
#: kilka razy (`docs/ui/`, `mv-design-pro/docs/ui/`), wiec kotwica po nazwie
#: trafialaby w PIERWSZY z brzegu blok i mierzyla nie ten zbior, co trzeba —
#: dokladnie klasa defektu, ktora ten guard ma tropic. Pierwsza wersja tego
#: pliku sie na tym wylozyla i zameldowala pusty blok.
#:
#: `backend/src` dolaczony 2026-11-11 (karta CLAUDE-MD-ANTHROPIC): drzewo backendu
#: wymienialo `src/compliance/` i szesc podkatalogow `application/`, ktorych nie
#: bylo w repozytorium, a milczalo o `werdykt/`, `dziedziny/`, `reference_engine/`
#: i `catalog/` — ta sama fikcja, ktora guard tropi we froncie.
SLEDZONE_WARSTWY: dict[str, tuple[Path, str, str]] = {
    "mv-design-pro/frontend/src/ui": (PLIK_STRUKTURY, "ui", "React components —"),
    "mv-design-pro/frontend/src/ui2": (PLIK_STRUKTURY, "ui2", "Warstwa UI programu"),
    "mv-design-pro/backend/src": (KATALOG_REGUL / "backend.md", "src", "Kod backendu"),
}

#: Katalogi pomijane po obu stronach — infrastruktura testowa, nie modul produktu.
POMIJANE = frozenset({"__tests__"})

_WIERSZ_DRZEWA = re.compile(r"[├└]── ([A-Za-z0-9_.\-]+)/")

#: Odwolanie do pliku reguly w `CLAUDE.md` (mapa regul i odeslania w tekscie).
_ODWOLANIE_REGULY = re.compile(r"`(\.claude/rules/[A-Za-z0-9_./\-]+\.md)`")


def moduly_z_repo(baza: str) -> set[str]:
    """Katalogi pierwszego poziomu pod `baza`, ktore maja pliki SLEDZONE przez git.

    Zrodlem jest `git ls-files`, nie `os.listdir`: katalog z samymi plikami
    nieledzonymi (artefakty builda, smieci po narzedziach) nie jest modulem
    produktu i nie ma prawa wymuszac wpisu w dokumencie.
    """
    wynik = subprocess.run(
        ["git", "ls-files", baza],
        cwd=KORZEN,
        capture_output=True,
        text=True,
        check=True,
    )
    prefiks = baza.rstrip("/") + "/"
    out: set[str] = set()
    for sciezka in wynik.stdout.split():
        reszta = sciezka[len(prefiks) :]
        if "/" in reszta:
            out.add(reszta.split("/", 1)[0])
    return out - POMIJANE


def moduly_z_dokumentu(tekst: str, nazwa: str, znacznik: str) -> set[str]:
    """Katalogi wymienione w bloku drzewa dla katalogu `nazwa`.

    Naglowek bloku musi spelnic OBA warunki naraz: wiersz drzewa o dokladnie tej
    nazwie ORAZ obecnosc `znacznik` — patrz komentarz przy `SLEDZONE_WARSTWY`.
    Blok konczy sie na pierwszym wierszu drzewa o wciecu MNIEJSZYM LUB ROWNYM
    naglowkowi, czyli tam, gdzie drzewo wraca na wyzszy poziom.
    """
    linie = tekst.splitlines()
    start = None
    for i, w in enumerate(linie):
        m = _WIERSZ_DRZEWA.search(w)
        if m is not None and m.group(1) == nazwa and znacznik in w:
            start = i
            break
    if start is None:
        raise SystemExit(
            f"[brak-bloku] plik struktury nie ma wiersza drzewa `{nazwa}/` ze znacznikiem "
            f"`{znacznik}`. Znacznik jest czescia kontraktu tego guarda — jesli zmieniasz "
            f"opis warstwy, zmien go TAKZE tutaj."
        )

    def wciecie(w: str) -> int:
        m = _WIERSZ_DRZEWA.search(w)
        return m.start() if m else -1

    baza_wciecia = wciecie(linie[start])
    out: set[str] = set()
    for w in linie[start + 1 :]:
        m = _WIERSZ_DRZEWA.search(w)
        if m is None:
            continue
        if m.start() <= baza_wciecia:
            break
        # Bierzemy WYLACZNIE pierwszy poziom pod naglowkiem; glebsze podkatalogi
        # (np. `sld/v3/`) sa opisem wewnetrznym modulu, nie osobnym modulem.
        if m.start() > baza_wciecia + 4:
            continue
        out.add(m.group(1))
    return out - POMIJANE


def reguly_z_dysku(katalog: Path) -> set[str]:
    """Pliki regul `**/*.md` pod `katalog` jako sciezki wzgledem korzenia repo.

    Zrodlem jest DYSK, nie `git ls-files`: Claude Code laduje regule z drzewa
    roboczego, wiec swiezo napisana, jeszcze niesledzona regula tez dziala — i tez
    musi miec wpis w mapie.
    """
    if not katalog.is_dir():
        return set()
    return {p.relative_to(KORZEN).as_posix() for p in sorted(katalog.rglob("*.md")) if p.is_file()}


def reguly_z_dokumentu(tekst: str) -> set[str]:
    """Pliki regul, na ktore `CLAUDE.md` sie powoluje (mapa regul i odeslania)."""
    return set(_ODWOLANIE_REGULY.findall(tekst))


def frontmatter(tekst: str) -> tuple[dict[str, list[str]], list[str]]:
    """Frontmatter reguly -> ({pole: [wartosci listy]}, [bledy skladni]).

    Parser celowo WASKI (bez zaleznosci od PyYAML w CI `docs-guard`): akceptuje
    wylacznie postac z dokumentacji Claude Code — `pole:` i elementy `  - "wzorzec"`.
    Wszystko inne jest bledem, nie cichym pominieciem.
    """
    linie = tekst.splitlines()
    if not linie or linie[0].strip() != "---":
        return {}, []
    try:
        koniec = next(i for i in range(1, len(linie)) if linie[i].strip() == "---")
    except StopIteration:
        return {}, ["frontmatter bez zamykajacego `---`"]
    pola: dict[str, list[str]] = {}
    biezace: str | None = None
    bledy: list[str] = []
    for w in linie[1:koniec]:
        if not w.strip():
            continue
        m_pole = re.fullmatch(r"([A-Za-z_][A-Za-z0-9_-]*):\s*", w)
        m_elem = re.fullmatch(r"\s+-\s+\"([^\"]+)\"\s*", w)
        if m_pole:
            biezace = m_pole.group(1)
            pola[biezace] = []
        elif m_elem and biezace is not None:
            pola[biezace].append(m_elem.group(1))
        else:
            bledy.append(f"nieobslugiwana linia frontmatter: {w.strip()!r}")
    return pola, bledy


def wzorzec_na_regex(wzorzec: str) -> re.Pattern[str]:
    """Glob `paths` -> regex: `**/` = zero lub wiecej katalogow, `**` = cokolwiek, `*` = w segmencie."""
    out = ""
    i = 0
    while i < len(wzorzec):
        if wzorzec.startswith("**/", i):
            out += "(?:.*/)?"
            i += 3
        elif wzorzec.startswith("**", i):
            out += ".*"
            i += 2
        elif wzorzec[i] == "*":
            out += "[^/]*"
            i += 1
        elif wzorzec[i] == "?":
            out += "[^/]"
            i += 1
        else:
            out += re.escape(wzorzec[i])
            i += 1
    return re.compile(out + r"\Z")


def pliki_sledzone() -> list[str]:
    wynik = subprocess.run(
        ["git", "ls-files"], cwd=KORZEN, capture_output=True, text=True, check=True
    )
    return wynik.stdout.split()


def ignorowane(sciezki: list[str]) -> set[str]:
    """Podzbior sciezek (wzgledem korzenia), ktore `.gitignore` wyklucza z repozytorium."""
    if not sciezki:
        return set()
    wynik = subprocess.run(
        ["git", "check-ignore", "--stdin"],
        input="\n".join(sciezki) + "\n",
        cwd=KORZEN,
        capture_output=True,
        text=True,
    )
    if wynik.returncode not in (0, 1):
        raise SystemExit(f"[git] check-ignore zawiodl: {wynik.stderr.strip()}")
    return set(wynik.stdout.split())


def naruszenia_regul(tekst_claude: str, sledzone: list[str]) -> list[str]:
    """Pary: mapa regul == pliki regul; kazdy wzorzec `paths` trafia w plik sledzony."""
    naruszenia: list[str] = []
    na_dysku = reguly_z_dysku(KATALOG_REGUL)
    w_dok = reguly_z_dokumentu(tekst_claude)
    if not na_dysku:
        naruszenia.append(f"[pusty-skan] brak plikow regul pod {KATALOG_REGUL}")
        return naruszenia
    widmo = sorted(w_dok - na_dysku)
    milczenie = sorted(na_dysku - w_dok)
    if widmo:
        naruszenia.append(
            f"[regula-widmo] `CLAUDE.md` wskazuje {len(widmo)} plikow regul, ktorych nie ma: {widmo}"
        )
    if milczenie:
        naruszenia.append(
            f"[regula-przemilczana] {len(milczenie)} plikow regul bez wpisu w mapie regul "
            f"`CLAUDE.md`: {milczenie}"
        )
    # Regula ignorowana przez gita dziala tylko na dysku autora: nie trafi do commita,
    # CI jej nie widzi, kolejna sesja jej nie dostanie (precedens: `.gitignore` z `.claude/*`
    # bez wyjatku `!.claude/rules/`, wykryty przy przenosinach 2026-11-11).
    zignorowane = sorted(ignorowane(sorted(na_dysku)))
    if zignorowane:
        naruszenia.append(
            f"[regula-ignorowana] {len(zignorowane)} plikow regul wyklucza `.gitignore`: "
            f"{zignorowane}"
        )
    for rel in sorted(na_dysku):
        pola, bledy = frontmatter((KORZEN / rel).read_text(encoding="utf-8"))
        for b in bledy:
            naruszenia.append(f"[frontmatter] {rel}: {b}")
        obce = sorted(set(pola) - {"paths"})
        if obce:
            naruszenia.append(
                f"[frontmatter] {rel}: pola {obce} — Claude Code czyta z reguly wylacznie `paths`"
            )
        if "paths" in pola and not pola["paths"]:
            naruszenia.append(f"[frontmatter] {rel}: `paths:` bez ani jednego wzorca")
        for wzorzec in pola.get("paths", []):
            rx = wzorzec_na_regex(wzorzec)
            if not any(rx.match(s) for s in sledzone):
                naruszenia.append(
                    f"[martwy-wzorzec] {rel}: `paths` {wzorzec!r} nie trafia w zaden plik "
                    f"sledzony — regula nie zaladuje sie nigdy"
                )
    return naruszenia


def main() -> int:
    pliki = {CLAUDE_MD, *(plik for plik, _n, _z in SLEDZONE_WARSTWY.values())}
    for plik in sorted(pliki):
        if not plik.is_file():
            print(f"[brak-pliku] nie znaleziono {plik}")
            return 1

    naruszenia: list[str] = naruszenia_regul(
        CLAUDE_MD.read_text(encoding="utf-8"), pliki_sledzone()
    )
    for baza, (plik, nazwa, znacznik) in SLEDZONE_WARSTWY.items():
        naglowek = f"{nazwa}/"
        w_repo = moduly_z_repo(baza)
        w_dok = moduly_z_dokumentu(plik.read_text(encoding="utf-8"), nazwa, znacznik)
        # Zapadka na zbior pusty: skan, ktory nic nie widzi, jest zielony z tego
        # samego powodu, co skan, ktory widzi komplet — i nie wolno ich mylic.
        if not w_repo:
            naruszenia.append(f"[pusty-skan] `git ls-files {baza}` nie zwrocil ani jednego modulu")
            continue
        if not w_dok:
            naruszenia.append(f"[pusty-blok] blok `{naglowek}` w {plik.name} nie wymienia modulow")
            continue
        widmo = sorted(w_dok - w_repo)
        milczenie = sorted(w_repo - w_dok)
        if widmo:
            naruszenia.append(
                f"[modul-widmo] `{naglowek}` wymienia {len(widmo)} katalogow BEZ ani jednego "
                f"pliku w gicie: {widmo}. Dokument wiazacy opisuje byt, ktorego nie ma."
            )
        if milczenie:
            naruszenia.append(
                f"[modul-przemilczany] `{baza}` ma {len(milczenie)} modulow NIEWYMIENIONYCH "
                f"w {plik.name}: {milczenie}. Tak przemilczana byla cala warstwa `ui2/`."
            )

    if naruszenia:
        print(
            f"\nFAILED: {len(naruszenia)} naruszen zgodnosci CLAUDE.md / .claude/rules "
            "z repozytorium:\n"
        )
        for n in naruszenia:
            print(f"  {n}")
        print(
            "\nDokument opisu struktury aktualizuje sie W TYM SAMYM commicie, co zmiane "
            "ukladu katalogow — inaczej kolejny agent wyprowadzi z niego falszywy obraz kodu."
        )
        return 1

    ile = {b: len(moduly_z_repo(b)) for b in SLEDZONE_WARSTWY}
    print(
        "claude_md_struktura_guard: "
        + " · ".join(f"{b.split('/', 1)[-1]}={n}" for b, n in ile.items())
        + f" · reguly={len(reguly_z_dysku(KATALOG_REGUL))}"
    )
    print(
        "OK: drzewa ui/, ui2/ (.claude/rules/frontend.md) i backend/src (.claude/rules/backend.md), "
        "mapa regul CLAUDE.md i wzorce `paths` zgadzaja sie z repozytorium."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
