"""Zakres ważności wyniku zwarcia przez impedancję przejścia Z_f (karta OD-14, partia 10).

INTENCJA. Wynik z Z_f jest poza zakresem IEC 60909 (norma definiuje prąd zwarcia
metalicznego), więc kontrakt OD-14 §3 dzieli zdolności zależne od wyniku zwarciowego na
ZABRONIONE (dobór, dowód aparatury, wytrzymałość, nastawy nadprądowe, koordynacja, dowód
regulacyjny, energia łuku) i DOPUSZCZONE (sama analiza zwarciowa, nastawy ziemnozwarciowe
z prądów minimalnych). Testy przypinają jako iloczyn cech:

  * podział zdolności — rozłączny i domykający zbiór zdolności zależnych (deklaracja
    „suma = zależne, zbiory rozłączne" z modułu zdolności);
  * zdolność × {wynik metaliczny, wynik z Z_f} → blokada SI-117 wyłącznie dla pary
    (zabroniona, z Z_f) — w `blokady_zakresu_waznosci`, w `blokady_autorytetu` i w warstwie
    biegu (`blokady_zakresu_biegu`, `wymagaj_zakresu_biegu`, `bieg_w_zakresie_iec60909`);
  * predykat artefaktu biegu × kształt artefaktu;
  * projekcja scenariusza na opcje biegu × tryb {METALLIC, IMPEDANCE Z_f, IMPEDANCE Z_f = 0}
    i reguła opcji w assemblerze (ta sama co w rdzeniu);
  * wkłady maszyn × {sieć bez maszyn, sieć z maszyną} × Z_f niedopuszczalna → odmowa
    wejścia rdzenia (reguła danych PRZED rozgałęzieniem „brak maszyn");
  * pola odmowy HTTP × łańcuch przyczyn (odmowa wprost, opakowana raz, dwa razy, odmowa
    wejścia rdzenia opakowana, odmowa bez pól, łańcuch z cyklem).
"""

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from api.odmowa_http import pola_odmowy
from application.autorytet_biegu_zwarciowego import (
    bieg_w_zakresie_iec60909,
    blokady_zakresu_biegu,
    wymagaj_zakresu_biegu,
)
from domain.fault_scenario import (
    FaultImpedance,
    FaultLocation,
    FaultMode,
    FaultType,
    ShortCircuitConfig,
    new_fault_scenario,
)
from enm.assembler import impedancja_zwarcia_z_opcji
from enm.scenariusze import OperatingScenario, RodzajScenariusza, opcje_biegu_ze_scenariusza
from network_model.core.autorytet_wyniku_zwarciowego import (
    KLUCZ_IMPEDANCJI_ZWARCIA,
    ProweniencjaWynikuZwarciowego,
    blokady_autorytetu,
    blokady_zakresu_waznosci,
    wynik_poza_zakresem_iec60909,
)
from network_model.core.impedancja_przejscia import (
    KLUCZ_OPCJI_IMPEDANCJI_ZWARCIA,
    KOD_IMPEDANCJA_NIESKONCZONA,
    KOD_IMPEDANCJA_POJEMNOSCIOWA,
)
from network_model.core.voltage_factor import dobierz_c
from network_model.core.zdolnosci_wkladu_zwarciowego import (
    KOD_BLOKADY_IMPEDANCJA_ZWARCIA,
    ZDOLNOSCI_BLOKOWANE_PRZY_IMPEDANCJI_ZWARCIA,
    ZDOLNOSCI_DOPUSZCZONE_PRZY_IMPEDANCJI_ZWARCIA,
    ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO,
    ZdolnoscMiarodajna,
)
from network_model.odmowa_danych import (
    RODZAJ_WEZEL,
    OdmowaDanychError,
    OdmowaNazwana,
    OdmowaWejsciaRdzenia,
    OdwolanieElementu,
    RekordOdmowy,
)

WSZYSTKIE_ZDOLNOSCI = sorted(ZdolnoscMiarodajna, key=str)
ARTEFAKT_Z_ZF = {KLUCZ_IMPEDANCJI_ZWARCIA: {"r_f_ohm": 2.0, "x_f_ohm": 0.0}}


