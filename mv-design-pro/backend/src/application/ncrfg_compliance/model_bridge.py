"""Most model → wejście solvera NC RfG / PTPiREE (karta S-3 W6-0; karta AB-1a Pakiet C).

Buduje ``NcRfgPtpireeModuleInput`` (kontrakt V2 solvera ``network_model/solvers/ncrfg_ptpiree``)
z kanonicznego generatora ENM, żeby JEDYNA implementacja zgodności NC RfG liczyła z DANYCH
ZATWIERDZONEGO MODELU (trasa ``GET /api/ncrfg-tests/cases/{case_id}/compliance``, certyfikat
zgodności i wniosek do OSD). Ten sam most wyprowadza PO STRONIE SERWERA dowód certyfikatu
urządzenia (``DowodCertyfikatu``): tabliczka urządzenia (``materialized_params``, pola
``ptpiree_*`` wpisane przez ``mv_ptpiree_catalog.annotate_with_ptpiree_status``) jest
dopasowywana do rejestru wykazu PTPiREE wskazanego przez warstwę WiPWC profilu — pola dowodu
pochodzą z REKORDU REJESTRU, a rozjazd tabliczki z rejestrem to brak dowodu z powodem, nigdy
„certyfikat zweryfikowany". Klient API nie ma żadnej drogi do certyfikatu (plan AB O-27).

ZERO FABRYKACJI. Brak danej w modelu = ``False``/``None`` w wejściu → solver daje ocenę
niewykonaną z nazwanym brakiem; nigdy wartość domyślna.

INWENTARZ PÓL WEJŚCIA SOLVERA × ŹRÓDŁO W MODELU (KLASA, NIE INSTANCJA — każde pole
``NcRfgPtpireeModuleInput`` ma tu jawny wiersz; test ``test_most_nazywa_kazde_pole_wejscia_solvera``
pilnuje, że nowe pole kontraktu solvera nie zostanie pominięte milcząco):

- ``der_ref``            ← ``generator.ref_id``
- ``der_name``           ← ``generator.name``
- ``der_kind``           ← ``generator.gen_type`` (``_DER_KIND_Z_GEN_TYPE``, komplet
                            ``GEN_TYPES_PRZEKSZTALTNIKOWE``; ``bess`` → ``BESS``, czyli technologia
                            ``MAGAZYN`` — magazyn poza rozporządzeniem 2016/631, O-28)
- ``module_family``      ← ``"PPM"`` — każdy typ przekształtnikowy jest modułem parku energii;
                            generator synchroniczny (``SyPGM``) jest poza klasą DER tego mostu
- ``operator_id``        ← parametr trasy (wybór projektanta)
- ``p_max_kw``           ← ``|generator.p_mw|`` → kW (moc zmaterializowana, z liczbą
                            jednostek); ``<= 0`` → DER pominięty z powodem ``brak_mocy``
- ``p_min_kw``           ← ``generator.deklaracje_modulu.p_min_kw`` (deklaracja modułu ze
                            źródłem, ``enm/deklaracje_modulu.py``; brak → ``None``)
- ``voltage_kv``         ← napięcie szyny przyłączenia (``enm.buses[bus_ref]``);
                            brak/``<= 0`` → DER pominięty z powodem ``brak_napiecia``
- ``modul_istniejacy``   ← ``generator.modul_istniejacy`` (art. 4 — 1:1, ``None`` = nieustalone)
- ``data_umowy_przylaczeniowej`` ← ``generator.data_umowy_przylaczeniowej`` (1:1)
- ``nastawy_zabezpieczen_modulu`` ← ``generator.nastawy_zabezpieczen`` (1:1, O-32)
- ``has_lvrt_curve``     ← ``meta.has_lvrt_curve`` (deklaracja kreatora OZE) LUB
                            ``materialized_params.profiles.lvrt_curve_ref`` (wiązanie)
- ``has_hvrt_curve``     ← ``meta.has_hvrt_curve`` LUB ``profiles.hvrt_curve_ref``
- ``has_pf_droop``       ← ``meta.frequency_droop_percent > 0`` LUB ``profiles.pf_curve_ref``
- ``has_qu_curve``       ← ``meta.qu_slope_pu_per_pu > 0`` LUB ``meta.control_mode``
                            ∈ ``_QU_CONTROL_MODES``
- ``has_dynamic_model``  ← ``materialized_params.dynamic_model_ref`` (wiązanie profilu
                            dynamicznego ``network_model.catalog.der_dynamic``)
- ``has_scada_communication``, ``has_disturbance_recorder`` ← ``deklaracje_modulu`` (1:1,
                            ``None`` = nie zadeklarowano; stan komunikacji i rejestratora
                            pola to migawka RUCHOWA ``BayRuntimeState``/
                            ``DisturbanceRecorderState``, nie deklaracja projektowa zdolności
                            modułu — nośnikiem deklaracji jest blok modułu)
- ``active_power_control_enabled``, ``stop_generation_enabled``,
  ``reduction_generation_enabled``, ``island_operation_capable``, ``black_start_capable``,
  ``power_oscillation_damping_enabled`` ← ``deklaracje_modulu`` (1:1, ``None`` = nie
                            zadeklarowano → ocena niewykonana z nazwanym brakiem)
- ``island_operation_required``, ``black_start_required``,
  ``power_oscillation_damping_required`` ← ``deklaracje_modulu`` (wymaganie programu badań
                            operatora; brak wskazania → ``False`` — wymaganie istnieje tylko,
                            gdy program je wskazał)
- ``droop_percent``      ← ``meta.frequency_droop_percent`` (``> 0``)
- ``dead_band_hz``       ← ``meta.lfsm_deadband_hz`` (``>= 0``)
- ``ramp_rate_pct_per_min`` ← ``deklaracje_modulu`` (1:1, brak → ``None``)
- ``cos_phi_min``        ← ``meta.cos_phi`` (``0 < x <= 1``; deklarowany cosφ modułu
                            z kreatora OZE / tabliczki katalogu)
- ``q_range_pct_pn_min`` ← ``meta.q_min_mvar`` w bazie ``|p_mw|``
                            (``pochodne.udzial_mocy_biernej_pu``; ta sama baza
                            całkowita co granice węzła PV w ``enm/assembler.py``)
- ``q_range_pct_pn_max`` ← ``meta.q_max_mvar`` w bazie ``|p_mw|`` (jw.)
- ``reactive_current_gain``, ``p_recovery_time_s`` ← ``deklaracje_modulu`` (1:1, brak →
                            ``None``)
- ``harmonic_thdu_percent`` ← ``deklaracje_modulu`` (1:1, brak → ``None``; karta
                            katalogowa niesie widmo prądu ``harmonic_spectrum_percent``, nie
                            THD_U — deklaracja THD_U źródła jest osobną daną)
- ``cease_generation_time_s`` ← ``deklaracje_modulu`` (1:1, brak → ``None``)

POCHODZENIE WARTOŚCI (``pola_wejscia_z_modelu``): pole wejścia jest „z modelu", gdy model
niesie jego daną — pole o wartości ``None`` nie jest; zdolność ``bool`` wyprowadzona z obecności
wiązania/deklaracji kreatora (``has_lvrt_curve`` … ``has_dynamic_model``) — gdy ``True``;
pole deklaracji modułu (``POLA_DEKLARACJI``, także wymagania programu ``*_required``) — gdy
blok ``deklaracje_modulu`` niesie wartość (jawne ``False`` jest daną modelu, brak — nie);
operator (wybór projektanta) i rodzina modułu (stała) nigdy. Formularz biegu „co-jeśli"
macierzy dostaje wartości i pochodzenie z JEDNEGO odczytu (``GET …/cases/{id}/wejscia``).

DOWÓD CERTYFIKATU (``weryfikacja_certyfikatu``): referencja rekordu wykazu z tabliczki
(``ptpiree_certificate_ref``) → rekord rejestru (``get_all_ptpiree_generator_certificates``);
kontrola spójności tabliczki z rejestrem (numer dokumentu, zakres typów, wersja WiPWC — gdy
tabliczka je niesie); wersja wykazu rekordu musi należeć do wersji warstwy WiPWC profilu, a przy
znanej dacie umowy przyłączeniowej — mieścić się w oknie akceptacji tej wersji. Podstawa dowodu =
rejestr wskazany przez warstwę WiPWC + wersja warstwy obowiązująca w dniu umowy (stan z profilu).
"""

