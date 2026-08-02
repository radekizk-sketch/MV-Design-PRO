#!/usr/bin/env python3
"""Testy strażnika kodowania — ZAKRES skanu i KLASY wykrywanych uszkodzeń.

Karta W4 zamyka dług z V12K-317: strażnik nie widział `backend/tests`, więc
referencja katalogowa zapisana jako mojibake nie mogła odpowiadać żadnej pozycji
katalogu i latami utrwalała test, który przechodził z błędną referencją.

Testy pilnują OBU stron mechanizmu (CLAUDE.md, reguła KLASA, NIE INSTANCJA):
  * ZAKRES — co strażnik ogląda; iloczyn cech: katalog testów × katalog narzędzi
    × korzeń repozytorium × katalog produkcyjny o nazwie mylącej z wyjściem
    budowania × katalog, którego nikt nie wpisał na żadną listę,
  * WYKRYWANIE — które zapisy są uszkodzeniem, a które poprawną składnią,
  * PRÓBKA CELOWA — znacznik z uzasadnieniem zwalnia, znacznik bez uzasadnienia
    nie zwalnia niczego (inaczej byłby cichą listą wykluczeń po plikach),
  * PARA PREDYKATÓW — naprawiacz `napraw_mojibake.py` widzi DOKŁADNIE ten sam
    zbiór plików co strażnik.
"""

from __future__ import annotations

import subprocess
import tempfile
import uuid
from pathlib import Path

import napraw_mojibake
from utf8_mojibake_guard import (
    _PARAMETR_ZAPYTANIA,
    KORZEN,
    SEGMENTY_POMIJANE,
    SUSPICIOUS_FRAGMENTS,
    ZNAK_ZASTEPCZY_W_SLOWIE,
    czy_segment_pomijany,
    ignorowane_przez_gita,
    iter_scannable_files,
    main,
    should_scan,
    znajdz_trafienia,
)

# Uszkodzone próbki trzymamy w sekwencjach ucieczki — inaczej TEN plik zapalałby
# strażnika, którego testuje (ta sama konwencja co w `napraw_mojibake.py`).
# Od karty W4 strażnik skanuje także pliki testowe, więc konwencja jest tu
# WARUNKIEM, a nie ozdobą.
_MOJIBAKE_A = "\u00c4\u2026"  # „ą" przepuszczone przez inną stronę kodową
_PYTAJNIK = "?"
_ZNAK_ZAPYTANIA_W_SLOWIE = f"Pr{_PYTAJNIK}d zwarciowy"  # „ą" zamienione na ASCII


def _zapala_regule(linia: str) -> bool:
    """Czy linia zapala regułę znaku zastępczego (tak jak w skanie strażnika)."""
    return bool(ZNAK_ZASTEPCZY_W_SLOWIE.search(_PARAMETR_ZAPYTANIA.sub(" ", linia)))


def _zapala_fragment(linia: str) -> bool:
    """Czy linia zawiera którykolwiek zakazany fragment (tak jak w skanie)."""
    return any(fragment in linia for fragment in SUSPICIOUS_FRAGMENTS)


# ---------------------------------------------------------------------------
# Rozpoznawanie plików
# ---------------------------------------------------------------------------


def test_should_scan_supported_source_files() -> None:
    assert should_scan(Path("sample.tsx"))
    assert should_scan(Path("sample.py"))
    assert should_scan(Path("sample.md"))


def test_should_skip_unsupported_files() -> None:
    assert not should_scan(Path("sample.svg"))
    assert not should_scan(Path("sample.bin"))


# ---------------------------------------------------------------------------
# ZAKRES — iloczyn cech (karta W4 §2 pkt 1)
# ---------------------------------------------------------------------------


def _zbior_zakresu() -> set[str]:
    return {str(p.relative_to(KORZEN)).replace("\\", "/") for p in iter_scannable_files()}


def test_zakres_obejmuje_katalog_testow_backendu() -> None:
    """DŁUG Z V12K-317: `backend/tests` nie był skanowany — stąd niewidoczna
    referencja katalogowa zapisana jako mojibake."""
    zakres = _zbior_zakresu()
    testy = [p for p in zakres if p.startswith("mv-design-pro/backend/tests/")]
    assert len(testy) > 400, f"katalog testów backendu poza zakresem (widziano {len(testy)})"


