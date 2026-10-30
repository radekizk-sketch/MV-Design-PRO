"""Obwody wtórne i profil funkcjonalny EAZ wzorca pola liniowego GPZ (uzupełnienie właściciela
2026-10-29 karty UX-04/POLE-LINIOWE-WZORZEC) — dane szablonu, nie opis.

PO CO. Powiązania funkcji EAZ z rdzeniem przekładnika prądowego, uzwojeniem przekładnika
napięciowego, przekładnikiem Ferrantiego i obwodem okrężnym, sygnały do wyłącznika i profil
funkcji (obowiązkowa / wariantowa / opcjonalna) mają być danymi szablonu, które karta pola
pokazuje i które przyszła karta nastaw (ADR-022) zwiąże z aktywami EAZ. Test przypina:

* WYROCZNIĘ RYSUNKU — tabelę faktów odczytanych z rysunków s.89, s.90, s.91 (niezależną od kodu
  modułu): z czego mierzy każda funkcja i na które obwody wyłącznika działa;
* DEKLARACJE walidatora szablonu (każda funkcja zestawu powiązana dokładnie raz, wejście na
  aparacie właściwego rodzaju i na istniejącym obwodzie, każdy rdzeń i uzwojenie z jednym
  przeznaczeniem, interpretacja z uzasadnieniem, brak sygnałów osieroconych) — każdą iniekcją;
* PROFIL EAZ wg reguł z dokumentu karty (tabela oczekiwań) w każdej klasie pola;
* PRZEKŁADNIĘ Ferrantiego jako daną: szablon → rekord pola → odmowa dla innego rodzaju.

ILOCZYN CECH: wykonanie pola {Z.10, Z.11.1, Z.11} × wykonanie łączników {łącznik
trójpołożeniowy, wyłącznik stały z odłącznikiem, wyłącznik wysuwny} × funkcja zestawu rysunku ×
klasa pola dopuszczająca wykonanie.
"""

from __future__ import annotations

import itertools
from typing import get_args

import pytest
from enm.models import BayPrimaryDevice
from network_model.catalog.bay_templates import (
    BAY_TEMPLATE_REGISTRY,
    BAY_TEMPLATES_GPZ_LINE,
    KLASY_POLA_LINIOWEGO,
    WARUNKI_FUNKCJI_EAZ,
    WYKONANIA_LACZNIKOW_POLA,
    WYKONANIA_POLA_KLASY,
    WYKONANIA_POLA_LINIOWEGO_GPZ,
    BayTemplate,
    funkcje_eaz_pola_liniowego,
    profil_eaz_szablonu,
    szablon_pola_liniowego_gpz,
    template_primary_devices,
)
from network_model.catalog.obwody_wtorne_pola import (
    NAPEDY_RODZAJU_APARATU,
    OBWODY_WTORNE_WYKONANIA_POLA,
    OPIS_NAPEDU_PL,
    NapedAparatuPola,
    ObwodyWtornePola,
    PowiazanieFunkcjiEaz,
    SygnalPola,
    WejscieFunkcjiEaz,
    powiazania_aparatow_pola,
)

SZABLONY = list(
    itertools.product(WYKONANIA_POLA_LINIOWEGO_GPZ, WYKONANIA_LACZNIKOW_POLA)
)

