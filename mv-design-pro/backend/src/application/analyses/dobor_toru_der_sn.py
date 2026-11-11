"""Kaskadowy dobór toru DER po stronie SN: transformator blokowy → kabel SN → aparat pola SN.

JEDNA orkiestracja doboru dla trzech konsumentów:

* podgląd kreatora źródła OZE (`POST /api/solver/der-selection-preview`,
  `api/grid_source_preview.py`),
* sekcja odstępstw dokumentu zgodności toru DER-SN (`api/der_sn_documents.py`),
* szablony stacji z jednostkami przyłączonymi po stronie SN
  (`application/station_templates/apply.py`): każda jednostka dostaje WŁASNY, jawny
  transformator blokowy nN/SN z katalogu na ścieżce mocy (rozstrzygnięcie architekta
  2026-10-15 — transformator blokowy nie może być ukryty w pozycji katalogowej 15 kV ani
  być transformatorem stacji, przez który moc źródła nie płynie).

Przed tym modułem kandydaci katalogu i kolejność kroków kaskady żyły w module API podglądu,
a dokument DER-SN dobierał transformator z domyślnymi tolerancjami silnika zamiast stałych
D1 (`enm.der_sn_validation`) — dwa niezależne warunki, które dziś dają tę samą liczbę.

Warstwa aplikacyjna: ZERO fizyki. Progi i porównania liczy silnik doboru
(`network_model.solvers.der_selection_preview`), prąd znamionowy TR — `enm.der_sn_validation.
rated_current_a`, spadek napięcia — przelicznik kabla wołany przez silnik.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol, cast

from domain.generator_validation import BEZ_REDUKCJI
from enm.der_sn_validation import rated_current_a
from enm.models import EnergyNetworkModel
from enm.nazwy_elementow import nazwa_pozycji_katalogu
from network_model.catalog.gazy_fluorowane import (
    czy_medium_z_gazem_fluorowanym,
    odmowa_gazu_fluorowanego_pl,
)
from network_model.catalog.mv_cable_line_catalog import get_all_cable_types
from network_model.catalog.mv_switch_catalog import get_all_switch_equipment_types
from network_model.catalog.mv_transformer_catalog import get_sn_nn_transformer_types
from network_model.catalog.wartosci_robocze import (
    CzasTrwaniaZwarcia,
    ZrodloCzasuZwarcia,
    rozstrzygnij_czas_trwania_zwarcia,
)
from network_model.odmowa_danych import OdmowaDanychError
from network_model.pochodne import kv_na_v
from network_model.pochodne.jednostki import ka_na_a
from network_model.pochodne.pasma_napieciowe import pasmo_napieciowe
from network_model.solvers.cable_ampacity_derating import wspolczynniki_z_opisu
from network_model.solvers.der_selection_preview import (
    BlockTransformerCandidate,
    BlockTransformerSelectionInput,
    BlockTransformerSelectionResult,
    CableCandidate,
    CableSelectionInput,
    CableSelectionResult,
    FieldApparatusCandidate,
    FieldApparatusSelectionInput,
    FieldApparatusSelectionResult,
    propose_block_transformer,
    propose_mv_cable,
    propose_mv_field_apparatus,
)

#: Dopuszczalny spadek napięcia kabla toru [%] przyjmowany, gdy wołający go nie podaje —
#: ta sama wartość jest domyślną żądania podglądu kreatora.
MAKS_SPADEK_NAPIECIA_KABLA_PCT = 2.0
#: Charakter mocy biernej falownika w doborze kabla, gdy wołający go nie podaje (pobór Q).
CHARAKTER_MOCY_BIERNEJ_DOMYSLNY = "inductive"


class NosnikCosPhi(Protocol):
    """Nośnik jawnego cosφ falownika (żądanie podglądu, jawne wejścia kontroli mocy)."""

    @property
    def cos_phi(self) -> float | None: ...


def cos_phi_doboru_kabla(zrodlo: NosnikCosPhi) -> float:
    """cosφ prądu toru w doborze kabla (ΔU): jawny cosφ falownika, a bez niego 1,0
    (sama moc czynna — człon bierny ΔU znika).

    JEDNA reguła dla podglądu kreatora (żądanie podglądu), sprawdzenia odstępstw dokumentu
    DER-SN (jawne wejścia zapisane przez tor tworzenia) i szablonów stacji. Podstawienie
    1,0 za brak cosφ jest długiem nazwanym w `solver_input_substitute_guard` (jeden wpis
    dla tej funkcji); funkcja przyjmuje nośnik z polem `cos_phi`, żeby forma podstawienia
    pozostała widoczna dla skanera strażnika."""
    return zrodlo.cos_phi if zrodlo.cos_phi is not None else 1.0


def kandydaci_transformatorow_blokowych() -> tuple[BlockTransformerCandidate, ...]:
    """Transformatory SN/nN katalogu z mocą i napięciami (kandydaci doboru TR blokowego)."""
    candidates: list[BlockTransformerCandidate] = []
    for record in get_sn_nn_transformer_types():
        params = record.get("params") or {}
        sn_mva = params.get("rated_power_mva")
        primary_kv = params.get("voltage_hv_kv")
        secondary_kv = params.get("voltage_lv_kv")
        if sn_mva is None or primary_kv is None or secondary_kv is None:
            continue
        candidates.append(
            BlockTransformerCandidate(
                catalog_ref=str(record["id"]),
                name=nazwa_pozycji_katalogu(record),
                sn_mva=float(sn_mva),
                primary_kv=float(primary_kv),
                secondary_kv=float(secondary_kv),
                uk_percent=(
                    float(params["uk_percent"]) if params.get("uk_percent") is not None else None
                ),
                vector_group=params.get("vector_group"),
            )
        )
    return tuple(candidates)


def _opcjonalna_liczba(value: Any) -> float | None:
    """Liczba katalogowa albo None — brak danej nie może stać się zerem."""
    return float(value) if value is not None else None


def kandydaci_kabli_sn() -> tuple[CableCandidate, ...]:
    """Kable katalogu z kompletem danych doboru (przekrój, obciążalność, impedancja)."""
    candidates: list[CableCandidate] = []
    for record in get_all_cable_types():
        params = record.get("params") or {}
        cross = params.get("cross_section_mm2")
        ampacity = params.get("rated_current_a")
        r_km = params.get("r_ohm_per_km")
        x_km = params.get("x_ohm_per_km")
        # Katalog-first: pomijamy rekordy niekompletne (brak obciążalności/impedancji).
        if cross is None or ampacity is None or r_km is None or x_km is None:
            continue
        candidates.append(
            CableCandidate(
                catalog_ref=str(record["id"]),
                name=nazwa_pozycji_katalogu(record),
                cross_section_mm2=float(cross),
                rated_current_a=float(ampacity),
                r_ohm_per_km=float(r_km),
                x_ohm_per_km=float(x_km),
                voltage_rating_kv=(
                    float(params["voltage_rating_kv"])
                    if params.get("voltage_rating_kv") is not None
                    else None
                ),
                # V12K-224: dane cieplne kandydata. Bez nich kryterium wytrzymałości
                # zwarciowej żyły (IEC 60949) było w doborze kabla ZAKODOWANE, ale
                # nigdy nie odpalało — żaden z 63 typów nie miał czym być sprawdzony,
                # a odrzucenie „wytrzymalosc_zwarciowa_niewystarczajaca" było martwe.
                ith_1s_a=_opcjonalna_liczba(params.get("ith_1s_a")),
                jth_1s_a_per_mm2=_opcjonalna_liczba(params.get("jth_1s_a_per_mm2")),
                conductor_material=(
                    str(params["conductor_material"])
                    if params.get("conductor_material") is not None
                    else None
                ),
                insulation=(
                    str(params["insulation_type"])
                    if params.get("insulation_type") is not None
                    else None
                ),
                temp_operating_c=_opcjonalna_liczba(params.get("max_temperature_c")),
                temp_short_circuit_c=_opcjonalna_liczba(params.get("short_circuit_temperature_c")),
            )
        )
    return tuple(candidates)


def kandydaci_aparatow_pola_sn() -> tuple[FieldApparatusCandidate, ...]:
    """Aparatura SN katalogu z rodzajem, napięciem i prądem znamionowym.

    Pozycje z gazem fluorowanym nie są kandydatami (pole źródłowe powstaje jako projektowane).
    Pozycje spoza pasma SN (łączniki topologii zasilania 110 kV, U_m 123 kV) nie są
    kandydatami aparatu pola SN: napięciowo „wystarczają”, ale aparat WN w polu SN nie
    jest propozycją doboru, tylko pomyłką klasy napięcia. ``ik_ka = None`` to brak danej
    z karty i tak przechodzi do propozycji (nigdy 0.0 — bramka KAT-T-050).
    """
    candidates: list[FieldApparatusCandidate] = []
    for record in get_all_switch_equipment_types():
        params = record.get("params") or {}
        kind = params.get("equipment_kind")
        un_kv = params.get("un_kv")
        in_a = params.get("in_a")
        if kind is None or un_kv is None or in_a is None:
            continue
        if pasmo_napieciowe(float(un_kv)) != "SN":
            continue
        # Karta UX-04/POLE-LINIOWE-WZORZEC (zakaz gazów fluorowanych w obiektach projektowanych):
        # dobór aparatu NOWEGO pola źródłowego SN nie proponuje pozycji z gazem fluorowanym —
        # pole powstaje jako projektowane, więc taka propozycja kończyłaby się odmową strażnika
        # operacji. Ta sama reguła co oferta pickerów (`api.catalog._dopuszczenie_do_nowych_pol`):
        # `czy_medium_z_gazem_fluorowanym` → `odmowa_gazu_fluorowanego_pl` dla stanu projektowanego.
        if (
            odmowa_gazu_fluorowanego_pl(
                str(record["id"]),
                gaz_fluorowany=czy_medium_z_gazem_fluorowanym(params.get("medium")),
                stan_obiektu="PROJEKTOWANY",
            )
            is not None
        ):
            continue
        candidates.append(
            FieldApparatusCandidate(
                catalog_ref=str(record["id"]),
                name=nazwa_pozycji_katalogu(record),
                equipment_kind=str(kind),
                un_kv=float(un_kv),
                in_a=float(in_a),
                ik_ka=(float(params["ik_ka"]) if params.get("ik_ka") is not None else None),
            )
        )
    return tuple(candidates)


def dobierz_transformator_blokowy(
    *,
    moc_pozorna_mva: float,
    napiecie_sn_kv: float,
    napiecie_falownika_kv: float,
    wspolczynnik_jednoczesnosci: float = BEZ_REDUKCJI,
    przeciazalnosc_pu: float = BEZ_REDUKCJI,
    rezerwa_pu: float = 0.0,
) -> BlockTransformerSelectionResult:
    """Dobór TR blokowego z katalogu (równość napięć znamionowych D1) — jedna funkcja dla
    kaskady i dla odstępstw dokumentu DER-SN. `OdmowaDanychError` — wejście poza dziedziną."""
    return propose_block_transformer(
        BlockTransformerSelectionInput(
            sum_apparent_power_mva=moc_pozorna_mva,
            primary_voltage_kv=napiecie_sn_kv,
            secondary_voltage_kv=napiecie_falownika_kv,
            candidates=kandydaci_transformatorow_blokowych(),
            simultaneity_factor=wspolczynnik_jednoczesnosci,
            reserve_pu=rezerwa_pu,
            loadability_pu=przeciazalnosc_pu,
        )
    )


@dataclass(frozen=True)
class OpisUlozeniaKabla:
    """Warunki UŁOŻENIA kabla toru (V12K-207, F-K7): nazwa zestawu albo współczynniki
    własne z opisem. Brak opisu = warunki katalogowe (nazwane w wyniku doboru)."""

    set_name: str | None = None
    f_grunt: float | None = None
    f_wiazka: float | None = None
    f_grupa: float | None = None
    opis_pl: str | None = None


@dataclass(frozen=True)
class WejscieZwarcioweToruDer:
    """Wejście kryterium wytrzymałości zwarciowej kabla toru (karta EDYTOR-DELT-SCENARIUSZA-
    ZABEZPIECZEN, pakiet 6b): I″k i κ szyny przyłączenia z biegu zwarciowego przypadku oraz
    czas trwania zwarcia z ``rozstrzygnij_czas_trwania_zwarcia`` (projektant > nastawy >
    wartość robocza 1 s). ``ikss_a``/``kappa`` ``None`` — prądu nie ma, ``powod_braku_pl``
    mówi dlaczego (rekord kryterium NIE_OCENIONO z akcją, nie ciche pominięcie)."""

    ikss_a: float | None
    kappa: float | None
    czas_s: float
    zrodlo_czasu: str
    podstawa_czasu_pl: str
    powod_braku_pl: str | None
    run_id: str | None = None
    #: Dana przyjęta czasu (``ESTIMATED``) — wyłącznie przy wartości roboczej; ocena na niej
    #: ma kompletność dowodu ``NIEPELNY`` (zasada nr 4, kontrakt werdyktu §3).
    dana_przyjeta: dict[str, Any] | None = None

    @property
    def kompletnosc_dowodu(self) -> str:
        return "NIEPELNY" if self.dana_przyjeta is not None else "PELNY"


def czas_trwania_zwarcia_nowego_pola() -> CzasTrwaniaZwarcia:
    """Czas trwania zwarcia pola przyłączenia toru, którego jeszcze nie ma w modelu (podgląd
    kreatora): bez łącznika i nastaw — wartość robocza 1 s (IEC 62271-1 §4.7). Po utworzeniu
    pola ten sam czas zmienia projektant na łączniku pola (``czas_wylaczenia_zwarcia_s``)."""
    return rozstrzygnij_czas_trwania_zwarcia(
        czas_projektanta_s=None,
        opis_projektanta_pl="przyjęty czas zwarcia na łączniku pola przyłączenia toru",
        czas_z_nastaw_s=None,
        opis_nastaw_pl="",
    )


def czas_trwania_zwarcia_pola_toru(
    model: EnergyNetworkModel, pole_ref: str, prad_a: float | None
) -> CzasTrwaniaZwarcia:
    """Czas trwania zwarcia ISTNIEJĄCEGO pola przyłączenia toru — to samo rozstrzygnięcie co
    ocena cieplna aparatury pola (``czas_trwania_zwarcia_pola``: wartość projektanta na
    łączniku pola > nastawy zabezpieczenia pola przy prądzie ``prad_a`` > wartość robocza 1 s).
    Pola nie ma w modelu — jak pole nowe (wartość robocza)."""
    from application.analyses.aparaty_pol import aparaty_pol_stacji, znajdz_stacje
    from application.analyses.protection.czas_wylaczenia_pola import czas_trwania_zwarcia_pola

    bay = next((b for b in model.bays if b.ref_id == pole_ref), None)
    if bay is None:
        return czas_trwania_zwarcia_nowego_pola()
    stacja = znajdz_stacje(model, bay.substation_ref) if bay.substation_ref else None
    aparaty = aparaty_pol_stacji(model, stacja).get(bay.ref_id, []) if stacja is not None else []
    czas = czas_trwania_zwarcia_pola(model, bay, aparaty, prad_a)
    # Słownik widoku pola (``nastawy_pola``) → trójka rozstrzygnięcia (``nastawy``).
    zrodlo = {"nastawy_pola": "nastawy"}.get(str(czas["zrodlo"]), str(czas["zrodlo"]))
    return CzasTrwaniaZwarcia(
        float(czas["t_clearing_s"]), cast(ZrodloCzasuZwarcia, zrodlo), str(czas["podstawa_pl"])
    )


def wejscie_zwarciowe_toru_der(
    *,
    case_id: str | None,
    szyna_ref: str | None,
    model: EnergyNetworkModel | None,
    czas_dla_pradu: Callable[[float | None], CzasTrwaniaZwarcia],
) -> WejscieZwarcioweToruDer:
    """I″k i κ szyny przyłączenia toru z NAJNOWSZEGO zakończonego biegu zwarciowego
    przypadku (scenariusz maksymalny, zwarcie metaliczne w zakresie IEC 60909 — prąd
    maksymalny decyduje o wytrzymałości cieplnej) policzonego dla BIEŻĄCEJ wersji modelu.

    ``czas_dla_pradu`` — czas trwania zwarcia przy prądzie I″k [A] szyny (``None`` = prądu
    nie ma): nowe pole — ``czas_trwania_zwarcia_nowego_pola``, pole w modelu —
    ``czas_trwania_zwarcia_pola_toru`` (nastawy zabezpieczenia zależą od prądu).

    Każdy brak ma własny powód (przypadek nie wskazany, brak biegu, bieg nieaktualny, punkt
    spoza biegu) — wołający przekazuje go do rekordu kryterium. Zero fizyki: odczyt wiersza
    zapisanego biegu.
    """
    from application.autorytet_biegu_zwarciowego import bieg_w_zakresie_iec60909
    from enm.canonical_analysis import (
        build_short_circuit_results,
        list_runs_for_case,
        scenariusz_biegu_zwarciowego,
    )
    from enm.hash import compute_enm_hash
    from enm.mapping import ref_to_graph_id

    def _brak(powod_pl: str, run_id: str | None = None) -> WejscieZwarcioweToruDer:
        czas = czas_dla_pradu(None)
        return WejscieZwarcioweToruDer(
            ikss_a=None,
            kappa=None,
            czas_s=czas.wartosc_s,
            zrodlo_czasu=czas.zrodlo,
            podstawa_czasu_pl=czas.podstawa_pl,
            powod_braku_pl=powod_pl,
            run_id=run_id,
            dana_przyjeta=_dana_czasu(czas),
        )

    if not case_id or not szyna_ref:
        return _brak(
            "Dobór nie wskazuje przypadku obliczeniowego ani szyny przyłączenia toru — prądu "
            "zwarciowego w miejscu przyłączenia nie ma z czego wziąć."
        )
    biegi = [
        bieg
        for bieg in list_runs_for_case(case_id)
        if bieg.analysis_type == "short_circuit_sn"
        and bieg.status == "FINISHED"
        and bieg_w_zakresie_iec60909(bieg)
        and scenariusz_biegu_zwarciowego(bieg) == "MAX"
    ]
    if not biegi:
        return _brak(
            "Przypadek nie ma zakończonego biegu zwarciowego (scenariusz maksymalny) — prądu "
            "zwarciowego w miejscu przyłączenia toru jeszcze nie policzono."
        )
    bieg = max(biegi, key=lambda b: (b.created_at, str(b.id)))
    if model is not None and bieg.snapshot_hash != compute_enm_hash(model):
        return _brak(
            "Najnowszy bieg zwarciowy przypadku policzono dla wcześniejszej wersji modelu — "
            "jego prąd nie opisuje bieżącej sieci.",
            str(bieg.id),
        )
    identyfikatory = {szyna_ref, ref_to_graph_id(szyna_ref)}
    wiersz = next(
        (
            w
            for w in build_short_circuit_results(bieg)["rows"]
            if w.get("fault_type") == "3F"
            and (w.get("element_id") in identyfikatory or w.get("target_id") in identyfikatory)
        ),
        None,
    )
    ik_ka = wiersz.get("ikss_ka") if wiersz is not None else None
    kappa = wiersz.get("kappa") if wiersz is not None else None
    if ik_ka is None or kappa is None:
        return _brak(
            "Bieg zwarciowy przypadku nie niesie prądu zwarciowego początkowego i współczynnika "
            "udaru zwarcia trójfazowego dla szyny przyłączenia toru.",
            str(bieg.id),
        )
    ikss_a = ka_na_a(float(ik_ka))
    czas = czas_dla_pradu(ikss_a)
    return WejscieZwarcioweToruDer(
        ikss_a=ikss_a,
        kappa=float(kappa),
        czas_s=czas.wartosc_s,
        zrodlo_czasu=czas.zrodlo,
        podstawa_czasu_pl=czas.podstawa_pl,
        powod_braku_pl=None,
        run_id=str(bieg.id),
        dana_przyjeta=_dana_czasu(czas),
    )


def _dana_czasu(czas: CzasTrwaniaZwarcia) -> dict[str, Any] | None:
    dana = czas.dana_przyjeta(miejsce_pl="pole przyłączenia toru DER-SN (kabel toru)")
    return dana.model_dump(mode="json") if dana is not None else None


def parametry_zwarciowe_doboru_kabla(zwarcie: WejscieZwarcioweToruDer | None) -> dict[str, Any]:
    """Pola zwarciowe ``CableSelectionInput`` z wejścia toru — JEDNO złożenie dla podglądu
    kreatora i dokumentu zgodności (ta sama propozycja przy tych samych danych)."""
    if zwarcie is None:
        return {}
    return {
        "ikss_a": zwarcie.ikss_a,
        "kappa": zwarcie.kappa,
        "fault_duration_s": zwarcie.czas_s,
        "fault_duration_basis_pl": zwarcie.podstawa_czasu_pl,
        "short_circuit_unavailable_pl": zwarcie.powod_braku_pl,
    }


@dataclass(frozen=True)
class WynikDoboruToruDerSn:
    """Wynik kaskady — WHITE BOX każdego kroku (próg, odrzuceni kandydaci z powodem).
    `kabel` i `aparat_pola` są `None`, gdy nie ma propozycji transformatora (kaskada kabla
    i pola zależy od prądu SN zaproponowanego TR)."""

    moc_pozorna_mva: float
    transformator: BlockTransformerSelectionResult
    prad_transformatora_a: float | None
    kabel: CableSelectionResult | None
    aparat_pola: FieldApparatusSelectionResult | None


def dobierz_tor_der_sn(
    *,
    moc_pozorna_mva: float,
    napiecie_sn_kv: float,
    napiecie_falownika_kv: float,
    dlugosc_kabla_km: float,
    nosnik_cos_phi: NosnikCosPhi,
    wspolczynnik_jednoczesnosci: float = BEZ_REDUKCJI,
    przeciazalnosc_pu: float = BEZ_REDUKCJI,
    rezerwa_transformatora_pu: float = 0.0,
    rezerwa_kabla_pu: float = 0.0,
    rezerwa_pola_pu: float = 0.0,
    maks_spadek_napiecia_pct: float = MAKS_SPADEK_NAPIECIA_KABLA_PCT,
    charakter_mocy_biernej: str = CHARAKTER_MOCY_BIERNEJ_DOMYSLNY,
    ulozenie: OpisUlozeniaKabla | None = None,
    zwarcie: WejscieZwarcioweToruDer | None = None,
) -> WynikDoboruToruDerSn:
    """Kaskada: TR blokowy (S_wym = `moc_pozorna_mva`) → prąd SN zaproponowanego TR →
    kabel SN (obciążalność i ΔU) oraz aparat główny pola SN.

    `moc_pozorna_mva` liczy wołający regułą kontroli mocy O-53 (`domain.generator_validation`)
    — kreator: człon nastawy ΣP/cosφ, szablon: pełna reguła max(S_n,jedn·n, |P|/cosφ) z karty.
    `zwarcie` — wejście kryterium wytrzymałości zwarciowej kabla (``wejscie_zwarciowe_toru_der``);
    ``None`` = dobór bez przypadku: rekord kryterium NIE_OCENIONO z akcją (pakiet 6b).
    `OdmowaDanychError` — wejście poza dziedziną (także nieznany zestaw warunków ułożenia)."""
    transformator = dobierz_transformator_blokowy(
        moc_pozorna_mva=moc_pozorna_mva,
        napiecie_sn_kv=napiecie_sn_kv,
        napiecie_falownika_kv=napiecie_falownika_kv,
        wspolczynnik_jednoczesnosci=wspolczynnik_jednoczesnosci,
        przeciazalnosc_pu=przeciazalnosc_pu,
        rezerwa_pu=rezerwa_transformatora_pu,
    )
    if transformator.proposal is None:
        return WynikDoboruToruDerSn(moc_pozorna_mva, transformator, None, None, None)

    prad_a = rated_current_a(transformator.proposal.sn_mva, napiecie_sn_kv)
    if prad_a is None:
        raise OdmowaDanychError("Nie można wyznaczyć prądu znamionowego TR (moc/napięcie).")

    # F-K7: nazwa zestawu / współczynniki własne → współczynniki. Nieznany zestaw i brak
    # opisu warunków własnych kończą się odmową (fail-closed), nie cichym przyjęciem
    # warunków katalogowych.
    wspolczynniki = wspolczynniki_z_opisu(
        ulozenie.set_name if ulozenie is not None else None,
        f_grunt=ulozenie.f_grunt if ulozenie is not None else None,
        f_wiazka=ulozenie.f_wiazka if ulozenie is not None else None,
        f_grupa=ulozenie.f_grupa if ulozenie is not None else None,
        opis_pl=ulozenie.opis_pl if ulozenie is not None else None,
    )
    kabel = propose_mv_cable(
        CableSelectionInput(
            transformer_current_a=prad_a,
            length_km=dlugosc_kabla_km,
            line_voltage_v=kv_na_v(napiecie_sn_kv),
            cos_phi=cos_phi_doboru_kabla(nosnik_cos_phi),
            candidates=kandydaci_kabli_sn(),
            reserve_pu=rezerwa_kabla_pu,
            max_delta_u_pct=maks_spadek_napiecia_pct,
            reactive_character=charakter_mocy_biernej,
            derating=wspolczynniki,
            **parametry_zwarciowe_doboru_kabla(zwarcie),
        )
    )
    aparat = propose_mv_field_apparatus(
        FieldApparatusSelectionInput(
            transformer_current_a=prad_a,
            system_voltage_kv=napiecie_sn_kv,
            candidates=kandydaci_aparatow_pola_sn(),
            reserve_pu=rezerwa_pola_pu,
        )
    )
    return WynikDoboruToruDerSn(moc_pozorna_mva, transformator, prad_a, kabel, aparat)
