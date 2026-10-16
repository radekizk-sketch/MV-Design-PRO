"""Stan zasilenia i tor zasilania z topologii łączeniowej (karta K6a, UI-07/UI-08).

Iloczyn cech (reguła KLASA NIE INSTANCJA):
  {źródła: 1, 2} × {łącznik na torze: zamknięty, otwarty, bez stanu}
  × {struktura: promieniowa, pierścień z punktem podziału, pierścień bez punktu podziału}
  × {element: szyna, odcinek, pole, transformator, odbiór}.

Sieć: GPZ1 (źródło S1) [+ GPZ2 (źródło S2) za zamkniętym sprzęgłem] → kabel C1 → stacja A
(pola IN/OUT/TR z własnymi zaciskami i wyłącznikami w torze, TR A, odbiór A) → kabel C2 →
stacja B (to samo). Łącznik na torze = wyłącznik pola OUT stacji A (``Q_A_OUT``). Pierścień =
kabel C3 z zacisku pola OUT stacji B do ostatniego GPZ; punkt podziału = otwarty wyłącznik
pola OUT stacji B (``Q_B_OUT``). „Bez stanu" = model ma łącznik zamknięty, a rekord stanu
aparatu pola mówi „nieznany" — model nie rozstrzyga stanu łączeniowego.
"""

from __future__ import annotations

import hashlib
import itertools
import json
import random

import pytest
from application.topologia_zasilenia import (
    KOD_AWARIA_APARATU,
    KOD_LACZNIK_NIEUSTALONY,
    KOD_LIMIT_DROG,
    KOD_PETLA,
    KOD_PUNKT_PODZIALU_ZAMKNIETY,
    KOD_ROZBIEZNOSC_STANU,
    KOD_STAN_APARATU_NIEZNANY,
    KOD_WYSPA_BEZ_ZRODLA,
    ElementNieistniejeError,
    zbuduj_stan_zasilenia,
    zbuduj_tor_elementu,
)
from enm.models import (
    Bay,
    BayPrimaryDevice,
    BaySwitchState,
    Bus,
    Cable,
    Corridor,
    EnergyNetworkModel,
    ENMHeader,
    Load,
    Measurement,
    MeasurementRating,
    ProtectionAssignment,
    Source,
    Substation,
    SwitchBranch,
    Transformer,
)
from enm.topology import derive

ZRODLA = (1, 2)
STANY_Q = ("zamkniety", "otwarty", "bez_stanu")
STRUKTURY = ("promieniowa", "pierscien_z_podzialem", "pierscien_bez_podzialu")
ELEMENTY = {
    "szyna": "B",
    "odcinek": "C2",
    "pole": "B_IN",
    "transformator": "T_B",
    "odbior": "L_B",
}
Q = "Q_A_OUT"
NOP = "Q_B_OUT"


