from __future__ import annotations

import dataclasses

import pytest
from application.equipment_proof import (
    DeviceRating,
    EquipmentProofGenerator,
    EquipmentProofInput,
)
from application.equipment_proof.proof_pack import build_equipment_proof_pack
from network_model.core.autorytet_wyniku_zwarciowego import ProweniencjaWynikuZwarciowego


def _base_input() -> EquipmentProofInput:
    device = DeviceRating(
        device_id="SW-001",
        name_pl="Wyłącznik SN",
        type_ref="CB-15kV",
        u_m_kv=15.0,
        i_cu_ka=20.0,
        i_dyn_ka=50.0,
        i_th_ka=20.0,
        t_th_s=1.0,
        meta={"vendor": "Test"},
    )
    required = {
        "u_kv": 12.0,
        "ikss_ka": 16.0,
        "ip_ka": 30.0,
        "idyn_ka": 40.0,
        "ith_ka": 18.0,
        "tk_s": 1.0,
        # Karta SC-IB-ITH-ZRODLA: zdolność wyłączania SN porównywana z I_b (IEC 62271-100,
        # IEC 60909-0 rozdz. 9); t_b i i_DC(t_b) biegu idą do uwag kryterium.
        "ib_ka": 15.5,
        "tb_s": 0.1,
        "i_dc_ka": 9.0,
    }
    return EquipmentProofInput(
        project_id="proj-1",
        case_id="case-1",
        run_id="run-1",
        connection_node_id="BoundaryNode-1",
        device=device,
        required_fault_results=required,
        project_name="Projekt testowy — sieć SN",
        case_name="Przypadek bazowy",
    )


def _find_check(bundle, name: str):
    return next(check for check in bundle.result.checks if check.name == name)


def test_equipment_proof_pass_all():
    bundle = EquipmentProofGenerator.generate(_base_input())

    assert bundle.result.overall_status == "PASS"
    assert bundle.result.failed_checks == ()
    assert bundle.result.key_results["overall_ok"] == "PASS"


def test_equipment_proof_fail_missing_field():
    proof_input = _base_input()
    device = proof_input.device
    proof_input = EquipmentProofInput(
        project_id=proof_input.project_id,
        case_id=proof_input.case_id,
        run_id=proof_input.run_id,
        connection_node_id=proof_input.connection_node_id,
        device=DeviceRating(
            device_id=device.device_id,
            name_pl=device.name_pl,
            type_ref=device.type_ref,
            u_m_kv=device.u_m_kv,
            i_cu_ka=None,
            i_dyn_ka=device.i_dyn_ka,
            i_th_ka=device.i_th_ka,
            t_th_s=device.t_th_s,
            meta=device.meta,
        ),
        required_fault_results=proof_input.required_fault_results,
        project_name="Projekt testowy — sieć SN",
        case_name="Przypadek bazowy",
    )
    bundle = EquipmentProofGenerator.generate(proof_input)
    check = _find_check(bundle, "Icu")

    assert check.status == "FAIL"
    assert "brak" in check.message_pl.lower()
    assert bundle.result.overall_status == "FAIL"


def test_equipment_proof_idyn_uses_ip_proxy_when_missing_idyn():
    proof_input = _base_input()
    required = dict(proof_input.required_fault_results)
    required.pop("idyn_ka")
    proof_input = EquipmentProofInput(
        project_id=proof_input.project_id,
        case_id=proof_input.case_id,
        run_id=proof_input.run_id,
        connection_node_id=proof_input.connection_node_id,
        device=proof_input.device,
        required_fault_results=required,
        project_name="Projekt testowy — sieć SN",
        case_name="Przypadek bazowy",
    )
    bundle = EquipmentProofGenerator.generate(proof_input)
    check = _find_check(bundle, "Idyn")

    assert check.status == "PASS"
    assert check.required_source_key == "ip_ka"


