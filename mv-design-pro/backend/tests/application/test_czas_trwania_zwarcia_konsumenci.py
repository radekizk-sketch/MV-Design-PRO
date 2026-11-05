"""Czas trwania zwarcia pola SN — JEDNO rozstrzygnięcie dla każdego konsumenta (karta
EDYTOR-DELT-SCENARIUSZA-ZABEZPIECZEN, pakiet 8; dyrektywa właściciela: „Spełnione dla t = 1 s”,
bez wymogu przypisania zabezpieczenia, bez stanu „nieustalony”).

Iloczyn cech: źródło czasu {projektant (łącznik pola), nastawy zabezpieczenia pola, wartość
robocza 1 s IEC 62271-1 §4.7} × wynik {spełnione, niespełnione} × konsument {ocena cieplna
aparatury pola, dowód doboru aparatury}. Konsument „przewody SN” ma iloczyn źródło × wynik
w ``tests/application/analyses/test_wytrzymalosc_cieplna_slad_czasu.py``, a dobór kabla toru
DER — w testach podglądu doboru DER (pakiet 6b).

Każdy przypadek sprawdza tę samą trójkę: liczba czasu (nigdy pusta), źródło i dana przyjęta
(wyłącznie przy wartości roboczej, jakość ``ESTIMATED``, dowód ``NIEPELNY``); zdanie wiersza
cieplnego „Spełnione/Niespełnione dla t = … s” z liczb backendu; brak słowa „nieustalony”.
"""

from __future__ import annotations

from typing import Any

import pytest
from application.analyses.protection.czas_wylaczenia_pola import czasy_wylaczenia_pol_stacji
from application.analyses.wytrzymalosc_aparatury_pol import (
    PradyPola,
    prad_cieplny_przy_czasie_pola,
    zbuduj_widok_wytrzymalosci_aparatury,
)
from application.equipment_proof.generator import EquipmentProofGenerator
from application.equipment_proof.types import DeviceRating, EquipmentProofInput
from application.equipment_proof.wymagania_pola import wymagania_z_czasem_pola
from enm.models import EnergyNetworkModel
from network_model.catalog.wartosci_robocze import liczba_pl

from tests.analysis.test_wytrzymalosc_aparatury_pol import _enm
from tests.utils.prad_cieplny import KAPPA_FIKSTURY, TK_BIEGU_FIKSTURY_S, ith_normy

POLE = "pole/in"
#: Czas z nastaw zabezpieczenia pola (kształt ``czasy_wylaczenia_pol_stacji``).
CZAS_NASTAW_S = 0.5
CZAS_PROJEKTANTA_S = 3.0
#: I″k pola: 5 kA mieści się w I_th wyłącznika (20 kA / 1 s) przy każdym czasie iloczynu,
#: 40 kA przekracza go przy każdym.
IK_SPELNIONE_KA = 5.0
IK_NIESPELNIONE_KA = 40.0

ZRODLA = ("projektant", "nastawy", "wartosc_robocza")
WYNIKI = ("spelnione", "niespelnione")


def _model(zrodlo: str) -> EnergyNetworkModel:
    enm = _enm(aparaty={POLE: "sw-cb-abb-vd4-12kv-630a"})
    if zrodlo != "projektant":
        return enm
    galezie = [
        g.model_copy(update={"czas_wylaczenia_zwarcia_s": CZAS_PROJEKTANTA_S}) for g in enm.branches
    ]
    return enm.model_copy(update={"branches": galezie})


def _prady(ik_ka: float) -> PradyPola:
    ith_biegu = ith_normy(ik_ka, KAPPA_FIKSTURY, TK_BIEGU_FIKSTURY_S)
    return PradyPola(
        punkt_ref="sn1",
        punkt_nazwa="sn1",
        ik_ka=ik_ka,
        ip_ka=ik_ka * KAPPA_FIKSTURY * 2**0.5,
        ith_ka=ith_biegu,
        kappa=KAPPA_FIKSTURY,
        tk_biegu_s=TK_BIEGU_FIKSTURY_S,
    )


def _czas_nastaw() -> dict[str, Any]:
    return {
        "t_clearing_s": CZAS_NASTAW_S,
        "zrodlo": "nastawy_pola",
        "powod_pl": "Czas stopnia I> zabezpieczenia pola P-01.",
        "podstawa_pl": "Czas stopnia I> zabezpieczenia pola P-01.",
        "czlon_nastawczy_s": 0.44,
        "czas_wlasny_wylacznika_s": 0.06,
        "zalozenia_pl": [],
        "kody_gotowosci": [],
        "dana_przyjeta": None,
    }


def _czas_oczekiwany(zrodlo: str) -> tuple[float, str]:
    return {
        "projektant": (CZAS_PROJEKTANTA_S, "projektant"),
        "nastawy": (CZAS_NASTAW_S, "nastawy_pola"),
        "wartosc_robocza": (1.0, "wartosc_robocza"),
    }[zrodlo]


