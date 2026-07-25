"""D2 (RECENZJA_DER_SN_DOBORY_2026-07): testy silników DOBORU toru DER-SN.

Reguła doboru, progi, kandydaci odrzuceni z powodem, determinizm oraz przypadki ❌.
Przykład kanonu: PV 998 kW ⇒ propozycja 1000 kVA 15/0.4 (asercja na REGULE:
najmniejsza Sn ≥ próg przy zgodnych napięciach — katalog ma wpis 1000 kVA 15/0.4).
"""

from __future__ import annotations

import pytest
from network_model.solvers.der_selection_preview import (
    BlockTransformerCandidate,
    BlockTransformerSelectionInput,
    CableCandidate,
    CableSelectionInput,
    FieldApparatusCandidate,
    FieldApparatusSelectionInput,
    propose_block_transformer,
    propose_mv_cable,
    propose_mv_field_apparatus,
)


def _tr_candidates() -> tuple[BlockTransformerCandidate, ...]:
    """Typoszereg 15/0.4 kV (część rzeczywistego katalogu) + wpis o niezgodnym napięciu."""
    return (
        BlockTransformerCandidate("tr-630", "TR 630 kVA 15/0.4", 0.63, 15.0, 0.4, 5.0, "Dyn11"),
        BlockTransformerCandidate("tr-1000", "TR 1000 kVA 15/0.4", 1.0, 15.0, 0.4, 6.0, "Dyn11"),
        BlockTransformerCandidate("tr-1600", "TR 1600 kVA 15/0.4", 1.6, 15.0, 0.4, 6.0, "Dyn11"),
        # Niezgodne napięcie SN (20 kV) — musi zostać odrzucone.
        BlockTransformerCandidate("tr-1000-20", "TR 1000 kVA 20/0.4", 1.0, 20.0, 0.4, 6.0, "Dyn11"),
        # Niezgodne napięcie nN (0.69 kV) — musi zostać odrzucone.
        BlockTransformerCandidate(
            "tr-1000-069", "TR 1000 kVA 15/0.69", 1.0, 15.0, 0.69, 6.0, "Dyn11"
        ),
    )


def test_block_transformer_998kw_proposes_1000kva() -> None:
    """PV 998 kW (cosφ→P=S) ⇒ najmniejsza Sn ≥ 0,998 MVA przy 15/0,4 kV = 1000 kVA."""
    result = propose_block_transformer(
        BlockTransformerSelectionInput(
            sum_apparent_power_mva=0.998,
            primary_voltage_kv=15.0,
            secondary_voltage_kv=0.4,
            candidates=_tr_candidates(),
        )
    )
    assert result.proposal is not None
    assert result.proposal.sn_mva == pytest.approx(1.0)
    assert result.proposal.primary_kv == pytest.approx(15.0)
    assert result.proposal.secondary_kv == pytest.approx(0.4)
    assert result.required_apparent_power_mva == pytest.approx(0.998)
    # 630 kVA odrzucone jako za małe; wpisy o niezgodnych napięciach też odrzucone.
    reason_by_ref = {r.catalog_ref: r.reason_code for r in result.rejected}
    assert reason_by_ref["tr-630"] == "moc_niewystarczajaca"
    assert reason_by_ref["tr-1000-20"] == "napiecie_sn_niezgodne"
    assert reason_by_ref["tr-1000-069"] == "napiecie_nn_niezgodne"


def test_block_transformer_available_vector_groups_from_voltage_class() -> None:
    """D3 wym. 7: lista układów połączeń = realne grupy kandydatów zgodnych napięciowo,
    posortowane, unikalne, niezależnie od progu mocy (i bez wpisów o innych napięciach)."""
    candidates = (
        BlockTransformerCandidate("tr-630", "TR 630 Dyn11", 0.63, 15.0, 0.4, 5.0, "Dyn11"),
        BlockTransformerCandidate("tr-1000-yd", "TR 1000 Yd11", 1.0, 15.0, 0.4, 6.0, "Yd11"),
        # Inne napięcie SN (20 kV) — jego grupa (YNyn0) NIE należy do klasy 15/0,4 kV.
        BlockTransformerCandidate("tr-20", "TR 20/0.4 YNyn0", 1.0, 20.0, 0.4, 6.0, "YNyn0"),
    )
    result = propose_block_transformer(
        BlockTransformerSelectionInput(
            sum_apparent_power_mva=0.5,
            primary_voltage_kv=15.0,
            secondary_voltage_kv=0.4,
            candidates=candidates,
        )
    )
    assert result.available_vector_groups == ("Dyn11", "Yd11")