def _input_with_device(base: EquipmentProofInput, **device_over) -> EquipmentProofInput:
    """Wejście z podmienionymi polami aparatu (reszta 1:1 z bazowego)."""
    device = base.device
    fields = {
        "device_id": device.device_id,
        "name_pl": device.name_pl,
        "type_ref": device.type_ref,
        "u_m_kv": device.u_m_kv,
        "i_cu_ka": device.i_cu_ka,
        "i_dyn_ka": device.i_dyn_ka,
        "i_th_ka": device.i_th_ka,
        "t_th_s": device.t_th_s,
        "meta": device.meta,
    }
    fields.update(device_over)
    return EquipmentProofInput(
        project_id=base.project_id,
        case_id=base.case_id,
        run_id=base.run_id,
        connection_node_id=base.connection_node_id,
        device=DeviceRating(**fields),
        required_fault_results=base.required_fault_results,
        project_name="Projekt testowy — sieć SN",
        case_name="Przypadek bazowy",
    )


def test_equipment_proof_ith_equal_times_unchanged():
    """t_th_s == tk_s → porównanie prądów jak dotychczas (bez zmiany zachowania)."""
    bundle = EquipmentProofGenerator.generate(_base_input())
    check = _find_check(bundle, "Ith")

    assert check.status == "PASS"
    assert "I_th aparatu 20.0000 kA wobec wartości wymaganej 18.0000 kA" in check.message_pl
    # Krok wywodu: równanie prądowe (nie energetyczne).
    step = next(s for s in bundle.proof_document.steps if s.title_pl == "Check Ith")
    assert step.equation.equation_id == "EQ_P12_006"


def test_equipment_proof_ith_time_mismatch_i2t_pass():
    """Karta S-C: t_k > t_th → porównanie energii I²t (tu: 324 ≤ 450 → PASS)."""
    proof_input = _input_with_device(_base_input(), i_th_ka=30.0, t_th_s=0.5)
    bundle = EquipmentProofGenerator.generate(proof_input)
    check = _find_check(bundle, "Ith")

    # Ith_req²·tk = 18²·1 = 324 kA²s ≤ Ith²·t_th = 30²·0,5 = 450 kA²s → PASS.
    assert check.status == "PASS"
    assert "I²t" in check.message_pl
    assert "324.0000" in check.message_pl
    assert "450.0000" in check.message_pl
    assert any("I²t wymagane" in note for note in check.notes)
    assert any("I²t aparatu" in note for note in check.notes)
    # Krok wywodu: równanie energetyczne z jawnym podstawieniem.
    step = next(s for s in bundle.proof_document.steps if s.title_pl == "Check Ith")
    assert step.equation.equation_id == "EQ_P12_006b"
    assert "324.0000" in step.substitution_latex
    assert "450.0000" in step.substitution_latex
    assert bundle.result.overall_status == "PASS"


def test_equipment_proof_ith_time_mismatch_i2t_fail():
    """Karta S-C: t_k > t_th i energia aparatu za mała → uczciwy FAIL."""
    # Ith aparatu 20 kA @ 0,5 s → 200 kA²s < wymagane 18²·1 = 324 kA²s.
    proof_input = _input_with_device(_base_input(), i_th_ka=20.0, t_th_s=0.5)
    bundle = EquipmentProofGenerator.generate(proof_input)
    check = _find_check(bundle, "Ith")

    assert check.status == "FAIL"
    assert "I²t" in check.message_pl
    assert bundle.result.overall_status == "FAIL"
    assert "Ith" in bundle.result.failed_checks