from __future__ import annotations

from datetime import date
from functools import cache
from typing import Any, Literal, get_args

from catalog.profiles.nc_rfg import NcRfgProfile, TypModulu, load_nc_rfg_profile
from enm.deklaracje_modulu import POLA_DEKLARACJI, DeklaracjeModulu
from enm.models import GEN_TYPES_PRZEKSZTALTNIKOWE, EnergyNetworkModel, Generator
from enm.nazwy_elementow import nazwa_elementu, nazwa_nadana_pozycji_katalogu
from network_model.catalog.mv_ptpiree_catalog import get_all_ptpiree_generator_certificates
from network_model.pochodne import mw_na_kw, udzial_mocy_biernej_pu
from network_model.solvers.ncrfg_ptpiree import NcRfgPtpireeModuleInput
from network_model.solvers.ncrfg_ptpiree.contracts import DowodCertyfikatu
from pydantic import BaseModel
from werdykt.kontrakt import PodstawaWymagania

PowodPominieciaDer = Literal["brak_mocy", "brak_napiecia"]

#: Jedno zrodlo prawdy predykatu DER: enm/models.py (obok Literalu gen_type).
_INVERTER_GEN_TYPES = GEN_TYPES_PRZEKSZTALTNIKOWE

#: gen_type ENM → rodzaj modułu solvera. KOMPLET ``GEN_TYPES_PRZEKSZTALTNIKOWE``
#: (przypięte testem) — brak wiersza dla nowego typu byłby cichym pominięciem DER.
_DER_KIND_Z_GEN_TYPE: dict[str, Literal["PV", "BESS", "FW", "OTHER"]] = {
    "pv_inverter": "PV",
    "bess": "BESS",
    "wind_inverter": "FW",
    "fw_pmsg": "FW",
    "fw_dfig": "FW",
    "fw_scig": "FW",
}
_QU_CONTROL_MODES = {"Q_OD_U", "Q_U", "VOLT_VAR"}