def test_block_transformer_reserve_and_simultaneity_raise_threshold() -> None:
    """Rezerwa + jednoczesność podnoszą próg: 0,63·1,2·1,1 = 0,8316 MVA ⇒ nadal 1000 kVA,
    ale 630 kVA już nie starcza (0,63 < 0,8316)."""
    result = propose_block_transformer(
        BlockTransformerSelectionInput(
            sum_apparent_power_mva=0.63,
            primary_voltage_kv=15.0,
            secondary_voltage_kv=0.4,
            candidates=_tr_candidates(),
            simultaneity_factor=1.1,
            reserve_pu=0.2,
        )
    )
    assert result.required_apparent_power_mva == pytest.approx(0.63 * 1.1 * 1.2)
    assert result.proposal is not None
    assert result.proposal.sn_mva == pytest.approx(1.0)


def test_block_transformer_no_candidate_returns_error() -> None:
    """ΣS ponad największy TR ⇒ brak kandydata, kod ❌ stabilny."""
    result = propose_block_transformer(
        BlockTransformerSelectionInput(
            sum_apparent_power_mva=5.0,
            primary_voltage_kv=15.0,
            secondary_voltage_kv=0.4,
            candidates=_tr_candidates(),
        )
    )
    assert result.proposal is None
    assert result.error_code == "converter.der_sn.dobor_tr_brak_kandydata"
    assert result.error_pl is not None and result.error_pl.startswith("❌")


def test_block_transformer_deterministic() -> None:
    """Ten sam wejściowy zestaw ⇒ identyczna propozycja (determinizm)."""
    args = BlockTransformerSelectionInput(
        sum_apparent_power_mva=0.998,
        primary_voltage_kv=15.0,
        secondary_voltage_kv=0.4,
        candidates=_tr_candidates(),
    )
    first = propose_block_transformer(args)
    second = propose_block_transformer(args)
    assert first == second


def _cable_candidates() -> tuple[CableCandidate, ...]:
    return (
        CableCandidate("cab-50", "Kabel 50", 50.0, 160.0, 0.641, 0.14),
        CableCandidate("cab-120", "Kabel 120", 120.0, 340.0, 0.153, 0.112),
        CableCandidate("cab-240", "Kabel 240", 240.0, 530.0, 0.0754, 0.099),
    )


def test_cable_selects_smallest_meeting_ampacity_and_drop() -> None:
    """I_TR=140 A, rezerwa 0 ⇒ próg 140 A; najmniejszy przekrój z Iz≥140 i ΔU≤2% = 50 mm²."""
    result = propose_mv_cable(
        CableSelectionInput(
            transformer_current_a=140.0,
            length_km=1.0,
            line_voltage_v=15000.0,
            cos_phi=0.95,
            candidates=_cable_candidates(),
            max_delta_u_pct=2.0,
        )
    )
    assert result.proposal is not None
    assert result.proposal.cross_section_mm2 == pytest.approx(50.0)
    assert result.proposal.rated_current_a >= result.required_ampacity_a


def test_cable_rejects_undersized_by_ampacity() -> None:
    """I_TR=200 A ⇒ 50 mm² (Iz 160) odrzucony za mały, propozycja 120 mm²."""
    result = propose_mv_cable(
        CableSelectionInput(
            transformer_current_a=200.0,
            length_km=1.0,
            line_voltage_v=15000.0,
            cos_phi=0.95,
            candidates=_cable_candidates(),
            max_delta_u_pct=5.0,
        )
    )
    assert result.proposal is not None
    assert result.proposal.cross_section_mm2 == pytest.approx(120.0)
    reason_by_ref = {r.catalog_ref: r.reason_code for r in result.rejected}
    assert reason_by_ref["cab-50"] == "przekroj_niewystarczajacy"