@pytest.mark.parametrize(
    ("i_th_ka", "status"),
    [(20.0, "PASS"), (15.0, "FAIL")],
    ids=["prad_aparatu_wiekszy", "energia_wieksza_ale_prad_mniejszy"],
)
def test_equipment_proof_ith_krotszy_czas_zwarcia_porownuje_prad_wprost(
    i_th_ka: float, status: str
):
    """Karta WYTRZYMALOSC-PRAD-POLA: t_k (1 s) < t_th (2 s) → równoważność I²t NIE działa
    w górę (IEC 60865-1: I_th ≤ I_thr dla T_k ≤ T_kr). Aparat 15 kA/2 s ma energię
    450 kA²s ≥ 324 kA²s, ale prądu 18 kA nie był próbowany — dawniej PASS, teraz FAIL.
    Werdykt i krok wywodu biorą TEN SAM predykat (równanie prądowe, nie energetyczne)."""
    proof_input = _input_with_device(_base_input(), i_th_ka=i_th_ka, t_th_s=2.0)
    bundle = EquipmentProofGenerator.generate(proof_input)
    check = _find_check(bundle, "Ith")

    assert check.status == status
    assert "I²t" not in check.message_pl
    step = next(s for s in bundle.proof_document.steps if s.title_pl == "Check Ith")
    assert step.equation.equation_id == "EQ_P12_006"


def test_equipment_proof_ith_missing_catalog_time_fails_honestly():
    """Brak danych katalogowych (t_th_s=None) → uczciwy FAIL jak dotychczas."""
    proof_input = _input_with_device(_base_input(), t_th_s=None)
    bundle = EquipmentProofGenerator.generate(proof_input)
    check = _find_check(bundle, "Ith")

    assert check.status == "FAIL"
    assert "brak" in check.message_pl.lower()


def test_equipment_proof_icu_not_applicable_gives_explicit_status_not_fail():
    """Karta UM-ICU-KATALOG (2a, d): rozłącznik/odłącznik/uziemnik bez
    zdolności wyłączania zwarć -> Icu = NIE_DOTYCZY, nie FAIL, nie wpada do
    failed_checks; U_m nadal jest liczone normalnie.
    """
    proof_input = _input_with_device(_base_input(), i_cu_ka=None, i_cu_not_applicable=True)
    bundle = EquipmentProofGenerator.generate(proof_input)
    check_icu = _find_check(bundle, "Icu")
    check_u = _find_check(bundle, "U")

    assert check_icu.status == "NIE_DOTYCZY"
    assert "nie dotyczy" in check_icu.message_pl.lower()
    assert "Icu" not in bundle.result.failed_checks
    assert bundle.result.key_results["icu_ok"] == "NIE_DOTYCZY"
    # U_m nadal PASS/FAIL normalnie — flaga rozłącznika nie wyłącza innych kryteriów.
    assert check_u.status == "PASS"
    # Skoro U/Idyn/Ith PASS i Icu jest NIE_DOTYCZY (nie FAIL) -> całość PASS.
    assert bundle.result.overall_status == "PASS"


def test_equipment_proof_icu_not_applicable_overrides_stray_numeric_value():
    """Predykat parami: flaga i_cu_not_applicable jest NADRZĘDNA — nawet gdy
    device.i_cu_ka niesie (błędnie) liczbę, generator i tak zwraca
    NIE_DOTYCZY, zamiast po cichu policzyć PASS/FAIL z niewłaściwej liczby.
    """
    proof_input = _input_with_device(_base_input(), i_cu_ka=999.0, i_cu_not_applicable=True)
    bundle = EquipmentProofGenerator.generate(proof_input)
    check_icu = _find_check(bundle, "Icu")

    assert check_icu.status == "NIE_DOTYCZY"
    assert check_icu.device_value is None


def test_equipment_proof_icu_not_applicable_with_missing_u_m_still_fails_u_honestly():
    """Iloczyn cech: rozłącznik (Icu NIE_DOTYCZY) + brak danych U_m ->
    U pozostaje uczciwym FAIL "brak podstawy" (flaga dotyczy WYŁĄCZNIE Icu).
    """
    proof_input = _input_with_device(
        _base_input(), u_m_kv=None, i_cu_ka=None, i_cu_not_applicable=True
    )
    bundle = EquipmentProofGenerator.generate(proof_input)
    check_icu = _find_check(bundle, "Icu")
    check_u = _find_check(bundle, "U")

    assert check_icu.status == "NIE_DOTYCZY"
    assert check_u.status == "FAIL"
    assert "brak" in check_u.message_pl.lower()
    assert "U" in bundle.result.failed_checks
    assert bundle.result.overall_status == "FAIL"


