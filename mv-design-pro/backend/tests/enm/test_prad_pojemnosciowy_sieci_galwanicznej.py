"""Prąd pojemnościowy doziemienia SIECI GALWANICZNEJ punktu neutralnego (karta UX-04/POLE-ZU,
znalezisko karty BKR).

DLACZEGO. Solver V12.6 (projekt uziemienia punktu neutralnego, ferrorezonans) sumował B0
WSZYSTKICH linii i kabli modelu, a nie gałęzi sieci galwanicznie połączonej z punktem
neutralnym danej sekcji. Przy dwóch sekcjach GPZ z otwartym sprzęgłem (normalny stan pracy
GPZ dwutransformatorowego) każda sekcja ma własną sieć i własny zespół uziemiający, więc prąd
pojemnościowy jednej sieci był zawyżony o pojemność drugiej, a dobór dławika i AWSC — błędny.
Kabel 110 kV i kabel nN (za transformatorem) też wchodziły do sumy.

JEDNO ŹRÓDŁO. Sieci, ich gałęzie i baterie wyznacza `enm.uziemienie_sekcji` (składowe spójne po
gałęziach w ruchu bez transformatorów: linie, kable, łączniki zamknięte). Wejście V12.6
(`V126UziemienieSnInput.sieci`) niesie dla KAŻDEJ sieci jej gałęzie i szyny; solver liczy I_C,
dobór i wiarygodność dla każdej sieci osobno; gotowość czyta te same sieci.

WYROCZNIA z pierwszych zasad (IEC 60909-0 pkt 7 i PN-EN 50522 zał. B: prąd zwarcia doziemnego
w sieci z punktem neutralnym nieuziemionym albo skompensowanym I_C = 3·ω·C0·U_f = √3·ω·C0·U_n):
B0 = ω·C0 = Σ b0·ℓ gałęzi SIECI + B0 baterii w gwieździe uziemionej tej sieci (B = Q_n/U_n²,
jeden stopień, bez dławika); I_C = √3·U_n·B0. Wyrocznia NIE wywołuje funkcji produktu.

ILOCZYN CECH: sprzęgło {zamknięte, otwarte} × liczba transformatorów 110 kV/SN {1, 2} ×
bateria w gwieździe uziemionej {brak, w sekcji 1, w sekcji 2}; stałe w każdym przypadku:
zespół uziemiający z dławikiem w każdej sekcji, kabel SN o RÓŻNEJ długości w każdej sekcji,
kabel 110 kV z B0 (poza siecią SN — nie może wejść do sumy).
"""

from __future__ import annotations

import math
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.models import Bus, Cable, EnergyNetworkModel, ENMDefaults, ENMHeader, ShuntCapacitor
from enm.uziemienie_sekcji import uziemienie_sieci
from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.v126_contracts import V126AnalysisType, build_v126_input_from_enm

from tests.enm.test_skladowa_zerowa_zu import TRAFO_WN_SN, _zespol

UN_KV = 15.0
#: B0 kabla SN [S/km] — 2π·50 Hz·0,39 µF/km (kabel XLPE 3×120 mm²).
B0_KABLA_S_PER_KM = 2.0 * math.pi * 50.0 * 390e-9
#: Długości kabli sekcji [km] — różne, żeby suma po całym modelu różniła się od sumy sieci.
DLUGOSC_KM = {1: 4.0, 2: 1.5}
#: Kabel 110 kV z pojemnością doziemną — po stronie WN transformatora (inna sieć galwaniczna).
B0_KABLA_WN_S_PER_KM = 2.0 * math.pi * 50.0 * 150e-9
DLUGOSC_WN_KM = 10.0
Q_BATERII_MVAR = 1.2
#: B baterii gwiazdy uziemionej (jeden stopień, bez dławika): Q_n/U_n² [S] (Y0 = Y1).
B0_BATERII_S = Q_BATERII_MVAR * 1e6 / (UN_KV * 1e3) ** 2