# --- wyrocznia rysunku (odczyt obrazów s.89 Z.10, s.90 Z.11, s.91 Z.11.1; 2026-10-29) ---------
# Wejście: (rodzaj, aparat, numer) albo ("SYGNAL", nazwa); wyjścia — sygnały rysunku.
_CT1 = ("RDZEN_CT", "T1", 1)
_CT3 = ("RDZEN_CT", "T1", 3)
_VT3 = ("UZWOJENIE_VT", "T3", 3)
_FERR = ("PRZEKLADNIK_FERRANTIEGO", "T2", None)
_ZZZ = ("SYGNAL", "Z, Zz")
RYSUNEK: dict[str, dict[str, tuple[tuple[object, ...], tuple[str, ...]]]] = {
    "Z10": {
        "51": ((_CT1,), ("OW1", "OW2")),
        "50": ((_CT1,), ("OW1", "OW2")),
        # Kryterium prądowe bloku „Zab. ziemnozwarciowe": linia Io z zacisku 2 przekładnika
        # Ferrantiego (czerwona na s.89 i s.91) — bez wejścia U0 (decyzja właściciela 2026-10-29).
        "51N": ((_FERR,), ("OW1", "OW2")),
        "67N": ((_FERR, _ZZZ), ("OW1", "OW2", "Blok. ZW")),
        "ZS": ((_CT1,), ("Blokowanie ZS",)),
        "50BF": ((_CT1,), ("OW1", "OW2", "Pobudzenie LRW")),
        "79": ((("SYGNAL", "Odstawienie SPZ"),), ("ZW",)),
        # Jedna funkcja SCO: obwody okrężne SCO1, SCO2 (wyłączenie) i SCO/SPZ (załączenie po SCO)
        # do jednego sterownika pola — rysunek nie ma osobnego bloku „SPZ po SCO”.
        "SCO": (
            (("SYGNAL", "SCO1"), ("SYGNAL", "SCO2"), ("SYGNAL", "SCO/SPZ")),
            ("OW1", "OW2", "ZW"),
        ),
    },
}
for _wyk, _ct in (("Z11_1", _CT1), ("Z11", _CT3)):
    RYSUNEK[_wyk] = {
        "51": ((_ct,), ("OW1",)),
        "50": ((_ct,), ("OW1",)),
        "67": ((_ct, _VT3), ("Blokowanie ZS",)),
        "51N": ((_FERR,), ("OW1",)),
        "67N": ((_FERR, _ZZZ), ("OW1",)),
        "27": ((_VT3,), ("Blok. ZW",)),
        "59": ((_VT3,), ("Blok. ZW",)),
        "81U": ((_VT3,), ("OW1",)),
        "81O": ((_VT3,), ("OW1",)),
        "81R": ((_VT3,), ("OW1",)),
        "ZS": ((_ct,), ("Blokowanie ZS",)),
        "50BF": ((_ct,), ("OW1", "Pobudzenie LRW")),
        "79": ((("SYGNAL", "Odstawienie SPZ"),), ("ZW",)),
        "SPZE": ((("SYGNAL", "Wył. od zab. TR"),), ("ZW",)),
        "OWG": ((("SYGNAL", "Wył. od zab. TR"),), ("OW1",)),
        "NZ": ((_VT3,), ("Blok. ZW",)),
        "SCO": (
            (("SYGNAL", "SCO1"), ("SYGNAL", "SCO2"), ("SYGNAL", "SCO/SPZ")),
            ("OW1", "ZW"),
        ),
    }
#: Rdzenie i uzwojenia POZA EAZ (Z.11: rozliczenie i regulacja; Z.11.1: niepodłączone).
POZA_EAZ: dict[str, dict[tuple[str, int], str | None]] = {
    "Z10": {},
    "Z11_1": {("T3", 1): None, ("T3", 2): None},
    "Z11": {
        (
            "T1",
            1,
        ): "układ pomiarowo-rozliczeniowy podstawowy, analizator jakości energii",
        ("T1", 2): "układy regulacyjne",
        (
            "T3",
            1,
        ): "układ pomiarowo-rozliczeniowy podstawowy, analizator jakości energii",
        ("T3", 2): "układy regulacyjne",
    },
}
#: Sygnały do wyłącznika (Z.10: dwa obwody wyłączające; Z.11/Z.11.1: OW1).
DO_WYLACZNIKA = {"Z10": {"Blok. ZW", "ZW", "OW1", "OW2"}}
DO_WYLACZNIKA["Z11_1"] = DO_WYLACZNIKA["Z11"] = {"Blok. ZW", "ZW", "OW1"}


def _klucz(w: WejscieFunkcjiEaz) -> tuple[object, ...]:
    return (
        ("SYGNAL", w.sygnal) if w.rodzaj == "SYGNAL" else (w.rodzaj, w.aparat, w.numer)
    )