# ---------------------------------------------------------------------------
# Podział zdolności
# ---------------------------------------------------------------------------


def test_podzial_zdolnosci_rozlaczny_i_domyka_zdolnosci_zalezne() -> None:
    assert not (
        ZDOLNOSCI_BLOKOWANE_PRZY_IMPEDANCJI_ZWARCIA & ZDOLNOSCI_DOPUSZCZONE_PRZY_IMPEDANCJI_ZWARCIA
    )
    assert (
        ZDOLNOSCI_BLOKOWANE_PRZY_IMPEDANCJI_ZWARCIA | ZDOLNOSCI_DOPUSZCZONE_PRZY_IMPEDANCJI_ZWARCIA
    ) == ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO


def test_kontrakt_od14_dopuszcza_wylacznie_analize_i_nastawy_ziemnozwarciowe() -> None:
    assert ZDOLNOSCI_DOPUSZCZONE_PRZY_IMPEDANCJI_ZWARCIA == {
        ZdolnoscMiarodajna.SHORT_CIRCUIT_3F,
        ZdolnoscMiarodajna.SHORT_CIRCUIT_1F,
        ZdolnoscMiarodajna.EARTH_FAULT_SETTINGS,
    }


# ---------------------------------------------------------------------------
# Zdolność × {metaliczny, z Z_f}
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("poza", [False, True], ids=["metaliczny", "przez_zf"])
@pytest.mark.parametrize("zdolnosc", WSZYSTKIE_ZDOLNOSCI, ids=str)
def test_blokada_si117_wylacznie_dla_zdolnosci_zabronionej_i_wyniku_z_zf(
    zdolnosc: ZdolnoscMiarodajna, poza: bool
) -> None:
    proweniencja = ProweniencjaWynikuZwarciowego.ze_znacznikow((), poza_zakresem_iec60909=poza)
    oczekiwana = poza and zdolnosc in ZDOLNOSCI_BLOKOWANE_PRZY_IMPEDANCJI_ZWARCIA
    zakres = blokady_zakresu_waznosci(zdolnosc, proweniencja)
    assert bool(zakres) is oczekiwana
    kody_autorytetu = [b.kod for b in blokady_autorytetu(zdolnosc, proweniencja)]
    assert (KOD_BLOKADY_IMPEDANCJA_ZWARCIA in kody_autorytetu) is oczekiwana
    if oczekiwana:
        (blokada,) = zakres
        assert blokada.kod == KOD_BLOKADY_IMPEDANCJA_ZWARCIA
        assert blokada.zdolnosc is zdolnosc
        assert "IEC 60909" in blokada.komunikat_pl

    bieg = SimpleNamespace(raw_result=dict(ARTEFAKT_Z_ZF) if poza else {"results": []})
    assert blokady_zakresu_biegu(bieg, zdolnosc) == zakres
    assert bieg_w_zakresie_iec60909(bieg) is not poza
    if oczekiwana:
        with pytest.raises(OdmowaNazwana) as odmowa:
            wymagaj_zakresu_biegu(bieg, zdolnosc)
        assert odmowa.value.kod == KOD_BLOKADY_IMPEDANCJA_ZWARCIA
        assert dict(odmowa.value.dane) == {"zdolnosc": str(zdolnosc)}
    else:
        wymagaj_zakresu_biegu(bieg, zdolnosc)


@pytest.mark.parametrize(
    ("artefakt", "poza"),
    [
        (None, False),
        ({}, False),
        ({KLUCZ_IMPEDANCJI_ZWARCIA: None}, False),
        ({"results": [{"z_f_ohm": {"re": 2.0, "im": 0.0}}]}, False),
        (ARTEFAKT_Z_ZF, True),
    ],
    ids=["brak", "pusty", "klucz_none", "tylko_wiersz", "z_zf"],
)
def test_predykat_artefaktu_biegu(artefakt: dict | None, poza: bool) -> None:
    """JEDYNY predykat cechy czyta klucz artefaktu biegu zapisywany wyłącznie dla Z_f ≠ 0."""
    assert wynik_poza_zakresem_iec60909(artefakt) is poza


# ---------------------------------------------------------------------------
# Projekcja scenariusza na opcje biegu × tryb
# ---------------------------------------------------------------------------


