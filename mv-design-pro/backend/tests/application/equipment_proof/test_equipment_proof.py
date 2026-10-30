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
        type_ref="CB-17.5kV",
        u_m_kv=17.5,
        i_cu_ka=20.0,
        i_dyn_ka=50.0,
        i_th_ka=20.0,
        t_th_s=1.0,
        meta={"vendor": "Test"},
    )
    required = {
        # Sieć 15 kV: wartość wymagana kryterium U to napięcie najwyższe sieci U_s = 17,5 kV
        # (IEC 60038), aparat klasy 17,5 kV leży na brzegu równości (dopuszczonym).
        "u_kv": 15.0,
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


def _status(bundle, name: str) -> str:
    return _find_check(bundle, name).ocena.status_maszynowy


def _krok(bundle, tytul: str):
    return next(s for s in bundle.proof_document.steps if s.title_pl == tytul)


_KROK_CIEPLNY = "Sprawdzenie wytrzymałości cieplnej I_th"


def test_equipment_proof_wszystkie_kryteria_spelnione():
    """Karta WERDYKT-MIGRACJA-190 (C33): cztery rekordy K spełnione. Rekord W doboru NIE jest
    „spełnia” bez pełnego dowodu: zdolność ``aparatura.dobor_aparatu_punktu`` stoi na modelu
    niezwalidowanym (UNVALIDATED_MODEL), więc kompletność dowodu jest NIEPELNY, a W — BRAK_DOWODU
    (kontrakt werdyktu §2.3 krok 9). Dawniej gołe ``overall_status == "PASS"``."""
    bundle = EquipmentProofGenerator.generate(_base_input())

    assert [c.ocena.status_maszynowy for c in bundle.result.checks] == ["SPELNIA"] * 4
    assert bundle.result.wymaganie.status_maszynowy == "BRAK_DOWODU"
    assert bundle.result.failed_checks == ()
    pozycja = bundle.proof_document.summary.key_results["dobor_ocena"]
    assert pozycja.value == bundle.result.wymaganie.etykieta.etykieta_pl
    assert pozycja.formatted == bundle.result.wymaganie.wyjasnienie.zdanie_pl


def test_equipment_proof_brak_danej_aparatu_to_brak_podstawy_nie_naruszenie():
    """Brak I_cu w karcie aparatu: limit kryterium nie istnieje → BRAK_PODSTAWY z nazwanym
    brakiem; brak danej nie jest naruszeniem (dawniej FAIL „brak”) ani spełnieniem."""
    proof_input = _input_with_device(_base_input(), i_cu_ka=None)
    bundle = EquipmentProofGenerator.generate(proof_input)
    check = _find_check(bundle, "Icu")

    assert check.ocena.status_maszynowy == "BRAK_PODSTAWY"
    assert any("I_cu" in brak for brak in check.ocena.wyjasnienie.czego_brakuje)
    assert "Icu" not in bundle.result.failed_checks
    assert bundle.result.wymaganie.status_maszynowy == "BRAK_PODSTAWY"


def test_equipment_proof_idyn_uses_ip_proxy_when_missing_idyn():
    proof_input = _base_input()
    required = dict(proof_input.required_fault_results)
    required.pop("idyn_ka")
    proof_input = dataclasses.replace(proof_input, required_fault_results=required)
    bundle = EquipmentProofGenerator.generate(proof_input)
    check = _find_check(bundle, "Idyn")

    assert check.ocena.status_maszynowy == "SPELNIA"
    assert check.required_source_key == "ip_ka"
    assert check.ocena.wynik.wartosc.wartosc == 30.0


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


def _limit_ka(check) -> float:
    return check.ocena.limit.wartosc.wartosc


def test_equipment_proof_ith_equal_times_unchanged():
    """T_kr == T_k → limit cieplny to I_thr aparatu (bez przeliczenia czasu)."""
    bundle = EquipmentProofGenerator.generate(_base_input())
    check = _find_check(bundle, "Ith")

    assert check.ocena.status_maszynowy == "SPELNIA"
    assert _limit_ka(check) == pytest.approx(20.0)
    assert "18 kA wobec wymaganych ≤ 20 kA" in check.message_pl
    step = _krok(bundle, _KROK_CIEPLNY)
    assert step.equation.equation_id == "EQ_P12_006"
    assert step.equation.latex == check.ocena.kryterium.warunek_latex


def test_equipment_proof_ith_time_mismatch_i2t_pass():
    """Karta S-C: T_k > T_kr → równoważność energii I²t (IEC 60865-1): I_th²·T_k ≤ I_thr²·T_kr
    ⇔ I_th ≤ I_thr·√(T_kr/T_k). Tu 18 kA ≤ 30·√0,5 = 21,2132 kA (dawniej 324 ≤ 450 kA²s)."""
    proof_input = _input_with_device(_base_input(), i_th_ka=30.0, t_th_s=0.5)
    bundle = EquipmentProofGenerator.generate(proof_input)
    check = _find_check(bundle, "Ith")

    assert check.ocena.status_maszynowy == "SPELNIA"
    assert _limit_ka(check) == pytest.approx(30.0 * 0.5**0.5)
    assert any("limit przeliczony na T_k = 21.2132 kA" in note for note in check.notes)
    # Krok wywodu: podstawienie z jawnym porównaniem wyniku z limitem rekordu.
    step = _krok(bundle, _KROK_CIEPLNY)
    assert "18.0000" in step.substitution_latex
    assert "21.2132" in step.substitution_latex
    assert r"\le" in step.substitution_latex
    assert bundle.result.failed_checks == ()


def test_equipment_proof_ith_time_mismatch_i2t_fail():
    """Karta S-C: T_k > T_kr i energia aparatu za mała → uczciwe naruszenie:
    I_thr = 20 kA przy T_kr = 0,5 s → limit 20·√0,5 = 14,1421 kA < 18 kA."""
    proof_input = _input_with_device(_base_input(), i_th_ka=20.0, t_th_s=0.5)
    bundle = EquipmentProofGenerator.generate(proof_input)
    check = _find_check(bundle, "Ith")

    assert check.ocena.status_maszynowy == "NIE_SPELNIA"
    assert _limit_ka(check) == pytest.approx(20.0 * 0.5**0.5)
    assert bundle.result.wymaganie.status_maszynowy == "NIE_SPELNIA"
    assert "Ith" in bundle.result.failed_checks
    step = _krok(bundle, _KROK_CIEPLNY)
    assert "18.0000\\,\\text{kA} > 14.1421" in step.substitution_latex


@pytest.mark.parametrize(
    ("i_th_ka", "status"),
    [(20.0, "SPELNIA"), (15.0, "NIE_SPELNIA")],
    ids=["prad_aparatu_wiekszy", "energia_wieksza_ale_prad_mniejszy"],
)
def test_equipment_proof_ith_krotszy_czas_zwarcia_porownuje_prad_wprost(
    i_th_ka: float, status: str
):
    """Karta WYTRZYMALOSC-PRAD-POLA: T_k (1 s) < T_kr (2 s) → równoważność I²t NIE działa
    w górę (IEC 60865-1: I_th ≤ I_thr dla T_k ≤ T_kr). Aparat 15 kA/2 s ma energię
    450 kA²s ≥ 324 kA²s, ale prądu 18 kA nie był próbowany — naruszenie. Rekord i krok
    wywodu biorą TEN SAM limit (``limit_cieplny_aparatu_ka``): tu I_thr bez przeliczenia."""
    proof_input = _input_with_device(_base_input(), i_th_ka=i_th_ka, t_th_s=2.0)
    bundle = EquipmentProofGenerator.generate(proof_input)
    check = _find_check(bundle, "Ith")

    assert check.ocena.status_maszynowy == status
    assert _limit_ka(check) == pytest.approx(i_th_ka)
    assert f"{i_th_ka:.4f}" in _krok(bundle, _KROK_CIEPLNY).substitution_latex


def test_equipment_proof_ith_brak_czasu_katalogowego_to_brak_podstawy():
    """Brak T_kr w karcie aparatu (t_th_s=None): limitu cieplnego nie da się wyznaczyć →
    BRAK_PODSTAWY z nazwanym brakiem, nie naruszenie (dawniej FAIL)."""
    proof_input = _input_with_device(_base_input(), t_th_s=None)
    bundle = EquipmentProofGenerator.generate(proof_input)
    check = _find_check(bundle, "Ith")

    assert check.ocena.status_maszynowy == "BRAK_PODSTAWY"
    assert check.ocena.wyjasnienie.czego_brakuje
    assert "Ith" not in bundle.result.failed_checks


def test_equipment_proof_icu_not_applicable_gives_explicit_status_not_fail():
    """Karta UM-ICU-KATALOG (2a, d): rozłącznik/odłącznik/uziemnik bez
    zdolności wyłączania zwarć -> Icu = NIE_DOTYCZY z powodem, nie wpada do
    failed_checks; U_m nadal jest liczone normalnie.
    """
    proof_input = _input_with_device(_base_input(), i_cu_ka=None, i_cu_not_applicable=True)
    bundle = EquipmentProofGenerator.generate(proof_input)
    check_icu = _find_check(bundle, "Icu")

    assert check_icu.ocena.status_maszynowy == "NIE_DOTYCZY"
    assert "nie dotyczy" in check_icu.message_pl.lower()
    assert "Icu" not in bundle.result.failed_checks
    assert bundle.proof_document.summary.key_results["wylaczanie_ocena"].value == "Nie dotyczy"
    # U_m nadal oceniane normalnie — flaga rozłącznika nie wyłącza innych kryteriów.
    assert _status(bundle, "U") == "SPELNIA"
    # NIE_DOTYCZY nie psuje agregatu: W jak przy komplecie spełnionych (BRAK_DOWODU — model
    # niezwalidowany, zob. test wyżej), nie BRAK_PODSTAWY ani NIE_SPELNIA.
    assert bundle.result.wymaganie.status_maszynowy == "BRAK_DOWODU"


def test_equipment_proof_icu_not_applicable_overrides_stray_numeric_value():
    """Predykat parami: flaga i_cu_not_applicable jest NADRZĘDNA — nawet gdy
    device.i_cu_ka niesie (błędnie) liczbę, rekord jest NIE_DOTYCZY, zamiast po cichu
    policzyć spełnienie albo naruszenie z niewłaściwej liczby.
    """
    proof_input = _input_with_device(_base_input(), i_cu_ka=999.0, i_cu_not_applicable=True)
    bundle = EquipmentProofGenerator.generate(proof_input)
    check_icu = _find_check(bundle, "Icu")

    assert check_icu.ocena.status_maszynowy == "NIE_DOTYCZY"
    assert check_icu.device_value is None


def test_equipment_proof_icu_not_applicable_with_missing_u_m_names_missing_u_m():
    """Iloczyn cech: rozłącznik (Icu NIE_DOTYCZY) + brak danych U_m ->
    U to BRAK_PODSTAWY z nazwanym brakiem U_m (flaga dotyczy WYŁĄCZNIE Icu); brak danej
    nie jest naruszeniem.
    """
    proof_input = _input_with_device(
        _base_input(), u_m_kv=None, i_cu_ka=None, i_cu_not_applicable=True
    )
    bundle = EquipmentProofGenerator.generate(proof_input)
    check_u = _find_check(bundle, "U")

    assert _status(bundle, "Icu") == "NIE_DOTYCZY"
    assert check_u.ocena.status_maszynowy == "BRAK_PODSTAWY"
    assert any("U_m" in brak for brak in check_u.ocena.wyjasnienie.czego_brakuje)
    assert "U" not in bundle.result.failed_checks
    assert bundle.result.wymaganie.status_maszynowy == "BRAK_PODSTAWY"


def test_equipment_proof_not_applicable_step_shows_nie_dotyczy_not_brak():
    """Krok „Dane znamionowe urządzenia” pokazuje NIE DOTYCZY dla I_cu rozłącznika,
    zamiast mylącego BRAK (który sugerowałby lukę w karcie katalogowej).
    """
    proof_input = _input_with_device(_base_input(), i_cu_ka=None, i_cu_not_applicable=True)
    bundle = EquipmentProofGenerator.generate(proof_input)
    device_step = _krok(bundle, "Dane znamionowe urządzenia")
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
        (12.0, 18.0, "SPELNIA", "ib_ka", 18.0, "Prąd wyłączeniowy symetryczny I_b w punkcie"),
        (12.0, 21.0, "NIE_SPELNIA", "ib_ka", 21.0, "21 kA wobec wymaganych ≤ 20 kA"),
        # Karta TB-WARTOSC-ROBOCZA: t_b jest rozstrzygany w każdym punkcie, więc brak I_b to
        # wyłącznie zapis bez pola (wiersz bez solvera) — ocena niewykonana z nazwanym brakiem,
        # nigdy podmiana na I″k ani naruszenie.
        (12.0, None, "NIE_OCENIONO", "ib_ka", None, "ocena niewykonana"),
        (0.4, 18.0, "NIE_SPELNIA", "ikss_ka", 22.0, "Spodziewany prąd zwarciowy początkowy I″k"),
        (0.4, 21.0, "NIE_SPELNIA", "ikss_ka", 22.0, "22 kA wobec wymaganych ≤ 20 kA"),
        (0.4, None, "NIE_SPELNIA", "ikss_ka", 22.0, "22 kA"),
        (None, 18.0, "NIE_OCENIONO", "ib_ka", None, "napięcia znamionowego punktu zwarcia"),
        (None, None, "NIE_OCENIONO", "ib_ka", None, "napięcia znamionowego punktu zwarcia"),
    ],
)
def test_icu_wielkosc_kryterium_wg_pasma_napiecia(
    u_kv: float | None,
    ib_ka: float | None,
    status: str,
    klucz: str,
    wartosc: float | None,
    fragment: str,
) -> None:
    """Iloczyn {SN · nN · brak napięcia} × {I_b poniżej I_cu · ponad · brak}: wielkość kryterium
    z jedynego predykatu; podstawa rekordu nazywa normę wybranej wielkości."""
    bundle = EquipmentProofGenerator.generate(_input_wylaczania(u_kv, ib_ka))
    check = _find_check(bundle, "Icu")
    assert check.ocena.status_maszynowy == status
    assert check.required_source_key == klucz
    assert check.required_value == wartosc
    wyjasnienie = check.message_pl + " ".join(check.ocena.wyjasnienie.czego_brakuje)
    assert fragment in wyjasnienie
    norma = {"ib_ka": "IEC 62271-100", "ikss_ka": "IEC 60947-2"}[klucz] if u_kv else "IEC 62271"
    assert norma in check.ocena.podstawa.dokument + check.ocena.podstawa.uwagi_pl
    # Kontrakt werdyktu wyjaśnialnego: tekst nie składa kodu werdyktu (status w polu).
    assert "PASS" not in check.message_pl and "FAIL" not in check.message_pl
    # Dowód mówi, CO porównano: wzór kroku z symbolem wielkości kryterium — z rekordu.
    krok = next(k for k in bundle.proof_document.steps if k.equation.equation_id == "EQ_P12_004")
    symbol = "I_k''" if klucz == "ikss_ka" else "I_b"
    assert krok.equation.latex == rf"{symbol} \le I_{{cu}}"
    assert krok.equation.latex == check.ocena.kryterium.warunek_latex


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
    assert check.ocena.status_maszynowy == "SPELNIA"
    assert check.notes[0].startswith("t_b = 0,1 s; składowa nieokresowa i_DC(t_b)")
    dane_tb = [
        d
        for d in check.ocena.dowod.status_danych.dane_przyjete
        if d.nazwa_pl == "czas wyłączenia t_b punktu zabudowy"
    ]
    if zrodlo is None:
        assert len(check.notes) == 1
        assert dane_tb == []
        return
    assert check.notes[1] == f"Czas wyłączenia: {zrodlo['opis_pl']}"
    dana_przyjeta = bool(zrodlo["wartosc_robocza"]) and maszyny
    assert len(check.notes) == (3 if dana_przyjeta else 2)
    # Predykat parami: zdanie uwagi o danej przyjętej i wpis t_b w danych przyjętych rekordu
    # pochodzą z tych samych flag wiersza biegu — występują razem albo wcale; z wpisem rekord
    # ma status danych UNVALIDATED_INPUT (ocena na wartości roboczej, kontrakt §3).
    assert len(dane_tb) == (1 if dana_przyjeta else 0)
    if dana_przyjeta:
        assert "wynikiem obliczeniowym na danej przyjętej" in check.notes[2]
        assert dane_tb[0].wartosc.wartosc == 0.1
        assert check.ocena.dowod.status_danych.stan == "UNVALIDATED_INPUT"


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

    assert check.ocena.status_maszynowy == "NIE_SPELNIA"
    assert check.required_source_key == "ikss_ka"
    assert check.required_value == 22.0
    assert "IEC 60282-1" in check.ocena.podstawa.dokument
    assert check.notes == ()
    krok = next(k for k in bundle.proof_document.steps if k.equation.equation_id == "EQ_P12_004")
    assert krok.equation.latex == r"I_k'' \le I_{cu}"