@pytest.mark.parametrize("wykonanie,laczniki", SZABLONY)
def test_powiazania_zgodne_z_wyrocznia_rysunku(wykonanie: str, laczniki: str) -> None:
    szablon = szablon_pola_liniowego_gpz(wykonanie, laczniki)
    obwody = szablon.obwody_wtorne
    assert obwody is not None
    assert obwody is OBWODY_WTORNE_WYKONANIA_POLA[wykonanie]
    odczyt = {
        p.funkcja: (tuple(_klucz(w) for w in p.wejscia), tuple(p.wyjscia))
        for p in obwody.powiazania
    }
    assert odczyt == RYSUNEK[wykonanie]
    # Zestaw funkcji rysunku = zbiór powiązanych funkcji (walidator) — i to dokładnie raz.
    assert sorted(odczyt) == sorted(szablon.funkcje_eaz)
    # Sygnał do wyłącznika działa na wyłącznik pola Q0 (rodzaj CB).
    do_wylacznika = {s.nazwa for s in obwody.sygnaly if s.obwod == "WYLACZNIK"}
    assert do_wylacznika == DO_WYLACZNIKA[wykonanie]
    wylacznik = next(d for d in szablon.devices if d.kind == "CB")
    for p in obwody.powiazania:
        assert (p.wylacznik == wylacznik.designation_q) == bool(
            set(p.wyjscia) & do_wylacznika
        )
    poza = {(o.aparat, o.numer): o.odbiornik_pl for o in obwody.obwody_przekladnikow}
    assert poza == POZA_EAZ[wykonanie]
    # Napędy łączników rysunku (s.89, s.90, s.91 w 400 dpi): Q0 silnikowy „M", Q1 łącznik
    # trójpołożeniowy — kwadrat na sprzężeniu z obsługą ręczną; Q5 bez znaku napędu.
    assert [(n.aparat, n.rodzaj_aparatu, n.naped) for n in obwody.napedy] == [
        ("Q0", "CB", "SILNIKOWY"),
        ("Q1", "THREE_POSITION_SWITCH", "ZASOBNIKOWY_RECZNY"),
    ]
    assert all(n.naped_pl == OPIS_NAPEDU_PL[n.naped] for n in obwody.napedy)


@pytest.mark.parametrize("wykonanie,laczniki", SZABLONY)
def test_kazdy_rdzen_i_uzwojenie_ma_jedno_przeznaczenie(
    wykonanie: str, laczniki: str
) -> None:
    szablon = szablon_pola_liniowego_gpz(wykonanie, laczniki)
    assert szablon.obwody_wtorne is not None
    eaz = {
        (w.aparat, w.numer)
        for p in szablon.obwody_wtorne.powiazania
        for w in p.wejscia
        if w.numer is not None
    }
    poza = {(o.aparat, o.numer) for o in szablon.obwody_wtorne.obwody_przekladnikow}
    wszystkie = {
        (d.designation_q, n)
        for d in szablon.devices
        for n in range(1, len(d.rdzenie or d.uzwojenia) + 1)
        if d.kind in ("CT", "VT")
    }
    assert not eaz & poza
    assert eaz | poza == wszystkie


def test_status_weryfikacji_i_uzasadnienie_kazdego_wpisu() -> None:
    """Każdy wpis ma status weryfikacji; interpretacja zawsze z uzasadnieniem; skróty, których
    standard nie rozwija, nie mają odgadniętego znaczenia."""
    for obwody in OBWODY_WTORNE_WYKONANIA_POLA.values():
        wpisy: list[PowiazanieFunkcjiEaz | WejscieFunkcjiEaz | SygnalPola] = [
            *obwody.powiazania,
            *(w for p in obwody.powiazania for w in p.wejscia),
            *obwody.sygnaly,
        ]
        for wpis in wpisy:
            assert wpis.weryfikacja in (
                "ZWERYFIKOWANE_NA_RYSUNKU",
                "ODCZYT_TEKSTU",
                "INTERPRETACJA",
            )
            if wpis.weryfikacja == "INTERPRETACJA":
                assert wpis.uwaga
        nierozwiniete = {s.nazwa for s in obwody.sygnaly if s.znaczenie_pl is None}
        assert {"Up", "Aw", "Al", "+AwUp", "Topologia"} <= nierozwiniete


# --- iniekcje: każda deklaracja walidatora ma test czerwony ----------------------------------


def _obwody(wykonanie: str = "Z11_1") -> dict[str, object]:
    return OBWODY_WTORNE_WYKONANIA_POLA[wykonanie].model_dump()