def test_zakres_obejmuje_pozostale_drzewa_z_trescia_autorska() -> None:
    """Iloczyn cech: specy e2e, narzędzia obu warstw, dokumentacja korzenia.

    Każda z tych pozycji była poza zakresem przed kartą W4; `frontend/e2e` był
    dodatkowo nazwany jako dług już w V12K-271.
    """
    zakres = _zbior_zakresu()
    for prefiks, opis in [
        ("mv-design-pro/frontend/e2e/", "specy e2e (dług nazwany w V12K-271)"),
        ("mv-design-pro/backend/scripts/", "narzędzia backendu"),
        ("mv-design-pro/frontend/scripts/", "narzędzia frontu"),
        ("docs/", "dokumentacja w korzeniu repozytorium"),
    ]:
        assert any(p.startswith(prefiks) for p in zakres), f"poza zakresem: {opis}"


def test_zakres_obejmuje_pliki_korzenia_ktorych_nie_bylo_na_liscie() -> None:
    """Stara lista wymieniała 4 pliki korzenia; reszta była niewidoczna."""
    zakres = _zbior_zakresu()
    for plik in (
        "mv-design-pro/README.md",
        "mv-design-pro/STAN_REPO.md",
        "mv-design-pro/CANONICAL_COMPLIANCE.md",
        "CLAUDE.md",
    ):
        assert plik in zakres, f"plik korzenia poza zakresem: {plik}"


def test_wykluczenia_dopasowane_do_segmentu_a_nie_do_podciagu_nazwy() -> None:
    """Kod PRODUKCYJNY o nazwie mylącej z wyjściem budowania musi być skanowany.

    Wzorzec „build" dopasowywany jako podciąg ukrywał `frontend/src/ui/network-build`
    (143 pliki), a „dist" — `frontend/src/ui/power-distribution`. W pierwszym z nich
    siedziały dwie etykiety UI z polską literą zamienioną na znak zapytania.
    """
    # Predykat WPROST — obchód drzewa woła tę samą funkcję, więc zmiana reguły
    # dopasowania nie może się schować przed testem (iniekcja I2 karty W4).
    assert not czy_segment_pomijany("network-build")
    assert not czy_segment_pomijany("power-distribution")
    assert not czy_segment_pomijany("builders")
    assert czy_segment_pomijany("build")
    assert czy_segment_pomijany("dist")

    # ...i SKUTEK na realnym drzewie:
    zakres = _zbior_zakresu()
    for prefiks in (
        "mv-design-pro/frontend/src/ui/network-build/",
        "mv-design-pro/frontend/src/ui/power-distribution/",
    ):
        assert any(p.startswith(prefiks) for p in zakres), f"katalog produkcyjny ukryty: {prefiks}"


def test_kazdy_pomijany_segment_ma_powod() -> None:
    """Lista pomijanych jest ODWROTNOŚCIĄ zakresu — wpis bez powodu byłby cichym
    wykluczeniem, którego nikt nie umie ocenić."""
    for segment, powod in SEGMENTY_POMIJANE.items():
        assert powod and powod.strip(), f"segment bez powodu pominięcia: {segment}"


def test_nowy_katalog_jest_objety_domyslnie_a_wyjscia_narzedzi_nie() -> None:
    """Anty-nawrót klasy: katalog, którego nie ma na żadnej liście, JEST skanowany;
    pomijane są wyłącznie segmenty wyjścia narzędzi (dopasowanie do segmentu)."""
    with tempfile.TemporaryDirectory() as tmp:
        korzen = Path(tmp)
        (korzen / "calkiem-nowy-katalog" / "glebiej").mkdir(parents=True)
        (korzen / "calkiem-nowy-katalog" / "glebiej" / "plik.ts").write_text("x", encoding="utf-8")
        (korzen / "ui" / "network-build").mkdir(parents=True)
        (korzen / "ui" / "network-build" / "Karta.tsx").write_text("x", encoding="utf-8")
        (korzen / "node_modules" / "paczka").mkdir(parents=True)
        (korzen / "node_modules" / "paczka" / "index.js").write_text("x", encoding="utf-8")
        (korzen / "dist").mkdir()
        (korzen / "dist" / "bundle.js").write_text("x", encoding="utf-8")

        widziane = {
            str(p.relative_to(korzen)).replace("\\", "/") for p in iter_scannable_files(korzen)
        }

    assert "calkiem-nowy-katalog/glebiej/plik.ts" in widziane
    assert "ui/network-build/Karta.tsx" in widziane
    assert "node_modules/paczka/index.js" not in widziane
    assert "dist/bundle.js" not in widziane