def test_cable_voltage_drop_exceeded_returns_error() -> None:
    """Długi odcinek + rygorystyczny ΔU ⇒ żaden przekrój się nie mieści (kod ❌ ΔU)."""
    result = propose_mv_cable(
        CableSelectionInput(
            transformer_current_a=150.0,
            length_km=40.0,
            line_voltage_v=15000.0,
            cos_phi=0.9,
            candidates=_cable_candidates(),
            max_delta_u_pct=0.5,
        )
    )
    assert result.proposal is None
    assert result.error_code == "converter.der_sn.dobor_kabel_spadek_przekroczony"
    assert result.error_pl is not None and result.error_pl.startswith("❌")


def test_cable_all_undersized_returns_ampacity_error() -> None:
    """I_TR ponad największą obciążalność ⇒ kod ❌ „przekrój niewystarczający"."""
    result = propose_mv_cable(
        CableSelectionInput(
            transformer_current_a=800.0,
            length_km=1.0,
            line_voltage_v=15000.0,
            cos_phi=0.95,
            candidates=_cable_candidates(),
            max_delta_u_pct=5.0,
        )
    )
    assert result.proposal is None
    assert result.error_code == "converter.der_sn.dobor_kabel_przekroj_niewystarczajacy"


def _field_candidates() -> tuple[FieldApparatusCandidate, ...]:
    return (
        FieldApparatusCandidate("cb-630", "Wyłącznik 630 A", "CIRCUIT_BREAKER", 12.0, 630.0, 20.0),
        FieldApparatusCandidate(
            "cb-1250", "Wyłącznik 1250 A", "CIRCUIT_BREAKER", 12.0, 1250.0, 25.0
        ),
        FieldApparatusCandidate("fuse-200", "Bezpiecznik 200 A", "FUSE", 12.0, 200.0, None),
    )


def test_field_apparatus_selects_smallest_meeting_current() -> None:
    """I_TR=100 A ⇒ najmniejszy wyłącznik In≥100 = 630 A (bezpiecznik odrzucony rodzajem)."""
    result = propose_mv_field_apparatus(
        FieldApparatusSelectionInput(
            transformer_current_a=100.0,
            system_voltage_kv=12.0,
            candidates=_field_candidates(),
        )
    )
    assert result.proposal is not None
    assert result.proposal.catalog_ref == "cb-630"
    reason_by_ref = {r.catalog_ref: r.reason_code for r in result.rejected}
    assert reason_by_ref["fuse-200"] == "rodzaj_niewlasciwy"


def test_field_apparatus_too_weak_proposes_stronger() -> None:
    """Aparat 630 A za słaby dla progu 700 A ⇒ odrzucony, propozycja 1250 A (kanon 11)."""
    result = propose_mv_field_apparatus(
        FieldApparatusSelectionInput(
            transformer_current_a=700.0,
            system_voltage_kv=12.0,
            candidates=_field_candidates(),
        )
    )
    assert result.proposal is not None
    assert result.proposal.catalog_ref == "cb-1250"
    reason_by_ref = {r.catalog_ref: r.reason_code for r in result.rejected}
    assert reason_by_ref["cb-630"] == "prad_niewystarczajacy"


def test_field_apparatus_voltage_too_low_rejected() -> None:
    """Aparat 12 kV na sieci 24 kV ⇒ odrzucony napięciem, brak kandydata."""
    result = propose_mv_field_apparatus(
        FieldApparatusSelectionInput(
            transformer_current_a=100.0,
            system_voltage_kv=24.0,
            candidates=_field_candidates(),
        )
    )
    assert result.proposal is None
    assert result.error_code == "converter.der_sn.dobor_pole_brak_kandydata"
    reason_codes = {r.reason_code for r in result.rejected}
    assert "napiecie_aparatu_za_niskie" in reason_codes


