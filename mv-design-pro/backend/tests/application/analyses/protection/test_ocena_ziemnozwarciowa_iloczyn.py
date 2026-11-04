"""Ocena zabezpieczeń ziemnozwarciowych — iloczyn cech (karta EWALUATORY-ZIEMNOZWARCIOWE).

ILOCZYN: sposób pracy punktu neutralnego {izolowany, kompensowany, kompensowany z AWSC,
rezystor} × funkcja {51N, 50N, 67N, Yo>, Go>, Bo>, 32N} × miejsce zwarcia {w strefie pola,
poza strefą — szyny GPZ i pola sąsiednie, linia sąsiednia — strefa zagnieżdżona odejścia ST1}
× nastawa {czuła, nieczuła}.

WYROCZNIA. Oczekiwany status czułości i selektywności liczy test z SUROWEGO wyniku solvera
doziemień (wielkości pól ``WielkosciPola``) i definicji wielkości decydującej funkcji wg
rejestru funkcji EAZ — bez funkcji ewaluatora. Próg „czuły" = połowa najmniejszej wielkości
decydującej w strefie (c_min), „nieczuły" = dwukrotność największej. Czułość: SPEŁNIA ⇔ min
w strefie ≥ próg; selektywność: SPEŁNIA ⇔ max poza strefą (c_max) < próg.

Uzupełnienia iloczynu: funkcja napięciowa 59N i automatyka ZAWSC z nastawami (czas po
wymuszeniu = t_W + t_f), stopniowanie czasowe z odejściem ST1 (CTI), odmowy nazwane (brak
wejścia 3U0, brak nastaw, AWSC bez ZAWSC) i rekord każdego rodzaju z wyjaśnieniem.
"""

from __future__ import annotations

import math
from functools import cache
from typing import Any

import pytest
from application.analyses.protection.ocena_ziemnozwarciowa import (
    KOD_AWSC_BEZ_ZAWSC,
    KOD_BRAK_NASTAWY,
    KOD_BRAK_WEJSCIA,
    funkcje_ziemnozwarciowe,
    oblicz_siec_doziemna,
    ocen_zabezpieczenia_ziemnozwarciowe,
)
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel
from network_model.catalog.bay_templates import BAY_TEMPLATE_GPZ_POMIAR_NAPIECIA_Z17
from network_model.solvers.doziemienie_sn import STAN_PO_AWSC, STAN_PRZED, WielkosciPola

from tests.reference_networks.sceny_zajetosci_pol import ok, op
from tests.reference_networks.scena_doziemienia import (
    NASTAWY_51N_ODEJSCIA,
    SPOSOBY_PRACY,
    SposobPracy,
    dodaj_odejscie_stacji,
    pola_liniowe,
    scena_z_nastawami,
    sterownik_pola,
    ustaw_funkcje,
    zbuduj_scene,
)

FUNKCJE = ("51N", "50N", "67N", "Yo>", "Go>", "Bo>", "32N")
_PRADOWE = {"51N", "50N", "67N"}
_KLUCZ_PROGU = {"Yo>": "prog_y0_ms", "Go>": "prog_g0_ms", "Bo>": "prog_b0_ms", "32N": "prog_p0_kw"}


def _kat_67n(sposob: SposobPracy) -> float:
    return 90.0 if sposob == "IZOLOWANY" else 0.0


def _wielkosc(kod: str, pole: WielkosciPola, sposob: SposobPracy) -> float:
    """Wielkość decydująca z definicji funkcji (rejestr EAZ), strona pierwotna."""
    if kod in ("51N", "50N"):
        return abs(pole.prad_3i0_a)
    if kod == "67N":
        if pole.kat_phi0_deg is None:
            return 0.0
        return abs(pole.prad_3i0_a) * math.cos(math.radians(pole.kat_phi0_deg - _kat_67n(sposob)))
    y0 = pole.admitancja_y0_s
    if kod == "32N":
        return pole.moc_p0_w / 1000.0
    if y0 is None:
        return 0.0
    return {"Yo>": abs(y0), "Go>": y0.real, "Bo>": y0.imag}[kod] * 1000.0


def _nastawy(kod: str, prog: float, sposob: SposobPracy) -> dict[str, Any]:
    if kod in _PRADOWE:
        nastawy: dict[str, Any] = {
            "prog": prog,
            "jednostka_progu": "A_PIERWOTNY",
            "krzywa": "DT",
            "zwloka_s": 0.6,
        }
        if kod == "67N":
            nastawy |= {"kierunek": "DO_LINII", "kat_charakterystyczny_deg": _kat_67n(sposob)}
        return nastawy
    return {_KLUCZ_PROGU[kod]: prog, "prog_u0_proc": 10.0, "zwloka_s": 0.6}