SPRZEGLO = ("zamkniete", "otwarte")
TRANSFORMATORY = (1, 2)
BATERIA = ("brak", "sekcja_1", "sekcja_2")


def _model(sprzeglo: str, transformatory: int, bateria: str) -> EnergyNetworkModel:
    """GPZ 110/15 kV z operacji domenowej (dwie sekcje, zespół z dławikiem w każdej), kable
    sekcji i kabel 110 kV, bateria w gwieździe uziemionej wg cechy, sprzęgło wg cechy."""
    pusty = EnergyNetworkModel(
        header=ENMHeader(name="Sieci galwaniczne", defaults=ENMDefaults(sn_nominal_kv=UN_KV))
    ).model_dump(mode="json")
    wynik = execute_domain_operation(
        enm_dict=pusty,
        op_name="add_grid_source_sn",
        payload={
            "source_name": "GPZ Łąkowa",
            "voltage_kv": UN_KV,
            "sections_count": 2,
            "manual_equivalent": {
                "short_circuit_input_side": "HV_110",
                "hv_voltage_kv": 110.0,
                "sk3_hv_mva": 3000.0,
                "rx_ratio": 0.1,
            },
            "transformer_count": transformatory,
            "transformer_catalog_ref": TRAFO_WN_SN,
            "zespoly_uziemiajace": [_zespol("dlawik", 1), _zespol("dlawik", 2)],
        },
    )
    assert not wynik.get("error"), wynik.get("error")
    enm = EnergyNetworkModel.model_validate(wynik["snapshot"])
    sekcje = [s.bus_ref for s in enm.substations[0].gpz_sections]
    szyna_wn = enm.transformers[0].hv_bus_ref
    szyny = list(enm.buses)
    galezie: list[Any] = []
    for numer, szyna in enumerate(sekcje, start=1):
        koniec = f"odbior/{numer}"
        szyny.append(Bus(ref_id=koniec, name=f"Stacja odbiorcza {numer}", voltage_kv=UN_KV))
        galezie.append(
            Cable(
                ref_id=f"kabel_sn/{numer}",
                name=f"Kabel SN sekcji {numer}",
                from_bus_ref=szyna,
                to_bus_ref=koniec,
                length_km=DLUGOSC_KM[numer],
                r_ohm_per_km=0.253,
                x_ohm_per_km=0.12,
                b0_siemens_per_km=B0_KABLA_S_PER_KM,
            )
        )
    szyny.append(Bus(ref_id="wn/odbior", name="Stacja 110 kV", voltage_kv=110.0))
    galezie.append(
        Cable(
            ref_id="kabel_wn",
            name="Kabel 110 kV",
            from_bus_ref=szyna_wn,
            to_bus_ref="wn/odbior",
            length_km=DLUGOSC_WN_KM,
            r_ohm_per_km=0.05,
            x_ohm_per_km=0.12,
            b0_siemens_per_km=B0_KABLA_WN_S_PER_KM,
        )
    )
    branches = [
        (
            g.model_copy(update={"status": "open"})
            if sprzeglo == "otwarte" and g.type == "bus_coupler"
            else g
        )
        for g in enm.branches
    ] + galezie
    baterie = []
    if bateria != "brak":
        numer = int(bateria[-1])
        baterie.append(
            ShuntCapacitor(
                ref_id="BAT",
                name="Bateria kondensatorów",
                bus_ref=sekcje[numer - 1],
                rated_mvar=Q_BATERII_MVAR,
                rated_kv=UN_KV,
                catalog_ref="KOMP_SN_1V2_15KV",
                catalog_namespace="KOMPENSATOR_SN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
                uklad_polaczen="GWIAZDA_UZIEMIONA",
                liczba_stopni=1,
                dlawik_ograniczajacy=False,
            )
        )
    return enm.model_copy(
        update={"buses": szyny, "branches": branches, "shunt_capacitors": baterie}
    )


