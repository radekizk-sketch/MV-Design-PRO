"""Importer symboli QElectroTech pola liniowego SN (karta UX-04/POLE-LINIOWE-WZORZEC).

Przypina: (1) świeżość i determinizm wygenerowanej geometrii TS, (2) zgodność gabarytów
i portów z siatką schematu, (3) układ kafla łącznika wg wzorca HMI e²TANGO (decyzja
właściciela 2026-10-30: zawias noża u dołu, styk stały u góry, nóż pionowy = zamknięty, ukośny
= otwarty; znacznik rodzaju aparatu przy styku stałym w jednym rozmiarze 22–28 % boku kafla,
z marginesem i bez kolizji z nożem w żadnym położeniu; symbol ziemi pod uziemnikiem skierowany
w dół), (4) jednolity kwadratowy kafel stanu łączników (wymaganie właściciela 2026-10-29: jeden
bok z jednej stałej manifestu dla każdego łącznika z nożem), (5) stopień symboli LOD2 (uwaga właściciela 2026-10-29:
glif aparatu ok. 55–70 % boku kafla, kreska glifu proporcjonalna do kafla, symbole toru w spójnym
stopniu), (6) ciągłość toru przez symbol (każdy port osiągnięty przewodem albo rysunkiem) oraz
(7) zachowanie fail-closed importera na danych niezaufanych — każda iniekcja w kopii katalogu
źródeł musi przerwać import, a nie wygenerować geometrię po cichu.

Symbole testy składają TĄ SAMĄ funkcją co generator (``zloz_symbole_manifestu``) — z kaflem
stanu, tak jak trafiają do ``qetPoleSn.ts``; druga, niepełna ścieżka składania w teście
sprawdzałaby geometrię, której użytkownik nigdy nie widzi.
"""

from __future__ import annotations

import importlib.util
import json
import math
import shutil
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = PROJECT_ROOT / "scripts"