def test_equipment_proof_not_applicable_step_shows_nie_dotyczy_not_brak():
    """Krok „Dane urządzenia” pokazuje NIE DOTYCZY dla I_cu rozłącznika,
    zamiast mylącego BRAK (który sugerowałby lukę w karcie katalogowej).
    """
    proof_input = _input_with_device(_base_input(), i_cu_ka=None, i_cu_not_applicable=True)
    bundle = EquipmentProofGenerator.generate(proof_input)
    device_step = next(
        s for s in bundle.proof_document.steps if s.title_pl == "Dane urządzenia (nameplate)"
    )
    icu_value = next(v for v in device_step.input_values if v.symbol == "I_{cu}")

    assert icu_value.value == "NIE DOTYCZY"
    assert "BRAK" not in icu_value.formatted


def test_equipment_proof_determinism_json():
    proof_input = _base_input()
    first = EquipmentProofGenerator.generate(proof_input)
    second = EquipmentProofGenerator.generate(proof_input)

    assert first.result.to_dict() == second.result.to_dict()
    assert first.proof_document.json_representation == second.proof_document.json_representation


def test_equipment_proof_pack_fail_closed_default_proweniencja_blocks():
    """Karta S-2 AUTORYTET: `EquipmentProofInput` skonstruowany BEZ jawnej
    `proweniencja` (jak w kodzie wywołującym spoza mostu HTTP) dostaje domyślkę
    `bez_sladu()` — FAIL-CLOSED. `build_equipment_proof_pack` musi odmówić, nie
    cicho przepuścić."""
    from network_model.core.autorytet_wyniku_zwarciowego import BrakAutorytetuWyniku

    proof_input = _base_input()
    assert proof_input.proweniencja.zrodlo.value == "BRAK_SLADU"
    with pytest.raises(BrakAutorytetuWyniku):
        build_equipment_proof_pack(proof_input)


def test_equipment_proof_pack_deterministic_zip():
    """Karta S-2 AUTORYTET: `build_equipment_proof_pack` bramkuje autorytetem
    (`wymagaj_autorytetu`) — `_base_input()` niesie domyślną proweniencję
    ``bez_sladu()`` (fail-closed dla wejścia skonstruowanego wprost w kodzie),
    więc ten test determinizmu podaje proweniencję MIARODAJNĄ jawnie (sieć bez
    falowników — puste znaczniki, `ze_znacznikow(())`), tak jak most
    `application.autorytet_biegu_zwarciowego` zrobiłby to na realnej ścieżce
    HTTP (`api/equipment_proof_pack.py`)."""
    proof_input = dataclasses.replace(
        _base_input(), proweniencja=ProweniencjaWynikuZwarciowego.ze_znacznikow(())
    )
    first_filename, first_pack = build_equipment_proof_pack(proof_input)
    second_filename, second_pack = build_equipment_proof_pack(proof_input)

    assert first_filename == second_filename
    assert first_pack == second_pack


def test_naglowek_dowodu_nazywa_projekt_i_przypadek_nazwami_nie_identyfikatorami():
    """Karta #144: nagłówek dowodu doboru aparatury niesie nazwy projektu i przypadku;
    identyfikatory `project_id`/`case_id` zostają w danych wejścia (dawniej nagłówek
    pokazywał „proj-1" i „case-1")."""
    bundle = EquipmentProofGenerator.generate(_base_input())
    naglowek = bundle.proof_document.header
    assert naglowek.project_name == "Projekt testowy — sieć SN"
    assert naglowek.case_name == "Przypadek bazowy"
    assert "proj-1" not in naglowek.project_name + naglowek.case_name
    assert "case-1" not in naglowek.project_name + naglowek.case_name


