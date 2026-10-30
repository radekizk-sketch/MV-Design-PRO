"""Importer symboli QElectroTech pola liniowego SN (karta UX-04/POLE-LINIOWE-WZORZEC).

Przypina: (1) świeżość i determinizm wygenerowanej geometrii TS, (2) zgodność gabarytów
i portów z siatką schematu, (3) regułę noża (zamknięcie = obrót na styk stały), (4) jednolity
kwadratowy kafel stanu łączników (wymaganie właściciela 2026-10-29: jeden bok z jednej stałej
manifestu dla każdego łącznika z nożem), (5) stopień symboli LOD2 (uwaga właściciela 2026-10-29:
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


def test_noz_zamyka_na_styk_staly_a_trojpolozeniowy_ma_polozenie_uziemione():
    manifest = json.loads(qet.MANIFEST.read_text(encoding="utf-8"))
    po_id = {s["id"]: s for s in _symbole()}
    lacznikowe = {w["symbolId"] for w in manifest["symbole"] if w.get("noz")}
    # Wyłącznik z napędem silnikowym M (wymaganie właściciela 2026-10-29 pkt 4) jest osobnym
    # symbolem z nożem — ta sama reguła noża i ten sam kafel co wyłącznik bez napędu.
    assert lacznikowe == {
        "qetBreaker",
        "qetBreakerZNapedem",
        "qetDisconnector",
        "qetLoadBreakSwitch",
        "qetFuseSwitch",
        "qetEarthSwitch",
        "qetThreePositionSwitch",
    }
    for ident in lacznikowe:
        noz = po_id[ident]["noz"]
        assert noz["katy"]["open"] == 0
        assert noz["katy"]["closed"] != 0
        assert all(p["k"] == "line" and p["nozStanu"] for p in noz["prymitywy"])
    trojpol = po_id["qetThreePositionSwitch"]["noz"]["katy"]
    # Zamknięty i uziemiony — przeciwne kierunki od położenia odłączonego (oś).
    assert trojpol["closed"] == -trojpol["earthed"] and trojpol["closed"] < 0
    assert trojpol["unknown"] == 0
    # Dwupołożeniowe: nieznany = połowa kąta zamknięcia.
    for ident in lacznikowe - {"qetThreePositionSwitch"}:
        katy = po_id[ident]["noz"]["katy"]
        assert "earthed" not in katy
        assert math.isclose(katy["unknown"], katy["closed"] / 2, abs_tol=1e-4)
    # Intencja (bez zmian od pierwszej wersji): symbol złożony z kilku elementów QET istnieje
    # tylko z jawną deklaracją złożenia — nigdy po cichu. Zbiór złożeń przypięty wprost: łącznik
    # trójpołożeniowy (QET nie ma elementu), oba wyłączniki (wyłącznik + cewka wyłączająca
    # EN 60617 07-15-01 — koniec linii wyłączania; z napędem M dodatkowo napęd silnikowy)
    # i przekładniki napięciowe wielouzwojeniowe (kopie elementu przekładnika, rysunek Z.11.1).
    zlozone = {s["id"] for s in po_id.values() if s["zlozenie"]}
    assert zlozone == {
        "qetThreePositionSwitch",
        "qetBreaker",
        "qetBreakerZNapedem",
        "qetVoltageTransformer2",
        "qetVoltageTransformer3",
    }
    wiele_skladnikow = {w["symbolId"] for w in manifest["symbole"] if len(w["skladniki"]) > 1}
    assert wiele_skladnikow == zlozone
    assert "złożenie z elementów QET" in po_id["qetThreePositionSwitch"]["zlozenie"]
    assert "en_60617_02_13_26" in po_id["qetBreakerZNapedem"]["zlozenie"]
    for ident in ("qetBreaker", "qetBreakerZNapedem"):
        assert "en_60617_07_15_01" in po_id[ident]["zlozenie"], ident
    # Intencja: odcinek przewodu dorysowany przez importer (zacisk źródła WEWNĄTRZ kafla →
    # krawędź) jest JAWNY w ``doprowadzenia``, pionowy, kończy się na krawędzi w stronę portu
    # i ma powód; zacisk źródła POZA kaflem (rysunek po jednokładności) przenosi się na krawędź
    # z przycięciem przewodu, bez doprowadzenia. Po jednokładności rysunku jedynym zaciskiem toru
    # wewnątrz kafla jest zacisk szynowy łącznika trójpołożeniowego (uziemienie nad zestykiem
    # uziemiającym sięga ponad poziom zacisków) — z powodem z własnej deklaracji.
    tor_z_doprowadzeniem = set()
    for ident in lacznikowe:
        s = po_id[ident]
        porty = {p["name"]: p for p in s["porty"]}
        for port in porty.values():
            assert port["y"] == (0 if port["dir"] == "N" else s["wysokosc"]), (ident, port)
        for d in (d for d in s["doprowadzenia"] if d["port"] in porty):
            tor_z_doprowadzeniem.add((ident, d["port"]))
            port = porty[d["port"]]
            assert d["x1"] == d["x2"] == port["x"], (ident, d)
            assert d["y2"] == port["y"], (ident, d)
            assert 0 < d["y1"] < s["wysokosc"] and d["powod"].startswith("zacisk szynowy QET")
    assert tor_z_doprowadzeniem == {("qetThreePositionSwitch", "top")}
    # Poza łącznikami doprowadzenie powstaje wyłącznie jako przedłużenie portu obwodu wtórnego
    # do rastru (przekładniki) — port toru pierwotnego leży na krawędzi bez dorysowań.
    for s in po_id.values():
        if s["id"] in lacznikowe:
            continue
        wtorne = {p["name"] for p in s["portyWtorne"]}
        assert {d["port"] for d in s["doprowadzenia"]} <= wtorne, s["id"]


def test_kafel_stanu_jest_jednym_kwadratem_dla_kazdego_lacznika():
    """Wymaganie właściciela 2026-10-29 pkt 1: kafel stanu każdego łącznika z nożem to kwadrat
    z JEDNEJ stałej manifestu (``kafelStanu.bokQet`` × skala = 48 jednostek świata na LOD2) —
    gabaryt symbolu równy kaflowi, porty toru na krawędziach. Symbol bez noża kafla nie ma."""
    zlozone = qet.zloz_symbole_manifestu()
    bok = float(zlozone.manifest["kafelStanu"]["bokQet"]) * zlozone.skala
    assert bok == 48.0
    lacznikowe = {w["symbolId"] for w in zlozone.manifest["symbole"] if w.get("noz")}
    for s in zlozone.symbole:
        if s["id"] in lacznikowe:
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
        ("bok_mniejszy_niz_rysunek", "nie mieści się w kaflu"),
        ("bez_powodu", "bez powodu"),
        ("kreska_zerowa", "kreska glifu poza"),
        ("kreska_ponad_bok_12", "kreska glifu poza"),
    ],
)
def test_iniekcja_kafel_stanu_przerywa_import(kopia_zrodel, wariant, oczekiwany):
    manifest = _manifest(kopia_zrodel)
    if wariant == "bok_nieparzysty_rastrowo":
        manifest["kafelStanu"]["bokQet"] = 100
    elif wariant == "bok_mniejszy_niz_rysunek":
        manifest["kafelStanu"]["bokQet"] = 80
    elif wariant == "kreska_zerowa":
        manifest["kafelStanu"]["kreskaGlifuQet"] = 0
    elif wariant == "kreska_ponad_bok_12":
        manifest["kafelStanu"]["kreskaGlifuQet"] = 10.5
    else:
        manifest["kafelStanu"]["powod"] = " "
    _zapisz_manifest(kopia_zrodel, manifest)
    with pytest.raises(qet.BladImportu, match=oczekiwany):
        qet.generuj()


def test_kwalifikator_napedu_powiekszony_w_kaflu_z_litera_w_okregu():
    """Napęd silnikowy wyłącznika (EN 60617 02-13-26) jest OSPRZĘTEM kafla (``osprzet``
    manifestu, kreska glifu, poza miarą stopnia): okrąg z literą M powiększony jawną decyzją
    ``skalaLokalna`` (z powodem) wokół punktu styku z linią sprzężenia — okrąg rośnie od linii
    w stronę lewej krawędzi kafla (prawą zajmuje cewka wyłączająca), linia sprzężenia zostaje
    w źródłowej długości (przegub noża → okrąg), litera rośnie razem z okręgiem (środek tą samą
    jednokładnością), a całość mieści się w kaflu stanu z marginesem kafla. Pomiar przed
    naprawą: litera 2,4 jednostki świata (skala źródła), na zrzutach pola 3,6–6,6 px;
    czytelność na ekranie w zakresie LOD2 przypina ``kafelStanu.test.tsx``."""
    zlozone = qet.zloz_symbole_manifestu()
    wpis = next(w for w in zlozone.manifest["symbole"] if w["symbolId"] == "qetBreakerZNapedem")
    znak_napedu = [z for z in wpis["skalaLokalna"] if z["skladnik"] == 1]
    assert len(znak_napedu) == 1 and znak_napedu[0]["powod"].strip()
    assert {o["skladnik"] for o in wpis["osprzet"]} == {1, 2}
    s = next(x for x in zlozone.symbole if x["id"] == "qetBreakerZNapedem")
    (okrag,) = (p for p in s["osprzet"] if p["k"] == "circle")
    (litera,) = (p for p in s["osprzet"] if p["k"] == "letter")
    (sprzezenie,) = (p for p in s["osprzet"] if p["k"] == "line" and p.get("kreskowana"))
    assert not any(p["k"] in ("circle", "letter") or p.get("kreskowana") for p in s["stale"])
    skala_znaku = float(znak_napedu[0]["skala"])
    zrodlo = next(e for e in zlozone.manifest["elementy"] if e["id"] == "en_60617_02_13_26")
    assert zrodlo["teksty"] == {"M": "zachowaj"}
    # Rozmiar źródła: okrąg 10 j. QET (promień 5), pismo 6 pt — × skala znaku × skala importu
    # (napęd stoi poza jednokładnością rysunku wyłącznika — przesunięcie w układzie po niej).
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
def test_cewka_wylaczajaca_jest_koncem_linii_wylaczania_na_krawedzi_kafla(ident):
    """Uwaga właściciela 2026-10-29 pkt 5: linia wyłączania od przekaźnika prowadzi do CEWKI
    wyłącznika, nie do środka kafla. Port obwodu wtórnego ``wylacz`` = zacisk sterujący cewki
    EN 60617 07-15-01 (osprzęt kafla), na prawej krawędzi kafla, z przewodem do prostokąta
    cewki; cewka w kaflu z marginesem i rozłączna z rysunkiem wyłącznika (nożem we wszystkich
    położeniach i krzyżykiem) — znak cewki nie nachodzi na znak aparatu."""
    zlozone = qet.zloz_symbole_manifestu()
    s = next(x for x in zlozone.symbole if x["id"] == ident)
    (wylacz,) = s["portyWtorne"]
    assert wylacz["name"] == "wylacz" and wylacz["dir"] == "E"
    assert wylacz["x"] == s["kafel"]["width"]
    assert wylacz["x"] % GRID == 0 and wylacz["y"] % GRID == 0
    (cewka,) = (p for p in s["osprzet"] if p["k"] == "path")
    xs = [
        float(v) for v in cewka["d"].replace("M", " ").replace("L", " ").replace("Z", " ").split()
    ]
    cx0, cx1 = min(xs[0::2]), max(xs[0::2])
    cy0, cy1 = min(xs[1::2]), max(xs[1::2])
    assert cy0 < wylacz["y"] < cy1
    przewod = [
        p
        for p in s["przewody"]
        if p["k"] == "line"
        and {(p["x1"], p["y1"]), (p["x2"], p["y2"])}
        == {(wylacz["x"], wylacz["y"]), (cx1, wylacz["y"])}
    ]
    assert len(przewod) == 1, "przewód od zacisku sterującego cewki do krawędzi kafla"
    margines = float(zlozone.manifest["kafelStanu"]["marginesQet"]) * zlozone.skala
    assert cx1 <= s["kafel"]["width"] - margines + 1e-9
    assert cx0 > s["glif"]["x"] + s["glif"]["width"], "cewka rozłączna z rysunkiem wyłącznika"


def test_stopien_glifu_w_zakresie_dla_kazdego_symbolu_i_polozenia():
    """Uwaga właściciela 2026-10-29 pkt 1 i 6: glif aparatu (rysunek bez przewodów i osprzętu)
    zajmuje 55–70 % boku kafla stanu w KAŻDYM położeniu noża łącznika, a symbole toru
    (przekładniki, głowica, wskaźnik, koniec kabla) mają spójny stopień [0,33; 0,70] boku kafla.
    Pomiar przed naprawą (rysunek w skali źródła, znak rodzaju × 2): wyłącznik 0,20–0,20,
    odłącznik 0,19–0,20, rozłącznik z bezpiecznikami 0,19, uziemnik 0,23, przekładnik prądowy
    0,17, przekładnik Ferrantiego 0,33, głowica 0,21, wskaźnik 0,08 boku kafla. Miara
    importera (``udzialy``) jest sprawdzana NIEZALEŻNIE z obwiedni glifu w wyjściu TS."""
    zlozone = qet.zloz_symbole_manifestu()
    deklaracja = zlozone.manifest["stopienSymboli"]
    assert deklaracja["kafel"] == [0.55, 0.70] and deklaracja["tor"] == [0.33, 0.70]
    assert deklaracja["powod"].strip()
    bok = float(zlozone.manifest["kafelStanu"]["bokQet"]) * zlozone.skala
    lacznikowe = {w["symbolId"] for w in zlozone.manifest["symbole"] if w.get("noz")}
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
    portem). Port bez przewodu i z przerwą do rysunku = przerwany tor na schemacie."""
    zlozone = qet.zloz_symbole_manifestu()
    pol_kreski = float(zlozone.manifest["kafelStanu"]["kreskaGlifuQet"]) * zlozone.skala / 2
    for s in zlozone.symbole:
        konce = [
            q for p in s["przewody"] + s["stale"] if p["k"] == "line" for q in _koniec_linii(p)
        ]
        g = s["glif"]
        for port in s["porty"] + s["portyWtorne"]:
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
    stopnia. Wyłącznik: przewody toru nad krzyżykiem i pod przegubem + przewód cewki."""
    po_id = {s["id"]: s for s in _symbole()}
    for s in po_id.values():
        for p in s["przewody"]:
            assert p["k"] == "line", s["id"]
            assert p["x1"] == pytest.approx(p["x2"], abs=0.11) or p["y1"] == p["y2"], s["id"]
            for x, y in _koniec_linii(p):
                assert -1e-9 <= x <= s["szerokosc"] + 1e-9, s["id"]
                assert -1e-9 <= y <= s["wysokosc"] + 1e-9, s["id"]
    wylacznik = po_id["qetBreaker"]
    assert len(wylacznik["przewody"]) == 3
    assert all(p["k"] == "line" and not p.get("kreskowana") for p in wylacznik["stale"])
    assert len(wylacznik["stale"]) == 2  # krzyżyk wyłącznika (dwie kreski)
    assert po_id["bayReserve"]["przewody"] == []  # odcinek kabla jest treścią znaku


def test_iniekcja_bez_jednokladnosci_rysunku_glif_ponizej_progu_przerywa_import(kopia_zrodel):
    """Iniekcja dolnego progu stopnia glifu: wyłącznik bez ``skalaRysunku`` (rysunek źródła
    w kaflu 48 × 48 — stan sprzed uwagi właściciela, glif 0,20 boku kafla) przerywa import,
    zamiast wygenerować miniaturowy znak w dużym kaflu. Górny próg: jednokładność 4 wyłącznika
    wychodzi poza kafel, a obniżony górny próg odrzuca położenie zamknięte."""
    manifest = _manifest(kopia_zrodel)
    wpis = next(w for w in manifest["symbole"] if w["symbolId"] == "qetBreaker")
    zapis = wpis.pop("skalaRysunku")
    wpis["skladniki"][1]["przesuniecie"] = [40, -40]
    _zapisz_manifest(kopia_zrodel, manifest)
    with pytest.raises(qet.BladImportu, match="stopień glifu 0.2"):
        qet.generuj()
    # Jednokładność 4: zacisk sterujący cewki przeniesiony na raster portów po tej skali.
    wpis["skalaRysunku"] = dict(zapis, k=4)
    wpis["skladniki"][1]["przesuniecie"] = [40, -24]
    _zapisz_manifest(kopia_zrodel, manifest)
    with pytest.raises(qet.BladImportu, match="nie mieści się w kaflu"):
        qet.generuj()
    # Górny próg kafla: położenie zamknięte (0,609) ponad obniżonym górnym progiem.
    wpis["skalaRysunku"] = zapis
    wpis["skladniki"][1]["przesuniecie"] = [40, -16]
    manifest["stopienSymboli"]["kafel"] = [0.55, 0.6]
    _zapisz_manifest(kopia_zrodel, manifest)
    with pytest.raises(qet.BladImportu, match="qetBreaker: stopień glifu 0.609 .*closed"):
        qet.generuj()
    # Próg toru: wskaźnik pojemnościowy (0,333) poniżej podniesionego dolnego progu toru.
    manifest["stopienSymboli"]["kafel"] = [0.55, 0.7]
    manifest["stopienSymboli"]["tor"] = [0.4, 0.7]
    _zapisz_manifest(kopia_zrodel, manifest)
    with pytest.raises(qet.BladImportu, match="qetVoltageIndicator: stopień glifu 0.333"):
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
    ],
)
def test_iniekcja_skala_rysunku_i_stopien_przerywa_import(kopia_zrodel, wariant, oczekiwany):
    manifest = _manifest(kopia_zrodel)
    wpis = next(w for w in manifest["symbole"] if w["symbolId"] == "qetBreaker")
    if wariant == "bez_powodu":
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
    """Środek litery liczony z posuwu znaku kroju źródła (Liberation Sans), nie z jednej
    szerokości dla wszystkich znaków; znak spoza tabeli przerywa import."""
    assert qet.szerokosc_tekstu("M", 6) == pytest.approx(6 * 1706 / 2048)
    assert qet.szerokosc_tekstu("3", 9) == pytest.approx(9 * 1139 / 2048)
    with pytest.raises(qet.BladImportu, match="brak szerokości znaków"):
        qet.szerokosc_tekstu("Mx", 6)


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
        ("cewka_bez_zacisku_powrotnego", "bez przypisania"),
    ],
)
def test_iniekcja_osprzet_lacznika_przerywa_import(kopia_zrodel, wariant, oczekiwany):
    manifest = _manifest(kopia_zrodel)
    wpis = next(w for w in manifest["symbole"] if w["symbolId"] == "qetBreaker")
    if wariant == "osprzet_bez_powodu":
        wpis["osprzet"][0]["powod"] = ""
    elif wariant == "osprzet_skladnik_noza":
        wpis["osprzet"].append({"skladnik": 0, "powod": "iniekcja"})
    elif wariant == "osprzet_spoza":
        wpis["osprzet"].append({"skladnik": 5, "powod": "iniekcja"})
    else:
        wpis.pop("zaciskiPozaTorem")
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
        "port_wtorny_cewki",
        "przedluzenie_bez_kierunku",
        "przedluzenie_zbedne",
    ],
)
def test_iniekcja_port_poza_rastrem_qet_przerywa_import(kopia_zrodel, wariant):
    """Każdy rodzaj punktu zaczepienia (port toru bez zacisku źródła, koniec doprowadzenia
    obwodu wtórnego, zacisk sterujący cewki wyłączającej) poza rastrem zacisków przerywa
    import; przedłużenie przewodu obwodu wtórnego do rastru wymaga kierunku i nie jest
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
    elif wariant == "port_wtorny_cewki":
        po_id["qetBreaker"]["skladniki"][1]["przesuniecie"] = [40, -15]
        oczekiwany = "port wtórny wylacz poza rastrem"
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
    ("symbol_id", "deklaracja"),
    [("qetThreePositionSwitch", "bottom"), ("qetCableHead", "top")],
)
def test_iniekcja_deklaracja_portu_wewnatrz_gabarytu_rozna_od_geometrii_przerywa_import(
    kopia_zrodel, symbol_id, deklaracja
):
    """Predykat parami: zbiór portów wewnątrz gabarytu wyliczony z geometrii i zbiór
    zadeklarowany w manifeście muszą być równe — deklaracja portu, który leży na krawędzi
    (łącznik z kaflem i symbol toru bez kafla), przerywa import."""
    manifest = _manifest(kopia_zrodel)
    symbol = next(w for w in manifest["symbole"] if w["symbolId"] == symbol_id)
    symbol.setdefault("portyWewnatrzGabarytu", {})[deklaracja] = "iniekcja"
    _zapisz_manifest(kopia_zrodel, manifest)
    with pytest.raises(qet.BladImportu, match="poza krawędzią gabarytu"):
        qet.generuj()