def test_znacznik_bezpiecznika_nie_zmienia_odcisku_innych_aparatow() -> None:
    """Pole addytywne: zapis urządzenia bez bezpiecznika jest bajt w bajt taki jak przed kartą
    (determinizm istniejących pakietów); bezpiecznik dopisuje znacznik."""
    device = _base_input().device
    assert "bezpiecznik" not in device.to_dict()
    assert dataclasses.replace(device, bezpiecznik=True).to_dict()["bezpiecznik"] is True


@pytest.mark.parametrize(
    ("nazwa", "zmiana", "status", "fragmenty"),
    [
        ("U", {"u_m_kv": 17.5}, "SPELNIA", ("U_s dla U_n = 15 kV: 17,5 kV", "≤ 17,5 kV")),
        # Komórka dyskryminująca: U_m równe U_n sieci (15 kV) nie pokrywa U_s = 17,5 kV.
        ("U", {"u_m_kv": 15.0}, "NIE_SPELNIA", ("U_s dla U_n = 15 kV: 17,5 kV", "≤ 15 kV")),
        ("Icu", {"i_cu_ka": 20.0}, "SPELNIA", ("15,5 kA", "≤ 20 kA")),
        ("Icu", {"i_cu_ka": 10.0}, "NIE_SPELNIA", ("15,5 kA", "≤ 10 kA")),
        ("Idyn", {"i_dyn_ka": 50.0}, "SPELNIA", ("40 kA", "≤ 50 kA")),
        ("Idyn", {"i_dyn_ka": 30.0}, "NIE_SPELNIA", ("40 kA", "≤ 30 kA")),
        ("Ith", {"i_th_ka": 20.0}, "SPELNIA", ("18 kA", "≤ 20 kA")),
        ("Ith", {"i_th_ka": 15.0}, "NIE_SPELNIA", ("18 kA", "≤ 15 kA")),
        ("Ith", {"i_th_ka": 30.0, "t_th_s": 0.5}, "SPELNIA", ("18 kA", "≤ 21,21 kA")),
        ("Ith", {"i_th_ka": 20.0, "t_th_s": 0.5}, "NIE_SPELNIA", ("18 kA", "≤ 14,14 kA")),
    ],
)
def test_tresc_sprawdzenia_nie_sklada_kodu_werdyktu(
    nazwa: str, zmiana: dict[str, float], status: str, fragmenty: tuple[str, ...]
) -> None:
    """Kontrakt werdyktu wyjaśnialnego w CAŁYM generatorze (nie tylko I_cu): iloczyn
    {U, I_cu, I_dyn, I_th prądowo, I_th energetycznie} × {spełnia, nie spełnia}. Treść to zdanie
    rekordu K: wynik z jednostką i limit; status — wyłącznie w rekordzie; wynik kroku wywodu to
    etykieta rekordu, nigdy gołe słowo kodu."""
    bundle = EquipmentProofGenerator.generate(_input_with_device(_base_input(), **zmiana))
    check = _find_check(bundle, nazwa)
    assert check.ocena.status_maszynowy == status
    assert check.message_pl == check.ocena.wyjasnienie.zdanie_pl
    for fragment in fragmenty:
        assert fragment in check.message_pl
    assert (nazwa in bundle.result.failed_checks) == (status == "NIE_SPELNIA")
    for slowo in ("PASS", "FAIL", "OK"):
        assert slowo not in check.message_pl
    for krok in bundle.proof_document.steps:
        assert krok.result.value not in ("PASS", "FAIL", "OK", "NIE_DOTYCZY")


