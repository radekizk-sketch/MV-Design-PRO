#!/usr/bin/env python3
"""Importer katalogu ABB SACE Emax 2 — wyciąg danych znamionowych z DOKUMENTU.

PO CO TEN SKRYPT ISTNIEJE
=========================
Rodzina wyłączników głównych nN w katalogu produktu kończyła się na 1600 A
(rama ABB E1.2). Szablony stacji wymagają prądów znamionowych strony dolnej
transformatora do ~3608 A (blok 2,5 MVA / 0,4 kV), więc dla ponad dwudziestu
szablonów NIE ISTNIAŁA pozycja katalogu, którą wolno było związać.

Dopisanie brakujących ram „z pamięci" byłoby FABRYKACJĄ danych producenta —
zakazaną wprost. Ten skrypt zamyka lukę drogą jedyną dopuszczalną: czyta
TABELE ZAMÓWIENIOWE z oryginalnego katalogu technicznego ABB i wyprowadza z
nich komplet ``(rama, Iu, Icu@440V, Icw 1s, kod zamówieniowy)``.

DOKUMENT ŹRÓDŁOWY (przypięty odciskiem — inna rewizja NIE przejdzie)
===================================================================
    tytuł       ABB SACE Emax 2 — Low voltage air circuit-breakers,
                Technical catalogue, Edition 2017.01
    dokument    1SDC200023D0205
    URL         https://library.e.abb.com/public/
                b7b28d531cc1451ba23320635a247c21/
                1SDC200023D0205_Emax2_dicembre_2016_EN.pdf
    SHA-256     4502f57f72a92209798e1792b415709d4ba8f40993c1bfb054d824f689582612
    pobrano     2026-09-11

PDF **nie jest** commitowany (10,5 MB, materiał producenta). Commitowany jest
WYCIĄG (`docs/katalog/zrodla/abb_emax2_1SDC200023D0205.json`) wraz z odciskiem
dokumentu, żeby dało się go odtworzyć i zweryfikować:

    curl -sSL -o emax2.pdf "<URL>"
    sha256sum emax2.pdf                      # musi zgadzać się z powyższym
    python scripts/import_katalog_abb_emax2.py --pdf emax2.pdf --sprawdz

DLACZEGO TABELE ZAMÓWIENIOWE, A NIE TABELA ZBIORCZA
===================================================
Tabela zbiorcza (str. 2/3 katalogu) podaje Iu, Icu i Icw dla trzech ram naraz,
w układzie wielokolumnowym. Ekstrakcja tekstu spłaszcza taki układ i przypisanie
„która wartość Iu należy do którego poziomu wykonania" przestaje być
jednoznaczne — a zgadywanie tego przypisania byłoby dokładnie fabrykacją.

Tabele zamówieniowe mają układ WIERSZOWY: każdy wiersz to jedno urządzenie z
własnym ``Iu``, ``Icu (440 V)``, ``Icw (1s)`` i kodem zamówieniowym ABB. Są więc
jednoznaczne i dodatkowo niosą najmocniejszą możliwą proweniencję — kod, po
którym urządzenie da się zamówić.

KONTROLA KRZYŻOWA (wbudowana, nie deklarowana)
==============================================
Skrypt porównuje wynik z tabelą zbiorczą ze str. 2/3 w zakresie, w którym ta
tabela JEST jednoznaczna (wiersze Icu i Icw czytane po poziomach wykonania).
Rozjazd przerywa import. Dwa niezależne miejsca tego samego dokumentu muszą
mówić to samo, inaczej to nie jest odczyt, tylko interpretacja.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

#: Odcisk dokumentu, z którego pochodzi commitowany wyciąg.
SHA256_DOKUMENTU = "4502f57f72a92209798e1792b415709d4ba8f40993c1bfb054d824f689582612"

DOKUMENT = {
    "producent": "ABB",
    "tytul": (
        "SACE Emax 2 — Low voltage air circuit-breakers, "
        "Technical catalogue, Edition 2017.01"
    ),
    "numer_dokumentu": "1SDC200023D0205",
    "url": (
        "https://library.e.abb.com/public/b7b28d531cc1451ba23320635a247c21/"
        "1SDC200023D0205_Emax2_dicembre_2016_EN.pdf"
    ),
    "sha256": SHA256_DOKUMENTU,
    "pobrano": "2026-09-11",
    "wersja_importera": "1.0",
}

#: Nagłówek strony tabeli zamówieniowej — daje rodzaj zacisków.
_NAGLOWEK = re.compile(r"SACE Emax (E\d\.\d[A-Z]+)\s*[•·]\s*(.+?)\s*$", re.M)

#: Wiersz tabeli zamówieniowej.
#:
#: Kolumny dokumentu: ``Size | Iu | Icu (440 V) | Icw (1s) | Type | 3 Poles | 4 Poles``.
#: Rozmiar występuje DWA RAZY (w kolumnie „Size" i w nazwie typu) — wymagamy
#: zgodności obu wystąpień, więc przypadkowe dopasowanie do innej tabeli odpada.
_WIERSZ = re.compile(
    r"^\s*(?:(E\d\.\d[A-Z]+)\s+)?(\d{3,4})\s+(\d{2,3})\s+(\d{2,3})\s+"
    r"(E\d\.\d[A-Z]+)\s+(\d{3,4})\s+Ekip\s+(\S+)\s+(\S*)\s+"
    r"(1SDA\d+R\d)(?:\s+(1SDA\d+R\d))?",
    re.M,
)

#: Tabela zbiorcza str. 2/3 — kolejność poziomów wykonania w kolumnach.
#: Odczytana z wiersza „Performance levels" tej strony: ``BNSHNSHVH V X``.
_POZIOMY_ZBIORCZEJ = (
    ("E2.2", "B"), ("E2.2", "N"), ("E2.2", "S"), ("E2.2", "H"),
    ("E4.2", "N"), ("E4.2", "S"), ("E4.2", "H"), ("E4.2", "V"),
    ("E6.2", "H"), ("E6.2", "V"), ("E6.2", "X"),
)


def _odcisk(sciezka: Path) -> str:
    h = hashlib.sha256()
    with sciezka.open("rb") as f:
        for blok in iter(lambda: f.read(1 << 20), b""):
            h.update(blok)
    return h.hexdigest()


def _strony(sciezka: Path) -> list[str]:
    try:
        import pypdf
    except ImportError:  # pragma: no cover - zależność narzędziowa, nie produktowa
        print(
            "BRAK pypdf. Importer jest narzędziem jednorazowym, więc pypdf NIE jest\n"
            "zależnością produktu. Zainstaluj go obok:\n"
            "    pip install --target=<katalog_roboczy> pypdf\n"
            "    PYTHONPATH=<katalog_roboczy> python scripts/import_katalog_abb_emax2.py ...",
            file=sys.stderr,
        )
        raise SystemExit(2) from None

    czytnik = pypdf.PdfReader(str(sciezka))
    wynik: list[str] = []
    for strona in czytnik.pages:
        try:
            wynik.append(strona.extract_text() or "")
        except Exception:  # pragma: no cover - pojedyncza strona bez warstwy tekstowej
            wynik.append("")
    return wynik


def zbierz_urzadzenia(strony: list[str]) -> list[dict[str, Any]]:
    """Wiersze tabel zamówieniowych jako rekordy kandydackie."""
    zebrane: list[dict[str, Any]] = []
    for numer, tekst in enumerate(strony):
        if "Ekip" not in tekst or "Icu" not in tekst:
            continue
        nagl = _NAGLOWEK.findall(tekst)
        zaciski = nagl[0][1] if nagl else None
        for m in _WIERSZ.finditer(tekst):
            _, iu_kolumna, icu, icw, rama, iu_typ, tu_a, tu_b, kod3, kod4 = m.groups()
            if iu_kolumna != iu_typ:
                continue
            zebrane.append(
                {
                    "strona_pdf": numer,
                    "zaciski": zaciski,
                    "rama": rama,
                    "iu_a": int(iu_kolumna),
                    "icu_440v_ka": int(icu),
                    "icw_1s_ka": int(icw),
                    "wyzwalacz": f"Ekip {tu_a} {tu_b}".strip(),
                    "kod_3p": kod3,
                    "kod_4p": kod4,
                }
            )
    return zebrane


def scal_do_typow(urzadzenia: list[dict[str, Any]]) -> dict[tuple[str, int], dict[str, Any]]:
    """Scal wiersze do jednego rekordu na ``(rama, Iu)`` — z kontrolą spójności.

    Ten sam aparat występuje w dokumencie wielokrotnie (warianty zacisków,
    wersja stała i wysuwna, warianty wyzwalacza). Wszystkie te wystąpienia MUSZĄ
    podawać identyczne ``Icu`` i ``Icw``; rozjazd oznacza, że wzorzec złapał coś
    innego niż tabelę zamówieniową i import nie ma prawa się udać.
    """
    typy: dict[tuple[str, int], dict[str, Any]] = {}
    for u in urzadzenia:
        klucz = (u["rama"], u["iu_a"])
        istniejacy = typy.get(klucz)
        if istniejacy is None:
            typy[klucz] = {
                "rama": u["rama"],
                "iu_a": u["iu_a"],
                "icu_440v_ka": u["icu_440v_ka"],
                "icw_1s_ka": u["icw_1s_ka"],
                "kody_zamowieniowe": sorted({u["kod_3p"]}),
                "strony_pdf": sorted({u["strona_pdf"]}),
                "wystapien": 1,
            }
            continue
        for pole in ("icu_440v_ka", "icw_1s_ka"):
            if istniejacy[pole] != u[pole]:
                raise SystemExit(
                    f"ROZJAZD ŹRÓDŁA dla {klucz}: {pole} = {istniejacy[pole]} "
                    f"(str. {istniejacy['strony_pdf']}) vs {u[pole]} "
                    f"(str. {u['strona_pdf']}). Import przerwany — dwa miejsca "
                    f"dokumentu podają różne wartości."
                )
        istniejacy["kody_zamowieniowe"] = sorted(
            set(istniejacy["kody_zamowieniowe"]) | {u["kod_3p"]}
        )
        istniejacy["strony_pdf"] = sorted(set(istniejacy["strony_pdf"]) | {u["strona_pdf"]})
        istniejacy["wystapien"] += 1
    return typy


def kontrola_krzyzowa(strony: list[str], typy: dict[tuple[str, int], dict[str, Any]]) -> list[str]:
    """Porównaj Icu/Icw z NIEZALEŻNĄ tabelą zbiorczą str. 2/3 tego samego katalogu.

    Zwraca listę potwierdzonych porównań. Rozjazd przerywa import: jedno źródło
    czytane dwa razy to nadal jedno źródło, ale dwa RÓŻNE miejsca dokumentu,
    które się zgadzają, wykluczają błąd ekstrakcji układu tabeli.
    """
    # Stronę zbiorczą wskazuje SPŁASZCZONY wiersz poziomów wykonania „BNSHNSHVH V X"
    # (etykieta „Performance levels" nie przetrwała ekstrakcji akurat na tej stronie —
    # szukanie po niej trafiało w inną tabelę, bez wierszy 11-kolumnowych).
    strona_zbiorcza = next(
        (t for t in strony if "BNSHNSHVH" in t and "E2.2 E4.2 E6.2" in t),
        None,
    )
    if strona_zbiorcza is None:
        raise SystemExit("Nie znaleziono tabeli zbiorczej (str. 2/3) — brak kontroli krzyżowej.")

    liczby = re.compile(r"^\s*((?:\d{2,3}\s+){10}\d{2,3})\s*$", re.M)
    wiersze = [w.group(1).split() for w in liczby.finditer(strona_zbiorcza)]
    if len(wiersze) < 5:
        raise SystemExit(
            f"Tabela zbiorcza ma {len(wiersze)} wierszy 11-kolumnowych, oczekiwano ≥5 "
            "(4 × Icu po napięciach + Icw 1s). Układ dokumentu się zmienił."
        )

    # Kolejność CZYSTYCH wierszy 11-kolumnowych na tej stronie:
    #   [0] Icu 400-415 V   [1] Icu 440 V   [2] Icu 500-525 V   [3] Icu 690 V
    #   [4] Icw (1s)
    # Wiersze „Ics [%Icu]" i „Icw (3s)" NIE trafiają do tej listy, bo niosą
    # odsyłacze przypisów (`2)`, `3)`) i mają 12 tokenów — filtr 11-kolumnowy je
    # odrzuca, co jest tu zaletą: nie da się ich pomylić z wierszem Icw(1s).
    icu_440 = wiersze[1]
    icw_1s = wiersze[4]

    potwierdzenia: list[str] = []
    for kolumna, (rodzina, poziom) in enumerate(_POZIOMY_ZBIORCZEJ):
        oczekiwane_icu = int(icu_440[kolumna])
        oczekiwane_icw = int(icw_1s[kolumna])
        rama = f"{rodzina}{poziom}"
        dopasowane = [t for (r, _), t in typy.items() if r == rama]
        if not dopasowane:
            continue
        for t in dopasowane:
            if t["icu_440v_ka"] != oczekiwane_icu:
                raise SystemExit(
                    f"KONTROLA KRZYŻOWA NIEUDANA {rama} Iu={t['iu_a']}: tabela "
                    f"zamówieniowa Icu@440V={t['icu_440v_ka']} kA, tabela zbiorcza "
                    f"{oczekiwane_icu} kA."
                )
            if t["icw_1s_ka"] != oczekiwane_icw:
                raise SystemExit(
                    f"KONTROLA KRZYŻOWA NIEUDANA {rama} Iu={t['iu_a']}: tabela "
                    f"zamówieniowa Icw(1s)={t['icw_1s_ka']} kA, tabela zbiorcza "
                    f"{oczekiwane_icw} kA."
                )
        potwierdzenia.append(f"{rama}: Icu@440V={oczekiwane_icu} kA, Icw(1s)={oczekiwane_icw} kA")
    if not potwierdzenia:
        raise SystemExit("Kontrola krzyżowa nie objęła ŻADNEJ ramy — wyciąg bez potwierdzenia.")
    return potwierdzenia


def zbuduj_wyciag(sciezka_pdf: Path) -> dict[str, Any]:
    odcisk = _odcisk(sciezka_pdf)
    if odcisk != SHA256_DOKUMENTU:
        raise SystemExit(
            f"ODCISK DOKUMENTU SIĘ NIE ZGADZA.\n  oczekiwano {SHA256_DOKUMENTU}\n"
            f"  jest       {odcisk}\nWyciąg jest przypięty do JEDNEJ rewizji katalogu. "
            "Inna rewizja wymaga świadomej aktualizacji `SHA256_DOKUMENTU` i ponownej "
            "weryfikacji wszystkich pozycji."
        )
    strony = _strony(sciezka_pdf)
    urzadzenia = zbierz_urzadzenia(strony)
    if not urzadzenia:
        raise SystemExit("Nie znaleziono ŻADNEGO wiersza tabeli zamówieniowej.")
    typy = scal_do_typow(urzadzenia)
    potwierdzenia = kontrola_krzyzowa(strony, typy)
    return {
        "dokument": DOKUMENT,
        "kontrola_krzyzowa_str_2_3": potwierdzenia,
        "liczba_wierszy_zrodlowych": len(urzadzenia),
        "typy": [typy[k] for k in sorted(typy)],
    }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pdf", required=True, type=Path, help="katalog techniczny ABB (PDF)")
    p.add_argument("--wyjscie", type=Path, help="plik wyciągu JSON do zapisania")
    p.add_argument(
        "--sprawdz",
        type=Path,
        nargs="?",
        const=Path("mv-design-pro/docs/katalog/zrodla/abb_emax2_1SDC200023D0205.json"),
        help="porównaj z commitowanym wyciągiem zamiast zapisywać",
    )
    a = p.parse_args()

    wyciag = zbuduj_wyciag(a.pdf)
    tekst = json.dumps(wyciag, ensure_ascii=False, indent=2, sort_keys=True) + "\n"

    if a.sprawdz is not None:
        if not a.sprawdz.exists():
            print(f"Brak pliku odniesienia: {a.sprawdz}", file=sys.stderr)
            return 2
        if a.sprawdz.read_text(encoding="utf-8") != tekst:
            print(f"WYCIĄG SIĘ ROZJECHAŁ z {a.sprawdz}", file=sys.stderr)
            return 1
        print(f"Wyciąg zgodny z {a.sprawdz} ({len(wyciag['typy'])} typów).")
        return 0

    if a.wyjscie is not None:
        a.wyjscie.parent.mkdir(parents=True, exist_ok=True)
        a.wyjscie.write_text(tekst, encoding="utf-8")
        print(f"Zapisano {a.wyjscie} ({len(wyciag['typy'])} typów).")
        return 0

    print(tekst)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