def _szablon_z(obwody: dict[str, object], wykonanie: str = "Z11_1") -> BayTemplate:
    wzor = szablon_pola_liniowego_gpz(wykonanie, "TROJPOLOZENIOWY").model_dump()
    wzor["obwody_wtorne"] = obwody
    return BayTemplate.model_validate(wzor)


def test_iniekcja_funkcja_bez_powiazania() -> None:
    obwody = _obwody()
    obwody["powiazania"] = [p for p in obwody["powiazania"] if p["funkcja"] != "NZ"]  # type: ignore[union-attr]
    with pytest.raises(ValueError, match="powiązania obwodów wtórnych"):
        _szablon_z(obwody)


def test_iniekcja_powiazanie_dwukrotne() -> None:
    obwody = _obwody()
    obwody["powiazania"] = [*obwody["powiazania"], obwody["powiazania"][0]]  # type: ignore[index,misc]
    with pytest.raises(ValueError, match="więcej niż raz"):
        ObwodyWtornePola.model_validate(obwody)


@pytest.mark.parametrize(
    "wejscie,komunikat",
    [
        ({"rodzaj": "RDZEN_CT", "aparat": "T1", "numer": 2}, "nie ma obwodu nr 2"),
        ({"rodzaj": "RDZEN_CT", "aparat": "T3", "numer": 1}, "nie jest aparatem CT"),
        ({"rodzaj": "UZWOJENIE_VT", "aparat": "T3", "numer": 4}, "nie ma obwodu nr 4"),
        (
            {"rodzaj": "PRZEKLADNIK_FERRANTIEGO", "aparat": "T1"},
            "nie jest aparatem CORE",
        ),
    ],
)
def test_iniekcja_wejscie_na_niewlasciwym_aparacie(
    wejscie: dict, komunikat: str
) -> None:
    obwody = _obwody()
    pierwsze = obwody["powiazania"][0]  # type: ignore[index]
    pierwsze["wejscia"] = [{**wejscie, "weryfikacja": "ZWERYFIKOWANE_NA_RYSUNKU"}]
    with pytest.raises(ValueError, match=komunikat):
        _szablon_z(obwody)


def test_iniekcja_rdzen_z_dwoma_przeznaczeniami() -> None:
    obwody = _obwody()
    obwody["obwody_przekladnikow"] = [
        *obwody["obwody_przekladnikow"],  # type: ignore[misc]
        {
            "aparat": "T1",
            "numer": 1,
            "odbiornik_pl": "licznik",
            "weryfikacja": "INTERPRETACJA",
        },
    ]
    with pytest.raises(ValueError, match="dwa przeznaczenia"):
        _szablon_z(obwody)


def test_iniekcja_uzwojenie_bez_przeznaczenia() -> None:
    obwody = _obwody()
    obwody["obwody_przekladnikow"] = []
    with pytest.raises(ValueError, match="bez przeznaczenia"):
        _szablon_z(obwody)


def test_iniekcja_wylacznik_wykonawczy_nie_jest_wylacznikiem() -> None:
    obwody = _obwody()
    obwody["powiazania"][0]["wylacznik"] = "Q1"  # type: ignore[index]
    with pytest.raises(ValueError, match="nie jest wyłącznikiem"):
        _szablon_z(obwody)


def test_iniekcja_sygnal_do_wylacznika_bez_wylacznika() -> None:
    obwody = _obwody()
    obwody["powiazania"][0]["wylacznik"] = None  # type: ignore[index]
    with pytest.raises(ValueError, match="bez wyłącznika"):
        ObwodyWtornePola.model_validate(obwody)


def test_iniekcja_sygnal_osierocony() -> None:
    obwody = _obwody()
    obwody["sygnaly"] = [
        *obwody["sygnaly"],  # type: ignore[misc]
        {
            "nazwa": "Sygnał bez odbiornika",
            "kierunek": "WYJSCIE",
            "obwod": "OKREZNY",
            "weryfikacja": "ZWERYFIKOWANE_NA_RYSUNKU",
        },
    ]
    with pytest.raises(ValueError, match="bez odbiornika"):
        ObwodyWtornePola.model_validate(obwody)


def test_iniekcja_wyjscie_spoza_sygnalow_pola() -> None:
    obwody = _obwody()
    obwody["powiazania"][0]["wyjscia"] = ["OW3"]  # type: ignore[index]
    with pytest.raises(ValueError, match="nie jest wyjściem pola"):
        ObwodyWtornePola.model_validate(obwody)