# ── Karta WERDYKT-MIGRACJA-190 (C33): iloczyn cech rekordów doboru ───────────────────────
# {U, I_cu, I_dyn, I_th} × {spełnia · narusza · brak danej aparatu · brak wielkości biegu}
# (+ I_cu × nie dotyczy). Każda komórka: status rekordu K, przynależność do failed_checks
# (WYŁĄCZNIE naruszenie), status rekordu W doboru, wynik kroku wywodu i pozycja podsumowania
# = etykieta TEGO SAMEGO rekordu (jedno źródło rozstrzygnięcia). Brak danych ≠ spełnia ≠ narusza.

_KLUCZ_PODSUMOWANIA = {
    "U": "izolacja_ocena",
    "Icu": "wylaczanie_ocena",
    "Idyn": "dynamiczna_ocena",
    "Ith": "cieplna_ocena",
}
_KROK_SPRAWDZENIA = {
    "U": "Sprawdzenie poziomu izolacji U_m",
    "Icu": "Sprawdzenie zdolności wyłączania I_cu",
    "Idyn": "Sprawdzenie wytrzymałości dynamicznej I_dyn",
    "Ith": _KROK_CIEPLNY,
}
#: Zmiana aparatu ({pole: wartość}) albo usunięcie wielkości biegu (klucze) dla komórki.
_KOMORKI_DOBORU: dict[tuple[str, str], tuple[dict, tuple[str, ...]]] = {
    ("U", "narusza"): ({"u_m_kv": 12.0}, ()),
    ("U", "brak_aparatu"): ({"u_m_kv": None}, ()),
    ("U", "brak_biegu"): ({}, ("u_kv",)),
    ("Icu", "narusza"): ({"i_cu_ka": 12.5}, ()),
    ("Icu", "brak_aparatu"): ({"i_cu_ka": None}, ()),
    ("Icu", "brak_biegu"): ({}, ("ib_ka",)),
    ("Icu", "nie_dotyczy"): ({"i_cu_ka": None, "i_cu_not_applicable": True}, ()),
    ("Idyn", "narusza"): ({"i_dyn_ka": 31.5}, ()),
    ("Idyn", "brak_aparatu"): ({"i_dyn_ka": None}, ()),
    ("Idyn", "brak_biegu"): ({}, ("idyn_ka", "ip_ka")),
    ("Ith", "narusza"): ({"i_th_ka": 16.0}, ()),
    ("Ith", "brak_aparatu"): ({"i_th_ka": None}, ()),
    ("Ith", "brak_biegu"): ({}, ("ith_ka",)),
}
_STATUS_KOMORKI = {
    "spelnia": ("SPELNIA", "BRAK_DOWODU"),
    "narusza": ("NIE_SPELNIA", "NIE_SPELNIA"),
    "brak_aparatu": ("BRAK_PODSTAWY", "BRAK_PODSTAWY"),
    "brak_biegu": ("NIE_OCENIONO", "NIE_OCENIONO"),
    "nie_dotyczy": ("NIE_DOTYCZY", "BRAK_DOWODU"),
}