def test_zakres_nie_wciaga_artefaktow_ignorowanych_przez_gita() -> None:
    """ANTY-NAWRÓT dla drugiej strony zakresu przez odjęcie.

    Skoro skanujemy WSZYSTKO poza wymienionymi segmentami, każdy nowy katalog
    stanu uruchomieniowego (magazyn migawek, raport narzędzia, pamięć podręczna)
    wchodzi do zakresu SAM — a wtedy wynik strażnika zależy od tego, czy ktoś
    wcześniej uruchomił testy. Taki katalog jest już opisany w `.gitignore`, więc
    ten test pyta gita: czy w zakresie nie ma pliku, którego repozytorium świadomie
    nie śledzi. Znaleziony plik = brakujący wpis w `SEGMENTY_POMIJANE`.

    Plik NIEŚLEDZONY, ale i NIEIGNOROWANY (świeżo napisany) zostaje w zakresie —
    o to właśnie chodzi, żeby nowa treść była pilnowana od pierwszej chwili.
    """
    sciezki = [str(p.relative_to(KORZEN)) for p in iter_scannable_files()]
    wynik = subprocess.run(
        ["git", "check-ignore", "--stdin"],
        input="\n".join(sciezki),
        cwd=KORZEN,
        capture_output=True,
        text=True,
    )
    # 0 = są ignorowane, 1 = żaden nie jest ignorowany, reszta = błąd wywołania
    assert wynik.returncode in (0, 1), f"git check-ignore zawiódł: {wynik.stderr.strip()}"
    ignorowane = sorted(filter(None, wynik.stdout.splitlines()))
    assert ignorowane == [], (
        "w zakresie strażnika są pliki ignorowane przez gita (stan uruchomieniowy "
        f"albo wyjście narzędzia): {ignorowane[:10]}"
    )


def _repozytorium(korzen: Path) -> None:
    """Minimalne repozytorium — potrzebne, bo `git check-ignore` czyta `.gitignore`
    wyłącznie wewnątrz drzewa roboczego gita."""
    for polecenie in (
        ["init", "-q"],
        ["config", "user.email", "t@t"],
        ["config", "user.name", "t"],
    ):
        subprocess.run(["git", *polecenie], cwd=korzen, check=True, capture_output=True)


def test_odjecie_ignorowanych_jest_regula_nie_lista_katalogow() -> None:
    """ILOCZYN CECH dla odejmowania stanu uruchomieniowego (CLAUDE.md pkt 2).

    Zakres liczymy przez odjęcie, więc katalog wyjścia narzędzia, którego nikt nie
    wpisał do `SEGMENTY_POMIJANE`, wchodziłby do skanu sam — i wynik strażnika
    zależałby od tego, co ktoś wcześniej uruchomił na SWOIM dysku. Precedens:
    `frontend/audyt-r4/` (ignorowany, obecny tylko po uruchomieniu audytu) czynił
    test zakresu czerwonym u nadzorcy i zielonym-pusto u wykonawcy.

    Cechy: {wzorzec katalogowy, wzorzec plikowy} × {ignorowany, nieignorowany} ×
    {śledzony, nieśledzony}. Odejmujemy WYŁĄCZNIE to, co git świadomie ignoruje —
    świeżo napisany plik zostaje w zakresie od pierwszej chwili.
    """
    with tempfile.TemporaryDirectory() as tmp:
        korzen = Path(tmp).resolve()
        _repozytorium(korzen)
        (korzen / ".gitignore").write_text(
            "raport-narzedzia/\n*.wygenerowany.json\n", encoding="utf-8"
        )

        (korzen / "raport-narzedzia").mkdir()
        (korzen / "raport-narzedzia" / "wynik.json").write_text("{}", encoding="utf-8")
        (korzen / "src").mkdir()
        (korzen / "src" / "dane.wygenerowany.json").write_text("{}", encoding="utf-8")
        (korzen / "src" / "Ekran.tsx").write_text("x", encoding="utf-8")
        (korzen / "src" / "swiezy.ts").write_text("x", encoding="utf-8")
        subprocess.run(
            ["git", "add", ".gitignore", "src/Ekran.tsx"],
            cwd=korzen,
            check=True,
            capture_output=True,
        )

        widziane = {
            str(p.relative_to(korzen)).replace("\\", "/") for p in iter_scannable_files(korzen)
        }

    # ignorowany katalogiem i ignorowany wzorcem plikowym — POZA zakresem
    assert "raport-narzedzia/wynik.json" not in widziane
    assert "src/dane.wygenerowany.json" not in widziane
    # śledzony oraz nieśledzony-nieignorowany — W zakresie (nowa treść pilnowana od razu)
    assert "src/Ekran.tsx" in widziane
    assert "src/swiezy.ts" in widziane