def test_iniekcja_interpretacja_bez_uzasadnienia() -> None:
    with pytest.raises(ValueError, match="uzasadnienia"):
        WejscieFunkcjiEaz(rodzaj="SYGNAL", sygnal="ZW", weryfikacja="INTERPRETACJA")
    obwody = _obwody()
    obwody["powiazania"][0]["weryfikacja"] = "INTERPRETACJA"  # type: ignore[index]
    obwody["powiazania"][0]["uwaga"] = None  # type: ignore[index]
    with pytest.raises(ValueError, match="uzasadnienia"):
        ObwodyWtornePola.model_validate(obwody)


# --- napęd łącznika (decyzja architekta 2026-10-30: atrybut łącznika, nie nowy aparat) ----------
# Iloczyn: rodzaj aparatu (każdy z `BayPrimaryDevice.kind`) × rodzaj napędu (każdy z
# `RodzajNapedu` + brak) × miejsce walidacji {wzorzec `NapedAparatuPola`, rekord ENM
# `BayPrimaryDevice`} — oba z JEDNEGO słownika `NAPEDY_RODZAJU_APARATU` (predykat parami).

_RODZAJE_APARATU = get_args(BayPrimaryDevice.model_fields["kind"].annotation)
_NAPEDY = get_args(BayPrimaryDevice.model_fields["naped"].annotation)[0]


def test_slownik_napedow_obejmuje_wylacznie_rodzaje_modelu() -> None:
    assert set(NAPEDY_RODZAJU_APARATU) <= set(_RODZAJE_APARATU)
    assert {n for napedy in NAPEDY_RODZAJU_APARATU.values() for n in napedy} == set(
        get_args(_NAPEDY)
    )
    assert set(OPIS_NAPEDU_PL) == set(get_args(_NAPEDY))


@pytest.mark.parametrize("rodzaj", _RODZAJE_APARATU)
@pytest.mark.parametrize("naped", [None, *get_args(_NAPEDY)])
def test_naped_wylacznie_na_rodzaju_ze_slownika(rodzaj: str, naped: str | None) -> None:
    dopuszczalny = naped is None or naped in NAPEDY_RODZAJU_APARATU.get(rodzaj, ())
    rekord = {
        "device_ref": "pole::dev::1",
        "symbol_ref": "symbol:x",
        "kind": rodzaj,
        "placement": "MIDSTREAM",
        "naped": naped,
    }
    if dopuszczalny:
        assert BayPrimaryDevice.model_validate(rekord).naped == naped
    else:
        with pytest.raises(ValueError, match="nie dotyczy"):
            BayPrimaryDevice.model_validate(rekord)
    if naped is None:
        return
    wzor = {
        "aparat": "Q9",
        "rodzaj_aparatu": rodzaj,
        "naped": naped,
        "weryfikacja": "ODCZYT_TEKSTU",
    }
    if dopuszczalny:
        assert NapedAparatuPola.model_validate(wzor).naped_pl == OPIS_NAPEDU_PL[naped]
    else:
        with pytest.raises(ValueError, match="nie dotyczy"):
            NapedAparatuPola.model_validate(wzor)


def test_iniekcja_napedy_wzorca() -> None:
    with pytest.raises(ValueError, match="uzasadnienia"):
        NapedAparatuPola(
            aparat="Q1",
            rodzaj_aparatu="THREE_POSITION_SWITCH",
            naped="ZASOBNIKOWY_RECZNY",
            weryfikacja="INTERPRETACJA",
        )
    obwody = _obwody()
    obwody["napedy"] = [obwody["napedy"][0], obwody["napedy"][0]]  # type: ignore[index]
    with pytest.raises(ValueError, match="więcej niż jednym napędem"):
        ObwodyWtornePola.model_validate(obwody)