# ---------------------------------------------------------------------------
# Karta F-K1 — TRZECIE kryterium doboru: wytrzymalosc zwarciowa zyly (IEC 60949).
# Znalezisko Z1 audytu FLOW: przekroj poprawny pradowo i napieciowo moze ulec
# zniszczeniu przy zwarciu. Kryterium bywa WIAZACE, czyli decyduje o przekroju
# bardziej niz obciazalnosc dlugotrwala.
# ---------------------------------------------------------------------------

# Al/XLPE wg katalogu kabli SN (mv_cable_line_catalog): Jth(1s) = 94 A/mm².
_JTH = 94.0


def _cable_candidates_z_danymi_cieplnymi() -> tuple[CableCandidate, ...]:
    return tuple(
        CableCandidate(
            base.catalog_ref,
            base.name,
            base.cross_section_mm2,
            base.rated_current_a,
            base.r_ohm_per_km,
            base.x_ohm_per_km,
            jth_1s_a_per_mm2=_JTH,
        )
        for base in _cable_candidates()
    )


def test_bez_danych_zwarciowych_wynik_jest_bit_identyczny() -> None:
    """Kryterium jest ADDYTYWNE: bez ith_a/fault_duration_s dobor dziala jak dotad.

    Determinizm istniejacych plynow zalezy od tego, ze rozszerzenie niczego nie
    zmienia, dopoki dane zwarciowe nie sa podane.
    """
    wspolne = {
        "transformer_current_a": 140.0,
        "length_km": 1.0,
        "line_voltage_v": 15000.0,
        "cos_phi": 0.95,
        "max_delta_u_pct": 2.0,
    }
    bez_danych_cieplnych = propose_mv_cable(
        CableSelectionInput(candidates=_cable_candidates(), **wspolne)
    )
    z_danymi_w_katalogu = propose_mv_cable(
        CableSelectionInput(candidates=_cable_candidates_z_danymi_cieplnymi(), **wspolne)
    )
    # Sam katalog z Jth niczego nie zmienia — kryterium wlacza dopiero prad i czas.
    assert bez_danych_cieplnych.proposal == z_danymi_w_katalogu.proposal
    assert bez_danych_cieplnych.rejected == z_danymi_w_katalogu.rejected
    assert bez_danych_cieplnych.error_code is None


def test_kryterium_zwarciowe_jest_wiazace_i_podnosi_przekroj() -> None:
    """Rachunek niezalezny (przypadek Z1 audytu).

    I_TR = 140 A, wiec obciazalnosc dopuszcza 50 mm² (Iz = 160 A) — i tak wychodzi
    z doboru bez kryterium zwarciowego. Dolozmy I_th = 12 500 A i t = 0,5 s:
      50 mm² : Ith(1s) = 94·50  = 4 700 A -> I_dop = 4 700/√0,5  =  6 646,80 A < 12 500 => ODPADA
      120 mm²: Ith(1s) = 94·120 = 11 280 A -> I_dop = 11 280/√0,5 = 15 952,33 A > 12 500 => OK
    Dobor musi przejsc z 50 mm² na 120 mm².
    """
    import math

    assert 4700.0 / math.sqrt(0.5) == pytest.approx(6646.80, rel=1e-5)
    assert 11280.0 / math.sqrt(0.5) == pytest.approx(15952.33, rel=1e-5)

    result = propose_mv_cable(
        CableSelectionInput(
            transformer_current_a=140.0,
            length_km=1.0,
            line_voltage_v=15000.0,
            cos_phi=0.95,
            candidates=_cable_candidates_z_danymi_cieplnymi(),
            max_delta_u_pct=2.0,
            ith_a=12500.0,
            fault_duration_s=0.5,
        )
    )
    assert result.proposal is not None
    assert result.proposal.cross_section_mm2 == pytest.approx(120.0)
    powody = {r.catalog_ref: r.reason_code for r in result.rejected}
    assert powody["cab-50"] == "wytrzymalosc_zwarciowa_niewystarczajaca"
    # Komunikat musi podac wymagany przekroj, zeby projektant wiedzial, co wybrac.
    komunikat = next(r.reason_pl for r in result.rejected if r.catalog_ref == "cab-50")
    assert "Wymagany przekroj co najmniej" in komunikat