def _stacja(
    st: str, *, stan_wyjscia: str = "closed", aparat_wyjscia: BayPrimaryDevice | None = None
) -> tuple[list, list, list, list, list, Substation, list]:
    """Stacja ``st``: szyna główna, pola IN/OUT/TR z zaciskami i wyłącznikami, TR i odbiór."""
    szyny = [
        Bus(ref_id=st, name=f"Szyna {st}", voltage_kv=15.0),
        Bus(ref_id=f"{st}_IN_t", name=f"Zacisk IN {st}", voltage_kv=15.0),
        Bus(ref_id=f"{st}_OUT_t", name=f"Zacisk OUT {st}", voltage_kv=15.0),
        Bus(ref_id=f"{st}_TR_t", name=f"Zacisk TR {st}", voltage_kv=15.0),
        Bus(ref_id=f"{st}_NN", name=f"Szyna nN {st}", voltage_kv=0.4),
    ]
    laczniki = [
        SwitchBranch(
            ref_id=f"Q_{st}_{rola}",
            name=f"Wyłącznik {rola} {st}",
            type="breaker",
            from_bus_ref=st,
            to_bus_ref=f"{st}_{rola}_t",
            status=stan_wyjscia if rola == "OUT" else "closed",
        )
        for rola in ("IN", "OUT", "TR")
    ]
    trafo = Transformer(
        ref_id=f"T_{st}",
        name=f"TR {st}",
        hv_bus_ref=f"{st}_TR_t",
        lv_bus_ref=f"{st}_NN",
        sn_mva=0.63,
        uhv_kv=15.0,
        ulv_kv=0.4,
        uk_percent=6.0,
        pk_kw=6.5,
    )
    odbior = Load(ref_id=f"L_{st}", name=f"Odbiór {st}", bus_ref=f"{st}_NN", p_mw=0.3, q_mvar=0.1)
    pola = [
        Bay(
            ref_id=f"{st}_{rola}",
            name=f"Pole {rola} {st}",
            bay_role=rola,
            substation_ref=f"ST_{st}",
            bus_ref=st,
            terminal_bus_ref=f"{st}_{rola}_t",
            equipment_refs=[f"Q_{st}_{rola}", *([f"T_{st}"] if rola == "TR" else [])],
            primary_devices=(
                [aparat_wyjscia] if rola == "OUT" and aparat_wyjscia is not None else []
            ),
        )
        for rola in ("IN", "OUT", "TR")
    ]
    stacja = Substation(
        ref_id=f"ST_{st}",
        name=f"Stacja {st}",
        station_type="mv_lv",
        bus_refs=[st, f"{st}_NN"],
        transformer_refs=[f"T_{st}"],
    )
    pomiary = [
        Measurement(
            ref_id=f"CT_{st}_IN",
            name=f"Przekładnik IN {st}",
            measurement_type="CT",
            bus_ref=f"{st}_IN_t",
            bay_ref=f"{st}_IN",
            rating=MeasurementRating(ratio_primary=200, ratio_secondary=5),
        )
    ]
    return szyny, laczniki, [trafo], [odbior], pola, stacja, pomiary


def siec(zrodla: int, struktura: str, stan_q: str) -> EnergyNetworkModel:
    """Sieć iloczynu cech (patrz docstring modułu)."""
    szyny = [Bus(ref_id="GPZ1", name="Szyna GPZ 1", voltage_kv=15.0)]
    galezie: list = []
    zrodla_lista = [Source(ref_id="S1", name="Sieć 1", bus_ref="GPZ1", model="short_circuit_power")]
    if zrodla == 2:
        szyny.append(Bus(ref_id="GPZ2", name="Szyna GPZ 2", voltage_kv=15.0))
        zrodla_lista.append(
            Source(ref_id="S2", name="Sieć 2", bus_ref="GPZ2", model="short_circuit_power")
        )
        galezie.append(
            SwitchBranch(
                ref_id="SPRZ",
                name="Sprzęgło GPZ",
                type="bus_coupler",
                from_bus_ref="GPZ1",
                to_bus_ref="GPZ2",
            )
        )
    aparat_q = None
    if stan_q == "bez_stanu":
        aparat_q = BayPrimaryDevice(
            device_ref="A_OUT_CB",
            linked_ref=Q,
            symbol_ref="CB",
            kind="CB",
            placement="MIDSTREAM",
            is_controllable=True,
            switch_state=BaySwitchState(actual_state="nieznany"),
        )
    stan_a = "open" if stan_q == "otwarty" else "closed"
    stan_b = "open" if struktura == "pierscien_z_podzialem" else "closed"
    a = _stacja("A", stan_wyjscia=stan_a, aparat_wyjscia=aparat_q)
    b = _stacja("B", stan_wyjscia=stan_b)
    trafa, odbiory, pola, stacje, pomiary = [], [], [], [], []
    for czesc in (a, b):
        szyny += czesc[0]
        galezie += czesc[1]
        trafa += czesc[2]
        odbiory += czesc[3]
        pola += czesc[4]
        stacje.append(czesc[5])
        pomiary += czesc[6]

    def kabel(ref: str, od: str, do: str) -> Cable:
        return Cable(
            ref_id=ref,
            name=f"Kabel {ref}",
            from_bus_ref=od,
            to_bus_ref=do,
            length_km=1.0,
            r_ohm_per_km=0.2,
            x_ohm_per_km=0.1,
        )

    galezie += [kabel("C1", "GPZ1", "A_IN_t"), kabel("C2", "A_OUT_t", "B_IN_t")]
    korytarze = []
    if struktura != "promieniowa":
        galezie.append(kabel("C3", "B_OUT_t", f"GPZ{zrodla}"))
        korytarze.append(
            Corridor(
                ref_id="M1",
                name="Magistrala pierścieniowa",
                corridor_type="ring",
                ordered_segment_refs=["C1", "C2", "C3"],
                no_point_ref=NOP,
            )
        )
    zabezpieczenia = [
        ProtectionAssignment(
            ref_id="PA_B_IN",
            name="Zabezpieczenie pola IN B",
            breaker_ref="Q_B_IN",
            ct_ref="CT_B_IN",
            device_type="overcurrent",
        )
    ]
    return EnergyNetworkModel(
        header=ENMHeader(name="Iloczyn cech toru"),
        buses=szyny,
        branches=galezie,
        transformers=trafa,
        sources=zrodla_lista,
        loads=odbiory,
        substations=stacje,
        bays=pola,
        corridors=korytarze,
        measurements=pomiary,
        protection_assignments=zabezpieczenia,
    )