_POWOD_POMINIECIA_PL: dict[PowodPominieciaDer, str] = {
    "brak_mocy": "Moc czynna modułu w modelu nie jest dodatnia — solver nie ma czego klasyfikować.",
    "brak_napiecia": (
        "Szyna przyłączenia modułu nie istnieje w modelu albo nie ma napięcia znamionowego."
    ),
}

#: Pola tabliczki porównywane z rekordem rejestru (pole tabliczki, pole rekordu, nazwa PL).
_POLA_SPOJNOSCI: tuple[tuple[str, str, str], ...] = (
    ("ptpiree_document_number", "document_number", "numer dokumentu"),
    ("ptpiree_ppm_scope", "ppm_scope", "zakres typów modułów"),
    ("ptpiree_wipwc_version", "wipwc_version", "wersja WiPWC"),
)
_TYPY_MODULOW: tuple[TypModulu, ...] = get_args(TypModulu)


class NcRfgDerPominiety(BaseModel):
    """DER modelu, którego solver NIE może objąć biegiem — jawny powód, nie cisza."""

    der_ref: str
    der_name: str | None
    powod: PowodPominieciaDer
    powod_pl: str


class NcRfgCertyfikatOdrzucony(BaseModel):
    """Tabliczka urządzenia wskazuje certyfikat z wykazu PTPiREE, ale serwer nie potwierdził
    go w rejestrze — brak dowodu certyfikatu z nazwanym powodem."""

    der_ref: str
    rekord_ref: str | None
    powod_pl: str