def test_brak_danych_cieplnych_w_katalogu_nie_odrzuca_kandydata() -> None:
    """Kandydat bez Ith/Jth nie moze byc odrzucony — brak danych to nie naruszenie.

    Zero fabrykacji dziala w obie strony: nie wolno ani przepuscic jako „spelnia”,
    ani odrzucic jako „nie spelnia”, gdy nie ma czym sprawdzic.
    """
    result = propose_mv_cable(
        CableSelectionInput(
            transformer_current_a=140.0,
            length_km=1.0,
            line_voltage_v=15000.0,
            cos_phi=0.95,
            candidates=_cable_candidates(),  # bez danych cieplnych
            max_delta_u_pct=2.0,
            ith_a=12500.0,
            fault_duration_s=0.5,
        )
    )
    assert result.proposal is not None
    assert result.proposal.cross_section_mm2 == pytest.approx(50.0)
    assert all(r.reason_code != "wytrzymalosc_zwarciowa_niewystarczajaca" for r in result.rejected)


def test_gdy_zaden_kabel_nie_wytrzyma_zwarcia_komunikat_wskazuje_wlasciwa_przyczyne() -> None:
    """Bez rozroznienia powodu blad raportowalby sie jako przekroczony ΔU.

    I_th = 60 kA przez 1 s: nawet 240 mm² ma Ith(1s) = 22 560 A — wszystkie odpadaja.
    """
    result = propose_mv_cable(
        CableSelectionInput(
            transformer_current_a=140.0,
            length_km=1.0,
            line_voltage_v=15000.0,
            cos_phi=0.95,
            candidates=_cable_candidates_z_danymi_cieplnymi(),
            max_delta_u_pct=5.0,
            ith_a=60000.0,
            fault_duration_s=1.0,
        )
    )
    assert result.proposal is None
    assert result.error_code == "converter.der_sn.dobor_kabel_wytrzymalosc_zwarciowa"
    assert result.error_pl is not None and "Wytrzymałość zwarciowa" in result.error_pl


# ---------------------------------------------------------------------------
# Karta F-K5 / V12K-203 — CHARAKTER MOCY BIERNEJ jako parametr doboru toru DER.
# Dlug z V12K-190: solver ΔU umial juz liczyc wzrost napiecia, ale dobor nie
# wystawial przypadku pracy toru wyzszym warstwom (wynik nie mowil, czy ΔU jest
# spadkiem, czy wzrostem, ani dla jakich kierunkow policzono).
# ---------------------------------------------------------------------------


def test_wynik_doboru_niesie_przypadek_pracy_toru_i_znak_zmiany() -> None:
    """Tor DER oddaje moc czynna, wiec domyslnie ΔU jest WZROSTEM napiecia.

    Rachunek niezalezny (cab-50: R = 0,641 om/km, X = 0,14 om/km; I_TR = 140 A,
    L = 1 km, cos fi = 0,95, sin fi = 0,31225; sqrt(3)*I = 242,4871):
      czlon czynny = 242,4871 * 0,641 * 0,95 = 147,663 V
      czlon bierny = 242,4871 * 0,140 * 0,31225 = 10,600 V
    Generacja + pobor Q: ΔU = -147,663 + 10,600 = -137,062 V = -0,9137 % (WZROST).
    """
    result = propose_mv_cable(
        CableSelectionInput(
            transformer_current_a=140.0,
            length_km=1.0,
            line_voltage_v=15000.0,
            cos_phi=0.95,
            candidates=_cable_candidates(),
            max_delta_u_pct=2.0,
        )
    )
    assert result.proposal is not None
    assert result.proposal.cross_section_mm2 == pytest.approx(50.0)
    assert result.proposal.delta_u_v == pytest.approx(-137.062, abs=0.01)
    assert result.proposal.delta_u_pct == pytest.approx(-0.9137, abs=0.0001)
    # Bez tych trzech pol warstwa prezentacji nazwalaby wzrost spadkiem.
    assert result.proposal.is_voltage_rise is True
    assert result.flow_direction == "generation"
    assert result.reactive_character == "inductive"