@pytest.mark.parametrize("wykonanie,laczniki", SZABLONY)
def test_naped_z_szablonu_na_lacznikach_pola(wykonanie: str, laczniki: str) -> None:
    """Każdy szablon pola liniowego GPZ: napęd dostaje WYŁĄCZNIE łącznik o oznaczeniu i rodzaju
    z rysunku — Q0 (CB) zawsze, Q1 tylko jako łącznik trójpołożeniowy (wariant z odłącznikiem
    szynowym i wózek wysuwny rysunkiem nie są — bez znaku napędu), Q5 nigdy."""
    szablon = szablon_pola_liniowego_gpz(wykonanie, laczniki)
    obwody = szablon.obwody_wtorne
    assert obwody is not None
    aparaty = powiazania_aparatow_pola(
        template_primary_devices(szablon.template_id, field_ref="pole-test"),
        obwody,
        szablon.funkcje_eaz,
    )
    z_napedem = {
        (a.get("designation"), a["kind"], a["naped"]) for a in aparaty if a.get("naped")
    }
    oczekiwane = {("Q0", "CB", "SILNIKOWY")}
    if laczniki == "TROJPOLOZENIOWY":
        oczekiwane.add(("Q1", "THREE_POSITION_SWITCH", "ZASOBNIKOWY_RECZNY"))
    assert z_napedem == oczekiwane
    for a in aparaty:
        BayPrimaryDevice.model_validate(a)


# --- przekładnia przekładnika Ferrantiego ------------------------------------------------------


@pytest.mark.parametrize("wykonanie,laczniki", SZABLONY)
def test_przekladnia_ferrantiego_z_szablonu_do_rekordu_pola(
    wykonanie: str, laczniki: str
) -> None:
    szablon = szablon_pola_liniowego_gpz(wykonanie, laczniki)
    (ferranti,) = (d for d in szablon.devices if d.kind == "CORE_BALANCE_CT")
    assert ferranti.przekladnia == "1/100"
    aparaty = template_primary_devices(szablon.template_id, field_ref="pole-test")
    (rekord,) = (a for a in aparaty if a["kind"] == "CORE_BALANCE_CT")
    assert rekord["przekladnia"] == "1/100"
    assert all(
        "przekladnia" not in a for a in aparaty if a["kind"] != "CORE_BALANCE_CT"
    )
    BayPrimaryDevice.model_validate(rekord)


def test_przekladnia_wylacznie_dla_przekladnika_ferrantiego() -> None:
    with pytest.raises(ValueError, match="Ferrantiego"):
        BayPrimaryDevice.model_validate(
            {
                "device_ref": "pole::dev::1",
                "symbol_ref": "symbol:ct",
                "kind": "CT",
                "placement": "MIDSTREAM",
                "przekladnia": "1/100",
            }
        )
    wzor = szablon_pola_liniowego_gpz("Z10", "TROJPOLOZENIOWY").model_dump()
    (ct,) = (d for d in wzor["devices"] if d["kind"] == "CT")
    ct["przekladnia"] = "1/100"
    with pytest.raises(ValueError, match="Ferrantiego"):
        BayTemplate.model_validate(wzor)


# --- profil funkcjonalny EAZ -------------------------------------------------------------------

#: Oczekiwany status (wyrocznia z reguł dokumentu karty: obowiązkowa — w każdej klasie wymagana
#: listą albo rysunkiem; opcjonalna — w każdej klasie dopuszczalna / na żądanie OSD / nieobecna;
#: wariantowa — pozostałe). Funkcja warunkowa (`WARUNKI_FUNKCJI_EAZ`) jest wariantowa ZAWSZE
#: (decyzja właściciela 2026-10-29 pkt 4): 67N rysunku Z.10/Z.11.1/Z.11 trafia do pola dopiero
#: przy przekładniku Ferrantiego i potwierdzonym źródle 3U₀ — dawniej „obowiązkowa", czyli
#: automatyczna w każdym polu (fikcja funkcji bez wejścia U0).
PROFIL: dict[str, dict[str, str]] = {
    "Z10": {
        "51": "OBOWIAZKOWA",
        "50": "OBOWIAZKOWA",
        # Kryterium prądowe z przekładnika Ferrantiego — na rysunku, bez warunku: wymagane
        # rysunkiem w każdej klasie (lista funkcji klasy wymienia je jako zabezpieczenie
        # ziemnozwarciowe pkt 2, którego kierunek niesie 67N).
        "51N": "OBOWIAZKOWA",
        "67N": "WARIANTOWA",
        "ZS": "OBOWIAZKOWA",
        "50BF": "OBOWIAZKOWA",
        "79": "WARIANTOWA",
        "SCO": "OPCJONALNA",
        "81U": "OBOWIAZKOWA",
        "59N": "OPCJONALNA",
        "Yo>": "OPCJONALNA",
        "Go>": "OPCJONALNA",
    },
}
PROFIL["Z11_1"] = PROFIL["Z11"] = {
    "51": "OBOWIAZKOWA",
    "50": "OBOWIAZKOWA",
    "67": "WARIANTOWA",
    "51N": "OBOWIAZKOWA",
    "67N": "WARIANTOWA",
    "27": "WARIANTOWA",
    "59": "WARIANTOWA",
    "81U": "WARIANTOWA",
    "81O": "WARIANTOWA",
    "81R": "WARIANTOWA",
    "ZS": "OBOWIAZKOWA",
    "50BF": "OBOWIAZKOWA",
    "79": "WARIANTOWA",
    "SPZE": "WARIANTOWA",
    "OWG": "OBOWIAZKOWA",
    "NZ": "WARIANTOWA",
    "SCO": "WARIANTOWA",
    "59N": "OPCJONALNA",
    "Yo>": "OPCJONALNA",
    "Go>": "OPCJONALNA",
    "32": "OPCJONALNA",
}