def _oczekiwany_stan(struktura: str, stan_q: str) -> str:
    if struktura == "pierscien_bez_podzialu":
        return "zasilany"
    return {"zamkniety": "zasilany", "otwarty": "niezasilany", "bez_stanu": "nierozstrzygniety"}[
        stan_q
    ]


def _oczekiwany_status(struktura: str, stan_q: str) -> tuple[str, set[str]]:
    if struktura == "pierscien_bez_podzialu":
        return {
            "zamkniety": ("nierozstrzygniety", {KOD_PETLA, KOD_PUNKT_PODZIALU_ZAMKNIETY}),
            "otwarty": ("rozstrzygniety", set()),
            "bez_stanu": ("nierozstrzygniety", {KOD_LACZNIK_NIEUSTALONY}),
        }[stan_q]
    return {
        "zamkniety": ("rozstrzygniety", set()),
        "otwarty": ("brak_drogi", {KOD_WYSPA_BEZ_ZRODLA}),
        "bez_stanu": ("nierozstrzygniety", {KOD_LACZNIK_NIEUSTALONY}),
    }[stan_q]


ILOCZYN = list(itertools.product(ZRODLA, STANY_Q, STRUKTURY, ELEMENTY))


@pytest.mark.parametrize(("zrodla", "stan_q", "struktura", "rodzaj"), ILOCZYN)
def test_iloczyn_cech_stan_i_tor(zrodla: int, stan_q: str, struktura: str, rodzaj: str) -> None:
    enm = siec(zrodla, struktura, stan_q)
    ref = ELEMENTY[rodzaj]
    zrodla_refy = [f"S{i}" for i in range(1, zrodla + 1)]

    stan = {e.ref_id: e for e in zbuduj_stan_zasilenia("c", enm).elementy}[ref]
    tor = zbuduj_tor_elementu("c", enm, ref)
    oczekiwany = _oczekiwany_stan(struktura, stan_q)
    assert stan.stan == oczekiwany
    assert tor.stan == oczekiwany
    assert tor.element.rodzaj == rodzaj
    if oczekiwany == "zasilany":
        assert stan.zrodla == zrodla_refy and stan.zrodla_warunkowe == []
    elif oczekiwany == "nierozstrzygniety":
        assert stan.zrodla == [] and stan.zrodla_warunkowe == zrodla_refy
        assert [p.kod for p in stan.przyczyny] == [KOD_LACZNIK_NIEUSTALONY]
        assert stan.przyczyny[0].elementy == [Q]
    else:
        assert stan.zrodla == [] and stan.zrodla_warunkowe == []
        assert [p.kod for p in stan.przyczyny] == [KOD_WYSPA_BEZ_ZRODLA]
        assert Q in stan.przyczyny[0].elementy

    status, kody = _oczekiwany_status(struktura, stan_q)
    assert tor.status == status
    assert {p.kod for p in tor.przyczyny} == kody
    assert tor.drogi_obciete is False

    # Liczba dróg na źródło: pierścień zamknięty i łącznik nieustalony w pierścieniu → 2.
    drogi_na_zrodlo = 0 if status == "brak_drogi" else 1
    if struktura == "pierscien_bez_podzialu" and stan_q != "otwarty":
        drogi_na_zrodlo = 2
    assert len(tor.drogi) == drogi_na_zrodlo * zrodla
    assert sorted({d.zrodlo_ref for d in tor.drogi}) == (zrodla_refy if tor.drogi else [])
    for droga in tor.drogi:
        refy = [e.ref_id for e in droga.elementy]
        assert refy[0] == droga.zrodlo_ref
        assert refy[-1] == ref
        assert len(refy) == len(set(refy)), "droga prosta nie powtarza elementu"
        assert NOP not in refy or struktura == "pierscien_bez_podzialu"
        assert droga.pewna == (Q not in droga.laczniki_nieustalone)
        for element in droga.elementy:
            if element.rodzaj == "lacznik":
                assert element.stan_lacznika == (
                    "nieustalony" if element.ref_id == Q and stan_q == "bez_stanu" else "zamkniety"
                )
        if stan_q == "otwarty":
            assert Q not in refy
    # Predykaty parami: zasilany pewnie ⇔ istnieje droga pewna; brak dróg ⇔ niezasilany.
    assert (stan.stan == "zasilany") == any(d.pewna for d in tor.drogi)
    assert (stan.stan == "niezasilany") == (not tor.drogi)
    assert tor.sasiedztwo.kierunek_ustalony == bool(tor.drogi)
    # Odcinek terenowy łączy dwie stacje — nie należy do żadnej.
    stacja = tor.sasiedztwo.stacja
    assert (stacja.ref_id if stacja else None) == (None if rodzaj == "odcinek" else "ST_B")