@cache
def _scena_bazowa(sposob: SposobPracy) -> dict[str, Any]:
    enm, _ = dodaj_odejscie_stacji(zbuduj_scene(sposob))
    return enm


def _pole1(enm: dict[str, Any]) -> str:
    return sterownik_pola(enm, pola_liniowe(enm)[0]["ref_id"])["ref_id"]


@cache
def _sonda(sposob: SposobPracy, kod: str) -> tuple[float, float, float]:
    """(min w strefie przy c_min, max w strefie przy c_min, max poza strefą przy c_max) wielkości
    decydującej funkcji pola 1 — z surowego wyniku solvera."""
    enm = ustaw_funkcje(_scena_bazowa(sposob), _pole1(_scena_bazowa(sposob)), {kod: _nastawy(kod, 1.0, sposob)})
    model = EnergyNetworkModel.model_validate(enm)
    graph = map_enm_to_network_graph(model)
    funkcje = funkcje_ziemnozwarciowe(model, graph)
    (f,) = [x for x in funkcje if x.kod == kod and x.urzadzenie_ref == _pole1(enm)]
    obliczenie = oblicz_siec_doziemna(model, graph, funkcje)
    w_strefie = [
        _wielkosc(kod, p.pole(f.klucz), sposob)
        for p in obliczenie.wynik_min.punkty
        if p.stan == STAN_PRZED and p.pole(f.klucz).zwarcie_w_strefie
    ]
    poza = [
        _wielkosc(kod, p.pole(f.klucz), sposob)
        for p in obliczenie.wynik_max.punkty
        if p.stan == STAN_PRZED and not p.pole(f.klucz).zwarcie_w_strefie
    ]
    assert w_strefie and poza
    return min(w_strefie), max(w_strefie), max(poza)


def _ocena(enm: dict[str, Any]) -> dict[str, Any]:
    model = EnergyNetworkModel.model_validate(enm)
    return ocen_zabezpieczenia_ziemnozwarciowe(
        model, map_enm_to_network_graph(model), odniesienie="test"
    ).to_dict()


def _rekordy(ziemne: dict[str, Any], urzadzenie: str, kod: str) -> dict[str, dict[str, Any]]:
    return {
        r["kryterium"]: r
        for r in ziemne["oceny"]
        if r["urzadzenie_ref"] == urzadzenie and r["kod"] == kod
    }


@pytest.mark.parametrize("nastawa", ["czula", "nieczula"])
@pytest.mark.parametrize("kod", FUNKCJE)
@pytest.mark.parametrize("sposob", SPOSOBY_PRACY)
def test_czulosc_i_selektywnosc_wg_wyroczni_solvera(
    sposob: SposobPracy, kod: str, nastawa: str
) -> None:
    min_w, max_w, max_poza = _sonda(sposob, kod)
    if nastawa == "czula":
        prog = 0.5 * min_w if min_w > 0 else 0.5 * max_w if max_w > 0 else 1e-3
    else:
        prog = 2.0 * max(max_w, max_poza, 1e-3)
    enm = _scena_bazowa(sposob)
    pole1 = _pole1(enm)
    ziemne = _ocena(ustaw_funkcje(enm, pole1, {kod: _nastawy(kod, prog, sposob)}))
    rekordy = _rekordy(ziemne, pole1, kod)

    czulosc = rekordy["CZULOSC"]
    assert czulosc["status"] == ("SPELNIA" if min_w >= prog else "NIE_SPELNIA"), czulosc["zdanie_pl"]
    assert czulosc["prog"] == pytest.approx(prog)
    assert czulosc["wartosc"] == pytest.approx(min_w, rel=1e-9, abs=1e-12)
    selektywnosc = rekordy["SELEKTYWNOSC"]
    assert selektywnosc["status"] == ("SPELNIA" if max_poza < prog else "NIE_SPELNIA"), (
        selektywnosc["zdanie_pl"]
    )
    # Miejsce zwarcia: punkty rekordu czułości to strefa pola 1 — z linią sąsiednią (ST1).
    nazwy_strefy = {p["nazwa_pl"] for p in czulosc["punkty"]}
    assert "Zacisk końcowy Kabel odejścia ST1" in nazwy_strefy
    assert not any(n.startswith("Szyna GPZ") for n in nazwy_strefy)
    for rekord in rekordy.values():
        assert rekord["ocena"]["wyjasnienie"]["zdanie_pl"].strip()
        assert rekord["ocena"]["limit"] is None or rekord["ocena"]["limit"]["podstawa"]["dokument"]
    if kod not in _PRADOWE:
        assert rekordy["ROZRUCH_U0"]["status"] == "SPELNIA"
    # AWSC bez automatyki ZAWSC w sieci — nazwany brak, ocena liczy stan przed wymuszeniem.
    kody_odmow = {b["kod"] for r in ziemne["odmowy"] for b in r.get("braki", [])}
    assert (KOD_AWSC_BEZ_ZAWSC in kody_odmow) is (sposob == "KOMPENSOWANY_AWSC")