def _pole_widoku(zrodlo: str, wynik: str) -> dict[str, Any]:
    enm = _model(zrodlo)
    ik = IK_SPELNIONE_KA if wynik == "spelnione" else IK_NIESPELNIONE_KA
    # Rozstrzygnięcie produkcyjne (bez prądu pola nastawy nie dają czasu — tu ich nie ma, bo
    # model nie ma sterownika); czas z nastaw podstawiony w kształcie produkcyjnym.
    czasy = czasy_wylaczenia_pol_stacji(enm=enm, station_ref="stn", ik_pol_ka={POLE: ik})
    if zrodlo == "nastawy":
        czasy[POLE] = _czas_nastaw()
    widok = zbuduj_widok_wytrzymalosci_aparatury(
        enm=enm,
        station_ref="stn",
        prady_pol={POLE: _prady(ik)},
        czasy_pol=czasy,
        run_id="bieg-iloczynu",
    )
    (pole,) = widok["pola"]
    return pole


@pytest.mark.parametrize("wynik", WYNIKI)
@pytest.mark.parametrize("zrodlo", ZRODLA)
def test_aparatura_pola_ocenia_cieplne_dla_czasu_z_jednego_rozstrzygniecia(
    zrodlo: str, wynik: str
) -> None:
    pole = _pole_widoku(zrodlo, wynik)
    t_k, zrodlo_czasu = _czas_oczekiwany(zrodlo)

    czas = pole["czas_wylaczenia"]
    assert (czas["t_clearing_s"], czas["zrodlo"]) == (t_k, zrodlo_czasu)
    cieplna = next(o for o in pole["oceny"] if o["kryterium_id"].endswith(".cieplna"))
    status = "SPELNIA" if wynik == "spelnione" else "NIE_SPELNIA"
    assert cieplna["status_maszynowy"] == status, cieplna["wyjasnienie"]
    slowo = "Spełnione" if wynik == "spelnione" else "Niespełnione"
    assert pole["komunikat_cieplny_pl"] == f"{slowo} dla t = {liczba_pl(t_k)} s"
    # I_th porównywany = I_th przy TYM czasie (jedna para (I_th, t_k)).
    assert pole["prad_cieplny_pola"]["tk_pola_s"] == t_k
    dane = cieplna["dowod"]["status_danych"]["dane_przyjete"]
    czasy_przyjete = [d for d in dane if d["nazwa_pl"].startswith("czas trwania zwarcia")]
    if zrodlo == "wartosc_robocza":
        assert [(d["wartosc"]["wartosc"], d["jakosc"]) for d in czasy_przyjete] == [
            (1.0, "ESTIMATED")
        ]
        assert cieplna["kompletnosc_dowodu"] == "NIEPELNY"
    else:
        assert czasy_przyjete == []
    for tekst in (czas["podstawa_pl"], czas["powod_pl"], pole["komunikat_pl"]):
        assert "nieustalon" not in tekst.lower()


@pytest.mark.parametrize("wynik", WYNIKI)
@pytest.mark.parametrize("zrodlo", ZRODLA)
def test_dowod_doboru_aparatury_bierze_ten_sam_czas_pola(zrodlo: str, wynik: str) -> None:
    """Dowód doboru aparatury pola: t_k i I_th z TEGO SAMEGO czasu pola co widok aparatury
    (``wymagania_z_czasem_pola``), sprawdzenie I_th rozstrzygnięte, czas roboczy w danych
    przyjętych dowodu."""
    pole = _pole_widoku(zrodlo, wynik)
    t_k, _ = _czas_oczekiwany(zrodlo)
    ik = IK_SPELNIONE_KA if wynik == "spelnione" else IK_NIESPELNIONE_KA
    czas_pola = {
        **pole["czas_wylaczenia"],
        "pole_ref": POLE,
        "prad_cieplny_pola": prad_cieplny_przy_czasie_pola(
            _prady(ik), pole["czas_wylaczenia"]
        ).to_dict(),
    }
    wymagane = wymagania_z_czasem_pola(
        {
            "u_kv": 15.0,
            "ikss_ka": ik,
            "ip_ka": _prady(ik).ip_ka,
            "ith_ka": _prady(ik).ith_ka,
            "tk_s": TK_BIEGU_FIKSTURY_S,
        },
        czas_pola,
    )
    assert wymagane["tk_s"] == t_k
    paczka = EquipmentProofGenerator.generate(
        EquipmentProofInput(
            project_id="p",
            case_id="c",
            run_id="bieg-iloczynu",
            connection_node_id="sn1",
            device=DeviceRating(
                device_id="q1",
                name_pl="Wyłącznik pola",
                type_ref=None,
                u_m_kv=17.5,
                i_cu_ka=25.0,
                i_dyn_ka=200.0,
                i_th_ka=20.0,
                t_th_s=1.0,
            ),
            required_fault_results=wymagane,
            project_name="Projekt",
            case_name="Przypadek",
        )
    )
    (ith,) = (c for c in paczka.result.checks if c.name == "Ith")
    assert ith.required_value == pytest.approx(pole["prad_cieplny_pola"]["ith_ka"])
    assert (ith.status == "PASS") is (wynik == "spelnione"), ith.message_pl
    czasy_przyjete = [
        d
        for d in paczka.result.dane_przyjete
        if d.wartosc is not None and d.wartosc.jednostka == "s"
    ]
    assert len(czasy_przyjete) == (1 if zrodlo == "wartosc_robocza" else 0)
    assert all("nieustalon" not in n.lower() for n in ith.notes)