def _opcje(tryb: FaultMode, z_f: FaultImpedance | None) -> dict:
    spec = new_fault_scenario(
        study_case_id=uuid4(),
        name="Zwarcie",
        fault_type=FaultType.SC_3F,
        location=FaultLocation(element_ref="bus-1", location_type="BUS"),
        fault_mode=tryb,
        fault_impedance=z_f,
        config=ShortCircuitConfig(scenariusz="MAX"),
    )
    scenariusz = OperatingScenario(
        scenario_id=str(spec.scenario_id),
        name="Zwarcie",
        kind=RodzajScenariusza.FAULT_STUDY,
        fault_spec=spec,
    )
    return opcje_biegu_ze_scenariusza(scenariusz)


@pytest.mark.parametrize(
    ("tryb", "z_f", "oczekiwana"),
    [
        (FaultMode.METALLIC, None, None),
        (FaultMode.IMPEDANCE, FaultImpedance(r_f_ohm=2.0, x_f_ohm=1.5), complex(2.0, 1.5)),
        (FaultMode.IMPEDANCE, FaultImpedance(r_f_ohm=0.0, x_f_ohm=0.0), None),
    ],
    ids=["metaliczny", "impedancja", "impedancja_zero"],
)
def test_projekcja_scenariusza_i_regula_opcji_biegu(
    tryb: FaultMode, z_f: FaultImpedance | None, oczekiwana: complex | None
) -> None:
    """Klucz opcji wyłącznie w trybie IMPEDANCE; Z_f = 0 przechodzi do biegu jako zwarcie
    metaliczne (ta sama funkcja normalizacji co rdzeń)."""
    opcje = _opcje(tryb, z_f)
    assert (KLUCZ_OPCJI_IMPEDANCJI_ZWARCIA in opcje) is (tryb == FaultMode.IMPEDANCE)
    assert impedancja_zwarcia_z_opcji(opcje) == oczekiwana


@pytest.mark.parametrize(
    ("surowe", "kod"),
    [
        ({}, KOD_IMPEDANCJA_NIESKONCZONA),
        ({"r_f_ohm": 1.0}, KOD_IMPEDANCJA_NIESKONCZONA),
        ({"r_f_ohm": "1", "x_f_ohm": 0.0}, KOD_IMPEDANCJA_NIESKONCZONA),
        ({"r_f_ohm": True, "x_f_ohm": 0.0}, KOD_IMPEDANCJA_NIESKONCZONA),
        ({"r_f_ohm": 1.0, "x_f_ohm": -1.0}, KOD_IMPEDANCJA_POJEMNOSCIOWA),
        ([1.0, 0.0], KOD_IMPEDANCJA_NIESKONCZONA),
    ],
    ids=["pusty", "brak_x", "napis", "bool", "x_ujemna", "lista"],
)
def test_opcja_biegu_niedopuszczalna_to_odmowa_nazwana(surowe: object, kod: str) -> None:
    with pytest.raises(OdmowaNazwana) as odmowa:
        impedancja_zwarcia_z_opcji({KLUCZ_OPCJI_IMPEDANCJI_ZWARCIA: surowe})
    assert odmowa.value.kod == kod


# ---------------------------------------------------------------------------
# Wkłady maszyn × {bez maszyn, z maszyną} × Z_f niedopuszczalna
# ---------------------------------------------------------------------------


#: c węzła SN 15 kV dla scenariusza MAX z JEDNEGO nośnika (tabela 1 IEC 60909-0) — od scalenia
#: partii 10 i 11 rdzeń wkładów nie ma domyślnego c; wołający podaje c dobrane dla węzła.
_C_MAX_SN = dobierz_c(15.0, "MAX", None, tolerancja_nn=None).wartosc


def _graf_wkladow(z_maszyna: bool):
    from enm.mapping import map_enm_to_network_graph

    from tests.api.test_proof_pack_api import _enm_z_maszyna

    enm = _enm_z_maszyna()
    if not z_maszyna:
        enm = enm.model_copy(update={"generators": []})
    graf = map_enm_to_network_graph(enm)
    wezel = next(n.id for n in graf.nodes.values() if n.name == "Szyna OZE")
    return graf, wezel