def test_sasiedztwo_nawigacyjne_sieci_promieniowej() -> None:
    enm = siec(1, "promieniowa", "zamkniety")

    def sasiedztwo(ref: str) -> dict[str, list[str] | str | None]:
        s = zbuduj_tor_elementu("c", enm, ref).sasiedztwo
        return {
            "poprzednie": [o.ref_id for o in s.poprzednie],
            "nastepne": [o.ref_id for o in s.nastepne],
            "pola_wejsciowe": [o.ref_id for o in s.pola_wejsciowe],
            "pola_wyjsciowe": [o.ref_id for o in s.pola_wyjsciowe],
            "pole": s.pole.ref_id if s.pole else None,
            "stacja": s.stacja.ref_id if s.stacja else None,
            "przekladniki": [p.ref_id for p in s.przekladniki],
            "zabezpieczenia": [z.ref_id for z in s.zabezpieczenia],
        }

    assert sasiedztwo("B") == {
        "poprzednie": ["Q_B_IN"],
        "nastepne": ["Q_B_OUT", "Q_B_TR"],
        "pola_wejsciowe": ["B_IN"],
        "pola_wyjsciowe": ["B_OUT", "B_TR"],
        "pole": None,
        "stacja": "ST_B",
        "przekladniki": [],
        "zabezpieczenia": [],
    }
    assert sasiedztwo("C2") == {
        "poprzednie": ["A_OUT_t"],
        "nastepne": ["B_IN_t"],
        "pola_wejsciowe": ["A_OUT"],
        "pola_wyjsciowe": ["B_IN"],
        "pole": None,
        "stacja": None,
        "przekladniki": [],
        "zabezpieczenia": [],
    }
    assert sasiedztwo("B_IN") == {
        "poprzednie": ["C2"],
        "nastepne": ["B"],
        "pola_wejsciowe": ["A_OUT"],
        "pola_wyjsciowe": [],
        "pole": "B_IN",
        "stacja": "ST_B",
        "przekladniki": ["CT_B_IN"],
        "zabezpieczenia": ["PA_B_IN"],
    }
    assert sasiedztwo("T_B") == {
        "poprzednie": ["B_TR_t"],
        "nastepne": ["B_NN"],
        "pola_wejsciowe": ["B_TR"],
        "pola_wyjsciowe": [],
        "pole": "B_TR",
        "stacja": "ST_B",
        "przekladniki": [],
        "zabezpieczenia": [],
    }
    assert sasiedztwo("L_B") == {
        "poprzednie": ["B_NN"],
        "nastepne": [],
        "pola_wejsciowe": ["B_TR"],
        "pola_wyjsciowe": [],
        "pole": None,
        "stacja": "ST_B",
        "przekladniki": [],
        "zabezpieczenia": [],
    }
    droga = zbuduj_tor_elementu("c", enm, "L_B").drogi[0]
    assert [e.ref_id for e in droga.elementy] == [
        "S1", "GPZ1", "C1", "A_IN_t", "Q_A_IN", "A", "Q_A_OUT", "A_OUT_t", "C2",
        "B_IN_t", "Q_B_IN", "B", "Q_B_TR", "B_TR_t", "T_B", "B_NN", "L_B",
    ]  # fmt: skip
    assert [e.pole_ref for e in droga.elementy if e.ref_id in {"Q_B_IN", "B_IN_t", "T_B"}] == [
        "B_IN",
        "B_IN",
        "B_TR",
    ]