@pytest.mark.parametrize("wykonanie,laczniki", SZABLONY)
def test_profil_eaz_statusy_i_wymogi_w_kazdej_klasie(
    wykonanie: str, laczniki: str
) -> None:
    szablon = szablon_pola_liniowego_gpz(wykonanie, laczniki)
    profil = profil_eaz_szablonu(szablon.template_id)
    assert profil is not None
    assert {p.kod: p.wymagalnosc for p in profil} == PROFIL[wykonanie]
    klasy = [k for k in KLASY_POLA_LINIOWEGO if wykonanie in WYKONANIA_POLA_KLASY[k]]
    for pozycja in profil:
        assert [w.klasa for w in pozycja.wymogi] == klasy
        assert pozycja.na_rysunku == (pozycja.kod in szablon.funkcje_eaz)
        assert pozycja.opis_pl and pozycja.wymagalnosc_pl
        warunek = WARUNKI_FUNKCJI_EAZ.get(pozycja.kod)
        # Funkcja warunkowa: wariantowa, z warunkiem opisanym zdaniem; bez warunków nie wchodzi
        # do zestawu żadnej klasy (iniekcja „automatyczne 67N" zapala ten test).
        assert (pozycja.warunek_pl is not None) is (warunek is not None)
        if warunek is not None:
            assert pozycja.wymagalnosc == "WARIANTOWA"
        for w in pozycja.wymogi:
            assert w.podstawa
            if warunek is not None:
                assert pozycja.kod not in funkcje_eaz_pola_liniowego(wykonanie, w.klasa)
            # Profil opisuje WZORZEC (warunki spełnione) — ten sam zestaw co operacja zapisu
            # pola, w którym warunek jest potwierdzony w modelu.
            w_zestawie = pozycja.kod in funkcje_eaz_pola_liniowego(
                wykonanie, w.klasa, frozenset(WARUNKI_FUNKCJI_EAZ.values())
            )
            # Predykat parami: „wg rysunku" wyłącznie dla funkcji zestawu klasy, „nie występuje"
            # wyłącznie poza nim — to samo źródło co operacja zapisu zestawu.
            if w.wymog == "WG_RYSUNKU":
                assert w_zestawie and w.weryfikacja == "ZWERYFIKOWANE_NA_RYSUNKU"
            if w.wymog == "NIE_WYSTEPUJE":
                assert not w_zestawie
            if w.wymog == "ZAKAZANA":
                assert not w_zestawie


def test_profil_tylko_dla_pola_liniowego_gpz_i_deterministyczny() -> None:
    inne = [t for t in BAY_TEMPLATE_REGISTRY.values() if t.wykonanie_pola is None]
    assert inne and all(profil_eaz_szablonu(t.template_id) is None for t in inne)
    assert all(t.obwody_wtorne is None for t in inne)
    assert profil_eaz_szablonu("szablon-nieznany") is None
    for szablon in BAY_TEMPLATES_GPZ_LINE:
        assert profil_eaz_szablonu(szablon.template_id) == profil_eaz_szablonu(
            szablon.template_id
        )