def test_fizyka_selektywnosci_wg_sposobu_pracy() -> None:
    """Kontrola wyroczni na liczbach: w sieci kompensowanej 51N nie da się nastawić selektywnie
    (pole zdrowe mierzy więcej niż uszkodzone), a 67N cos φ i Go> — tak; w sieci izolowanej
    selektywne są 51N (pole uszkodzone ≫ pola zdrowe) i 67N sin φ."""
    # Pole 1 (8 km kabla) w sieci kompensowanej: prąd własny przy zwarciu poza strefą (c_max)
    # jest prawie równy prądowi przy zwarciu w strefie — okno nastawy 51N bez zapasu.
    min_w, _, max_poza = _sonda("KOMPENSOWANY", "51N")
    assert 0.9 < max_poza / min_w < 1.1
    for kod in ("67N", "Go>"):
        min_w, _, max_poza = _sonda("KOMPENSOWANY", kod)
        assert max_poza <= 0 < min_w, kod
    min_w, _, max_poza = _sonda("IZOLOWANY", "51N")
    assert min_w > 2 * max_poza
    min_w, _, max_poza = _sonda("IZOLOWANY", "67N")
    assert max_poza <= 0 < min_w


# ---------------------------------------------------------------------------
# 59N i ZAWSC z nastawami, czas po wymuszeniu, stopniowanie z odejściem ST1
# ---------------------------------------------------------------------------


def _sterownik_pomiarowy(enm: dict[str, Any]) -> str:
    pola = {sterownik_pola(enm, p["ref_id"])["ref_id"] for p in pola_liniowe(enm)}
    return next(
        p["ref_id"]
        for p in enm["protection_assignments"]
        if p.get("bay_ref") and p["ref_id"] not in pola
    )


def _pole3(enm: dict[str, Any]) -> str:
    return sterownik_pola(enm, pola_liniowe(enm)[2]["ref_id"])["ref_id"]


def _zadeklaruj_zrodlo_u0_pola_pomiarowego(enm: dict[str, Any]) -> dict[str, Any]:
    """Projektant potwierdza źródło 3U₀ pola pomiaru napięcia Z.17 — własny przekładnik pola
    z uzwojeniem III w otwartym trójkącie (`set_bay_equipment`, ``zrodlo_u0_ref``; ta sama
    deklaracja co dla pól liniowych — decyzja właściciela 2026-10-29 pkt 4: źródło wiąże
    projektant, szablon go nie zgaduje)."""
    pole = next(b for b in enm["bays"] if b.get("funkcja_pomiaru") == "NAPIECIA_SZYN")
    vt = next(a["device_ref"] for a in pole["primary_devices"] if a["kind"] == "VT")
    return ok(
        op(
            enm,
            "set_bay_equipment",
            {
                "bay_ref": pole["ref_id"],
                "mode": "szablon",
                "bay_template_ref": BAY_TEMPLATE_GPZ_POMIAR_NAPIECIA_Z17.template_id,
                "zrodlo_u0_ref": vt,
            },
        )
    )


@cache
def _scena_awsc_z_zawsc(*, zrodlo_u0_pomiarowego: bool = True) -> dict[str, Any]:
    """59N w polu pomiaru napięcia Z.17 (funkcja z rysunku standardu — same nastawy) i ZAWSC
    w sterowniku pola 3 (wyłącznik pola w macierzy wyzwoleń, U0 z szyn GPZ)."""
    enm = scena_z_nastawami("KOMPENSOWANY_AWSC")
    if zrodlo_u0_pomiarowego:
        enm = _zadeklaruj_zrodlo_u0_pola_pomiarowego(enm)
    enm = ok(
        op(
            enm,
            "update_protection_settings",
            {
                "protection_ref": _sterownik_pomiarowy(enm),
                "grupa": 1,
                "nastawy": {"59N": {"prog_u0_proc": 30.0, "zwloka_s": 5.0}},
            },
        )
    )
    return ustaw_funkcje(enm, _pole3(enm), {"ZAWSC": {"prog_u0_proc": 20.0, "zwloka_s": 1.5}})


def test_59n_i_zawsc_z_nastawami_oceniane_bez_odmowy() -> None:
    enm = _scena_awsc_z_zawsc()
    ziemne = _ocena(enm)
    for urzadzenie, kod in ((_sterownik_pomiarowy(enm), "59N"), (_pole3(enm), "ZAWSC")):
        rekordy = _rekordy(ziemne, urzadzenie, kod)
        assert rekordy["CZULOSC"]["status"] == "SPELNIA", kod
        assert rekordy["SELEKTYWNOSC"]["status"] == "NIE_DOTYCZY", kod
    kody_odmow = {b["kod"] for r in ziemne["odmowy"] for b in r.get("braki", [])}
    assert KOD_AWSC_BEZ_ZAWSC not in kody_odmow


