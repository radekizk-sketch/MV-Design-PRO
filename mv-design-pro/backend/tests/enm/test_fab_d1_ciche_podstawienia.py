"""Karta FAB-D1 (klasa A6-12, część 1) — ciche podstawienia liczb na ścieżce
operacji domenowych ENM.

Testy jednostkowe (bezpośrednie wywołania funkcji pomocniczych) dla miejsc,
gdzie sprawdzenie end-to-end wymagałoby pozycji katalogowej celowo
niekompletnej (katalog produkcyjny zawsze dostarcza wymagane pola — brak
danej jest więc nieosiągalny drogą normalnej materializacji katalogowej).
Testy end-to-end (bez mocka) dla pozostałych miejsc żyją przy operacjach,
których dotyczą — patrz:
  * D3 (generator/genset/UPS moc) — tests/enm/test_genset_ups_sc.py
  * D4 (LDC) — tests/enm/test_gpz_multisection_domain.py
  * D5 (station_auxiliary/add_nn_load Q) — tests/enm/test_append_station_on_endpoint.py,
    tests/enm/test_add_nn_load_cosphi.py
  * D6 (length_m) — tests/enm/test_nn_topology_ops.py
  * D8 (DEFAULT_LOAD_KW) — tests/enm/test_catalog_completion_cosphi.py
  * D9 (BayMeasurements) — tests/enm/test_f10_6_domain_fields.py
"""

from __future__ import annotations

from enm.catalog_completion import _branch_point_port_count
from enm.domain_operations import _require_transformer_fields
from enm.domain_operations_v2 import _resolve_converter_defaults

# ---------------------------------------------------------------------------
# D2: _require_transformer_fields (add_transformer_sn_nn,
# _materialize_der_block_transformer, GPZ WN/SN — jedno źródło prawdy).
# ---------------------------------------------------------------------------


def _tabliczka_kompletna() -> dict:
    return {
        "sn_mva": 0.63,
        "uhv_kv": 15.0,
        "ulv_kv": 0.4,
        "uk_percent": 6.0,
        "pk_kw": 8.0,
    }


def test_require_transformer_fields_tabliczka_kompletna_przechodzi() -> None:
    """Dana JAWNA (komplet pól) przechodzi bez zmian — brak odrzucenia."""
    assert _require_transformer_fields(_tabliczka_kompletna(), "tr/probny") is None


def test_require_transformer_fields_brak_jednego_pola_odrzuca_kodem() -> None:
    tabliczka = _tabliczka_kompletna()
    tabliczka["pk_kw"] = None
    blad = _require_transformer_fields(tabliczka, "tr/probny")
    assert blad is not None
    assert blad["error_code"] == "transformer.field_missing"
    assert "straty obciążeniowe" in blad["error"]
    assert blad["snapshot"] is None


def test_require_transformer_fields_brak_wielu_pol_wymienia_wszystkie_naraz() -> None:
    """Jeden kod, lista WSZYSTKICH brakujących pól w jednym komunikacie."""
    tabliczka = {"sn_mva": None, "uhv_kv": 15.0, "ulv_kv": None, "uk_percent": 6.0, "pk_kw": None}
    blad = _require_transformer_fields(tabliczka, "tr/probny")
    assert blad is not None
    assert blad["error_code"] == "transformer.field_missing"
    for oczekiwane in ("moc znamionowa", "napięcie dolne", "straty obciążeniowe"):
        assert oczekiwane in blad["error"]
    # Pola KOMPLETNE (uhv_kv, uk_percent) nie trafiają do listy braków.
    assert "napięcie górne" not in blad["error"]
    assert "napięcie zwarcia" not in blad["error"]


def test_require_transformer_fields_zero_jest_wynikiem_nie_brakiem() -> None:
    """0.0 PODANE JAWNIE jest wartością (choć fizycznie podejrzaną), nie brakiem
    danej — ta funkcja pilnuje WYŁĄCZNIE nieobecności (None), nie sensowności."""
    tabliczka = _tabliczka_kompletna()
    tabliczka["pk_kw"] = 0.0
    assert _require_transformer_fields(tabliczka, "tr/probny") is None


# ---------------------------------------------------------------------------
# D3: _resolve_converter_defaults — moc None, gdy ani payload, ani katalog.
# ---------------------------------------------------------------------------


def test_resolve_converter_defaults_bez_mocy_daje_none() -> None:
    """Ani payload (power_setpoint_mw), ani katalog (pmax_mw/...) — moc None,
    NIE fabrykowane 0 MW."""
    _name, _gen_type, _event, _meta, p_mw = _resolve_converter_defaults("PV", {}, {})
    assert p_mw is None


def test_resolve_converter_defaults_moc_jawna_z_payloadu_przechodzi_bez_zmian() -> None:
    _name, _gen_type, _event, _meta, p_mw = _resolve_converter_defaults(
        "PV", {"power_setpoint_mw": 0.5}, {}
    )
    assert p_mw == 0.5


def test_resolve_converter_defaults_moc_z_katalogu_pomnozona_przez_quantity() -> None:
    """Brak jawnej mocy w payloadzie — moc PER-JEDNOSTKOWA z katalogu razy liczba
    jednostek (quantity) — zero MW nie jest tu wynikiem, bo katalog niesie realną
    tabliczkę."""
    _name, _gen_type, _event, _meta, p_mw = _resolve_converter_defaults(
        "PV", {"quantity": 3}, {"pmax_mw": 0.5}
    )
    assert p_mw == 1.5


def test_resolve_converter_defaults_bess_i_fw_tez_daja_none_bez_mocy() -> None:
    """KLASA NIE INSTANCJA: wszystkie trzy gałęzie technologii (PV/BESS/FW)
    naprawione razem, nie tylko jedna."""
    for technologia in ("BESS", "FW"):
        _name, _gen_type, _event, _meta, p_mw = _resolve_converter_defaults(technologia, {}, {})
        assert p_mw is None, f"{technologia}: oczekiwano None, jest {p_mw}"


# ---------------------------------------------------------------------------
# D8: _branch_point_port_count — liczba portów WYŁĄCZNIE z typu katalogowego.
# ---------------------------------------------------------------------------


def test_branch_point_port_count_slup_zawsze_jeden() -> None:
    """Słup rozgałęźny (branch_pole) ma DOKŁADNIE jeden port — to konwencja
    topologiczna tego rodzaju punktu, nie odczyt katalogu."""
    assert _branch_point_port_count(branch_point_type="branch_pole", catalog_params={}) == 1


def test_branch_point_port_count_zksn_z_katalogu_przechodzi_bez_zmian() -> None:
    liczba = _branch_point_port_count(
        branch_point_type="zksn", catalog_params={"branch_ports_count": 2}
    )
    assert liczba == 2


def test_branch_point_port_count_zksn_bez_danej_katalogowej_daje_none() -> None:
    """Karta FAB-D1 (D8): katalog nie rozstrzyga liczby portów ⇒ `None`, NIE
    zgadywanie po napisie referencji ani po topologii już podłączonych gałęzi."""
    assert _branch_point_port_count(branch_point_type="zksn", catalog_params={}) is None


def test_branch_point_port_count_wartosc_spoza_katalogu_niepoprawna_daje_none() -> None:
    """Wartość obecna, ale nie liczbowa (np. flaga/napis inny niż liczba) — nadal
    brak rozstrzygalnej danej, nie zgadywanie."""
    assert (
        _branch_point_port_count(
            branch_point_type="zksn", catalog_params={"branch_ports_count": "dwa"}
        )
        is None
    )