def _load_script(module_name: str):
    script_path = SCRIPTS_DIR / f"{module_name}.py"
    spec = importlib.util.spec_from_file_location(module_name, script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load script module: {script_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


qet = _load_script("import_qet_pole_sn")

GRID = 8


def _symbole() -> list[dict]:
    return qet.zloz_symbole_manifestu().symbole


@pytest.fixture
def kopia_zrodel(tmp_path, monkeypatch):
    """Kopia katalogu vendor QET z podmienionymi ścieżkami importera (iniekcje)."""
    cel = tmp_path / "qet"
    shutil.copytree(qet.ZRODLA, cel)
    monkeypatch.setattr(qet, "ZRODLA", cel)
    monkeypatch.setattr(qet, "MANIFEST", cel / "import_manifest.json")
    return cel


def _manifest(katalog: Path) -> dict:
    return json.loads((katalog / "import_manifest.json").read_text(encoding="utf-8"))


def _zapisz_manifest(katalog: Path, dane: dict) -> None:
    (katalog / "import_manifest.json").write_text(json.dumps(dane), encoding="utf-8")


def _podmien_zrodlo(katalog: Path, ident: str, stare: bytes, nowe: bytes) -> None:
    """Zmienia plik źródła ORAZ jego SHA w manifeście — sprawdza regułę treści, nie SHA."""
    manifest = _manifest(katalog)
    wpis = next(w for w in manifest["elementy"] if w["id"] == ident)
    plik = katalog / wpis["sourcePath"]
    dane = plik.read_bytes()
    assert stare in dane, "iniekcja musi trafić w treść źródła"
    dane = dane.replace(stare, nowe, 1)
    plik.write_bytes(dane)
    wpis["upstreamBlobSha"] = qet.sha_bloba_git(dane)
    _zapisz_manifest(katalog, manifest)


def test_wygenerowany_plik_ts_jest_swiezy_i_deterministyczny():
    manifest = json.loads(qet.MANIFEST.read_text(encoding="utf-8"))
    cel = PROJECT_ROOT / manifest["wyjscie"]
    pierwszy = qet.generuj()
    assert pierwszy == qet.generuj()
    assert (
        cel.read_text(encoding="utf-8") == pierwszy
    ), "qetPoleSn.ts rozjechany z importerem — python scripts/import_qet_pole_sn.py"
    assert qet.main(["--sprawdz"]) == 0


def test_sha_bloba_zrodel_rowne_manifestowi_i_wszystkie_elementy_uzyte():
    manifest = json.loads(qet.MANIFEST.read_text(encoding="utf-8"))
    for wpis in manifest["elementy"]:
        dane = (qet.ZRODLA / wpis["sourcePath"]).read_bytes()
        assert qet.sha_bloba_git(dane) == wpis["upstreamBlobSha"], wpis["sourcePath"]
    assert manifest["upstreamCommit"] == "14a4727f70856d8e79de59a353fa3c52d3e90e21"
    assert (qet.ZRODLA / "ELEMENTS.LICENSE").is_file()
    readme = (qet.ZRODLA / "README.md").read_text(encoding="utf-8")
    assert "CC BY 3.0" in readme and "QElectroTech" in readme


def test_gabaryty_i_porty_na_siatce_schematu():
    for s in _symbole():
        assert s["szerokosc"] % GRID == 0 and s["wysokosc"] % GRID == 0, s["id"]
        for port in s["porty"]:
            assert port["x"] % GRID == 0 and port["y"] % GRID == 0, (s["id"], port)
            assert 0 <= port["x"] <= s["szerokosc"] and 0 <= port["y"] <= s["wysokosc"]
        o = s["obrys"]
        assert o["x"] >= 0 and o["y"] >= 0, s["id"]
        assert o["x"] + o["width"] <= s["szerokosc"] + 1e-9, s["id"]
        assert o["y"] + o["height"] <= s["wysokosc"] + 1e-9, s["id"]
        # Gabaryt symetryczny względem osi toru (port dolny, bez niego górny).
        nazwy = {p["name"]: p for p in s["porty"]}
        os_x = (nazwy.get("bottom") or nazwy["top"])["x"]
        assert math.isclose(os_x * 2, s["szerokosc"]), s["id"]


LACZNIKI_KAFLA = {
    "qetBreaker",
    "qetBreakerZNapedem",
    "qetDisconnector",
    "qetLoadBreakSwitch",
    "qetFuseSwitch",
    "qetEarthSwitch",
    "qetThreePositionSwitch",
    "qetThreePositionSwitchZNapedem",
}
TROJPOLOZENIOWE = {"qetThreePositionSwitch", "qetThreePositionSwitchZNapedem"}
#: Tabela właściciela (decyzja 2026-10-30): rodzaj aparatu → znaczniki przy stykach stałych.
#: Wyłącznik „×”; odłącznik „○”; rozłącznik — kreska styku z okręgiem (IEC 60617 S00290);
#: uziemnik — sama kreska styku; łącznik trójpołożeniowy — znaczniki obu funkcji przy
#: odpowiednich stykach stałych.
ZNACZNIKI_WG_WLASCICIELA = {
    "qetBreaker": {"closed": "wylacznik"},
    "qetBreakerZNapedem": {"closed": "wylacznik"},
    "qetDisconnector": {"closed": "odlacznik"},
    "qetLoadBreakSwitch": {"closed": "rozlacznik"},
    "qetFuseSwitch": {"closed": "rozlacznik"},
    "qetEarthSwitch": {"closed": "uziemnik"},
    "qetThreePositionSwitch": {"closed": "odlacznik", "earthed": "uziemnik"},
    "qetThreePositionSwitchZNapedem": {"closed": "odlacznik", "earthed": "uziemnik"},
}


def _uklad(zlozone) -> dict:
    return zlozone.manifest["kafelStanu"]["uklad"]


def _swiat(zlozone, qet_jednostki: float) -> float:
    return float(qet_jednostki) * zlozone.skala


def _noz_w_polozeniu(noz: dict, polozenie: str) -> list[tuple[tuple[float, float], ...]]:
    """Odcinki noża w położeniu — NIEZALEŻNIE od importera: zasięg = jednokładność wokół
    przegubu, potem obrót SVG ``rotate(kąt cx cy)`` (oś y w dół, kąt dodatni zgodnie z ruchem
    wskazówek zegara na ekranie)."""
    cx, cy = noz["cx"], noz["cy"]
    k = noz["zasiegi"][polozenie]
    r = math.radians(noz["katy"][polozenie])

    def przenies(x: float, y: float) -> tuple[float, float]:
        dx, dy = (x - cx) * k, (y - cy) * k
        return (cx + dx * math.cos(r) - dy * math.sin(r), cy + dx * math.sin(r) + dy * math.cos(r))

    return [(przenies(p["x1"], p["y1"]), przenies(p["x2"], p["y2"])) for p in noz["prymitywy"]]


def _probki_odcinka(a, b, krok: float = 0.05) -> list[tuple[float, float]]:
    n = max(1, math.ceil(math.dist(a, b) / krok))
    return [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n + 1)]


def _probki_prymitywu(p: dict) -> list[tuple[float, float]]:
    """Punkty linii środkowej prymitywu znacznika albo ziemi (linia, okrąg) — próbkowanie,
    nie analityka importera (wyrocznia niezależna)."""
    if p["k"] == "line":
        return _probki_odcinka((p["x1"], p["y1"]), (p["x2"], p["y2"]))
    if p["k"] == "circle":
        return [
            (
                p["cx"] + p["r"] * math.cos(t / 720 * 2 * math.pi),
                p["cy"] + p["r"] * math.sin(t / 720 * 2 * math.pi),
            )
            for t in range(720)
        ]
    raise AssertionError(f"prymityw {p['k']} poza znacznikiem i ziemią")


def _obwiednia_prymitywow(prymitywy: list[dict]) -> tuple[float, float, float, float]:
    xs, ys = [], []
    for p in prymitywy:
        if p["k"] == "line":
            xs += [p["x1"], p["x2"]]
            ys += [p["y1"], p["y2"]]
        elif p["k"] == "circle":
            xs += [p["cx"] - p["r"], p["cx"] + p["r"]]
            ys += [p["cy"] - p["r"], p["cy"] + p["r"]]
        else:
            raise AssertionError(f"prymityw {p['k']} poza znacznikiem")
    return (min(xs), min(ys), max(xs), max(ys))


def test_noz_ukladu_kafla_zawias_u_dolu_styk_u_gory_i_polozenia():
    """Wzorzec HMI e²TANGO (decyzja właściciela 2026-10-30): zawias noża u dołu, styk stały
    u góry, nóż PIONOWY = zamknięty (koniec noża w punkcie styku zamknięcia), UKOŚNY = otwarty
    (kąt z jednej deklaracji układu), nieustalony = połowa drogi, skrócony; łącznik
    trójpołożeniowy — uziemiony = nóż na zestyku uziemiającym PO PRAWEJ stronie osi (jak na
    rysunku ENEA Zeszyt 1 Z.10 s.89), otwarty między zamkniętym a uziemionym. Geometria noża
    wynika WYŁĄCZNIE ze stanu (uwaga właściciela 2026-10-30)."""
    zlozone = qet.zloz_symbole_manifestu()
    manifest = zlozone.manifest
    po_id = {s["id"]: s for s in zlozone.symbole}
    lacznikowe = {w["symbolId"] for w in manifest["symbole"] if w.get("ukladKafla")}
    assert lacznikowe == LACZNIKI_KAFLA
    # Nóż i kafel wyłącznie w układzie kafla — żaden symbol nie ma już dawnej deklaracji noża.
    assert not any("noz" in w for w in manifest["symbole"])
    uklad = _uklad(zlozone)
    for ident in lacznikowe:
        s = po_id[ident]
        noz = s["noz"]
        katy, zasiegi = noz["katy"], noz["zasiegi"]
        assert all(p["k"] == "line" and p["nozStanu"] for p in noz["prymitywy"]), ident
        zamk = next(z for z in s["znaczniki"] if z["styk"] == "closed")
        (ostrze, *_reszta) = _noz_w_polozeniu(noz, "closed")
        # Nóż pionowy w osi toru (oś = środek kafla), zawias u dołu, koniec na styku zamknięcia.
        # Kierunek linii źródła bez znaczenia: końce ostrza = {przegub, punkt styku zamknięcia}.
        konce = sorted(ostrze, key=lambda q: q[1])
        assert konce[1] == pytest.approx((noz["cx"], noz["cy"])), ident
        assert konce[0] == pytest.approx((zamk["kotwica"]["x"], zamk["kotwica"]["y"])), ident
        assert noz["cx"] == s["kafel"]["width"] / 2, ident
        assert zamk["kotwica"]["y"] < noz["cy"], ident
        assert katy["closed"] == 0 and zasiegi["closed"] == 1, ident
        assert katy["open"] == uklad["noz"]["katOtwarty"] == 45, ident
        assert zasiegi["open"] == 1, ident
        assert katy["unknown"] == pytest.approx(katy["open"] / 2), ident
        assert zasiegi["unknown"] == uklad["noz"]["zasiegNieustalony"], ident
        pewne = [katy[k] for k in ("open", "closed", "earthed") if k in katy]
        assert min(abs(katy["unknown"] - k) for k in pewne) >= 5, ident
        # Otwarty: koniec noża po prawej stronie osi i niżej niż styk zamknięcia (nóż ukośny).
        otw = min(_noz_w_polozeniu(noz, "open")[0], key=lambda q: q[1])
        assert otw[0] > noz["cx"] and otw[1] > zamk["kotwica"]["y"], ident
    for ident in TROJPOLOZENIOWE:
        s = po_id[ident]
        noz = s["noz"]
        uziem = next(z for z in s["znaczniki"] if z["styk"] == "earthed")
        assert noz["katy"]["earthed"] == 90, ident
        assert noz["katy"]["closed"] < noz["katy"]["open"] < noz["katy"]["earthed"], ident
        ostrze_e = _noz_w_polozeniu(noz, "earthed")[0]
        koniec = max(ostrze_e, key=lambda q: math.dist(q, (noz["cx"], noz["cy"])))
        assert koniec == pytest.approx((uziem["kotwica"]["x"], uziem["kotwica"]["y"]))
        assert uziem["kotwica"]["x"] > noz["cx"], "zestyk uziemiający po prawej stronie osi"
    for ident in lacznikowe - TROJPOLOZENIOWE:
        assert "earthed" not in po_id[ident]["noz"]["katy"], ident
    # Napęd nie zmienia noża ani znaczników: łącznik z napędem = łącznik bez napędu + osprzęt.
    for bez, z in (
        ("qetBreaker", "qetBreakerZNapedem"),
        ("qetThreePositionSwitch", "qetThreePositionSwitchZNapedem"),
    ):
        for klucz in ("noz", "znaczniki", "ziemia", "przewody", "porty", "portyWtorne"):
            assert po_id[bez][klucz] == po_id[z][klucz], (z, klucz)
        assert po_id[bez]["osprzet"] == [] and po_id[z]["osprzet"], z
    # Intencja (bez zmian od pierwszej wersji): symbol złożony z kilku elementów QET istnieje
    # tylko z jawną deklaracją złożenia — nigdy po cichu. Złożenia przypięte wprost: łącznik
    # trójpołożeniowy (QET nie ma elementu; z napędem dodatkowo napęd energią zmagazynowaną
    # EN 60617 02-13-20 i napęd ręczny EN 60617 02-13-01), wyłącznik z napędem M, odłącznik
    # (okrąg styku odłączającego 07-13-07 jako znacznik „○”), rozłącznik z bezpiecznikami
    # (znacznik rozłącznika z 07-13-08 — ten sam co w rozłączniku), uziemnik (ziemia
    # 02-15-01) i przekładniki napięciowe wielouzwojeniowe (kopie elementu przekładnika).
    zlozone_ids = {s["id"] for s in po_id.values() if s["zlozenie"]}
    assert zlozone_ids == {
        "qetThreePositionSwitch",
        "qetThreePositionSwitchZNapedem",
        "qetBreakerZNapedem",
        "qetDisconnector",
        "qetFuseSwitch",
        "qetEarthSwitch",
        "qetVoltageTransformer2",
        "qetVoltageTransformer3",
    }
    wiele_skladnikow = {w["symbolId"] for w in manifest["symbole"] if len(w["skladniki"]) > 1}
    assert wiele_skladnikow == zlozone_ids
    assert "złożenie z elementów QET" in po_id["qetThreePositionSwitch"]["zlozenie"]
    for ident, element in (
        ("qetBreakerZNapedem", "en_60617_02_13_26"),
        ("qetDisconnector", "en_60617_07_13_07"),
        ("qetFuseSwitch", "en_60617_07_13_08"),
        ("qetEarthSwitch", "en_60617_02_15_01"),
        ("qetThreePositionSwitchZNapedem", "en_60617_07_13_07"),
        ("qetThreePositionSwitchZNapedem", "en_60617_02_15_01"),
        ("qetThreePositionSwitchZNapedem", "en_60617_02_13_20"),
        ("qetThreePositionSwitchZNapedem", "en_60617_02_13_01"),
    ):
        assert element in po_id[ident]["zlozenie"], (ident, element)
    # Kafel łącznika: porty toru na krawędziach, bez dorysowanych doprowadzeń; rysunek aparatu
    # wyłącznie w nożu i znacznikach (``stale`` puste). Poza łącznikami doprowadzenie powstaje
    # wyłącznie jako przedłużenie portu obwodu wtórnego do rastru (przekładniki).
    for ident in lacznikowe:
        s = po_id[ident]
        assert s["doprowadzenia"] == [] and s["stale"] == [], ident
        for port in s["porty"]:
            assert port["x"] == s["kafel"]["width"] / 2, (ident, port)
            assert port["y"] == (0 if port["dir"] == "N" else s["wysokosc"]), (ident, port)
    for s in po_id.values():
        if s["id"] in lacznikowe:
            continue
        assert s["noz"] is None and s["znaczniki"] == [] and s["ziemia"] is None, s["id"]
        wtorne = {p["name"] for p in s["portyWtorne"]}
        assert {d["port"] for d in s["doprowadzenia"]} <= wtorne, s["id"]


def test_kafel_stanu_jest_jednym_kwadratem_dla_kazdego_lacznika():
    """Wymaganie właściciela 2026-10-29 pkt 1: kafel stanu każdego łącznika z nożem to kwadrat
    z JEDNEJ stałej manifestu (``kafelStanu.bokQet`` × skala = 48 jednostek świata na LOD2) —
    gabaryt symbolu równy kaflowi, porty toru na krawędziach. Symbol bez noża kafla nie ma."""
    zlozone = qet.zloz_symbole_manifestu()
    bok = float(zlozone.manifest["kafelStanu"]["bokQet"]) * zlozone.skala
    assert bok == 48.0
    for s in zlozone.symbole:
        if s["id"] in LACZNIKI_KAFLA:
            assert s["kafel"] == {"x": 0, "y": 0, "width": bok, "height": bok}, s["id"]
            assert s["szerokosc"] == s["wysokosc"] == bok, s["id"]
        else:
            assert s["kafel"] is None, s["id"]
    ts = (qet.KORZEN / zlozone.manifest["wyjscie"]).read_text(encoding="utf-8")
    assert f"QET_BOK_KAFLA_STANU = {bok:g}" in ts
    # Kreska glifu z tej samej deklaracji co bok — proporcjonalna do kafla (bok/24).
    kreska = float(zlozone.manifest["kafelStanu"]["kreskaGlifuQet"]) * zlozone.skala
    assert kreska == pytest.approx(bok / 24)
    assert f"QET_KRESKA_GLIFU = {kreska:g}" in ts


@pytest.mark.parametrize(
    ("wariant", "oczekiwany"),
    [
        ("bok_nieparzysty_rastrowo", "parzystą wielokrotnością"),
        ("przegub_przy_krawedzi", "nie mieści się w kaflu"),
        ("bez_powodu", "bez powodu"),
        ("kreska_zerowa", "kreska glifu poza"),
        ("kreska_ponad_bok_12", "kreska glifu poza"),
    ],
)
def test_iniekcja_kafel_stanu_przerywa_import(kopia_zrodel, wariant, oczekiwany):
    """Kafel się nie rozszerza: przegub przesunięty pod dolną krawędź (rysunek noża poza
    marginesem kafla) przerywa import, zamiast powiększyć kafel."""
    manifest = _manifest(kopia_zrodel)
    if wariant == "bok_nieparzysty_rastrowo":
        manifest["kafelStanu"]["bokQet"] = 100
    elif wariant == "przegub_przy_krawedzi":
        manifest["kafelStanu"]["uklad"]["rodzaje"]["dwupolozeniowy"]["przegub"] = [60, 118]
    elif wariant == "kreska_zerowa":
        manifest["kafelStanu"]["kreskaGlifuQet"] = 0
    elif wariant == "kreska_ponad_bok_12":
        manifest["kafelStanu"]["kreskaGlifuQet"] = 10.5
    else:
        manifest["kafelStanu"]["powod"] = " "
    _zapisz_manifest(kopia_zrodel, manifest)
    with pytest.raises(qet.BladImportu, match=oczekiwany):
        qet.generuj()


@pytest.mark.parametrize(
    ("wariant", "oczekiwany"),
    [
        ("uklad_bez_powodu", "układ kafla bez powodu"),
        ("kat_otwarty_zero", "poza \\(0; 90\\)"),
        ("kat_otwarty_prosty", "poza \\(0; 90\\)"),
        ("otwarty_poza_uziemionym", "nie leży między zamkniętym"),
        ("nieznany_zasieg_zero", "poza \\(0; 1\\)"),
        ("nieznany_zasieg_pelny", "poza \\(0; 1\\)"),
        ("styk_zamkniecia_pod_przegubem", "styk zamknięcia nie leży nad przegubem"),
        ("przegub_poza_osia", "poza osią toru"),
        ("ziemia_przy_nieznanym", "przyłączenie ziemi"),
    ],
)
def test_iniekcja_uklad_kafla_noz_i_rodzaje_przerywa_import(kopia_zrodel, wariant, oczekiwany):
    """Jedna deklaracja układu kafla (``kafelStanu.uklad``) jest decyzją projektową: powód,
    kąt położenia otwartego w (0; 90) i między zamkniętym a uziemionym, zasięg nieustalonego
    w (0; 1), zawias u dołu i styk u góry w osi toru, przyłączenie ziemi ze zbioru zamkniętego."""
    manifest = _manifest(kopia_zrodel)
    uklad = manifest["kafelStanu"]["uklad"]
    rodzaje = uklad["rodzaje"]
    if wariant == "uklad_bez_powodu":
        uklad["powod"] = " "
    elif wariant == "kat_otwarty_zero":
        uklad["noz"]["katOtwarty"] = 0
    elif wariant == "kat_otwarty_prosty":
        uklad["noz"]["katOtwarty"] = 90
    elif wariant == "otwarty_poza_uziemionym":
        rodzaje["trojpolozeniowy"]["styki"]["earthed"] = [70, 50]
    elif wariant == "nieznany_zasieg_zero":
        uklad["noz"]["zasiegNieustalony"] = 0
    elif wariant == "nieznany_zasieg_pelny":
        uklad["noz"]["zasiegNieustalony"] = 1
    elif wariant == "styk_zamkniecia_pod_przegubem":
        rodzaje["dwupolozeniowy"]["styki"]["closed"] = [60, 100]
    elif wariant == "przegub_poza_osia":
        rodzaje["uziemnik"]["przegub"] = [55, 87.5]
    else:
        rodzaje["dwupolozeniowy"]["ziemiaPrzy"] = "open"
    _zapisz_manifest(kopia_zrodel, manifest)
    with pytest.raises(qet.BladImportu, match=oczekiwany):
        qet.generuj()


def test_znacznik_rodzaju_przy_stykach_iloczyn_rodzaj_x_polozenie():
    """Decyzja właściciela 2026-10-30 — znacznik rodzaju aparatu przy styku stałym, iloczyn
    {wyłącznik, wyłącznik z napędem, odłącznik, rozłącznik, rozłącznik z bezpiecznikami,
    uziemnik, trójpołożeniowy z napędem i bez} × {każde położenie noża: zamknięty, otwarty,
    nieustalony, uziemiony}. Sprawdza (wyrocznia z próbkowania, niezależna od analityki
    importera): rozmiar znacznika 22–28 % boku kafla (~11–13 j.św.), margines tuszu od krawędzi
    kafla ≥ 4 j.św., brak kolizji z nożem w żadnym położeniu (tusz ≥ odstęp poza strefą styku,
    na którym nóż spoczywa w tym położeniu), kotwicę wg tabeli rodzajów, jednoznaczne
    rozróżnienie rodzajów po znaczniku i te same proporcje znacznika danego rodzaju
    w każdym symbolu. Ten sam znacznik jest w każdym położeniu (położenie zmienia wyłącznie
    nóż), więc iloczyn z położeniem dotyczy kolizji z nożem."""
    zlozone = qet.zloz_symbole_manifestu()
    po_id = {s["id"]: s for s in zlozone.symbole}
    zn = _uklad(zlozone)["znacznik"]
    bok_kafla = float(zlozone.manifest["kafelStanu"]["bokQet"]) * zlozone.skala
    kreska = float(zlozone.manifest["kafelStanu"]["kreskaGlifuQet"]) * zlozone.skala
    bok_zn = _swiat(zlozone, zn["bokQet"])
    margines = _swiat(zlozone, zn["marginesQet"])
    odstep = _swiat(zlozone, zn["odstepOdNozaQet"])
    strefa = _swiat(zlozone, zn["strefaStykuQet"])
    # Liczby z decyzji właściciela: 22–28 % boku kafla 48 j.św., margines ≥ 4 j.św., kreska
    # znacznika = kreska noża (jedna kreska glifu), znacznik nie nachodzi na nóż.
    assert zn["udzial"] == [0.22, 0.28]
    assert 0.22 * bok_kafla <= bok_zn <= 0.28 * bok_kafla and 11 <= bok_zn <= 13
    assert margines >= 4 and odstep > 0
    kotwice = qet.RODZAJE_ZNACZNIKOW
    sygnatury: dict[str, set] = {}
    for ident, oczekiwane in ZNACZNIKI_WG_WLASCICIELA.items():
        s = po_id[ident]
        assert {z["styk"]: z["rodzaj"] for z in s["znaczniki"]} == oczekiwane, ident
        for z in s["znaczniki"]:
            x0, y0, x1, y1 = _obwiednia_prymitywow(z["prymitywy"])
            assert max(x1 - x0, y1 - y0) == pytest.approx(bok_zn), (ident, z["rodzaj"])
            # Tusz (linia środkowa ± pół kreski) co najmniej ``margines`` od krawędzi kafla.
            assert min(x0, y0) - kreska / 2 >= margines - 1e-9, (ident, z["rodzaj"])
            assert bok_kafla - max(x1, y1) - kreska / 2 >= margines - 1e-9, (ident, z["rodzaj"])
            k = (z["kotwica"]["x"], z["kotwica"]["y"])
            if kotwice[z["rodzaj"]] == "srodek":
                assert ((x0 + x1) / 2, (y0 + y1) / 2) == pytest.approx(k), (ident, z)
            else:
                # Bok obwiedni zwrócony do przegubu przechodzi przez punkt styku.
                przegub = (s["noz"]["cx"], s["noz"]["cy"])
                if abs(przegub[0] - k[0]) < 1e-9:
                    assert (y1 if przegub[1] > k[1] else y0) == pytest.approx(k[1]), (ident, z)
                    assert (x0 + x1) / 2 == pytest.approx(k[0]), (ident, z)
                else:
                    assert (x1 if przegub[0] > k[0] else x0) == pytest.approx(k[0]), (ident, z)
            # Sygnatura kształtu względem kotwicy (rodzaje prymitywów i geometria zaokrąglona).
            sygnatura = tuple(
                sorted(
                    (p["k"],)
                    + tuple(
                        (
                            round(v - (k[0] if c.startswith("x") or c == "cx" else k[1]), 3)
                            if c != "r"
                            else round(v, 3)
                        )
                        for c, v in sorted(p.items())
                        if c in ("x1", "y1", "x2", "y2", "cx", "cy", "r")
                    )
                    for p in z["prymitywy"]
                )
            )
            if z["rodzaj"] == "uziemnik":
                # Kreska styku uziemnika: jedna linia prostopadła do noża — pozioma przy styku nad
                # przegubem, pionowa przy zestyku uziemiającym (nóż poziomy); długość stała.
                (p,) = z["prymitywy"]
                sygnatura = (
                    "uziemnik",
                    round(math.dist((p["x1"], p["y1"]), (p["x2"], p["y2"])), 3),
                )
            sygnatury.setdefault(z["rodzaj"], set()).add(sygnatura)
            # Kolizja z nożem w każdym położeniu (wyrocznia próbkowana).
            probki_zn = [q for p in z["prymitywy"] for q in _probki_prymitywu(p)]
            for polozenie in s["noz"]["katy"]:
                probki_noza = [
                    q
                    for a, b in _noz_w_polozeniu(s["noz"], polozenie)
                    for q in _probki_odcinka(a, b)
                    if polozenie != z["styk"] or math.dist(q, k) > strefa
                ]
                d = min(math.dist(a, b) for a in probki_noza for b in probki_zn)
                assert d - kreska >= odstep - 0.05, (ident, z["rodzaj"], polozenie, d)
    # Ten sam rodzaj = ta sama geometria znacznika w każdym symbolu; różne rodzaje = różne znaki.
    assert set(sygnatury) == {"wylacznik", "odlacznik", "rozlacznik", "uziemnik"}
    for rodzaj, zbior in sygnatury.items():
        assert len(zbior) == 1, (rodzaj, zbior)
    assert len({next(iter(z)) for z in sygnatury.values()}) == 4
    # Wyróżniki: „×” = dwie przecinające się kreski, „○” = jeden okrąg, rozłącznik = kreska
    # i okrąg, uziemnik = jedna kreska.
    rodzaje_prymitywow = {
        r: sorted(p[0] for p in next(iter(z))) if r != "uziemnik" else ["line"]
        for r, z in sygnatury.items()
    }
    assert rodzaje_prymitywow == {
        "wylacznik": ["line", "line"],
        "odlacznik": ["circle"],
        "rozlacznik": ["circle", "line"],
        "uziemnik": ["line"],
    }


def test_symbol_ziemi_pod_uziemnikiem_skierowany_w_dol():
    """Polecenie właściciela 2026-10-30 (wzorzec HMI e²TANGO): symbol ziemi ZAWSZE pod
    uziemnikiem, skierowany w dół, na końcu pionu odgałęzienia — uziemnik (Q8, ziemia przy
    przegubie) i część uziemiająca łącznika trójpołożeniowego (Q1, Q5; ziemia pod dolnym
    końcem kreski zestyku uziemiającego). Pion odgałęzienia biegnie od punktu przyłączenia
    w dół; pierwsza kreska ziemi jest najszersza, kolejne węższe i niżej; całość pod kotwicą
    styku uziemiającego i w kaflu z marginesem."""
    zlozone = qet.zloz_symbole_manifestu()
    ziemia_d = _uklad(zlozone)["ziemia"]
    szer = _swiat(zlozone, ziemia_d["szerokoscQet"])
    pion = _swiat(zlozone, ziemia_d["pionQet"])
    margines = float(zlozone.manifest["kafelStanu"]["marginesQet"]) * zlozone.skala
    z_ziemia = {s["id"] for s in zlozone.symbole if s["ziemia"] is not None}
    assert z_ziemia == {"qetEarthSwitch"} | TROJPOLOZENIOWE
    for s in zlozone.symbole:
        if s["ziemia"] is None:
            continue
        ziemia = s["ziemia"]
        uziem = next(z for z in s["znaczniki"] if z["rodzaj"] == "uziemnik")
        kx, ky = ziemia["kotwica"]["x"], ziemia["kotwica"]["y"]
        if s["id"] == "qetEarthSwitch":
            assert (kx, ky) == (s["noz"]["cx"], s["noz"]["cy"]), "ziemia przy przegubie"
        else:
            (p,) = uziem["prymitywy"]
            assert (kx, ky) == (p["x2"], max(p["y1"], p["y2"])), "pod kreską zestyku"
        assert ky >= uziem["kotwica"]["y"], s["id"]
        (pion_p, *kreski) = ziemia["prymitywy"]
        assert (pion_p["x1"], pion_p["y1"]) == (kx, ky) and pion_p["x2"] == kx, s["id"]
        assert pion_p["y2"] - pion_p["y1"] == pytest.approx(pion), s["id"]
        assert len(kreski) == 3, s["id"]
        szerokosci = []
        poprzednie_y = pion_p["y2"] - 1e-9
        for k in kreski:
            assert k["y1"] == k["y2"], (s["id"], k)
            assert k["y1"] >= poprzednie_y, (s["id"], k)
            poprzednie_y = k["y1"] + 1e-9
            assert (k["x1"] + k["x2"]) / 2 == pytest.approx(kx), (s["id"], k)
            szerokosci.append(abs(k["x2"] - k["x1"]))
            assert k["y1"] <= s["kafel"]["height"] - margines + 1e-9, (s["id"], k)
        assert kreski[0]["y1"] == pytest.approx(pion_p["y2"]), s["id"]
        assert szerokosci[0] == pytest.approx(szer), s["id"]
        assert all(b < a for a, b in zip(szerokosci, szerokosci[1:], strict=False)), szerokosci


@pytest.mark.parametrize(
    ("wariant", "oczekiwany"),
    [
        ("znacznik_za_maly", "za mały albo za duży"),
        ("znacznik_za_duzy", "za mały albo za duży"),
        ("brak_znacznika", "styk closed ma 0 znaczników"),
        ("znacznik_przy_krawedzi", "bliżej krawędzi kafla niż margines"),
        ("znacznik_nachodzi_na_noz", "nachodzi na nóż"),
        ("ziemia_w_gore", "skierowany w górę"),
        ("ziemia_niewysrodkowana", "nie leżą na jednej osi"),
        ("uziemnik_przy_styku_bez_ziemi", "znacznik uziemnika wyłącznie przy styku"),
        ("prymityw_bez_roli", "bez roli w układzie kafla"),
        ("prymityw_dwie_role", "ma dwie role"),
        ("dolny_port_zdjety", "porty \\['top'\\] ≠ \\['top', 'bottom'\\]"),
        ("rodzaj_znacznika_nieznany", "rodzaj znacznika 'bezpiecznik' nieznany"),
        ("rodzaj_ukladu_nieznany", "rodzaj układu kafla 'czteropolozeniowy' nieznany"),
    ],
)
def test_iniekcja_znacznik_i_ziemia_przerywa_import(kopia_zrodel, wariant, oczekiwany):
    """Iniekcje decyzji właściciela 2026-10-30: znacznik za mały, za duży, brakujący, przy
    krawędzi kafla i nachodzący na nóż, ziemia skierowana w górę albo rozjechana, znacznik
    uziemnika przy styku bez ziemi, prymityw bez roli albo z dwiema rolami, port toru niezgodny
    z rodzajem — każda przerywa import (czerwony wynik), żadna nie generuje geometrii po cichu."""
    manifest = _manifest(kopia_zrodel)
    uklad = manifest["kafelStanu"]["uklad"]
    po_id = {w["symbolId"]: w for w in manifest["symbole"]}
    wylacznik = po_id["qetBreaker"]
    if wariant == "znacznik_za_maly":
        uklad["znacznik"]["bokQet"] = 24
    elif wariant == "znacznik_za_duzy":
        uklad["znacznik"]["bokQet"] = 36
    elif wariant == "brak_znacznika":
        (znak,) = wylacznik["ukladKafla"].pop("znaczniki")
        wylacznik["pominPrymitywy"].append(
            {"skladnik": 0, "prymitywy": znak["prymitywy"], "powod": "iniekcja"}
        )
    elif wariant == "znacznik_przy_krawedzi":
        uklad["znacznik"]["marginesQet"] = 20
    elif wariant == "znacznik_nachodzi_na_noz":
        uklad["znacznik"]["strefaStykuQet"] = 5
    elif wariant == "ziemia_w_gore":
        po_id["qetEarthSwitch"]["skladniki"][1]["obrot"] = 180
    elif wariant == "ziemia_niewysrodkowana":
        # Najszersza kreska (−10…10) skrócona jednokładnością wokół lewego końca do −10…8:
        # kreski dalej maleją w dół (18 > 14 > 8), ale środek górnej zjeżdża z osi pionu.
        po_id["qetEarthSwitch"]["skalaLokalna"] = [
            {"skladnik": 1, "prymitywy": [0], "srodek": [-10, 0], "skala": 0.9, "powod": "iniekcja"}
        ]
    elif wariant == "uziemnik_przy_styku_bez_ziemi":
        wylacznik["ukladKafla"]["znaczniki"][0]["rodzaj"] = "uziemnik"
    elif wariant == "prymityw_bez_roli":
        wylacznik.pop("pominPrymitywy")
    elif wariant == "prymityw_dwie_role":
        wylacznik["ukladKafla"]["znaczniki"][0]["prymitywy"] = [2, 3, 4]
    elif wariant == "dolny_port_zdjety":
        wylacznik["porty"] = [p for p in wylacznik["porty"] if p["name"] != "bottom"]
        wylacznik["zaciskiPozaTorem"] = [{"skladnik": 0, "zacisk": [0, 20], "powod": "iniekcja"}]
    elif wariant == "rodzaj_znacznika_nieznany":
        wylacznik["ukladKafla"]["znaczniki"][0]["rodzaj"] = "bezpiecznik"
    else:
        wylacznik["ukladKafla"]["rodzaj"] = "czteropolozeniowy"
    _zapisz_manifest(kopia_zrodel, manifest)
    with pytest.raises(qet.BladImportu, match=oczekiwany):
        qet.generuj()


def test_kwalifikator_napedu_powiekszony_w_kaflu_z_litera_w_okregu():
    """Napęd silnikowy wyłącznika (EN 60617 02-13-26) jest OSPRZĘTEM kafla (``osprzet``
    manifestu, kreska glifu, poza miarą stopnia) i atrybutem łącznika (decyzja właściciela
    2026-10-30: „Napęd M zostaje jako atrybut”): okrąg z literą M powiększony jawną decyzją
    ``skalaLokalna`` (z powodem) wokół punktu styku z linią sprzężenia — okrąg rośnie od linii
    w stronę lewej krawędzi kafla, linia sprzężenia zostaje w źródłowej długości (przegub noża
    → okrąg), litera rośnie razem z okręgiem (środek tą samą jednokładnością), a całość mieści
    się w kaflu stanu z marginesem kafla. Pomiar przed naprawą: litera 2,4 jednostki świata
    (skala źródła), na zrzutach pola 3,6–6,6 px; czytelność na ekranie w zakresie LOD2 przypina
    ``kafelStanu.test.tsx``."""
    zlozone = qet.zloz_symbole_manifestu()
    wpis = next(w for w in zlozone.manifest["symbole"] if w["symbolId"] == "qetBreakerZNapedem")
    znak_napedu = [z for z in wpis["skalaLokalna"] if z["skladnik"] == 1]
    assert len(znak_napedu) == 1 and znak_napedu[0]["powod"].strip()
    assert {o["skladnik"] for o in wpis["osprzet"]} == {1}
    s = next(x for x in zlozone.symbole if x["id"] == "qetBreakerZNapedem")
    (okrag,) = (p for p in s["osprzet"] if p["k"] == "circle")
    (litera,) = (p for p in s["osprzet"] if p["k"] == "letter")
    (sprzezenie,) = (p for p in s["osprzet"] if p["k"] == "line" and p.get("kreskowana"))
    assert len(s["osprzet"]) == 3, "osprzęt kafla = wyłącznie napęd M (okrąg, litera, sprzężenie)"
    skala_znaku = float(znak_napedu[0]["skala"])
    zrodlo = next(e for e in zlozone.manifest["elementy"] if e["id"] == "en_60617_02_13_26")
    assert zrodlo["teksty"] == {"M": "zachowaj"}
    # Rozmiar źródła: okrąg 10 j. QET (promień 5), pismo 6 pt — × skala znaku × skala importu.
    assert okrag["r"] == pytest.approx(5 * skala_znaku * zlozone.skala)
    assert litera["t"] == "M"
    assert litera["size"] == pytest.approx(6 * skala_znaku * zlozone.skala)
    # Linia sprzężenia: długość źródła (20 j. QET), od przegubu noża do prawej krawędzi okręgu.
    assert abs(sprzezenie["x1"] - sprzezenie["x2"]) == pytest.approx(20 * zlozone.skala)
    assert max(sprzezenie["x1"], sprzezenie["x2"]) == s["noz"]["cx"]
    assert sprzezenie["y1"] == sprzezenie["y2"] == s["noz"]["cy"]
    assert min(sprzezenie["x1"], sprzezenie["x2"]) == pytest.approx(okrag["cx"] + okrag["r"])
    margines = float(zlozone.manifest["kafelStanu"]["marginesQet"]) * zlozone.skala
    assert okrag["cx"] - okrag["r"] >= margines - 1e-9
    assert okrag["r"] < okrag["cy"] < s["kafel"]["height"] - okrag["r"]
    assert math.hypot(litera["x"] - okrag["cx"], litera["y"] - okrag["cy"]) < okrag["r"] / 4


@pytest.mark.parametrize("ident", ["qetBreaker", "qetBreakerZNapedem"])
def test_linia_wylaczania_konczy_sie_na_krawedzi_kafla_wylacznika(ident):
    """Uwaga właściciela 2026-10-29 pkt 5 (linia wyłączania od przekaźnika kończy się na
    wyłączniku, nie w środku kafla) w kanonie decyzji 2026-10-30 („kafel zawiera tylko nóż,
    styk stały ze znacznikiem i ewentualnie M; duży osobny symbol w kaflu znika”): port obwodu
    wtórnego ``wylacz`` leży na prawej krawędzi kafla, na rastrze schematu, a kafel nie ma
    cewki wyłączającej (dawny osprzęt EN 60617 07-15-01) ani przewodu do niej — element cewki
    zniknął z manifestu i z katalogu źródeł."""
    zlozone = qet.zloz_symbole_manifestu()
    s = next(x for x in zlozone.symbole if x["id"] == ident)
    (wylacz,) = s["portyWtorne"]
    assert wylacz["name"] == "wylacz" and wylacz["dir"] == "E"
    assert wylacz["x"] == s["kafel"]["width"]
    assert wylacz["x"] % GRID == 0 and wylacz["y"] % GRID == 0
    assert not any(p["k"] == "path" for p in s["osprzet"]), "cewka wyłączająca w kaflu"
    assert all(p["x1"] == p["x2"] for p in s["przewody"]), "przewody wyłącznie w osi toru"
    elementy = {e["id"] for e in zlozone.manifest["elementy"]}
    assert "en_60617_07_15_01" not in elementy
    assert not list(qet.ZRODLA.rglob("en_60617_07_15_01.elmt"))


def test_stopien_glifu_w_zakresie_dla_kazdego_symbolu_i_polozenia():
    """Uwaga właściciela 2026-10-29 pkt 1 i 6: glif aparatu (rysunek bez przewodów i osprzętu)
    zajmuje 55–70 % boku kafla stanu w KAŻDYM położeniu noża łącznika, a symbole toru
    (przekładniki, głowica, wskaźnik, koniec kabla) mają spójny stopień [0,33; 0,70] boku kafla.
    Pomiar przed naprawą (rysunek w skali źródła, znak rodzaju × 2): wyłącznik 0,20–0,20,
    odłącznik 0,19–0,20, rozłącznik z bezpiecznikami 0,19, uziemnik 0,23, przekładnik prądowy
    0,17, przekładnik Ferrantiego 0,33, głowica 0,21, wskaźnik 0,08 boku kafla. W układzie
    kafla (decyzja właściciela 2026-10-30) glif łącznika = nóż + znaczniki + ziemia; stopień
    wynika z układu, nie z jednokładności rysunku. Miara importera (``udzialy``) jest
    sprawdzana NIEZALEŻNIE z obwiedni glifu w wyjściu TS."""
    zlozone = qet.zloz_symbole_manifestu()
    deklaracja = zlozone.manifest["stopienSymboli"]
    assert deklaracja["kafel"] == [0.55, 0.70] and deklaracja["tor"] == [0.33, 0.70]
    assert deklaracja["powod"].strip()
    bok = float(zlozone.manifest["kafelStanu"]["bokQet"]) * zlozone.skala
    lacznikowe = {w["symbolId"] for w in zlozone.manifest["symbole"] if w.get("ukladKafla")}
    assert lacznikowe == LACZNIKI_KAFLA
    for s in zlozone.symbole:
        lo, hi = deklaracja["kafel"] if s["id"] in lacznikowe else deklaracja["tor"]
        udzialy = zlozone.udzialy[s["id"]]
        oczekiwane = set(s["noz"]["katy"]) if s["noz"] else {"open"}
        assert set(udzialy) == oczekiwane, s["id"]
        for polozenie, u in udzialy.items():
            assert lo - 1e-9 <= u <= hi + 1e-9, (s["id"], polozenie, u)
        # Obwiednia glifu w wyjściu = suma położeń: jej wysokość to największy udział.
        assert s["glif"]["height"] / bok == pytest.approx(max(udzialy.values()), abs=1e-3)
        # Glif w gabarycie; łącznik — w kaflu z marginesem.
        g = s["glif"]
        m = float(zlozone.manifest["kafelStanu"]["marginesQet"]) * zlozone.skala
        m = m if s["id"] in lacznikowe else 0
        assert g["x"] >= m - 1e-9 and g["y"] >= m - 1e-9, s["id"]
        assert g["x"] + g["width"] <= s["szerokosc"] - m + 1e-9, s["id"]
        assert g["y"] + g["height"] <= s["wysokosc"] - m + 1e-9, s["id"]


def _koniec_linii(p: dict) -> list[tuple[float, float]]:
    return [(p["x1"], p["y1"]), (p["x2"], p["y2"])]


def test_kazdy_port_osiagniety_przewodem_albo_rysunkiem_aparatu():
    """Ciągłość toru przez symbol po przycięciu przewodów do gabarytu: każdy port toru
    i obwodu wtórnego jest końcem przewodu albo leży na obwiedni glifu w odległości nie
    większej niż połowa kreski glifu (przekładnik napięciowy: okrąg uzwojenia pierwotnego pod
    portem). Port bez przewodu i z przerwą do rysunku = przerwany tor na schemacie. Port obwodu
    wtórnego kafla łącznika (``wylacz``) jest końcem linii wyłączania NA KRAWĘDZI kafla —
    kafel nie ma osobnego symbolu cewki (decyzja właściciela 2026-10-30)."""
    zlozone = qet.zloz_symbole_manifestu()
    pol_kreski = float(zlozone.manifest["kafelStanu"]["kreskaGlifuQet"]) * zlozone.skala / 2
    for s in zlozone.symbole:
        konce = [
            q for p in s["przewody"] + s["stale"] if p["k"] == "line" for q in _koniec_linii(p)
        ]
        g = s["glif"]
        wtorne = s["portyWtorne"]
        if s["kafel"] is not None:
            for port in wtorne:
                assert port["x"] in (0, s["kafel"]["width"]) or port["y"] in (
                    0,
                    s["kafel"]["height"],
                ), (s["id"], port)
            wtorne = []
        for port in s["porty"] + wtorne:
            punkt = (port["x"], port["y"])
            if any(math.dist(punkt, q) < 1e-6 for q in konce):
                continue
            if port["dir"] in ("N", "S"):
                krawedz = g["y"] if port["dir"] == "N" else g["y"] + g["height"]
                odstep = abs(port["y"] - krawedz)
            else:
                krawedz = g["x"] if port["dir"] == "W" else g["x"] + g["width"]
                odstep = abs(port["x"] - krawedz)
            assert odstep <= pol_kreski + 1e-9, (s["id"], port, odstep)


def test_przewody_poza_miara_glifu_i_w_gabarycie():
    """Przewód (linia od zacisku portu w kierunku portu) jest w ``przewody`` — kreska
    przewodu, przycięty do gabarytu; nie wchodzi do ``stale`` (kreska glifu) ani do miary
    stopnia. Wyłącznik: przewód toru od portu górnego do krzyżyka styku i od przegubu do portu
    dolnego; krzyżyk jest znacznikiem styku (dwie kreski), nie kreską stałą."""
    po_id = {s["id"]: s for s in _symbole()}
    for s in po_id.values():
        for p in s["przewody"]:
            assert p["k"] == "line", s["id"]
            assert p["x1"] == pytest.approx(p["x2"], abs=0.11) or p["y1"] == p["y2"], s["id"]
            for x, y in _koniec_linii(p):
                assert -1e-9 <= x <= s["szerokosc"] + 1e-9, s["id"]
                assert -1e-9 <= y <= s["wysokosc"] + 1e-9, s["id"]
    wylacznik = po_id["qetBreaker"]
    assert len(wylacznik["przewody"]) == 2
    assert wylacznik["stale"] == []
    (krzyzyk,) = wylacznik["znaczniki"]
    assert krzyzyk["rodzaj"] == "wylacznik"
    assert [p["k"] for p in krzyzyk["prymitywy"]] == ["line", "line"]  # „×” (dwie kreski)
    assert po_id["bayReserve"]["przewody"] == []  # odcinek kabla jest treścią znaku


@pytest.mark.parametrize(
    ("wariant", "oczekiwany"),
    [
        ("tor_bez_jednokladnosci", "qetCurrentTransformer: stopień glifu 0.167"),
        ("kafel_dolny_prog", "qetBreaker: stopień glifu 0.562 .*closed"),
        ("kafel_gorny_prog", "qetDisconnector: stopień glifu 0.688 .*closed"),
        ("tor_dolny_prog", "qetVoltageIndicator: stopień glifu 0.333"),
    ],
)
def test_iniekcja_stopien_glifu_poza_progiem_przerywa_import(kopia_zrodel, wariant, oczekiwany):
    """Iniekcje progów stopnia glifu — każda przerywa import: przekładnik prądowy bez
    ``skalaRysunku`` (rysunek w skali źródła, 0,167 boku kafla — stan sprzed uwagi właściciela
    2026-10-29) zamiast miniaturowego znaku w dużym kaflu; podniesiony dolny próg kafla odrzuca
    wyłącznik (0,5625 — nóż z krzyżykiem w układzie kafla), obniżony górny próg kafla odrzuca
    odłącznik (0,6875 — okrąg nad końcem noża); podniesiony dolny próg toru odrzuca wskaźnik
    pojemnościowy (0,333)."""
    manifest = _manifest(kopia_zrodel)
    if wariant == "tor_bez_jednokladnosci":
        ct = next(w for w in manifest["symbole"] if w["symbolId"] == "qetCurrentTransformer")
        ct.pop("skalaRysunku")
    elif wariant == "kafel_dolny_prog":
        manifest["stopienSymboli"]["kafel"] = [0.6, 0.7]
    elif wariant == "kafel_gorny_prog":
        manifest["stopienSymboli"]["kafel"] = [0.55, 0.65]
    else:
        manifest["stopienSymboli"]["tor"] = [0.4, 0.7]
    _zapisz_manifest(kopia_zrodel, manifest)
    with pytest.raises(qet.BladImportu, match=oczekiwany):
        qet.generuj()


@pytest.mark.parametrize(
    ("wariant", "oczekiwany"),
    [
        ("bez_powodu", "skala rysunku bez powodu"),
        ("k_poza_zakresem", "skala rysunku 5.0 poza"),
        ("k_rowne_1", "skala rysunku 1.0 poza"),
        ("skladnik_spoza", "składnik spoza złożenia"),
        ("stopien_bez_powodu", "stopień symboli bez powodu"),
        ("stopien_zakres_odwrocony", "zakres kafel"),
        ("skala_rysunku_w_kaflu", "qetBreaker: skalaRysunku zbędne w układzie kafla"),
    ],
)
def test_iniekcja_skala_rysunku_i_stopien_przerywa_import(kopia_zrodel, wariant, oczekiwany):
    """Jednokładność rysunku (``skalaRysunku``) wyłącznie w symbolu toru (przekładnik prądowy),
    z powodem, w zakresie i dla składników złożenia; w kaflu łącznika rozmiar wynika z układu
    kafla, więc deklaracja skali rysunku łącznika przerywa import (druga prawda rozmiaru)."""
    manifest = _manifest(kopia_zrodel)
    wpis = next(w for w in manifest["symbole"] if w["symbolId"] == "qetCurrentTransformer")
    if wariant == "skala_rysunku_w_kaflu":
        lacznik = next(w for w in manifest["symbole"] if w["symbolId"] == "qetBreaker")
        lacznik["skalaRysunku"] = dict(wpis["skalaRysunku"], skladniki=[0])
    elif wariant == "bez_powodu":
        wpis["skalaRysunku"]["powod"] = " "
    elif wariant == "k_poza_zakresem":
        wpis["skalaRysunku"]["k"] = 5
    elif wariant == "k_rowne_1":
        wpis["skalaRysunku"]["k"] = 1
    elif wariant == "skladnik_spoza":
        wpis["skalaRysunku"]["skladniki"] = [0, 7]
    elif wariant == "stopien_bez_powodu":
        manifest["stopienSymboli"]["powod"] = ""
    else:
        manifest["stopienSymboli"]["kafel"] = [0.7, 0.55]
    _zapisz_manifest(kopia_zrodel, manifest)
    with pytest.raises(qet.BladImportu, match=oczekiwany):
        qet.generuj()


def test_szerokosc_znaku_z_metryki_kroju_zrodla_i_fail_closed():
    """Środek litery liczony z posuwu znaku kroju schematu (Liberation Sans) w odmianie, którą
    renderer rysuje litery symboli (waga 600 → odmiana 700), nie z jednej szerokości dla
    wszystkich znaków; znak spoza tabeli kroju (``core/metrykiKroju.json``, krój ``sans``)
    przerywa import — litera symbolu bez posuwu w tabeli nie dostaje szacunku."""
    assert qet.szerokosc_tekstu("M", 6) == pytest.approx(6 * 1706 / 2048)
    assert qet.szerokosc_tekstu("3", 9) == pytest.approx(9 * 1139 / 2048)
    # „x” odmiany pogrubionej (1139); zwykła ma 1024 — odmiana z wagi renderera, nie źródła QET.
    assert qet.szerokosc_tekstu("x", 6) == pytest.approx(6 * 1139 / 2048)
    with pytest.raises(qet.BladImportu, match="brak szerokości znaków"):
        qet.szerokosc_tekstu("M\u4e2d", 6)


def test_iniekcja_skala_lokalna_bez_powodu_lub_poza_skala_przerywa_import(kopia_zrodel):
    manifest = _manifest(kopia_zrodel)
    wpis = next(w for w in manifest["symbole"] if w["symbolId"] == "qetBreakerZNapedem")
    znak = next(z for z in wpis["skalaLokalna"] if z["skladnik"] == 1)
    znak["powod"] = " "
    _zapisz_manifest(kopia_zrodel, manifest)
    with pytest.raises(qet.BladImportu, match="skala lokalna bez powodu"):
        qet.generuj()
    znak["powod"] = "iniekcja"
    for skala in (4.5, 0.2, 1):
        znak["skala"] = skala
        _zapisz_manifest(kopia_zrodel, manifest)
        with pytest.raises(qet.BladImportu, match="poza \\[0,25; 4\\] albo równa 1"):
            qet.generuj()
    # Skala dopuszczalna, ale okrąg napędu wychodzi poza kafel — kafel się nie rozszerza.
    znak["skala"] = 4
    _zapisz_manifest(kopia_zrodel, manifest)
    with pytest.raises(qet.BladImportu, match="nie mieści się w kaflu"):
        qet.generuj()


@pytest.mark.parametrize(
    ("wariant", "oczekiwany"),
    [
        ("osprzet_bez_powodu", "osprzęt bez powodu"),
        ("osprzet_skladnik_noza", "składnik noża nie może być osprzętem"),
        ("osprzet_spoza", "osprzęt wskazuje składnik spoza złożenia"),
        ("zacisk_znacznika_bez_deklaracji", "qetDisconnector: zacisk źródła .* bez przypisania"),
    ],
)
def test_iniekcja_osprzet_lacznika_przerywa_import(kopia_zrodel, wariant, oczekiwany):
    """Osprzęt kafla (napęd M) z powodem i wyłącznie ze składnika złożenia innego niż nóż —
    wskazanie spoza złożenia nie jest już ignorowane po cichu (dawniej fail-open). Zacisk
    składnika znacznika (okrąg styku odłączającego 07-13-07 w odłączniku) bez deklaracji
    zacisku poza torem przerywa import."""
    manifest = _manifest(kopia_zrodel)
    wpis = next(w for w in manifest["symbole"] if w["symbolId"] == "qetBreakerZNapedem")
    if wariant == "osprzet_bez_powodu":
        wpis["osprzet"][0]["powod"] = ""
    elif wariant == "osprzet_skladnik_noza":
        wpis["osprzet"].append({"skladnik": 0, "powod": "iniekcja"})
    elif wariant == "osprzet_spoza":
        wpis["osprzet"].append({"skladnik": 5, "powod": "iniekcja"})
    else:
        odlacznik = next(w for w in manifest["symbole"] if w["symbolId"] == "qetDisconnector")
        odlacznik.pop("zaciskiPozaTorem")
    _zapisz_manifest(kopia_zrodel, manifest)
    with pytest.raises(qet.BladImportu, match=oczekiwany):
        qet.generuj()


def test_iniekcja_zmieniony_plik_bez_zmiany_sha_przerywa_import(kopia_zrodel):
    wpis = _manifest(kopia_zrodel)["elementy"][0]
    plik = kopia_zrodel / wpis["sourcePath"]
    plik.write_bytes(plik.read_bytes() + b"\n")
    with pytest.raises(qet.BladImportu, match="SHA bloba"):
        qet.generuj()


def test_iniekcja_dtd_przerywa_import(kopia_zrodel):
    _podmien_zrodlo(
        kopia_zrodel,
        "en_60617_07_13_05",
        b"<definition",
        b'<!DOCTYPE x [<!ENTITY a "b">]><definition',
    )
    with pytest.raises(qet.BladImportu, match="DTD"):
        qet.generuj()


def test_iniekcja_nieznany_element_rysunku_przerywa_import(kopia_zrodel):
    # ``rect`` jest dziś figurą dopuszczoną (zaczerniony wtyk głowicy kablowej EN 60617 03-03-05),
    # więc iniekcja wstawia element spoza listy figur importera.
    _podmien_zrodlo(
        kopia_zrodel, "en_60617_07_13_05", b"<line ", b'<polyline points="0,0 4,4"/><line '
    )
    with pytest.raises(qet.BladImportu, match="nieznany element rysunku"):
        qet.generuj()


def test_iniekcja_tekst_bez_decyzji_przerywa_import(kopia_zrodel):
    manifest = _manifest(kopia_zrodel)
    wpis = next(w for w in manifest["elementy"] if w["id"] == "en_60617_06_13_10")
    wpis["teksty"].pop("3")
    _zapisz_manifest(kopia_zrodel, manifest)
    with pytest.raises(qet.BladImportu, match="bez decyzji"):
        qet.generuj()


def test_iniekcja_zacisk_bez_przypisania_przerywa_import(kopia_zrodel):
    manifest = _manifest(kopia_zrodel)
    symbol = next(w for w in manifest["symbole"] if w["symbolId"] == "qetBreaker")
    symbol["porty"] = [p for p in symbol["porty"] if p["name"] != "bottom"]
    _zapisz_manifest(kopia_zrodel, manifest)
    with pytest.raises(qet.BladImportu, match="bez przypisania"):
        qet.generuj()


@pytest.mark.parametrize("symbol_id", ["qetVoltageTransformer2", "qetVoltageTransformer3"])
@pytest.mark.parametrize("wariant", ["bez_deklaracji", "bez_powodu", "zly_zacisk"])
def test_iniekcja_zacisk_poza_torem_wymaga_deklaracji_z_powodem(kopia_zrodel, wariant, symbol_id):
    """Zacisk wtórny kolejnego uzwojenia przekładnika napięciowego wielouzwojeniowego (kopia
    elementu QET bez doprowadzenia w złożeniu) nie jest portem: bez deklaracji, z pustym
    powodem albo ze wskazaniem nieistniejącego zacisku import jest przerywany. Przekładnik
    jednouzwojeniowy nie ma zacisków poza torem — jego zacisk wtórny jest portem obwodu
    wtórnego (``portyWtorne``)."""
    manifest = _manifest(kopia_zrodel)
    symbol = next(w for w in manifest["symbole"] if w["symbolId"] == symbol_id)
    if wariant == "bez_deklaracji":
        symbol.pop("zaciskiPozaTorem")
        oczekiwany = "bez przypisania"
    elif wariant == "bez_powodu":
        symbol["zaciskiPozaTorem"][0]["powod"] = "  "
        oczekiwany = "bez powodu"
    else:
        symbol["zaciskiPozaTorem"][0]["zacisk"] = [0, 70]
        oczekiwany = "nie ma zacisku"
    _zapisz_manifest(kopia_zrodel, manifest)
    with pytest.raises(qet.BladImportu, match=oczekiwany):
        qet.generuj()


@pytest.mark.parametrize(
    "symbol_id", ["qetVoltageTransformer", "qetVoltageTransformer2", "qetVoltageTransformer3"]
)
def test_przekladnik_napieciowy_ma_jeden_port_pierwotny(symbol_id):
    vt = next(s for s in _symbole() if s["id"] == symbol_id)
    assert [p["name"] for p in vt["porty"]] == ["top"]
    assert [p["name"] for p in vt["portyWtorne"]] == ["wtorny"]
    assert vt["noz"] is None


def test_iniekcja_sciezka_poza_katalogiem_przerywa_import(kopia_zrodel):
    manifest = _manifest(kopia_zrodel)
    manifest["elementy"][0]["sourcePath"] = "../poza.elmt"
    _zapisz_manifest(kopia_zrodel, manifest)
    with pytest.raises(qet.BladImportu, match="niebezpieczna ścieżka"):
        qet.generuj()


@pytest.mark.parametrize(
    ("ident", "stare", "nowe", "oczekiwany"),
    [
        # Styl spoza listy importera.
        (
            "en_60617_07_13_05",
            b"line-style:normal",
            b"line-style:dotted",
            "styl kreski 'dotted' nieobsługiwany",
        ),
        # Kreska przerywana jest dopuszczona WYŁĄCZNIE dla linii (sprzęgło napędu silnikowego
        # EN 60617 02-13-26) — na figurze innej niż linia przerywa import.
        (
            "en_60617_07_13_07",
            b'<ellipse x="-2" y="0" width="4" height="4" style="line-style:normal',
            b'<ellipse x="-2" y="0" width="4" height="4" style="line-style:dashed',
            "dopuszczony wyłącznie dla linii",
        ),
        # Kolor inny niż czarny wymaga osobnej oceny (kolor stanu nadaje schemat, nie źródło).
        ("en_60617_07_13_05", b"color:black", b"color:red", "wymaga osobnej oceny"),
    ],
    ids=["styl_nieobslugiwany", "przerywana_poza_linia", "kolor"],
)
def test_iniekcja_kolor_lub_styl_kreski_przerywa_import(
    kopia_zrodel, ident, stare, nowe, oczekiwany
):
    _podmien_zrodlo(kopia_zrodel, ident, stare, nowe)
    with pytest.raises(qet.BladImportu, match=oczekiwany):
        qet.generuj()


@pytest.mark.parametrize(
    "wariant",
    [
        "port_toru",
        "port_wtorny_punkt",
        "port_wtorny_wylacz_poza_rastrem",
        "port_wtorny_wylacz_poza_krawedzia",
        "przedluzenie_bez_kierunku",
        "przedluzenie_zbedne",
    ],
)
def test_iniekcja_port_poza_rastrem_qet_przerywa_import(kopia_zrodel, wariant):
    """Każdy rodzaj punktu zaczepienia (port toru bez zacisku źródła, koniec doprowadzenia
    obwodu wtórnego, koniec linii wyłączania na krawędzi kafla wyłącznika) poza rastrem
    zacisków albo — w kaflu — poza krawędzią kafla przerywa import; przedłużenie przewodu obwodu wtórnego do rastru wymaga kierunku i nie jest
    dopuszczone dla punktu leżącego już na rastrze (fikcyjny odcinek)."""
    manifest = _manifest(kopia_zrodel)
    po_id = {w["symbolId"]: w for w in manifest["symbole"]}
    if wariant == "port_toru":
        # Port dolny głowicy przeniesiony z zacisku źródła na punkt o 5 jednostek QET obok;
        # zacisk źródła zadeklarowany poza torem, żeby zadziałała reguła rastru, nie przypisania.
        symbol = po_id["qetCableHead"]
        symbol["porty"][1] = {
            "name": "bottom",
            "skladnik": 0,
            "punkt": [-25, 0],
            "dir": "S",
            "powod": "iniekcja",
        }
        symbol["zaciskiPozaTorem"] = [{"skladnik": 0, "zacisk": [-20, 0], "powod": "iniekcja"}]
        oczekiwany = "port bottom poza rastrem"
    elif wariant == "port_wtorny_punkt":
        po_id["qetCoreBalanceCt"]["portyWtorne"][0]["punkt"] = [40, 5]
        oczekiwany = "port wtórny wtorny poza rastrem"
    elif wariant == "port_wtorny_wylacz_poza_rastrem":
        po_id["qetBreaker"]["portyWtorne"][0]["punkt"] = [120, 50]
        oczekiwany = "port wtórny wylacz poza rastrem"
    elif wariant == "port_wtorny_wylacz_poza_krawedzia":
        po_id["qetBreaker"]["portyWtorne"][0]["punkt"] = [110, 60]
        oczekiwany = "port wtórny wylacz poza krawędzią kafla E"
    elif wariant == "przedluzenie_bez_kierunku":
        po_id["qetVoltageTransformer"]["portyWtorne"][0]["przedluzenie"].pop("kierunek")
        oczekiwany = "przedłużenie portu wtórnego wtorny bez kierunku"
    else:
        po_id["qetCoreBalanceCt"]["portyWtorne"][0]["przedluzenie"] = {
            "kierunek": "S",
            "powod": "iniekcja",
        }
        oczekiwany = "zbędne"
    _zapisz_manifest(kopia_zrodel, manifest)
    with pytest.raises(qet.BladImportu, match=oczekiwany):
        qet.generuj()


@pytest.mark.parametrize(
    ("symbol_id", "oczekiwany"),
    [
        ("qetThreePositionSwitchZNapedem", "portyWewnatrzGabarytu zbędne w układzie kafla"),
        ("qetCableHead", "poza krawędzią gabarytu"),
    ],
)
def test_iniekcja_deklaracja_portu_wewnatrz_gabarytu_rozna_od_geometrii_przerywa_import(
    kopia_zrodel, symbol_id, oczekiwany
):
    """Predykat parami: zbiór portów wewnątrz gabarytu wyliczony z geometrii i zbiór
    zadeklarowany w manifeście muszą być równe — deklaracja portu, który leży na krawędzi
    symbolu toru, przerywa import; w kaflu łącznika porty toru leżą na krawędziach z układu,
    więc sama deklaracja jest zbędna i przerywa import."""
    manifest = _manifest(kopia_zrodel)
    symbol = next(w for w in manifest["symbole"] if w["symbolId"] == symbol_id)
    symbol.setdefault("portyWewnatrzGabarytu", {})["top"] = "iniekcja"
    _zapisz_manifest(kopia_zrodel, manifest)
    with pytest.raises(qet.BladImportu, match=oczekiwany):
        qet.generuj()