def test_odbior_zamiast_generacji_daje_spadek_i_znak_dodatni() -> None:
    """Ten sam tor policzony jako ODBIOR: ΔU = +158,263 V (+1,0551 %), czyli spadek.

    Modul zmiany rozni sie od przypadku generacji z poborem Q (0,9137 %), bo znak
    czlonu biernego jest NIEZALEZNY od kierunku mocy czynnej — przy odbiorze
    indukcyjnym oba czlony obnizaja napiecie i sumuja sie.
    """
    result = propose_mv_cable(
        CableSelectionInput(
            transformer_current_a=140.0,
            length_km=1.0,
            line_voltage_v=15000.0,
            cos_phi=0.95,
            candidates=_cable_candidates(),
            max_delta_u_pct=2.0,
            flow_direction="load",
        )
    )
    assert result.proposal is not None
    assert result.proposal.delta_u_pct == pytest.approx(1.0551, abs=0.0001)
    assert result.proposal.is_voltage_rise is False
    assert result.flow_direction == "load"


def test_oddawanie_mocy_biernej_podnosi_wymagany_przekroj() -> None:
    """DOWOD, ze charakter Q jest parametrem DOBORU, a nie ozdoba opisu.

    Ten sam tor (I_TR = 140 A, L = 1 km, cos 0,95) przy limicie |ΔU%| = 1,0 %:
      falownik POBIERA Q  -> cab-50: -0,9137 % <= 1,0 % => propozycja 50 mm²
      falownik ODDAJE Q   -> cab-50: -1,0551 %  > 1,0 % => ODRZUCONY,
                             cab-120: -0,2915 % => propozycja 120 mm²
    Regulacja Q(U) falownika oszczedza wiec caly stopien przekroju kabla.
    """
    wspolne = {
        "transformer_current_a": 140.0,
        "length_km": 1.0,
        "line_voltage_v": 15000.0,
        "cos_phi": 0.95,
        "candidates": _cable_candidates(),
        "max_delta_u_pct": 1.0,
    }
    z_poborem_q = propose_mv_cable(CableSelectionInput(**wspolne))
    z_oddawaniem_q = propose_mv_cable(
        CableSelectionInput(**wspolne, reactive_character="capacitive")
    )

    assert z_poborem_q.proposal is not None
    assert z_poborem_q.proposal.cross_section_mm2 == pytest.approx(50.0)
    assert z_oddawaniem_q.proposal is not None
    assert z_oddawaniem_q.proposal.cross_section_mm2 == pytest.approx(120.0)
    assert z_oddawaniem_q.proposal.delta_u_pct == pytest.approx(-0.2915, abs=0.0001)
    # Powod odrzucenia mowi „Wzrost", bo to wzrost jest tu ograniczeniem.
    powody = {r.catalog_ref: r.reason_pl for r in z_oddawaniem_q.rejected}
    assert "Wzrost napięcia" in powody["cab-50"]


def test_nieznany_przypadek_pracy_jest_odrzucany_takze_bez_kandydatow() -> None:
    """Walidacja kierunkow PRZED petla: literowka nie moze udawac „braku kandydata"."""
    with pytest.raises(ValueError, match="reactive_character"):
        propose_mv_cable(
            CableSelectionInput(
                transformer_current_a=140.0,
                length_km=1.0,
                line_voltage_v=15000.0,
                cos_phi=0.95,
                candidates=(),
                reactive_character="pojemnosciowy",
            )
        )
    with pytest.raises(ValueError, match="flow_direction"):
        propose_mv_cable(
            CableSelectionInput(
                transformer_current_a=140.0,
                length_km=1.0,
                line_voltage_v=15000.0,
                cos_phi=0.95,
                candidates=(),
                flow_direction="w_obie_strony",
            )
        )