@pytest.mark.parametrize(
    ("nazwa", "stan"),
    [(n, "spelnia") for n in _KLUCZ_PODSUMOWANIA] + sorted(_KOMORKI_DOBORU),
    ids=lambda v: v,
)
def test_iloczyn_kryterium_x_stan_danych(nazwa: str, stan: str) -> None:
    zmiana_aparatu, usuniete = _KOMORKI_DOBORU.get((nazwa, stan), ({}, ()))
    base = _input_with_device(_base_input(), **zmiana_aparatu)
    required = {k: v for k, v in base.required_fault_results.items() if k not in usuniete}
    bundle = EquipmentProofGenerator.generate(
        dataclasses.replace(base, required_fault_results=required)
    )
    status_k, status_w = _STATUS_KOMORKI[stan]
    check = _find_check(bundle, nazwa)

    assert check.ocena.status_maszynowy == status_k
    # Pozostałe kryteria nietknięte — zmiana jednej danej nie przecieka do innych rekordów.
    # Jedyne sprzężenie fizyczne: bez U_n punktu nie wiadomo też, którą wielkość (I_b czy I″k)
    # porównać z I_cu — kryterium wyłączania jest wtedy również nieocenione.
    sprzezone = {"Icu"} if (nazwa, stan) == ("U", "brak_biegu") else set()
    for inny in _KLUCZ_PODSUMOWANIA:
        if inny != nazwa:
            oczekiwany = "NIE_OCENIONO" if inny in sprzezone else "SPELNIA"
            assert _status(bundle, inny) == oczekiwany, inny
    assert bundle.result.wymaganie.status_maszynowy == status_w
    assert bundle.result.failed_checks == ((nazwa,) if status_k == "NIE_SPELNIA" else ())
    if status_k in ("NIE_OCENIONO", "BRAK_PODSTAWY"):
        assert check.ocena.wyjasnienie.czego_brakuje
    etykieta = check.ocena.etykieta.etykieta_pl
    assert _krok(bundle, _KROK_SPRAWDZENIA[nazwa]).result.value == etykieta
    pozycja = bundle.proof_document.summary.key_results[_KLUCZ_PODSUMOWANIA[nazwa]]
    assert (pozycja.value, pozycja.formatted) == (etykieta, check.ocena.wyjasnienie.zdanie_pl)
    # Kod agregatu dowodu jest projekcją rozstrzygnięcia LICZBOWEGO rekordów
    # (``werdykt.porownanie.rozstrzygniecie``; kompletność dowodu niesie rekord W): naruszenie →
    # FAIL, komplet spełnień (NIE_DOTYCZY pominięte) → PASS, brak danej → NIEROZSTRZYGALNE —
    # nigdy PASS przy braku danej.
    assert bundle.proof_document.summary.overall_status == {
        "NIE_SPELNIA": "FAIL",
        "SPELNIA": "PASS",
        "NIE_DOTYCZY": "PASS",
    }.get(status_k, "NIEROZSTRZYGALNE")