# ── Karta SC-IB-ITH-ZRODLA: wielkość kryterium wyłączania wg pasma napięcia ──────
# Iloczyn: {SN 12 kV · nN 0,4 kV · brak napięcia punktu} × {I_b poniżej I_cu · I_b ponad
# I_cu · brak I_b}. I″k = 22 kA zawsze PONAD I_cu = 20 kA — PASS w SN dowodzi, że
# porównano I_b, a nie I″k; FAIL w nN — że porównano I″k spodziewany.


def _input_wylaczania(u_kv: float | None, ib_ka: float | None) -> EquipmentProofInput:
    base = _base_input()
    required = dict(base.required_fault_results)
    required["ikss_ka"] = 22.0
    if u_kv is None:
        required.pop("u_kv")
    else:
        required["u_kv"] = u_kv
    if ib_ka is None:
        for klucz in ("ib_ka", "tb_s", "i_dc_ka"):
            required.pop(klucz)
    else:
        required["ib_ka"] = ib_ka
    return dataclasses.replace(base, required_fault_results=required)


@pytest.mark.parametrize(
    ("u_kv", "ib_ka", "status", "klucz", "wartosc", "fragment"),
    [
        (12.0, 18.0, "PASS", "ib_ka", 18.0, "wobec prądu wyłączeniowego symetrycznego I_b"),
        (12.0, 21.0, "FAIL", "ib_ka", 21.0, "IEC 62271-100"),
        # Karta TB-WARTOSC-ROBOCZA: t_b jest rozstrzygany w każdym punkcie, więc brak I_b to
        # wyłącznie zapis bez pola (wiersz bez solvera) — brak podstawy, nigdy podmiana na I″k.
        (12.0, None, "FAIL", "ib_ka", None, "nie niosą prądu wyłączeniowego I_b"),
        (0.4, 18.0, "FAIL", "ikss_ka", 22.0, "spodziewanego prądu zwarciowego początkowego I″k"),
        (0.4, 21.0, "FAIL", "ikss_ka", 22.0, "IEC 60947-2"),
        (0.4, None, "FAIL", "ikss_ka", 22.0, "22.0000 kA"),
        (None, 18.0, "FAIL", "ib_ka", None, "Brak podstawy"),
        (None, None, "FAIL", "ib_ka", None, "Brak podstawy"),
    ],
)
def test_icu_wielkosc_kryterium_wg_pasma_napiecia(
    u_kv: float | None,
    ib_ka: float | None,
    status: str,
    klucz: str,
    wartosc: float | None,
    fragment: str | None,
) -> None:
    bundle = EquipmentProofGenerator.generate(_input_wylaczania(u_kv, ib_ka))
    check = _find_check(bundle, "Icu")
    assert check.status == status
    assert check.required_source_key == klucz
    assert check.required_value == wartosc
    if fragment is not None:
        assert fragment in check.message_pl
    # Kontrakt werdyktu wyjaśnialnego: tekst nie składa kodu werdyktu (status w polu).
    assert "PASS" not in check.message_pl and "FAIL" not in check.message_pl
    # Dowód mówi, CO porównano: wzór kroku z symbolem wielkości kryterium.
    krok = next(k for k in bundle.proof_document.steps if k.equation.equation_id == "EQ_P12_004")
    symbol = "I_k''" if klucz == "ikss_ka" else "I_b"
    assert krok.equation.latex == rf"I_{{cu}} \ge {symbol}"


def test_icu_sn_uwagi_niosa_tb_i_skladowa_nieokresowa() -> None:
    check = _find_check(EquipmentProofGenerator.generate(_input_wylaczania(12.0, 18.0)), "Icu")
    (uwaga,) = check.notes
    assert uwaga.startswith("t_b = 0,1 s; składowa nieokresowa i_DC(t_b) = 9,0000 kA")
    assert "porównania z nią nie wystawiono" in uwaga


def test_icu_sn_zapis_bez_tb_uwaga_o_braku_tb() -> None:
    """Zapis bez I_b i t_b (wiersz bez solvera) — uwaga mówi, czego brakuje; dawnego kodu
    blokady `fault.czas_tb_brak` już nie ma (karta TB-WARTOSC-ROBOCZA)."""
    check = _find_check(EquipmentProofGenerator.generate(_input_wylaczania(12.0, None)), "Icu")
    assert check.notes == ("Wielkości biegu nie niosą czasu wyłączenia t_b punktu zwarcia.",)
    assert not any("czas_tb_brak" in uwaga for uwaga in check.notes)