def _b0_wyroczni(sekcje: tuple[int, ...], bateria: str) -> float:
    b0 = sum(B0_KABLA_S_PER_KM * DLUGOSC_KM[n] for n in sekcje)
    if bateria != "brak" and int(bateria[-1]) in sekcje:
        b0 += B0_BATERII_S
    return b0


def _i_c_a(b0_s: float) -> float:
    return math.sqrt(3.0) * UN_KV * 1e3 * b0_s


def _sieci_wyroczni(sprzeglo: str) -> list[tuple[int, ...]]:
    return [(1, 2)] if sprzeglo == "zamkniete" else [(1,), (2,)]


def _wyniki_sieci(wynik: dict[str, Any]) -> list[dict[str, Any]]:
    return wynik["sieci"] if "sieci" in wynik else [wynik]


@pytest.mark.parametrize("bateria", BATERIA)
@pytest.mark.parametrize("transformatory", TRANSFORMATORY)
@pytest.mark.parametrize("sprzeglo", SPRZEGLO)
def test_prad_pojemnosciowy_kazdej_sieci_z_wyroczni(
    sprzeglo: str, transformatory: int, bateria: str
) -> None:
    enm = _model(sprzeglo, transformatory, bateria)
    oczekiwane = _sieci_wyroczni(sprzeglo)

    # Jedyna prawda: sieci SN modelu, B0 i I_C każdej sieci (z baterią tej sieci).
    sieci = uziemienie_sieci(enm)
    assert len(sieci) == len(oczekiwane)
    for siec, sekcje in zip(sieci, oczekiwane, strict=True):
        assert siec.b0_s == pytest.approx(_b0_wyroczni(sekcje, bateria), rel=1e-12)
        assert siec.prad_pojemnosciowy_a == pytest.approx(
            _i_c_a(_b0_wyroczni(sekcje, bateria)), rel=1e-12
        )
        assert [ref for ref, _ in siec.baterie_b0] == (
            ["BAT"] if bateria != "brak" and int(bateria[-1]) in sekcje else []
        )

    # Wejście V12.6: jedna pozycja na sieć, gałęzie wyłącznie tej sieci (bez kabla 110 kV).
    wejscie = build_v126_input_from_enm(enm, analysis_type=V126AnalysisType.NEUTRAL_EARTHING_DESIGN)
    assert wejscie.uziemienie_sn is not None
    assert [sorted(s.galezie_sieci) for s in wejscie.uziemienie_sn.sieci] == [
        sorted(f"kabel_sn/{n}" for n in sekcje) for sekcje in oczekiwane
    ]

    # Solver: I_C i dobór dławika każdej sieci z JEJ gałęzi i baterii.
    wynik = V126AcademicSolver().run(V126AnalysisType.NEUTRAL_EARTHING_DESIGN, wejscie)["result"]
    wiersze = _wyniki_sieci(wynik)
    assert len(wiersze) == len(oczekiwane)
    assert ("sieci" in wynik) is (len(oczekiwane) > 1)
    for wiersz, siec, sekcje in zip(wiersze, sieci, oczekiwane, strict=True):
        i_c = _i_c_a(_b0_wyroczni(sekcje, bateria))
        assert wiersz["capacitive_earth_fault_current_a"] == pytest.approx(i_c, abs=1e-4)
        assert wiersz["capacitive_earth_fault_current_a"] == pytest.approx(
            siec.prad_pojemnosciowy_a, abs=1e-4
        )
        assert sorted(b["branch_ref"] for b in wiersz["branches_contributing"]) == sorted(
            f"kabel_sn/{n}" for n in sekcje
        )
        assert [
            b["shunt_capacitor_ref"] for b in wiersz.get("shunt_capacitors_contributing", [])
        ] == (["BAT"] if bateria != "brak" and int(bateria[-1]) in sekcje else [])
        # Dławik dobrany na prąd TEJ sieci (I_L = I_C przy rozstrojeniu zerowym doboru).
        assert wiersz["coil_current_rating_a"] == pytest.approx(i_c, abs=1e-4)
        if len(oczekiwane) > 1:
            # Sieć nazwana szyną SWOJEJ sekcji GPZ (nie zaciskiem pola zespołu, wspólnym
            # z nazwy dla obu sieci).
            (sekcja,) = sekcje
            szyna_sekcji = enm.substations[0].gpz_sections[sekcja - 1].bus_ref
            assert wiersz["szyna_ref"] == szyna_sekcji
            nazwa_szyny = next(b.name for b in enm.buses if b.ref_id == szyna_sekcji)
            assert wiersz["nazwa_pl"] == f"Sieć SN 15 kV — {nazwa_szyny}"

    # Iniekcja w wyroczni: przy otwartym sprzęgle suma po CAŁYM modelu (z kablem 110 kV) różni
    # się od I_C każdej sieci — test rozróżnia obie metody, więc czerwienieje przy powrocie
    # do sumy po modelu.
    if sprzeglo == "otwarte":
        caly_model = _i_c_a(_b0_wyroczni((1, 2), bateria) + B0_KABLA_WN_S_PER_KM * DLUGOSC_WN_KM)
        for wiersz in wiersze:
            assert abs(wiersz["capacitive_earth_fault_current_a"] - caly_model) > 1.0