def test_odcinek_otwarty_i_lacznik_otwarty_jako_cel() -> None:
    """Łącznik otwarty zasilany z jednej strony: stan per strona, ostatni element drogi
    ``otwarty``; strona za łącznikiem — niezasilana."""
    enm = siec(1, "promieniowa", "otwarty")
    stan = {e.ref_id: e for e in zbuduj_stan_zasilenia("c", enm).elementy}[Q]
    assert stan.stan == "zasilany" and stan.otwarty and stan.stan_lacznika == "otwarty"
    assert {s.szyna_ref: s.stan for s in stan.strony} == {
        "A": "zasilany",
        "A_OUT_t": "niezasilany",
    }
    tor = zbuduj_tor_elementu("c", enm, Q)
    assert tor.status == "rozstrzygniety"
    assert tor.drogi[0].elementy[-1].stan_lacznika == "otwarty"
    assert [o.ref_id for o in tor.sasiedztwo.nastepne] == ["A_OUT_t"]


@pytest.mark.parametrize(
    ("stan_w_modelu", "zgloszony", "kod"),
    [
        ("closed", "nieznany", KOD_STAN_APARATU_NIEZNANY),
        ("closed", "awaria", KOD_AWARIA_APARATU),
        ("closed", "otwarty", KOD_ROZBIEZNOSC_STANU),
        ("open", "zamkniety", KOD_ROZBIEZNOSC_STANU),
        ("open", "nieznany", KOD_STAN_APARATU_NIEZNANY),
    ],
)
def test_lacznik_nieustalony_kazda_przyczyna(stan_w_modelu: str, zgloszony: str, kod: str) -> None:
    """Każda postać „model nie rozstrzyga" (nieznany, awaria, rozbieżność w obie strony)
    × stan w modelu — ta sama ścieżka nierozstrzygnięcia, nigdy domysł."""
    enm = siec(1, "promieniowa", "zamkniety")
    galezie = [
        g.model_copy(update={"status": stan_w_modelu}) if g.ref_id == Q else g for g in enm.branches
    ]
    pola = [
        (
            b.model_copy(
                update={
                    "primary_devices": [
                        BayPrimaryDevice(
                            device_ref="A_OUT_CB",
                            linked_ref=Q,
                            symbol_ref="CB",
                            kind="CB",
                            placement="MIDSTREAM",
                            switch_state=BaySwitchState(actual_state=zgloszony),
                        )
                    ]
                }
            )
            if b.ref_id == "A_OUT"
            else b
        )
        for b in enm.bays
    ]
    enm = enm.model_copy(update={"branches": galezie, "bays": pola})
    odpowiedz = zbuduj_stan_zasilenia("c", enm)
    [nieustalony] = odpowiedz.laczniki_nieustalone
    assert nieustalony.ref_id == Q and nieustalony.przyczyna.kod == kod
    assert nieustalony.stan_zgloszony == zgloszony and nieustalony.pole_ref == "A_OUT"
    stany = {e.ref_id: e for e in odpowiedz.elementy}
    assert stany["L_B"].stan == "nierozstrzygniety"
    assert stany[Q].stan_lacznika == "nieustalony"
    assert stany["L_A"].stan == "zasilany"


def test_rekord_zgodny_z_modelem_nie_jest_nieustalony() -> None:
    enm = siec(1, "promieniowa", "zamkniety")
    pola = [
        (
            b.model_copy(
                update={
                    "primary_devices": [
                        BayPrimaryDevice(
                            device_ref="A_OUT_CB",
                            linked_ref=Q,
                            symbol_ref="CB",
                            kind="CB",
                            placement="MIDSTREAM",
                            switch_state=BaySwitchState(actual_state="zamkniety_naped_rozbrojony"),
                        )
                    ]
                }
            )
            if b.ref_id == "A_OUT"
            else b
        )
        for b in enm.bays
    ]
    odpowiedz = zbuduj_stan_zasilenia("c", enm.model_copy(update={"bays": pola}))
    assert odpowiedz.laczniki_nieustalone == []
    assert {e.ref_id: e.stan for e in odpowiedz.elementy}["L_B"] == "zasilany"