def test_brak_repozytorium_nie_zwęża_zakresu() -> None:
    """Gdy git nie odpowiada (drzewo poza repozytorium, brak narzędzia), strażnik
    ma skanować WIĘCEJ, nigdy mniej — awaria pomocnika nie może cicho wygasić
    kontroli kodowania."""
    with tempfile.TemporaryDirectory() as tmp:
        korzen = Path(tmp).resolve()
        (korzen / "plik.md").write_text("x", encoding="utf-8")
        assert ignorowane_przez_gita(korzen, [korzen / "plik.md"]) == set()
        assert [p.name for p in iter_scannable_files(korzen)] == ["plik.md"]


def test_naprawiacz_widzi_dokladnie_ten_sam_zbior_co_straznik() -> None:
    """PARA PREDYKATÓW (CLAUDE.md pkt 3). Do karty W4 `napraw_mojibake.py` niósł
    własną kopię list z deklaracją „DOKŁADNIE to, co widzi guard" — bez testu,
    więc rozjazd detektora i naprawiacza mógł urosnąć niezauważony."""
    assert napraw_mojibake._pliki(KORZEN, None) == sorted(set(iter_scannable_files()))


# ---------------------------------------------------------------------------
# BRAMKA (a) karty W4 — uszkodzenie w `backend/tests` czyni strażnika czerwonym
# ---------------------------------------------------------------------------


def test_uszkodzony_zapis_w_testach_backendu_czyni_straznika_czerwonym() -> None:
    """Ścieżka REALNA: plik trafia do `backend/tests`, uruchamiamy `main()`.

    Przed kartą W4 taki plik nie zapalał niczego — katalog był poza `SCAN_DIRS`.
    Plik jest usuwany w `finally`, żeby test nie zostawiał śladu w drzewie.
    """
    katalog = KORZEN / "mv-design-pro" / "backend" / "tests"
    plik = katalog / f"test_sonda_kodowania_{uuid.uuid4().hex}.py"
    plik.write_text(
        f'CATALOG_REF = "kabel-{_MOJIBAKE_A}-240"\n',
        encoding="utf-8",
    )
    try:
        assert main() == 1, "strażnik zielony mimo uszkodzonego zapisu w backend/tests"
    finally:
        plik.unlink()
    assert main() == 0, "drzewo po sprzątnięciu próbki musi być czyste"


# ---------------------------------------------------------------------------
# WYKRYWANIE — klasy uszkodzeń i poprawna składnia
# ---------------------------------------------------------------------------


def test_wykrywa_litere_zastapiona_znakiem_zapytania() -> None:
    """Realne przypadki z repo — komunikaty operacji domenowych i etykieta UI."""
    znak = "?"
    assert _zapala_regule(f'return _error_response("Dost{znak}pne rekordy: 3.")')
    assert _zapala_regule(f'"Brak napi{znak}cia znamionowego SN"')
    assert _zapala_regule(f"const pusty = 'Brak wynik{znak}w diagnostyki';")


def test_nie_zapala_sie_na_poprawnym_tekscie_polskim() -> None:
    assert not _zapala_regule('"Brak napięcia znamionowego SN: podaj voltage_kv"')
    assert not _zapala_regule("Zażółć gęślą jaźń — pełny zestaw znaków")


def test_nie_zapala_sie_na_adresie_z_parametrem_zapytania() -> None:
    """Dokumentacja końcówek API nie jest uszkodzonym tekstem."""
    assert not _zapala_regule("- ``GET /api/quality/flicker?run_id=`` — ocena migotania")
    assert not _zapala_regule("- GET /api/station-templates?category=<cat> — filter by category")
    assert not _zapala_regule("GET /api/oze-analysis/pq-area?run_id=&bus_ref=")


def test_nie_zapala_sie_na_pytaniu_ani_skladni_typescript() -> None:
    """Zdanie pytające i operatory TS to normalna treść, nie uszkodzenie."""
    assert not _zapala_regule("Czy rozpływ jest dostępny? Sprawdź flagę wiersza.")
    assert not _zapala_regule("const wynik = warunek ? pierwszy : drugi;")
    assert not _zapala_regule("interface Pole { etykieta?: string }")
    assert not _zapala_regule("const nazwa = element?.meta?.nazwa ?? null;")