@pytest.mark.parametrize("z_maszyna", [False, True], ids=["bez_maszyn", "z_maszyna"])
@pytest.mark.parametrize(
    "z_f", [complex(1.0, -1.0), complex(float("nan"), 0.0)], ids=["x_ujemna", "nan"]
)
def test_wklady_maszyn_odmawiaja_niedopuszczalnej_zf_niezaleznie_od_maszyn(
    z_maszyna: bool, z_f: complex
) -> None:
    from network_model.solvers.machine_sc_iec60909 import compute_machine_contributions

    graf, wezel = _graf_wkladow(z_maszyna)
    with pytest.raises(OdmowaWejsciaRdzenia) as odmowa:
        compute_machine_contributions(graf, wezel, c_factor=_C_MAX_SN, t_min_s=0.1, z_f_ohm=z_f)
    (rekord,) = odmowa.value.rekordy
    assert rekord.odwolania == (OdwolanieElementu(RODZAJ_WEZEL, wezel),)
    assert wezel not in str(odmowa.value)


@pytest.mark.parametrize("z_maszyna", [False, True], ids=["bez_maszyn", "z_maszyna"])
def test_wklady_maszyn_zerowa_zf_bit_w_bit_jak_brak(z_maszyna: bool) -> None:
    from network_model.solvers.machine_sc_iec60909 import compute_machine_contributions

    graf, wezel = _graf_wkladow(z_maszyna)
    assert (
        compute_machine_contributions(
            graf, wezel, c_factor=_C_MAX_SN, t_min_s=0.1, z_f_ohm=0j
        ).to_dict()
        == compute_machine_contributions(graf, wezel, c_factor=_C_MAX_SN, t_min_s=0.1).to_dict()
    )


# ---------------------------------------------------------------------------
# Pola odmowy HTTP × łańcuch przyczyn
# ---------------------------------------------------------------------------


def _nazwana() -> OdmowaNazwana:
    return OdmowaNazwana("Zdanie bez identyfikatora.", kod="test.kod", dane={"punkt": "w-1"})


def _rdzenia() -> OdmowaWejsciaRdzenia:
    return OdmowaWejsciaRdzenia(
        [
            RekordOdmowy(
                "test.rdzen",
                "Węzeł bez drogi do źródła.",
                (OdwolanieElementu(RODZAJ_WEZEL, "w-2"),),
            )
        ]
    )


def _opakuj(przyczyna: BaseException, razy: int) -> OdmowaDanychError:
    biezaca: BaseException = przyczyna
    for poziom in range(razy):
        try:
            raise OdmowaDanychError(f"Kontekst {poziom}: {biezaca}") from biezaca
        except OdmowaDanychError as opakowana:
            biezaca = opakowana
    assert isinstance(biezaca, OdmowaDanychError)
    return biezaca


@pytest.mark.parametrize("razy", [0, 1, 2], ids=["wprost", "opakowana", "dwa_razy"])
def test_pola_odmowy_nazwanej_przez_lancuch_przyczyn(razy: int) -> None:
    pola = pola_odmowy(_opakuj(_nazwana(), razy))
    assert pola == {"kod": "test.kod", "dane": {"punkt": "w-1"}}


@pytest.mark.parametrize("razy", [0, 1, 2], ids=["wprost", "opakowana", "dwa_razy"])
def test_pola_odmowy_rdzenia_przez_lancuch_przyczyn(razy: int) -> None:
    pola = pola_odmowy(_opakuj(_rdzenia(), razy))
    assert pola["rekordy"] == [
        {
            "kod": "test.rdzen",
            "tresc": "Węzeł bez drogi do źródła.",
            "odwolania": [{"rodzaj": RODZAJ_WEZEL, "ref": "w-2"}],
        }
    ]


def test_pola_odmowy_bez_pol_strukturalnych_i_z_cyklem() -> None:
    assert pola_odmowy(OdmowaDanychError("Zwykła odmowa.")) == {}
    a = OdmowaDanychError("A")
    b = OdmowaDanychError("B")
    a.__cause__ = b
    b.__cause__ = a
    assert pola_odmowy(a) == {}