def test_59n_bez_zrodla_3u0_to_odmowa_nazwana_z_akcja() -> None:
    """Para do testu wyżej: te same nastawy 59N bez deklaracji źródła 3U₀ — odmowa nazywa
    brakujące wejście i akcję naprawczą, liczby nie ma (brak wejścia ≠ spełnia)."""
    enm = _scena_awsc_z_zawsc(zrodlo_u0_pomiarowego=False)
    ziemne = _ocena(enm)
    sterownik = _sterownik_pomiarowy(enm)
    assert not [r for r in ziemne["oceny"] if r["urzadzenie_ref"] == sterownik and r["kod"] == "59N"]
    odmowy = [r for r in ziemne["odmowy"] if r["urzadzenie_ref"] == sterownik and r["kod"] == "59N"]
    assert len(odmowy) == 1
    assert odmowy[0]["status"] == "NIE_OCENIONO"
    braki = odmowy[0]["braki"]
    assert {b["kod"] for b in braki} == {KOD_BRAK_WEJSCIA}
    assert "3U0" in braki[0]["komunikat_pl"] and braki[0]["akcja_naprawcza_pl"].strip()


def test_awsc_funkcja_ruszajaca_po_wymuszeniu_dziala_po_tw_plus_tf() -> None:
    """Go> z progiem między konduktancją przed i po wymuszeniu: rusza dopiero po załączeniu
    AWSC, więc czas zadziałania = zwłoka ZAWSC (1,5 s) + zwłoka Go> (0,6 s)."""
    enm = _scena_awsc_z_zawsc()
    pole1 = _pole1(enm)
    enm = ustaw_funkcje(enm, pole1, {"Go>": _nastawy("Go>", 2.5, "KOMPENSOWANY_AWSC")})
    rekordy = _rekordy(_ocena(enm), pole1, "Go>")
    czulosc = rekordy["CZULOSC"]
    assert czulosc["status"] == "SPELNIA", czulosc["zdanie_pl"]
    assert czulosc["stan"] == STAN_PO_AWSC
    assert czulosc["t_zadzialania_s"] == pytest.approx(1.5 + 0.6)


def test_stopniowanie_z_odejsciem_st1_wg_cti() -> None:
    """Zwarcie na linii sąsiedniej (strefa ST1 ⊂ strefa pola 1): odstęp czasu 51N pola 1
    wobec 51N odejścia ST1 = 0,8 − 0,3 s ≥ CTI 0,2 s; po skróceniu zwłoki pola do 0,4 s
    odstęp 0,1 s < CTI."""
    for zwloka, status in ((0.8, "SPELNIA"), (0.4, "NIE_SPELNIA")):
        enm = scena_z_nastawami("IZOLOWANY")
        pole1 = _pole1(enm)
        enm = ustaw_funkcje(
            enm, pole1, {"51N": {**NASTAWY_51N_ODEJSCIA, "zwloka_s": zwloka, "prog": 5.0}}
        )
        stopniowanie = [
            r
            for r in _ocena(enm)["oceny"]
            if r["urzadzenie_ref"] == pole1
            and r["kod"] == "51N"
            and r["kryterium"].startswith("STOPNIOWANIE_CZASOWE:")
        ]
        assert len(stopniowanie) == 1
        assert stopniowanie[0]["status"] == status, stopniowanie[0]["zdanie_pl"]


def test_brak_nastaw_funkcji_to_odmowa_nazwana() -> None:
    enm = _scena_bazowa("IZOLOWANY")
    pole1 = _pole1(enm)
    ziemne = _ocena(ustaw_funkcje(enm, pole1, {"Yo>": {"prog_y0_ms": 1.0}}))
    odmowy = [r for r in ziemne["odmowy"] if r["urzadzenie_ref"] == pole1 and r["kod"] == "Yo>"]
    assert len(odmowy) == 1
    assert odmowy[0]["status"] == "NIE_OCENIONO"
    assert {b["kod"] for b in odmowy[0]["braki"]} == {KOD_BRAK_NASTAWY}
    assert not _rekordy(ziemne, pole1, "Yo>")


def test_rekord_pola_stanu_przed_dla_sieci_bez_awsc() -> None:
    ziemne = _ocena(scena_z_nastawami("KOMPENSOWANY"))
    assert {r.get("stan") for r in ziemne["oceny"] if r["kryterium"] == "CZULOSC"} == {STAN_PRZED}