def test_api_szablonow_niesie_profil_i_obwody() -> None:
    from api.catalog import list_bay_templates_endpoint

    wynik = {w["template_ref"]: w for w in list_bay_templates_endpoint(pole_gpz=True)}
    for szablon in BAY_TEMPLATES_GPZ_LINE:
        wpis = wynik[szablon.template_id]
        assert [p["kod"] for p in wpis["profil_eaz"]] == list(
            PROFIL[szablon.wykonanie_pola]
        )
        assert wpis["obwody_wtorne"] == szablon.obwody_wtorne.model_dump(mode="json")
    rmu = wynik["bay_template_line_out"]
    assert rmu["profil_eaz"] is None and rmu["obwody_wtorne"] is None


# Odcisk szablonu (unieważnianie wyników): pola addytywne wzorca — przekładnia przekładnika
# Ferrantiego i obwody wtórne — poza odciskiem, gdy `None`; nadane — treść szablonu.
# Iloczyn: szablon {bez nowych pól (pole RMU), z nowymi polami (pole GPZ)} × postać pola
# {brak klucza, `None`, wartość}.
def _odcisk(szablon: BayTemplate) -> str:
    from network_model.catalog.switchgear.complete_mv_bay_template import (
        CompleteMvBayTemplate,
    )

    return CompleteMvBayTemplate(
        template_ref="odcisk-testowy",
        base_template=szablon,
        manufacturer_ref="producent",
        switchgear_family_ref="rodzina",
        source_status="repo_verified",
    ).compute_hash()


def test_odcisk_szablonu_bez_pol_addytywnych_none() -> None:
    import json

    from network_model.catalog.bay_templates import postac_odcisku_szablonu

    rmu = BAY_TEMPLATE_REGISTRY["bay_template_line_out"]
    zrzut = postac_odcisku_szablonu(rmu)
    assert "obwody_wtorne" not in zrzut
    assert all("przekladnia" not in a for a in zrzut["devices"])
    # Zrzut bez nowych kluczy = postać sprzed atrybutów: ten sam odcisk co dawny zrzut.
    dawny = rmu.model_dump(mode="json")
    dawny.pop("obwody_wtorne")
    for aparat in dawny["devices"]:
        aparat.pop("przekladnia")
        aparat.pop("wykonanie")
    assert json.dumps(zrzut, sort_keys=True) == json.dumps(dawny, sort_keys=True)
    assert _odcisk(rmu) == _odcisk(rmu.model_copy(update={"obwody_wtorne": None}))

    gpz = szablon_pola_liniowego_gpz("Z11_1", "TROJPOLOZENIOWY")
    zrzut_gpz = postac_odcisku_szablonu(gpz)
    assert zrzut_gpz["obwody_wtorne"] == gpz.obwody_wtorne.model_dump(mode="json")
    assert [
        a.get("przekladnia") for a in zrzut_gpz["devices"] if "przekladnia" in a
    ] == ["1/100"]
    # Wartość nadana zmienia odcisk; zdjęta do `None` — wraca do odcisku bez pola.
    bez_obwodow = gpz.model_copy(update={"obwody_wtorne": None})
    assert _odcisk(gpz) != _odcisk(bez_obwodow)
    aparaty_bez_przekladni = [
        d.model_copy(update={"przekladnia": None}) for d in gpz.devices
    ]
    bez_przekladni = bez_obwodow.model_copy(update={"devices": aparaty_bez_przekladni})
    assert _odcisk(bez_obwodow) != _odcisk(bez_przekladni)
    assert all(
        "przekladnia" not in a
        for a in postac_odcisku_szablonu(bez_przekladni)["devices"]
    )
    # Wykonanie wyłącznika (rozstrzygnięcie architekta 2026-10-30 pkt 3) — to samo prawo.
    assert all("wykonanie" not in a for a in zrzut["devices"])
    assert [a["wykonanie"] for a in zrzut_gpz["devices"] if "wykonanie" in a] == [
        "STALE"
    ]
    bez_wykonania = gpz.model_copy(
        update={
            "devices": [d.model_copy(update={"wykonanie": None}) for d in gpz.devices]
        }
    )
    assert _odcisk(gpz) != _odcisk(bez_wykonania)
    assert all(
        "wykonanie" not in a for a in postac_odcisku_szablonu(bez_wykonania)["devices"]
    )