def test_stan_zasilenia_zgodny_z_derive_dla_kazdej_szyny() -> None:
    """Jedna prawda: bez łączników nieustalonych stan szyny = ``Wyspa.zasilona`` z ``derive``."""
    for zrodla, struktura, stan_q in itertools.product(ZRODLA, STRUKTURY, ("zamkniety", "otwarty")):
        enm = siec(zrodla, struktura, stan_q)
        widok = derive(enm)
        odpowiedz = zbuduj_stan_zasilenia("c", enm)
        for element in odpowiedz.elementy:
            if element.rodzaj != "szyna":
                continue
            wyspa = widok.wyspa_szyny(element.ref_id)
            assert wyspa is not None
            assert (element.stan == "zasilany") == wyspa.zasilona
            assert element.zrodla == list(wyspa.zrodla_sieciowe)
        assert [w.szyny for w in odpowiedz.wyspy] == [list(w.szyny) for w in widok.wyspy]
        assert odpowiedz.laczniki_otwarte == list(widok.laczniki_otwarte)


def test_stacja_i_generator_bez_zrodla_sieciowego() -> None:
    """Stacja zasilona, gdy którakolwiek jej szyna; wyspa z samym generatorem nie jest
    zasilona (semantyka ``Wyspa.zasilona``) — przyczyna nazywa generator."""
    from enm.models import Generator

    enm = siec(1, "promieniowa", "otwarty")
    enm = enm.model_copy(
        update={
            "generators": [
                Generator(
                    ref_id="PV_B", name="PV B", bus_ref="B_NN", p_mw=0.1, gen_type="pv_inverter"
                )
            ]
        }
    )
    stany = {e.ref_id: e for e in zbuduj_stan_zasilenia("c", enm).elementy}
    assert stany["ST_A"].stan == "zasilany"
    assert stany["ST_B"].stan == "niezasilany"
    assert stany["PV_B"].stan == "niezasilany"
    [przyczyna] = stany["L_B"].przyczyny
    assert przyczyna.kod == KOD_WYSPA_BEZ_ZRODLA and "PV_B" in przyczyna.opis


def test_nieznany_element_404_semantyka() -> None:
    with pytest.raises(ElementNieistniejeError):
        zbuduj_tor_elementu("c", siec(1, "promieniowa", "zamkniety"), "NIE_MA")


def _odcisk(model: object) -> str:
    return hashlib.sha256(
        json.dumps(model.model_dump(mode="json"), sort_keys=True).encode()  # type: ignore[attr-defined]
    ).hexdigest()


@pytest.mark.parametrize(
    ("zrodla", "struktura", "stan_q"), list(itertools.product(ZRODLA, STRUKTURY, STANY_Q))
)
def test_determinizm_niezalezny_od_kolejnosci_kolekcji(
    zrodla: int, struktura: str, stan_q: str
) -> None:
    enm = siec(zrodla, struktura, stan_q)
    los = random.Random(20261016)
    przetasowany = enm.model_copy(
        update={
            k: los.sample(getattr(enm, k), len(getattr(enm, k)))
            for k in (
                "buses",
                "branches",
                "transformers",
                "sources",
                "loads",
                "bays",
                "substations",
            )
        }
    )
    for ref in ["B", "C2", "B_IN", "T_B", "L_B", Q]:
        odciski = {_odcisk(zbuduj_tor_elementu("c", m, ref)) for m in (enm, enm, przetasowany)}
        assert len(odciski) == 1
    assert len({_odcisk(zbuduj_stan_zasilenia("c", m)) for m in (enm, enm, przetasowany)}) == 1


def test_siec_oczkowa_obciecie_jawne() -> None:
    """Sieć oczkowa (złota sieć 20 stacji z poprzecznymi połączeniami): lista dróg obcięta
    jawnie — status nierozstrzygnięty z kodem limitu, nigdy cicho."""
    from tests.enm.golden_network_fixture import build_golden_network

    tor = zbuduj_tor_elementu("c", build_golden_network(), "bus_s19_15")
    assert tor.drogi_obciete is True
    assert tor.status == "nierozstrzygniety"
    assert {KOD_LIMIT_DROG, KOD_PETLA} <= {p.kod for p in tor.przyczyny}