class WejsciaZgodnosciZModelu(BaseModel):
    """Wynik mostu dla całego modelu: moduły do biegu, pola każdego modułu z wartością z danych
    modelu (po ``der_ref``, ``pola_wejscia_z_modelu``), DER pominięte z powodem, dowody
    certyfikatu potwierdzone w rejestrze (po ``der_ref``) i tabliczki odrzucone z powodem."""

    modules: list[NcRfgPtpireeModuleInput]
    pola_z_modelu: dict[str, list[str]]
    pominiete: list[NcRfgDerPominiety]
    certyfikaty: dict[str, DowodCertyfikatu]
    certyfikaty_odrzucone: list[NcRfgCertyfikatOdrzucony]


def _slownik(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _bool_flag(meta: dict[str, Any], key: str) -> bool:
    value = meta.get(key)
    return value if isinstance(value, bool) else False


def _liczba(value: Any) -> float | None:
    """Liczba z meta/tabliczki; ``bool`` NIE jest liczbą (``True`` ≠ ``1.0`` mocy)."""
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _dodatnia(value: Any) -> float | None:
    liczba = _liczba(value)
    return liczba if liczba is not None and liczba > 0 else None


def _nieujemna(value: Any) -> float | None:
    liczba = _liczba(value)
    return liczba if liczba is not None and liczba >= 0 else None


def _niepusty_tekst(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


@cache
def _rejestr_wykazu() -> dict[str, dict[str, Any]]:
    """Rejestr wykazu PTPiREE po identyfikatorze rekordu (jedno źródło — snapshot wykazu)."""
    return {str(rekord["id"]): rekord for rekord in get_all_ptpiree_generator_certificates()}


def _zakres_typow(zakres: str) -> tuple[tuple[TypModulu, ...], list[str]]:
    """Zakres typów rekordu wykazu („A,B") — typy znane i nieznane tokeny."""
    tokeny = [t.strip() for t in zakres.split(",") if t.strip()]
    znane = tuple(t for t in _TYPY_MODULOW if t in tokeny)
    nieznane = [t for t in tokeny if t not in _TYPY_MODULOW]
    return znane, nieznane


def _podstawa_dowodu(
    profile: NcRfgProfile, parametry: dict[str, Any], data_umowy: date | None
) -> PodstawaWymagania:
    """Podstawa dowodu certyfikatu: rekord wykazu w rejestrze wskazanym przez warstwę WiPWC
    profilu i wersja warstwy obowiązująca w dniu umowy (stan z profilu, nigdy podnoszony)."""
    dokument = profile.wersja_warstwy("WIPWC", data_umowy)
    strona, wiersz = parametry.get("source_page"), parametry.get("source_row")
    jednostka = (
        f"s. {strona}, poz. {wiersz}"
        if isinstance(strona, int) and isinstance(wiersz, int)
        else None
    )
    uwagi = "; ".join(
        u
        for u in (
            f"rejestr {profile.wipwc.rejestr.plik} ({profile.wipwc.rejestr.schemat})",
            f"warstwa WiPWC profilu: {dokument.tytul}, wydanie {dokument.wydanie}",
            dokument.uwagi_pl,
            None if jednostka is not None else "brak pozycji rekordu w wykazie",
        )
        if u
    )
    return PodstawaWymagania(
        rodzaj="WIPWC",
        dokument=(
            f"Wykaz urządzeń PTPiREE, WiPWC {parametry.get('wipwc_version')} (publikacja "
            f"{parametry.get('publication_date')})"
        ),
        wydanie=str(parametry.get("wipwc_version")),
        jednostka_redakcyjna=jednostka,
        status=dokument.status if jednostka is not None else "NIEUSTALONE",
        uwagi_pl=uwagi,
    )


def weryfikacja_certyfikatu(
    der_ref: str,
    tabliczka: dict[str, Any],
    *,
    profile: NcRfgProfile,
    data_umowy: date | None,
) -> DowodCertyfikatu | NcRfgCertyfikatOdrzucony | None:
    """Dowód certyfikatu urządzenia wyprowadzony PO STRONIE SERWERA z tabliczki × rejestr.

    ``None`` — tabliczka nie wskazuje certyfikatu (status inny niż ``POWIAZANY`` i brak
    referencji rekordu). ``NcRfgCertyfikatOdrzucony`` — tabliczka wskazuje certyfikat, ale
    rekord nie istnieje w rejestrze, tabliczka przeczy rekordowi, zakres typów rekordu jest
    nieczytelny, wersja wykazu jest spoza warstwy WiPWC profilu albo data umowy leży poza
    oknem akceptacji tej wersji. ``DowodCertyfikatu`` — pola z REKORDU REJESTRU.
    """
    referencja = tabliczka.get("ptpiree_certificate_ref")
    powiazany = tabliczka.get("ptpiree_status") == "POWIAZANY"
    if not _niepusty_tekst(referencja):
        if powiazany:
            return NcRfgCertyfikatOdrzucony(
                der_ref=der_ref,
                rekord_ref=None,
                powod_pl=(
                    "tabliczka urządzenia oznaczona jako powiązana z wykazem PTPiREE, ale bez "
                    "referencji rekordu wykazu (ptpiree_certificate_ref) — brak dowodu"
                ),
            )
        return None
    assert isinstance(referencja, str)
    rekord = _rejestr_wykazu().get(referencja)
    if rekord is None:
        return NcRfgCertyfikatOdrzucony(
            der_ref=der_ref,
            rekord_ref=referencja,
            powod_pl=(
                "referencja rekordu wykazu z tabliczki nie istnieje w rejestrze "
                f"{profile.wipwc.rejestr.plik} — brak dowodu certyfikatu"
            ),
        )
    parametry = _slownik(rekord.get("params"))
    # Rekord wykazu nazywa jego nazwa z rejestru (producent, rodzaj, typ), nie klucz rekordu —
    # klucz zostaje w `rekord_ref` odmowy (karta #144).
    nazwa_rekordu = nazwa_nadana_pozycji_katalogu(rekord) or "rekord wykazu bez nazwy"
    rozjazdy = [
        f"{nazwa}: tabliczka „{tabliczka[pole_tabliczki]}”, rejestr „{parametry.get(pole_rekordu)}”"
        for pole_tabliczki, pole_rekordu, nazwa in _POLA_SPOJNOSCI
        if tabliczka.get(pole_tabliczki) is not None
        and str(tabliczka[pole_tabliczki]) != str(parametry.get(pole_rekordu))
    ]
    if rozjazdy:
        return NcRfgCertyfikatOdrzucony(
            der_ref=der_ref,
            rekord_ref=referencja,
            powod_pl=(
                f"tabliczka urządzenia przeczy rekordowi wykazu „{nazwa_rekordu}” ("
                + "; ".join(rozjazdy)
                + ") — brak dowodu certyfikatu"
            ),
        )
    niepelny = [
        nazwa
        for pole, nazwa in (
            ("manufacturer", "producent"),
            ("model", "model"),
            ("document_number", "numer dokumentu"),
            ("wipwc_version", "wersja WiPWC"),
        )
        if not _niepusty_tekst(parametry.get(pole))
    ]
    if niepelny:
        return NcRfgCertyfikatOdrzucony(
            der_ref=der_ref,
            rekord_ref=referencja,
            powod_pl=(
                f"rekord wykazu „{nazwa_rekordu}” bez pól: {', '.join(niepelny)} — brak dowodu "
                "certyfikatu"
            ),
        )
    zakres, nieznane = _zakres_typow(str(parametry.get("ppm_scope") or ""))
    if nieznane:
        return NcRfgCertyfikatOdrzucony(
            der_ref=der_ref,
            rekord_ref=referencja,
            powod_pl=(
                f"zakres typów rekordu wykazu „{nazwa_rekordu}” zawiera oznaczenia spoza typów "
                f"modułów A–D ({', '.join(nieznane)}) — brak dowodu certyfikatu"
            ),
        )
    wersja = str(parametry.get("wipwc_version") or "")
    wersja_wykazu = next((w for w in profile.wipwc.wersje if w.wersja == wersja), None)
    if wersja_wykazu is None:
        return NcRfgCertyfikatOdrzucony(
            der_ref=der_ref,
            rekord_ref=referencja,
            powod_pl=(
                f"wersja wykazu rekordu „{nazwa_rekordu}” (WiPWC {wersja or 'nieznana'}) spoza "
                "wersji warstwy WiPWC profilu — brak dowodu certyfikatu"
            ),
        )
    if data_umowy is not None:
        przed = (
            wersja_wykazu.akceptowana_od is not None and data_umowy < wersja_wykazu.akceptowana_od
        )
        po = wersja_wykazu.akceptowana_do is not None and data_umowy > wersja_wykazu.akceptowana_do
        if przed or po:
            return NcRfgCertyfikatOdrzucony(
                der_ref=der_ref,
                rekord_ref=referencja,
                powod_pl=(
                    f"data umowy przyłączeniowej {data_umowy.isoformat()} poza oknem akceptacji "
                    f"wykazu WiPWC {wersja} (od {wersja_wykazu.akceptowana_od or 'nieustalone'} "
                    f"do {wersja_wykazu.akceptowana_do or 'nieustalone'}) — brak dowodu "
                    "certyfikatu"
                ),
            )
    return DowodCertyfikatu(
        rekord_id=referencja,
        producent=str(parametry.get("manufacturer") or ""),
        model=str(parametry.get("model") or ""),
        numer_dokumentu=str(parametry.get("document_number") or ""),
        data_akceptacji=parametry.get("document_acceptance_date") or None,
        wersja_wipwc=wersja,
        wersja_wos=parametry.get("wos_version") or None,
        zakres_typow=zakres,
        warunek_waznosci=parametry.get("certificate_condition") or None,
        adres_zrodla=parametry.get("source_url") or None,
        podstawa=_podstawa_dowodu(profile, parametry, data_umowy),
    )


def build_ncrfg_module_input_from_generator(
    generator: Generator, *, voltage_kv: float, operator_id: str
) -> NcRfgPtpireeModuleInput:
    """Wejście solvera dla JEDNEGO generatora przekształtnikowego (patrz inwentarz w nagłówku).

    Wołający gwarantuje ``voltage_kv > 0`` i ``|p_mw| > 0`` (inaczej DER jest
    pominięty w ``build_ncrfg_module_inputs_from_enm`` — kontrakt solvera
    odrzuca zero/ujemne, a fabrykować nie wolno).
    """
    meta = _slownik(generator.meta)
    tabliczka = _slownik(generator.materialized_params)
    profile = _slownik(tabliczka.get("profiles"))
    p_max_mw = abs(generator.p_mw)

    droop_percent = _dodatnia(meta.get("frequency_droop_percent"))
    has_pf_droop = droop_percent is not None or _niepusty_tekst(profile.get("pf_curve_ref"))

    qu_slope = _dodatnia(meta.get("qu_slope_pu_per_pu"))
    control_mode = str(meta.get("control_mode") or "").upper()
    has_qu_curve = qu_slope is not None or control_mode in _QU_CONTROL_MODES

    cos_phi = _liczba(meta.get("cos_phi"))
    cos_phi_min = cos_phi if cos_phi is not None and 0 < cos_phi <= 1 else None

    q_min_mvar = _liczba(meta.get("q_min_mvar"))
    q_max_mvar = _liczba(meta.get("q_max_mvar"))
    deklaracje = generator.deklaracje_modulu or DeklaracjeModulu()

    return NcRfgPtpireeModuleInput(
        der_ref=generator.ref_id,
        der_name=nazwa_elementu(generator, "generators"),
        der_kind=_DER_KIND_Z_GEN_TYPE.get(generator.gen_type or "", "OTHER"),
        module_family="PPM",
        operator_id=operator_id,
        p_max_kw=mw_na_kw(p_max_mw),
        p_min_kw=deklaracje.p_min_kw,
        voltage_kv=voltage_kv,
        modul_istniejacy=generator.modul_istniejacy,
        data_umowy_przylaczeniowej=generator.data_umowy_przylaczeniowej,
        nastawy_zabezpieczen_modulu=generator.nastawy_zabezpieczen,
        has_lvrt_curve=_bool_flag(meta, "has_lvrt_curve")
        or _niepusty_tekst(profile.get("lvrt_curve_ref")),
        has_hvrt_curve=_bool_flag(meta, "has_hvrt_curve")
        or _niepusty_tekst(profile.get("hvrt_curve_ref")),
        has_pf_droop=has_pf_droop,
        has_qu_curve=has_qu_curve,
        has_dynamic_model=_niepusty_tekst(tabliczka.get("dynamic_model_ref")),
        has_scada_communication=deklaracje.has_scada_communication,
        has_disturbance_recorder=deklaracje.has_disturbance_recorder,
        active_power_control_enabled=deklaracje.active_power_control_enabled,
        stop_generation_enabled=deklaracje.stop_generation_enabled,
        reduction_generation_enabled=deklaracje.reduction_generation_enabled,
        island_operation_required=bool(deklaracje.island_operation_required),
        island_operation_capable=deklaracje.island_operation_capable,
        black_start_required=bool(deklaracje.black_start_required),
        black_start_capable=deklaracje.black_start_capable,
        power_oscillation_damping_required=bool(deklaracje.power_oscillation_damping_required),
        power_oscillation_damping_enabled=deklaracje.power_oscillation_damping_enabled,
        droop_percent=droop_percent,
        dead_band_hz=_nieujemna(meta.get("lfsm_deadband_hz")),
        ramp_rate_pct_per_min=deklaracje.ramp_rate_pct_per_min,
        cos_phi_min=cos_phi_min,
        q_range_pct_pn_min=(
            udzial_mocy_biernej_pu(q_min_mvar, p_max_mw) if q_min_mvar is not None else None
        ),
        q_range_pct_pn_max=(
            udzial_mocy_biernej_pu(q_max_mvar, p_max_mw) if q_max_mvar is not None else None
        ),
        reactive_current_gain=deklaracje.reactive_current_gain,
        p_recovery_time_s=deklaracje.p_recovery_time_s,
        harmonic_thdu_percent=deklaracje.harmonic_thdu_percent,
        cease_generation_time_s=deklaracje.cease_generation_time_s,
    )


#: Pola wejścia, których wartość NIGDY nie pochodzi z modelu: operator to wybór projektanta
#: (parametr trasy), rodzina modułu to stała mostu (``"PPM"``).
POLA_WEJSCIA_SPOZA_MODELU: frozenset[str] = frozenset({"operator_id", "module_family"})


def pola_wejscia_z_modelu(generator: Generator, wejscie: NcRfgPtpireeModuleInput) -> list[str]:
    """Pola ``wejscie`` (zbudowanego z ``generator`` przez
    ``build_ncrfg_module_input_from_generator``), których wartość pochodzi z DANYCH MODELU —
    reguła w nagłówku modułu (POCHODZENIE WARTOŚCI). Kolejność = kolejność pól kontraktu."""
    deklaracje = generator.deklaracje_modulu or DeklaracjeModulu()
    pola: list[str] = []
    for pole, definicja in NcRfgPtpireeModuleInput.model_fields.items():
        if pole in POLA_WEJSCIA_SPOZA_MODELU:
            continue
        wartosc = getattr(wejscie, pole)
        if pole in POLA_DEKLARACJI:
            z_modelu = getattr(deklaracje, pole) is not None
        elif definicja.annotation is bool:
            # Zdolność bez stanu „nieustalone" (kontrakt `bool`): most wyprowadza ją
            # z obecności wiązania albo deklaracji kreatora — `False` to brak danej.
            z_modelu = wartosc is True
        else:
            z_modelu = wartosc is not None
        if z_modelu:
            pola.append(pole)
    return pola


def build_ncrfg_module_inputs_from_enm(
    enm: EnergyNetworkModel, *, operator_id: str
) -> WejsciaZgodnosciZModelu:
    """Wszystkie źródła przekształtnikowe (DER) modelu jako wejścia solvera NC RfG + dowody
    certyfikatu wyprowadzone z tabliczek po stronie serwera.

    Kolejność deterministyczna (kolejność generatorów w modelu). DER bez dodatniej mocy albo
    bez szyny z napięciem NIE jest fabrykowany — trafia do ``pominiete`` z nazwanym powodem
    (ten sam słownik co blokada modułu w macierzy frontendu). Nieznany operator —
    ``FileNotFoundError`` z loadera profilu (wołający sprawdza operatora wcześniej).
    """
    profil = load_nc_rfg_profile(operator_id)
    bus_voltage = {bus.ref_id: bus.voltage_kv for bus in enm.buses}
    modules: list[NcRfgPtpireeModuleInput] = []
    pola_z_modelu: dict[str, list[str]] = {}
    pominiete: list[NcRfgDerPominiety] = []
    certyfikaty: dict[str, DowodCertyfikatu] = {}
    odrzucone: list[NcRfgCertyfikatOdrzucony] = []
    for generator in enm.generators:
        if generator.gen_type not in _INVERTER_GEN_TYPES:
            continue
        voltage_kv = bus_voltage.get(generator.bus_ref)
        powod: PowodPominieciaDer
        if abs(generator.p_mw) <= 0:
            powod = "brak_mocy"
        elif voltage_kv is None or voltage_kv <= 0:
            powod = "brak_napiecia"
        else:
            wejscie = build_ncrfg_module_input_from_generator(
                generator, voltage_kv=voltage_kv, operator_id=operator_id
            )
            modules.append(wejscie)
            pola_z_modelu[generator.ref_id] = pola_wejscia_z_modelu(generator, wejscie)
            weryfikacja = weryfikacja_certyfikatu(
                generator.ref_id,
                _slownik(generator.materialized_params),
                profile=profil,
                data_umowy=generator.data_umowy_przylaczeniowej,
            )
            if isinstance(weryfikacja, DowodCertyfikatu):
                certyfikaty[generator.ref_id] = weryfikacja
            elif weryfikacja is not None:
                odrzucone.append(weryfikacja)
            continue
        pominiete.append(
            NcRfgDerPominiety(
                der_ref=generator.ref_id,
                der_name=nazwa_elementu(generator, "generators"),
                powod=powod,
                powod_pl=_POWOD_POMINIECIA_PL[powod],
            )
        )
    return WejsciaZgodnosciZModelu(
        modules=modules,
        pola_z_modelu=pola_z_modelu,
        pominiete=pominiete,
        certyfikaty=certyfikaty,
        certyfikaty_odrzucone=odrzucone,
    )


def weryfikacje_certyfikatow_typu(
    enm: EnergyNetworkModel, catalog_item_id: str, *, operator_id: str
) -> list[tuple[str, DowodCertyfikatu | NcRfgCertyfikatOdrzucony | None]]:
    """Dowody certyfikatu urządzeń modelu związanych z TYPEM katalogowym (dokument studium).

    Tożsamość urządzenia w studium to typ katalogowy przekształtnika, nie moduł biegu —
    dopasowanie idzie po ``catalog_item_id`` tabliczki; kolejność = kolejność urządzeń w
    modelu. Każde urządzenie przechodzi TĘ SAMĄ weryfikację tabliczki × rejestr co moduły
    biegu zgodności.
    """
    profil = load_nc_rfg_profile(operator_id)
    return [
        (
            generator.ref_id,
            weryfikacja_certyfikatu(
                generator.ref_id,
                _slownik(generator.materialized_params),
                profile=profil,
                data_umowy=generator.data_umowy_przylaczeniowej,
            ),
        )
        for generator in enm.generators
        if _slownik(generator.materialized_params).get("catalog_item_id") == catalog_item_id
    ]