# Karta TB-WARTOSC-ROBOCZA — uwagi kryterium wyłączania: pochodzenie t_b punktu ×
# udział maszyn wirujących w I_b. Iloczyn: {t_b projektanta (bez `tb_zrodlo`) · pole
# z czasem z karty · pole z roboczym czasem własnym · propozycja robocza} × {I_b z udziałem
# maszyn · I_b = I″k (bez maszyn)}. Zdanie „dana przyjęta" WYŁĄCZNIE, gdy t_b roboczy
# i I_b od niego zależy — w sieci bez maszyn I_b nie zależy od t_b.
_ZRODLA_TB_DOBORU: dict[str, dict | None] = {
    "projektant": None,
    "pole_karta": {
        "pochodzenie": "Z_POL",
        "wartosc_robocza": False,
        "opis_pl": "t_b = 0,15 s z pola Odpływ 1 (czas własny z karty).",
    },
    "pole_robocze": {
        "pochodzenie": "Z_POL",
        "wartosc_robocza": True,
        "opis_pl": "t_b = 0,16 s z pola Odpływ 1 (czas własny — wartość robocza).",
    },
    "propozycja": {
        "pochodzenie": "PROPOZYCJA",
        "wartosc_robocza": True,
        "opis_pl": "t_b = 0,1 s — wartość robocza (węzeł tablicy μ IEC 60909-0:2016).",
    },
}


@pytest.mark.parametrize("maszyny", [True, False], ids=["z_maszynami", "bez_maszyn"])
@pytest.mark.parametrize("wariant", sorted(_ZRODLA_TB_DOBORU))
def test_icu_sn_uwagi_pochodzenie_tb_x_udzial_maszyn(wariant: str, maszyny: bool) -> None:
    base = _input_wylaczania(12.0, 18.0)
    required = dict(base.required_fault_results)
    zrodlo = _ZRODLA_TB_DOBORU[wariant]
    if zrodlo is not None:
        required["tb_zrodlo"] = {**zrodlo, "ib_z_udzialem_maszyn": maszyny}
    check = _find_check(
        EquipmentProofGenerator.generate(
            dataclasses.replace(base, required_fault_results=required)
        ),
        "Icu",
    )
    assert check.status == "PASS"
    assert check.notes[0].startswith("t_b = 0,1 s; składowa nieokresowa i_DC(t_b)")
    if zrodlo is None:
        assert len(check.notes) == 1
        return
    assert check.notes[1] == f"Czas wyłączenia: {zrodlo['opis_pl']}"
    dana_przyjeta = bool(zrodlo["wartosc_robocza"]) and maszyny
    assert len(check.notes) == (3 if dana_przyjeta else 2)
    if dana_przyjeta:
        assert "wynikiem obliczeniowym na danej przyjętej" in check.notes[2]


def test_icu_nn_bez_uwag_o_tb() -> None:
    check = _find_check(EquipmentProofGenerator.generate(_input_wylaczania(0.4, 18.0)), "Icu")
    assert check.notes == ()


# Bezpiecznik × {SN · nN · brak napięcia punktu} × {I_b poniżej I_cu · brak I_b}: bezpiecznik
# ograniczający przerywa przed pierwszym szczytem — I_cu (I_1) wobec spodziewanego I″k
# (IEC 60282-1 / IEC 60269-1) niezależnie od pasma i od t_b. I″k = 22 kA > I_cu = 20 kA,
# więc FAIL dowodzi porównania I″k (porównanie I_b = 18 kA dałoby PASS).