@pytest.mark.parametrize("u_n_kv", [0.23, 0.4, 0.69, 1.0, 3.0, 6.0, 10.0, 15.0, 20.0, 30.0, 110.0])
@pytest.mark.parametrize("przesuniecie_kv", [-0.5, -1e-3, 0.0, 1e-3, 0.5])
def test_parytet_rekordu_izolacji_z_predykatem_pasm(u_n_kv: float, przesuniecie_kv: float) -> None:
    """Predykaty parami: rekord K izolacji dowodu i ``pasma_napieciowe.izolacja_pokrywa_siec``
    (odmowa ogranicznika, kontrola aparatu pola, rodzina rozdzielnicy, podgląd DER) rozstrzygają
    tak samo dla U_m wokół napięcia wymaganego sieci (z granicą równości) w każdym paśmie."""
    from network_model.pochodne.pasma_napieciowe import (
        izolacja_pokrywa_siec,
        napiecie_wymagane_izolacji_kv,
    )

    u_s = napiecie_wymagane_izolacji_kv(u_n_kv)
    assert u_s is not None
    u_m = u_s + przesuniecie_kv
    base = _input_with_device(_base_input(), u_m_kv=u_m)
    required = {**base.required_fault_results, "u_kv": u_n_kv}
    bundle = EquipmentProofGenerator.generate(
        dataclasses.replace(base, required_fault_results=required)
    )
    pokrywa = izolacja_pokrywa_siec(u_m, u_n_kv)
    assert _status(bundle, "U") == ("SPELNIA" if pokrywa else "NIE_SPELNIA")