def test_kwantyfikator_regexp_to_skladnia_a_nie_zgubiona_litera() -> None:
    """`\\s?` w wyrażeniu regularnym daje trójkę „litera-znak zapytania-litera",
    choć żaden znak nie zginął. Zawężenie jest WĄSKIE: wymaga odwrotnego ukośnika
    bezpośrednio przed literą, więc uszkodzone słowo nadal zapala regułę."""
    czyste = znajdz_trafienia([r"{ term: /\bwhite\s?box\b/i, replacement: 'x' },"])
    assert czyste == []
    assert znajdz_trafienia([r"const opis = /\d?\w?/;"]) == []
    # ...a prawdziwe uszkodzenie NIE chowa się za tym zawężeniem:
    assert len(znajdz_trafienia([f"label: '{_ZNAK_ZAPYTANIA_W_SLOWIE} Ik3',"])) == 1


def test_wykrywa_klase_cp1250_naprawiona_w_kd6() -> None:
    """PRÓBKI Z REPO SPRZED NAPRAWY — dowód, że strażnik łapie tę klasę.

    Do karty KD-6 klasa była WPISANA JAKO DŁUG (komentarz w strażniku), bo
    zapalała ponad tysiąc miejsc. Po masowej naprawie
    (`scripts/napraw_mojibake.py`) jest pilnowana, więc te próbki MUSZĄ być
    czerwone — inaczej dług wróciłby niezauważony.
    """
    assert _zapala_fragment("const etykieta = 'Wy\u0139\u201aacznik';")  # Wylacznik
    assert _zapala_fragment('"description": "Przek\u0139\u201aadnik pr\u0102\u0142dowy"')
    assert _zapala_fragment("# nale\u0139\u013dy wskazać pozycję")  # nalezy
    assert _zapala_fragment("Ci\u0139\u0161nienie")  # Cisnienie (klasa \u0139\u0161)
    assert _zapala_fragment("kr\u0102\u0142tko")  # krotko (klasa \u0102\u0142)
    assert _zapala_fragment("\u00e2\u201d\u0161\u00e2\u201d\u20ac ramka")  # ramka rysunkowa


def test_klasa_cp1250_nie_zapala_sie_na_poprawnym_tekscie() -> None:
    """Poprawna polszczyzna — także wielkimi literami — zostaje czysta."""
    assert not _zapala_fragment("Wyłącznik, przekładnik, ciśnienie, krótko")
    assert not _zapala_fragment("RÓŻNICA NAPIĘĆ i CZĘŚĆ ZAMIENNA")
    assert not _zapala_fragment("├── ramka rysunkowa")


# ---------------------------------------------------------------------------
# PRÓBKA CELOWA — znacznik z uzasadnieniem (karta W4 §2 pkt 2)
# ---------------------------------------------------------------------------

_ZNACZNIK = "mojibake-guard: probka celowa"


def test_znacznik_z_uzasadnieniem_zwalnia_linie_trafienia() -> None:
    linia = f"const wzorzec = /{_MOJIBAKE_A}/;  // {_ZNACZNIK} — probka asercji ekranu"
    assert znajdz_trafienia([linia]) == []


def test_znacznik_z_uzasadnieniem_w_linii_nad_trafieniem_zwalnia() -> None:
    """Forma potrzebna tam, gdzie samej linii nie da się skomentować (wnętrze
    wywołania, tekst dokumentacyjny modułu)."""
    linie = [
        f"// {_ZNACZNIK} — uszkodzone znaki sa TRESCIA tej asercji",
        f"expect(tresc).not.toMatch(/{_MOJIBAKE_A}/);",
    ]
    assert znajdz_trafienia(linie) == []


def test_znacznik_bez_uzasadnienia_nie_zwalnia_niczego() -> None:
    """Znacznik bez powodu byłby cichą listą wykluczeń rozproszoną po plikach."""
    assert len(znajdz_trafienia([f"const x = '{_MOJIBAKE_A}';  // {_ZNACZNIK}"])) == 1
    assert len(znajdz_trafienia([f"const x = '{_MOJIBAKE_A}';  // {_ZNACZNIK} — bo"])) == 1


def test_znacznik_dwie_linie_wyzej_nie_zwalnia() -> None:
    """Zwolnienie jest PRZYPIĘTE do miejsca: linia trafienia albo bezpośrednio
    nad nią. Inaczej jeden znacznik zwalniałby cały blok, którego nikt nie czytał."""
    linie = [
        f"// {_ZNACZNIK} — uzasadnienie dostatecznie dlugie",
        "const obojetna = 1;",
        f"const x = '{_MOJIBAKE_A}';",
    ]
    assert len(znajdz_trafienia(linie)) == 1