@pytest.mark.parametrize("u_kv", [12.0, 0.4, None], ids=["sn", "nn", "bez_napiecia"])
@pytest.mark.parametrize("ib_ka", [18.0, None], ids=["ib_ponizej_icu", "bez_ib"])
def test_icu_bezpiecznika_wobec_ik_spodziewanego(u_kv: float | None, ib_ka: float | None) -> None:
    base = _input_wylaczania(u_kv, ib_ka)
    wejscie = dataclasses.replace(base, device=dataclasses.replace(base.device, bezpiecznik=True))
    bundle = EquipmentProofGenerator.generate(wejscie)
    check = _find_check(bundle, "Icu")

    assert check.status == "FAIL"
    assert check.required_source_key == "ikss_ka"
    assert check.required_value == 22.0
    assert "IEC 60282-1" in check.message_pl
    assert check.notes == ()
    krok = next(k for k in bundle.proof_document.steps if k.equation.equation_id == "EQ_P12_004")
    assert krok.equation.latex == r"I_{cu} \ge I_k''"


def test_znacznik_bezpiecznika_nie_zmienia_odcisku_innych_aparatow() -> None:
    """Pole addytywne: zapis urządzenia bez bezpiecznika jest bajt w bajt taki jak przed kartą
    (determinizm istniejących pakietów); bezpiecznik dopisuje znacznik."""
    device = _base_input().device
    assert "bezpiecznik" not in device.to_dict()
    assert dataclasses.replace(device, bezpiecznik=True).to_dict()["bezpiecznik"] is True


@pytest.mark.parametrize(
    ("nazwa", "zmiana", "status", "fragmenty"),
    [
        ("U", {"u_m_kv": 15.0}, "PASS", ("U_m aparatu 15.0000 kV", "12.0000 kV")),
        ("U", {"u_m_kv": 10.0}, "FAIL", ("U_m aparatu 10.0000 kV", "12.0000 kV")),
        ("Icu", {"i_cu_ka": 20.0}, "PASS", ("I_cu aparatu 20.0000 kA", "15.5000 kA")),
        ("Icu", {"i_cu_ka": 10.0}, "FAIL", ("I_cu aparatu 10.0000 kA", "15.5000 kA")),
        ("Idyn", {"i_dyn_ka": 50.0}, "PASS", ("I_dyn aparatu 50.0000 kA", "40.0000 kA")),
        ("Idyn", {"i_dyn_ka": 30.0}, "FAIL", ("I_dyn aparatu 30.0000 kA", "40.0000 kA")),
        ("Ith", {"i_th_ka": 20.0}, "PASS", ("I_th aparatu 20.0000 kA", "18.0000 kA")),
        ("Ith", {"i_th_ka": 15.0}, "FAIL", ("I_th aparatu 15.0000 kA", "18.0000 kA")),
        (
            "Ith",
            {"i_th_ka": 30.0, "t_th_s": 0.5},
            "PASS",
            ("I²t aparatu 450.0000 kA²s", "324.0000 kA²s"),
        ),
        (
            "Ith",
            {"i_th_ka": 20.0, "t_th_s": 0.5},
            "FAIL",
            ("I²t aparatu 200.0000 kA²s", "324.0000 kA²s"),
        ),
    ],
)
def test_tresc_sprawdzenia_nie_sklada_kodu_werdyktu(
    nazwa: str, zmiana: dict[str, float], status: str, fragmenty: tuple[str, ...]
) -> None:
    """Kontrakt werdyktu wyjaśnialnego w CAŁYM generatorze (nie tylko I_cu): iloczyn
    {U, I_cu, I_dyn, I_th prądowo, I_th energetycznie} × {spełnia, nie spełnia}. Treść niesie
    wartość aparatu, wartość wymaganą i jednostkę; status — wyłącznie pole ``status``."""
    bundle = EquipmentProofGenerator.generate(_input_with_device(_base_input(), **zmiana))
    check = _find_check(bundle, nazwa)
    assert check.status == status
    for fragment in fragmenty:
        assert fragment in check.message_pl
    assert "PASS" not in check.message_pl and "FAIL" not in check.message_pl
    assert "→" not in check.message_pl