@pytest.mark.parametrize("bateria", BATERIA)
@pytest.mark.parametrize("sprzeglo", SPRZEGLO)
def test_gotowosc_czyta_te_same_sieci(sprzeglo: str, bateria: str) -> None:
    """Gotowość projektu uziemienia: źródło C0 w sieci punktu neutralnego (blokujące, gdy nie
    ma go w ŻADNEJ sieci) i nieblokujące „sieć bez C0" — z tych samych sieci co solver."""
    from application.analyses.v126_gotowosc import ocen_gotowosc_v126

    enm = _model(sprzeglo, 2, bateria)
    # Sekcja 2 bez kabla (i bez stacji na jego końcu — szyna bez gałęzi byłaby osobną siecią
    # bez punktu neutralnego): przy otwartym sprzęgle jej sieć ma C0 wyłącznie z baterii.
    enm = enm.model_copy(
        update={
            "branches": [g for g in enm.branches if g.ref_id != "kabel_sn/2"],
            "buses": [b for b in enm.buses if b.ref_id != "odbior/2"],
        }
    )
    gotowosc = ocen_gotowosc_v126(enm, V126AnalysisType.NEUTRAL_EARTHING_DESIGN, {})
    warunki = {w.kod: w for w in gotowosc.warunki}
    assert warunki["galezie.b0"].spelniony is True
    sekcja_2_bez_c0 = sprzeglo == "otwarte" and bateria != "sekcja_2"
    if sekcja_2_bez_c0:
        assert warunki["galezie.siec_bez_c0"].spelniony is False
        assert warunki["galezie.siec_bez_c0"].blokujacy is False
    else:
        assert "galezie.siec_bez_c0" not in warunki or warunki["galezie.siec_bez_c0"].spelniony

    wynik = V126AcademicSolver().run(
        V126AnalysisType.NEUTRAL_EARTHING_DESIGN,
        build_v126_input_from_enm(enm, analysis_type=V126AnalysisType.NEUTRAL_EARTHING_DESIGN),
    )["result"]
    if sekcja_2_bez_c0:
        # Sieć sekcji 2 bez C0 — nazwany brak tej sieci; sieć sekcji 1 policzona (wynik
        # jednej sieci nie znika za brakiem danych drugiej).
        pierwsza, druga = wynik["sieci"]
        assert pierwsza["capacitive_earth_fault_current_a"] == pytest.approx(
            _i_c_a(_b0_wyroczni((1,), bateria)), abs=1e-4
        )
        assert druga["status"] == "dane niekompletne"
        assert "status" not in wynik
        assert wynik["sanity"]["status"] == "dane niekompletne"


def test_determinizm_wyniku_wielu_sieci() -> None:
    """Ten sam model → ten sam wynik bit w bit (kolejność sieci z jedynej prawdy)."""
    import json

    wyniki = [
        json.dumps(
            V126AcademicSolver().run(
                V126AnalysisType.NEUTRAL_EARTHING_DESIGN,
                build_v126_input_from_enm(
                    _model("otwarte", 2, "sekcja_2"),
                    analysis_type=V126AnalysisType.NEUTRAL_EARTHING_DESIGN,
                ),
            ),
            sort_keys=True,
        )
        for _ in range(2)
    ]
    assert wyniki[0] == wyniki[1]


@pytest.mark.parametrize("nazwa_szyny", ["", "   "])
def test_nazwa_sieci_przy_szynie_bez_nazwy_bez_identyfikatora(nazwa_szyny: str) -> None:
    """Sieć nazwana szyną sekcji bez nazwy nadanej dostaje opis rodzaju, nigdy identyfikator
    szyny (strażnik `nazwa_bez_identyfikatora_guard` pilnuje kształtu wyrażenia)."""
    enm = _model("otwarte", 1, "brak")
    szyna_1 = enm.substations[0].gpz_sections[0].bus_ref
    szyny = [
        b.model_copy(update={"name": nazwa_szyny}) if b.ref_id == szyna_1 else b for b in enm.buses
    ]
    enm = enm.model_copy(update={"buses": szyny})
    wejscie = build_v126_input_from_enm(enm, analysis_type=V126AnalysisType.NEUTRAL_EARTHING_DESIGN)
    assert wejscie.uziemienie_sn is not None
    siec_1 = next(s for s in wejscie.uziemienie_sn.sieci if s.szyna_ref == szyna_1)
    assert siec_1.nazwa_pl == "Sieć SN 15 kV — Szyna bez nazwy"
    assert szyna_1 not in siec_1.nazwa_pl


#: Susceptancja zgodna kabla SN [S/km] i długość [km], przy których KAŻDA sekcja ma Σb·ℓ
#: poniżej progu pojemności doczepnej oceny ferrorezonansu (10 µS), a suma obu — powyżej.
B_KABLA_S_PER_KM = 1.2e-4
DLUGOSC_FERRO_KM = 0.06


@pytest.mark.parametrize("sprzeglo", SPRZEGLO)
def test_ferrorezonans_ocenia_kazda_siec_osobno(sprzeglo: str) -> None:
    """Ocena ferrorezonansu (analiza napięcia powrotnego) — pojemność doczepna sieci
    z punktem neutralnym izolowanym liczona dla KAŻDEJ sieci galwanicznej: przy otwartym
    sprzęgle żadna sekcja nie przekracza progu, choć suma po modelu by go przekroczyła."""
    enm = _model(sprzeglo, 2, "brak")
    enm = enm.model_copy(
        update={
            "zespoly_uziemiajace": [],
            "branches": [
                (
                    g.model_copy(
                        update={"length_km": DLUGOSC_FERRO_KM, "b_siemens_per_km": B_KABLA_S_PER_KM}
                    )
                    if g.ref_id.startswith("kabel_sn/")
                    else g
                )
                for g in enm.branches
            ],
        }
    )
    assert {s.wariant("spoczynek") for s in uziemienie_sieci(enm)} == {"izolowany"}
    wejscie = build_v126_input_from_enm(enm, analysis_type=V126AnalysisType.TRANSIENT_TRV)
    wynik = V126AcademicSolver().run(V126AnalysisType.TRANSIENT_TRV, wejscie)["result"]
    suma_sekcji = B_KABLA_S_PER_KM * DLUGOSC_FERRO_KM
    assert suma_sekcji < 1e-5 < 2 * suma_sekcji
    assert wynik["ferroresonance"]["risk"] is (sprzeglo == "zamkniete")
