"""
Katalog zrodel OZE i magazynow energii SN — dane znamionowe i inwerterowe.

ZRODLA DANYCH:
- Farmy PV: typowe instalacje 0.5-5 MW podlaczane do SN
- Farmy wiatrowe: turbiny 2-4 MW z inwerterami
- BESS: magazyny energii 0.5-5 MW / 1-10 MWh

KONWENCJE:
- un_kv [kV] — napiecie znamionowe stronypodlaczenia do SN
- sn_mva [MVA] — moc pozorna znamionowa inwertera
- pmax_mw [MW] — maksymalna moc czynna
- e_kwh [kWh] — pojemnosc energetyczna (tylko BESS)
- cosphi — zakres regulacji wspolczynnika mocy
"""

from typing import Any

from network_model.pochodne import mwh_na_kwh

from .mv_ptpiree_catalog import annotate_with_ptpiree_status
from .types import CATALOG_CONTRACT_VERSION, CatalogStatus, CatalogVerificationStatus

#: Proweniencja rekordow BEZ karty producenta (karta KATALOG-KOMPLETNY-PROWENIENCJA,
#: 2026-10-15). Rodziny „MV-DESIGN-PRO reference" i rekordy z marka, ale z liczbami
#: wyliczonymi regula (S_n = 1,1·P, |Q| = 0,36·P, cos φ 0,9) — to modele obliczeniowe,
#: nie produkty. Status REFERENCYJNY wyklucza je z doboru szablonow
#: (`dopuszczona_do_doboru_szablonu`).
ZRODLO_MODELU_REFERENCYJNEGO = (
    "Referencyjny model obliczeniowy MV-DESIGN-PRO — nie produkt: wartości są założeniami "
    "obliczeniowymi, nie danymi karty katalogowej; producent i model, jeśli podane, są "
    "wyłącznie etykietą"
)
_NOTA_MODELU_REFERENCYJNEGO = (
    "Referencyjny model obliczeniowy — nie egzemplarz producenta; wykluczony z doboru "
    "szablonów stacji. Parametry urządzenia potwierdza karta producenta przy doborze "
    "wykonawczym."
)
_DEFAULT_VERIFICATION_STATUS = CatalogVerificationStatus.REFERENCYJNY.value
_DEFAULT_CATALOG_STATUS = CatalogStatus.REFERENCYJNY_V1.value


#: Kopia dokumentu producenta odczytana z serwera STRONY TRZECIEJ (urząd, sprzedawca) —
#: treść jest dokumentem producenta, ale autentyczności i aktualności wersji nie
#: potwierdzono u producenta. Reguła (karta KATALOG-KOMPLETNY-PROWENIENCJA, runda 3):
#: status CZESCIOWO_ZWERYFIKOWANY / REFERENCYJNY_V1, pola karty ESTIMATED, pozycja
#: wykluczona z doboru szablonu (dobór wymaga ZWERYFIKOWANY — dokumentu z kanału
#: producenta). Źródło zaczyna się od tego prefiksu i cytuje adres kopii z datą dostępu.
PREFIKS_KOPII_KARTY = "Kopia karty producenta na serwerze strony trzeciej: "


def dopuszczona_do_doboru_szablonu(params: dict[str, Any]) -> bool:
    """Jedno zrodlo prawdy: czy pozycja przeksztaltnika moze zostac dobrana przez
    szablon stacji. Dopuszczona jest WYLACZNIE pozycja z karta producenta
    (`verification_status == ZWERYFIKOWANY`); model referencyjny, deklaracja bez
    dokumentu i pozycja czesciowo zweryfikowana — nie."""
    return params.get("verification_status") == CatalogVerificationStatus.ZWERYFIKOWANY.value


def _quality(
    note: str,
    *,
    source_reference: str,
    verification_status: str = _DEFAULT_VERIFICATION_STATUS,
    catalog_status: str = _DEFAULT_CATALOG_STATUS,
) -> dict[str, Any]:
    return {
        "verification_status": verification_status,
        "source_reference": source_reference,
        "catalog_status": catalog_status,
        "contract_version": CATALOG_CONTRACT_VERSION,
        "verification_note": note,
    }


def _apply_quality_defaults(record: dict[str, Any]) -> None:
    """Uzupelnia statusy domyslne; ZRODLA nie uzupelnia — rekord bez `source_reference`
    jest bledem katalogu (nie ma „zrodla domyslnego")."""
    params = record.setdefault("params", {})
    if not params.get("source_reference"):
        raise ValueError(
            f"catalog.source_missing: pozycja '{record.get('id')}' nie ma źródła danych "
            "(source_reference)"
        )
    params.setdefault("verification_status", _DEFAULT_VERIFICATION_STATUS)
    params.setdefault("catalog_status", _DEFAULT_CATALOG_STATUS)
    params.setdefault("contract_version", CATALOG_CONTRACT_VERSION)
    params.setdefault("verification_note", _NOTA_MODELU_REFERENCYJNEGO)


def _converter_record(
    *,
    item_id: str,
    name: str,
    kind: str,
    un_kv: float,
    sn_mva: float,
    pmax_mw: float,
    qmin_mvar: float | None,
    qmax_mvar: float | None,
    cosphi_min: float | None,
    cosphi_max: float | None,
    manufacturer: str,
    model: str,
    source_reference: str,
    verification_status: str = _DEFAULT_VERIFICATION_STATUS,
    catalog_status: str = _DEFAULT_CATALOG_STATUS,
    e_kwh: float | None = None,
    control_mode: str | None = None,
    grid_code: str | None = None,
    dynamic_profile_id: str | None = None,
    note: str = _NOTA_MODELU_REFERENCYJNEGO,
    # Inverter datasheet-card ("karta falownika") optional fields. All keyword,
    # all default to absent so existing records stay byte-identical.
    p_installed_mw: float | None = None,
    pn_ac_mw: float | None = None,
    p_connection_mw: float | None = None,
    p_achievable_mw: float | None = None,
    current_loop_bandwidth_hz: float | None = None,
    voltage_loop_bandwidth_hz: float | None = None,
    pll_bandwidth_hz: float | None = None,
    control_delay_ms: float | None = None,
    filter_l_pu: float | None = None,
    filter_r_pu: float | None = None,
    card_field_status: dict[str, dict[str, Any]] | None = None,
    # Optional P-Q capability curve: ascending-by-p_mw points
    # (p_mw, q_min_mvar, q_max_mvar). Added to params only when provided.
    pq_curve: tuple[tuple[float, float, float], ...] | None = None,
    # Optional flicker emission coefficient c(psi_k) [-], > 0. Added to params
    # only when provided so records without it stay byte-identical.
    flicker_c: float | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {
        "kind": kind,
        "un_kv": un_kv,
        "sn_mva": sn_mva,
        "pmax_mw": pmax_mw,
        "qmin_mvar": qmin_mvar,
        "qmax_mvar": qmax_mvar,
        "cosphi_min": cosphi_min,
        "cosphi_max": cosphi_max,
        "manufacturer": manufacturer,
        "model": model,
        **_quality(
            note,
            source_reference=source_reference,
            verification_status=verification_status,
            catalog_status=catalog_status,
        ),
    }
    if e_kwh is not None:
        params["e_kwh"] = e_kwh
    if control_mode is not None:
        params["control_mode"] = control_mode
    if grid_code is not None:
        params["grid_code"] = grid_code
    if dynamic_profile_id is not None:
        params["dynamic_profile_id"] = dynamic_profile_id
    # Card schema fields — added to params only when explicitly provided so that
    # converters built without them serialize byte-identically (ConverterType
    # round-trips absent keys to None).
    for card_key, card_value in (
        ("p_installed_mw", p_installed_mw),
        ("pn_ac_mw", pn_ac_mw),
        ("p_connection_mw", p_connection_mw),
        ("p_achievable_mw", p_achievable_mw),
        ("current_loop_bandwidth_hz", current_loop_bandwidth_hz),
        ("voltage_loop_bandwidth_hz", voltage_loop_bandwidth_hz),
        ("pll_bandwidth_hz", pll_bandwidth_hz),
        ("control_delay_ms", control_delay_ms),
        ("filter_l_pu", filter_l_pu),
        ("filter_r_pu", filter_r_pu),
    ):
        if card_value is not None:
            params[card_key] = card_value
    if card_field_status is not None:
        params["card_field_status"] = card_field_status
    if pq_curve is not None:
        params["pq_curve"] = [
            [float(p), float(q_min), float(q_max)] for p, q_min, q_max in pq_curve
        ]
    if flicker_c is not None:
        params["flicker_c"] = flicker_c
    return {"id": item_id, "name": name, "params": params}


# Literature reference for typical inverter-based-generator (IBG) controller
# bandwidths. Public datasheets virtually never publish these, so the reference
# cards carry TYPICAL-CLASS values explicitly tagged ESTIMATED (never DATASHEET)
# with this citation, per the paramount "no fabrication" rule.
_BANDWIDTH_LITERATURE_REF = (
    "Typowe pasma regulatorów IBG (oszacowanie): A. Yazdani, R. Iravani, "
    "'Voltage-Sourced Converters in Power Systems', Wiley/IEEE 2010; "
    "IEEE Std 1547-2018"
)

# Flicker emission coefficient c(psi_k): methodology reference. Public inverter
# datasheets rarely publish c(psi_k), so the reference cards carry a conservative
# typical-class ANALYTICAL value tagged ESTIMATED (never DATASHEET) with this
# citation, to be confirmed against the device grid-compliance certificate.
_FLICKER_LITERATURE_REF = (
    "Współczynnik emisji migotania c(psi_k) — wartość analityczna klasy "
    "(konserwatywnie), do potwierdzenia kartą zgodności sieciowej urządzenia; "
    "metodyka pomiaru: IEC 61400-21-1:2019; ocena emisji: IEC/TR 61000-3-7:2008"
)


def _zrodlo_deklarowane(dokument: str) -> str:
    return (
        f"Deklarowane: {dokument} — dokument nie jest dołączony do repozytorium "
        "(niezweryfikowany)"
    )


def _reference_card_field_status(
    *,
    datasheet_ref: str,
    rating_fields: tuple[str, ...],
    power_hierarchy_fields: tuple[str, ...] = (),
    bandwidth_fields: tuple[str, ...] = (),
    flicker_fields: tuple[str, ...] = (),
    assumption_fields: dict[str, str] | None = None,
) -> dict[str, dict[str, Any]]:
    """Build a per-card data-quality override declaring explicit provenance.

    Ratings / power-hierarchy from a DECLARED datasheet that is not attached to the
    repository => ESTIMATED (``source_ref`` names the declared document as such; karta
    KATALOG-KOMPLETNY-PROWENIENCJA: a declaration without the document is not
    datasheet-grade). Fields that are assumptions of the record (DC oversizing,
    storage capacity) => ESTIMATED with the assumption named. Controller bandwidths => ESTIMATED with a
    literature citation (never DATASHEET — anti-fabrication). Flicker coefficient
    => ESTIMATED (typical-class analytical value, methodology citation). The
    returned map is the serialized {field_name -> CardFieldStatus.to_dict()} form
    consumed by solver_input.provenance.resolve_card_field_quality_map.
    """
    status: dict[str, dict[str, Any]] = {}
    for name in rating_fields + power_hierarchy_fields:
        status[name] = {
            "field_name": name,
            "quality": "ESTIMATED",
            "source_ref": _zrodlo_deklarowane(datasheet_ref),
            "note": "wartość z deklarowanej karty technicznej — dokument niedołączony, "
            "niezweryfikowany",
        }
    for name, nota in (assumption_fields or {}).items():
        status[name] = {"field_name": name, "quality": "ESTIMATED", "note": nota}
    for name in bandwidth_fields:
        status[name] = {
            "field_name": name,
            "quality": "ESTIMATED",
            "source_ref": _BANDWIDTH_LITERATURE_REF,
            "note": "oszacowanie pasma regulatora; wartość typowa dla klasy, nie z karty technicznej",
        }
    for name in flicker_fields:
        status[name] = {
            "field_name": name,
            "quality": "ESTIMATED",
            "source_ref": _FLICKER_LITERATURE_REF,
            "note": "wartość analityczna klasy (konserwatywnie), do potwierdzenia kartą zgodności",
        }
    return status


# Rating / identity fields that a real datasheet pins down (=> DATASHEET).
_REFERENCE_RATING_FIELDS: tuple[str, ...] = (
    "un_kv",
    "sn_mva",
    "pmax_mw",
    "qmin_mvar",
    "qmax_mvar",
    "cosphi_min",
    "cosphi_max",
    "manufacturer",
    "model",
)
# Power-hierarchy fields populated on the reference cards (=> DATASHEET).
_REFERENCE_POWER_HIERARCHY_FIELDS: tuple[str, ...] = ("pn_ac_mw",)
#: Moc zainstalowana DC: nadwymiarowanie DC/AC to zalozenie rekordu, nie dana karty AC.
_NOTA_P_INSTALLED = (
    "moc zainstalowana DC — założenie nadwymiarowania DC/AC przyjęte w rekordzie, " "nie dana karty"
)
# Controller-bandwidth + converter-filter fields carried as typical-class
# estimates (=> ESTIMATED). The filter L/R join this block because, like the
# bandwidths, public datasheets do not publish them and the reference cards carry
# typical VSC-design values (never DATASHEET) with the same literature citation.
_REFERENCE_BANDWIDTH_FIELDS: tuple[str, ...] = (
    "current_loop_bandwidth_hz",
    "voltage_loop_bandwidth_hz",
    "pll_bandwidth_hz",
    "control_delay_ms",
    "filter_l_pu",
    "filter_r_pu",
)


_NN_INVERTER_VOLTAGES_KV = (0.4, 0.5, 0.69, 0.8, 1.0, 3.15, 6.0, 6.3)
_PV_POWER_MW = (0.5, 1.0, 2.0, 3.0, 5.0)
_BESS_POWER_MW = (0.5, 1.0, 2.0, 3.0, 5.0, 10.0)
_FW_POWER_MW = (2.0, 3.0, 4.0, 5.0, 6.0)


def _catalog_token(value: float) -> str:
    return f"{value:g}".replace(".", "p")


def _reactive_limit(power_mw: float) -> float:
    return round(power_mw * 0.36, 2)


def _sn_mva_for_power(power_mw: float) -> float:
    return round(power_mw * 1.1, 3)


def _build_nn_converter_family(
    *,
    kind: str,
    voltage_kv: float,
    powers_mw: tuple[float, ...],
    manufacturer: str,
    model_prefix: str,
    name_prefix: str,
    energy_hours: float | None = None,
) -> list[dict[str, Any]]:
    voltage_token = _catalog_token(voltage_kv)
    records: list[dict[str, Any]] = []
    for power_mw in powers_mw:
        power_token = _catalog_token(power_mw)
        q_limit = _reactive_limit(power_mw)
        energy_kwh = mwh_na_kwh(power_mw * energy_hours) if energy_hours is not None else None
        records.append(
            _converter_record(
                item_id=f"conv-{kind.lower()}-nn-{power_token}mw-{voltage_token}kv",
                source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
                name=f"{name_prefix} {power_mw:g} MW / {voltage_kv:g} kV nN",
                kind=kind,
                un_kv=voltage_kv,
                sn_mva=_sn_mva_for_power(power_mw),
                pmax_mw=power_mw,
                qmin_mvar=-q_limit,
                qmax_mvar=q_limit,
                cosphi_min=0.9,
                cosphi_max=1.0,
                manufacturer=manufacturer,
                model=f"{model_prefix} {power_mw:g} MW {voltage_kv:g} kV",
                e_kwh=energy_kwh,
                control_mode="Q_U_DROOP",
                grid_code="NC_RfG",
                note=(
                    "Referencyjny profil nN dla stacji SN/nN z transformatorem "
                    "blokowym; parametry producenta należy potwierdzić przy doborze wykonawczym."
                ),
            )
        )
    return records


CONVERTER_PV_NN: list[dict[str, Any]] = [
    record
    for _voltage in _NN_INVERTER_VOLTAGES_KV
    for record in _build_nn_converter_family(
        kind="PV",
        voltage_kv=_voltage,
        powers_mw=_PV_POWER_MW,
        manufacturer="MV-DESIGN-PRO reference",
        model_prefix="PV central inverter",
        name_prefix="Falownik PV",
    )
]

CONVERTER_PV_NN.extend(
    [
        _converter_record(
            item_id="pv_inv_catalog_50",
            source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
            name="Pakiet katalogowy PV 50 50 kW / 0.4 kV",
            kind="PV",
            un_kv=0.4,
            sn_mva=_sn_mva_for_power(0.05),
            pmax_mw=0.05,
            qmin_mvar=-_reactive_limit(0.05),
            qmax_mvar=_reactive_limit(0.05),
            cosphi_min=0.9,
            cosphi_max=1.0,
            manufacturer="MV-DESIGN-PRO",
            model="PV 50",
            control_mode="Q_U_DROOP",
            grid_code="NC_RfG_typ_A",
        ),
        _converter_record(
            item_id="pv_inv_sma_2500",
            source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
            name="SMA Sunny Central 2500-EV 2.5 MW / 0.69 kV",
            kind="PV",
            un_kv=0.69,
            sn_mva=_sn_mva_for_power(2.5),
            pmax_mw=2.5,
            qmin_mvar=-_reactive_limit(2.5),
            qmax_mvar=_reactive_limit(2.5),
            cosphi_min=0.9,
            cosphi_max=1.0,
            manufacturer="SMA",
            model="Sunny Central 2500-EV",
            control_mode="Q_U_DROOP",
            grid_code="NC_RfG_typ_C",
        ),
        _converter_record(
            item_id="pv_inv_huawei_185",
            source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
            name="Huawei SUN2000-185KTL 185 kW / 0.4 kV",
            kind="PV",
            un_kv=0.4,
            sn_mva=_sn_mva_for_power(0.185),
            pmax_mw=0.185,
            qmin_mvar=-_reactive_limit(0.185),
            qmax_mvar=_reactive_limit(0.185),
            cosphi_min=0.9,
            cosphi_max=1.0,
            manufacturer="HUAWEI",
            model="SUN2000-185KTL",
            control_mode="Q_U_DROOP",
            grid_code="NC_RfG_typ_B",
        ),
        _converter_record(
            item_id="pv_inv_system_1000",
            source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
            name="Pakiet katalogowy PV 1000 1 MW / 0.69 kV",
            kind="PV",
            un_kv=0.69,
            sn_mva=_sn_mva_for_power(1.0),
            pmax_mw=1.0,
            qmin_mvar=-_reactive_limit(1.0),
            qmax_mvar=_reactive_limit(1.0),
            cosphi_min=0.9,
            cosphi_max=1.0,
            manufacturer="MV-DESIGN-PRO",
            model="PV 1000",
            control_mode="Q_U_DROOP",
            grid_code="NC_RfG_typ_B",
        ),
        _converter_record(
            item_id="pv_inv_fimer_3000",
            source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
            name="FIMER PVS-3000-CSE 3 MW / 0.69 kV",
            kind="PV",
            un_kv=0.69,
            sn_mva=_sn_mva_for_power(3.0),
            pmax_mw=3.0,
            qmin_mvar=-_reactive_limit(3.0),
            qmax_mvar=_reactive_limit(3.0),
            cosphi_min=0.9,
            cosphi_max=1.0,
            manufacturer="FIMER",
            model="PVS-3000-CSE",
            control_mode="Q_U_DROOP",
            grid_code="NC_RfG_typ_C",
        ),
    ]
)


# =============================================================================
# KARTY PRODUCENTOW — FALOWNIKI PV PO STRONIE nN (karta KATALOG-KOMPLETNY-PROWENIENCJA)
# =============================================================================
#
# Kazda wartosc z karty katalogowej producenta (cytat z adresem i data dostepu w
# `source_reference`, per pole w `card_field_status`). Moc bierna: karty podaja zakres
# cos φ 0,8 przewzbudzenie – 0,8 niedowzbudzenie PRZY MOCY ZNAMIONOWEJ S_n (SMA: „Nominal AC
# power at cos φ = 0,8" = 0,8·S_n), wiec |Q| = 0,6·S_n — wartosc wpisana liczbowo.
# Tryb regulacji (`control_mode`) to nastawa projektu, nie dana karty — oznaczony
# SYSTEM_DEFAULT. Pola, ktorych karty nie podaja (k_sc, kod sieciowy, pasma regulatorow),
# pozostaja puste.

_ZRODLO_SMA_SC2200 = (
    "SMA Solar Technology AG, karta „Sunny Central 2200 / 2475” SC2200-2475-DS-en-60, "
    "tabela „Technical data”; https://files.sma.de/downloads/SC2200-2475-DS-en-60.pdf "
    "(dostęp 2026-10-15)"
)
_ZRODLO_SMA_SC_UP = (
    "SMA Solar Technology AG, karta „SC 4000 UP / SC 4200 UP / SC 4400 UP / SC 4600 UP” "
    "SC4xxxUP-DS-en-33, tabela „Technical data” (str. 2–3); "
    "https://files.sma.de/downloads/SC4xxxUP-DS-en-33.pdf (dostęp 2026-10-15)"
)
_ZRODLO_HUAWEI_330KTL = (
    "Huawei Digital Power, „SUN2000-330KTL-H1/H2 Technical Specification”, kolumna "
    "SUN2000-330KTL-H1; https://solar.huawei.com/en/products/SUN2000-330KTL-H1-H2/specs "
    "(dostęp 2026-10-15)"
)

_POLA_KARTY_PV: tuple[str, ...] = (
    "un_kv",
    "sn_mva",
    "pmax_mw",
    "qmin_mvar",
    "qmax_mvar",
    "cosphi_min",
    "cosphi_max",
    "manufacturer",
    "model",
)


def _status_pol_karty(
    zrodlo: str, *, pola: tuple[str, ...], nota_q: str
) -> dict[str, dict[str, Any]]:
    status: dict[str, dict[str, Any]] = {
        name: {"field_name": name, "quality": "DATASHEET", "source_ref": zrodlo} for name in pola
    }
    for name in ("qmin_mvar", "qmax_mvar"):
        status[name]["note"] = nota_q
    status["control_mode"] = {
        "field_name": "control_mode",
        "quality": "SYSTEM_DEFAULT",
        "note": "tryb regulacji mocy biernej jest nastawą projektu; karta podaje zdolność "
        "(regulowany cos φ), nie tryb",
    }
    return status


def _karta_pv(
    *,
    item_id: str,
    name: str,
    model: str,
    manufacturer: str,
    un_kv: float,
    sn_mva: float,
    pmax_mw: float,
    q_mvar: float,
    zrodlo: str,
    nota: str,
    nota_q: str,
    pn_ac_mw: float | None = None,
) -> dict[str, Any]:
    pola = _POLA_KARTY_PV + (("pn_ac_mw",) if pn_ac_mw is not None else ())
    return _converter_record(
        item_id=item_id,
        name=name,
        kind="PV",
        un_kv=un_kv,
        sn_mva=sn_mva,
        pmax_mw=pmax_mw,
        qmin_mvar=-q_mvar,
        qmax_mvar=q_mvar,
        cosphi_min=0.8,
        cosphi_max=1.0,
        manufacturer=manufacturer,
        model=model,
        source_reference=zrodlo,
        verification_status=CatalogVerificationStatus.ZWERYFIKOWANY.value,
        catalog_status=CatalogStatus.PRODUKCYJNY_V1.value,
        control_mode="STALY_COS_PHI",
        note=nota,
        pn_ac_mw=pn_ac_mw,
        card_field_status=_status_pol_karty(zrodlo, pola=pola, nota_q=nota_q),
    )


_NOTA_Q_SMA = (
    "|Q| = 0,6·S_n: karta podaje moc czynną przy cos φ = 0,8 równą 0,8·S_n "
    "(„Nominal AC power at cos φ = 0.8”)"
)

CONVERTER_PV_NN_KARTY_PRODUCENTOW: list[dict[str, Any]] = [
    _karta_pv(
        item_id="conv-pv-nn-sma-sc2200-0p385kv",
        name="SMA Sunny Central 2200 2,2 MVA / 0,385 kV",
        model="SC 2200-10",
        manufacturer="SMA",
        un_kv=0.385,
        sn_mva=2.2,
        pmax_mw=2.2,
        q_mvar=1.32,
        zrodlo=_ZRODLO_SMA_SC2200,
        nota=(
            "Karta: S_n = 2200 kVA przy cos φ = 1 (35 °C; 2000 kVA przy 50 °C), 1760 kW przy "
            "cos φ = 0,8, U_n = 385 V (308–462 V), I_AC,nom = I_AC,max = 3300 A, cos φ "
            "regulowany 0,8 przewzbudzenie – 0,8 niedowzbudzenie."
        ),
        nota_q=_NOTA_Q_SMA,
    ),
    _karta_pv(
        item_id="conv-pv-nn-sma-sc2475-0p434kv",
        name="SMA Sunny Central 2475 2,475 MVA / 0,434 kV",
        model="SC 2475-10",
        manufacturer="SMA",
        un_kv=0.434,
        sn_mva=2.475,
        pmax_mw=2.475,
        q_mvar=1.485,
        zrodlo=_ZRODLO_SMA_SC2200,
        nota=(
            "Karta: S_n = 2475 kVA przy cos φ = 1 (35 °C; 2250 kVA przy 50 °C), 1980 kW przy "
            "cos φ = 0,8, U_n = 434 V (347–521 V), I_AC,nom = I_AC,max = 3300 A, cos φ "
            "regulowany 0,8 przewzbudzenie – 0,8 niedowzbudzenie."
        ),
        nota_q=_NOTA_Q_SMA,
    ),
    *[
        _karta_pv(
            item_id=f"conv-pv-nn-sma-sc{kva}up-{napiecie_token}kv",
            name=f"SMA Sunny Central {kva} UP {sn_mva:g} MVA / {un_kv:g} kV",
            model=f"SC {kva} UP",
            manufacturer="SMA",
            un_kv=un_kv,
            sn_mva=sn_mva,
            pmax_mw=sn_mva,
            q_mvar=q_mvar,
            zrodlo=_ZRODLO_SMA_SC_UP,
            nota=(
                f"Karta: S_n = {kva} kVA przy cos φ = 1 (35 °C), {p08_kw} kW przy cos φ = 0,8, "
                f"U_n = {un_v} V, I_AC,nom = 3850 A (35 °C), cos φ regulowany 0,8 "
                "przewzbudzenie – 0,8 niedowzbudzenie. Moc > 3150 kVA: transformator blokowy "
                "wymaga pozycji powyżej typoszeregu normatywnego (zablokowany danymi)."
            ),
            nota_q=_NOTA_Q_SMA,
        )
        for kva, sn_mva, un_v, un_kv, napiecie_token, p08_kw, q_mvar in (
            (4000, 4.0, 600, 0.6, "0p6", 3200, 2.4),
            (4200, 4.2, 630, 0.63, "0p63", 3360, 2.52),
            (4400, 4.4, 660, 0.66, "0p66", 3520, 2.64),
            (4600, 4.6, 690, 0.69, "0p69", 3680, 2.76),
        )
    ],
    _karta_pv(
        item_id="conv-pv-nn-huawei-sun2000-330ktl-h1-0p8kv",
        name="Huawei SUN2000-330KTL-H1 330 kVA / 0,8 kV",
        model="SUN2000-330KTL-H1",
        manufacturer="HUAWEI",
        un_kv=0.8,
        sn_mva=0.33,
        pmax_mw=0.33,
        q_mvar=0.198,
        pn_ac_mw=0.3,
        zrodlo=_ZRODLO_HUAWEI_330KTL,
        nota=(
            "Karta: P_n,AC = 300 kW, S_max = 330 kVA, P_max (cos φ = 1) = 330 kW, U_n = 800 V "
            "(3W + PE), I_n = 216,6 A, I_max = 238,2 A, cos φ regulowany 0,8 LG – 0,8 LD."
        ),
        nota_q=(
            "|Q| = 0,6·S_max: zakres cos φ 0,8 LG – 0,8 LD przy mocy pozornej maksymalnej "
            "(interpretacja — karta nie podaje Q wprost)"
        ),
    ),
]
_ZRODLO_SMA_STP_3AV_40 = (
    "SMA Solar Technology AG, instrukcja online „Sunny Tripower 8.0 / 10.0” "
    "(STP8.0-3AV-40 / STP10.0-3AV-40), rozdział „Technical data”, tabela „AC output”; "
    "https://manuals.sma.de/STP8-10-3AV-40/en-US/4176094859.html (dostęp 2026-10-15)"
)

CONVERTER_PV_NN_KARTY_PRODUCENTOW.extend(
    [
        _karta_pv(
            item_id=f"conv-pv-nn-sma-stp{token}-3av-40-0p4kv",
            name=f"SMA Sunny Tripower {kw:g}.0 {kw:g} kVA / 0,4 kV",
            model=f"STP{kw:g}.0-3AV-40",
            manufacturer="SMA",
            un_kv=0.4,
            sn_mva=sn_mva,
            pmax_mw=sn_mva,
            q_mvar=q_mvar,
            zrodlo=_ZRODLO_SMA_STP_3AV_40,
            nota=(
                f"Instrukcja: moc znamionowa {w} W (230 V, 50 Hz), maksymalna i znamionowa "
                f"moc pozorna przy cos φ = 1 {w} VA, sieć 3/N/PE 230 V / 400 V (także "
                f"220/380 i 240/415 V; zakres 180–280 V), prąd znamionowy przy 230 V "
                f"3 × {i_a} A, współczynnik mocy przy mocy znamionowej 1, cos φ regulowany "
                "0,8 przewzbudzenie – 0,8 niedowzbudzenie."
            ),
            nota_q=(
                "|Q| = 0,6·S_n: cos φ regulowany 0,8 przewzbudzenie – 0,8 niedowzbudzenie "
                "w granicy mocy pozornej S_n (przy mocy znamionowej cos φ = 1 — moc bierną "
                "uzyskuje się kosztem mocy czynnej; interpretacja, instrukcja nie podaje Q "
                "wprost)"
            ),
        )
        for token, kw, w, sn_mva, q_mvar, i_a in (
            ("8p0", 8.0, 8000, 0.008, 0.0048, "11,6"),
            ("10p0", 10.0, 10000, 0.01, 0.006, "14,5"),
        )
    ]
)
CONVERTER_PV_NN.extend(CONVERTER_PV_NN_KARTY_PRODUCENTOW)


# =============================================================================
# KOPIE KART PRODUCENTOW (serwer strony trzeciej) — status CZESCIOWO_ZWERYFIKOWANY
# =============================================================================

_NOTA_POLA_KOPII = (
    "wartość z kopii karty producenta na serwerze strony trzeciej — autentyczność "
    "i aktualność wersji niepotwierdzone u producenta"
)


def _status_pol_kopii(zrodlo: str, *, pola: tuple[str, ...]) -> dict[str, dict[str, Any]]:
    return {
        name: {
            "field_name": name,
            "quality": "ESTIMATED",
            "source_ref": zrodlo,
            "note": _NOTA_POLA_KOPII,
        }
        for name in pola
    }


_ZRODLO_FRONIUS_SYMO_10 = (
    PREFIKS_KOPII_KARTY + "Fronius International, „Technical data Fronius Symo "
    "10.0-3-M-OS”, tabela „OUTPUT DATA”; kopia u sprzedawcy: "
    "https://www.sparkydirect.com.au/assets/brochures/SYMO10.0-3-M.pdf (dostęp 2026-10-15)"
)

CONVERTER_PV_NN_KOPIE_KART: list[dict[str, Any]] = [
    _converter_record(
        item_id="conv-pv-nn-fronius-symo-10p0-3-m-0p4kv",
        name="Fronius Symo 10.0-3-M 10 kVA / 0,4 kV",
        kind="PV",
        un_kv=0.4,
        sn_mva=0.01,
        pmax_mw=0.01,
        # cos φ 0–1 ind./poj. przy S_max = 10 000 VA: |Q| do S_max (interpretacja — karta
        # nie podaje Q wprost; cos φ = 0 oznacza całą moc pozorną jako bierną). Pole
        # `cosphi_min` kontraktu przyjmuje (0; 1] — dolna granica karty (0) jest więc
        # niesiona przez zakres Q, a pole zostaje puste (bez zastępczej liczby).
        qmin_mvar=-0.01,
        qmax_mvar=0.01,
        cosphi_min=None,
        cosphi_max=1.0,
        manufacturer="Fronius",
        model="Symo 10.0-3-M",
        source_reference=_ZRODLO_FRONIUS_SYMO_10,
        verification_status=CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY.value,
        catalog_status=CatalogStatus.REFERENCYJNY_V1.value,
        control_mode="STALY_COS_PHI",
        note=(
            "Kopia karty: P_ac,r = 10 000 W, moc maksymalna 10 000 VA, I_ac,nom = 14,4 A, sieć "
            "3-NPE 400 V / 230 V albo 380 V / 220 V (+20 % / −30 %), 50/60 Hz, cos φ 0–1 "
            "ind./poj. Karta dotyczy wariantu 10.0-3-M-OS (rynek australijski) — przyjęcie tych "
            "danych dla wersji standardowej 10.0-3-M jest interpretacją, niepotwierdzoną. "
            "Wykluczona z doboru szablonu do czasu karty z kanału producenta."
        ),
        card_field_status={
            **_status_pol_kopii(
                _ZRODLO_FRONIUS_SYMO_10,
                pola=tuple(p for p in _POLA_KARTY_PV if p != "cosphi_min"),
            ),
            "control_mode": {
                "field_name": "control_mode",
                "quality": "SYSTEM_DEFAULT",
                "note": "tryb regulacji mocy biernej jest nastawą projektu, nie daną karty",
            },
        },
    ),
]
CONVERTER_PV_NN.extend(CONVERTER_PV_NN_KOPIE_KART)


CONVERTER_BESS_NN: list[dict[str, Any]] = [
    record
    for _voltage in _NN_INVERTER_VOLTAGES_KV
    for record in _build_nn_converter_family(
        kind="BESS",
        voltage_kv=_voltage,
        powers_mw=_BESS_POWER_MW,
        manufacturer="MV-DESIGN-PRO reference",
        model_prefix="BESS PCS",
        name_prefix="PCS BESS",
        energy_hours=2.0,
    )
]

# Rekord `bess_pcs_sma_2200` (SMA Sunny Central Storage 2200) USUNIETY (karta
# KATALOG-KOMPLETNY-PROWENIENCJA, 2026-10-15): napiecie 0,69 kV, cos φ 0,9 i pojemnosc
# 4400 kWh nie pochodzily z karty (karta SCS1900-2900-DS-en-20: 385 V, Q <= 60 % S,
# praca czterokwadrantowa, pojemnosci magazynu nie podaje). Poprawny rekord PCS jest
# ZABLOKOWANY danymi: wyprowadzenie typu BESS (`repository._derive_bess_records`)
# wymaga `e_kwh` w rekordzie przeksztaltnika, a karta PCS go nie podaje — pojemnosc
# nalezy do osobnego pakietu baterii (katalog BATERIA_BESS). Wpisanie liczby
# byloby fabrykacja.
CONVERTER_BESS_NN.extend(
    [
        _converter_record(
            item_id="bess_pcs_abb_500",
            source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
            name="ABB PCS100 ESS 500 kW / 0.4 kV",
            kind="BESS",
            un_kv=0.4,
            sn_mva=_sn_mva_for_power(0.5),
            pmax_mw=0.5,
            qmin_mvar=-_reactive_limit(0.5),
            qmax_mvar=_reactive_limit(0.5),
            cosphi_min=0.9,
            cosphi_max=1.0,
            manufacturer="ABB",
            model="PCS100 ESS",
            e_kwh=1000.0,
            control_mode="Q_U_DROOP",
            grid_code="NC_RfG_typ_B",
        ),
    ]
)


_ZRODLO_TESLA_MEGAPACK_2XL = (
    PREFIKS_KOPII_KARTY + "Tesla, Inc., „Megapack 2 XL Datasheet”, Rev. 2.0, "
    "2025-11-13, tabele „POWER AND ENERGY” i „ELECTRICAL” (str. 1); kopia w dokumentacji "
    "hrabstwa Cayuga: https://ny-cayugacounty.civicplus.com/DocumentCenter/View/33252/"
    "Tesla-Megapack-Datasheet (dostęp 2026-10-15)"
)
_POLA_KARTY_MEGAPACK: tuple[str, ...] = (
    "un_kv",
    "sn_mva",
    "pmax_mw",
    "e_kwh",
    "manufacturer",
    "model",
)

#: Tesla Megapack 2 XL — zintegrowany kontener (przekształtnik + bateria), więc moc,
#: energia i moc pozorna falownika są w JEDNYM rekordzie przekształtnika BESS. Karta nie
#: podaje zakresu mocy biernej ani cos φ — pola puste (nie zgadywane). Napięcie 480 V AC
#: (moc pozorna falownika konfigurowalna od 400 kVA co 50 kVA; w rekordzie maksimum karty).
CONVERTER_BESS_NN_KOPIE_KART: list[dict[str, Any]] = [
    _converter_record(
        item_id=f"conv-bess-nn-tesla-megapack-2xl-{token}-0p48kv",
        name=f"Tesla Megapack 2 XL {opis} {p_kw} kW / {e_kwh} kWh / 0,48 kV",
        kind="BESS",
        un_kv=0.48,
        sn_mva=sn_mva,
        pmax_mw=pmax_mw,
        qmin_mvar=None,
        qmax_mvar=None,
        cosphi_min=None,
        cosphi_max=None,
        manufacturer="Tesla",
        model=f"Megapack 2 XL {opis}",
        source_reference=_ZRODLO_TESLA_MEGAPACK_2XL,
        verification_status=CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY.value,
        catalog_status=CatalogStatus.REFERENCYJNY_V1.value,
        e_kwh=float(e_kwh),
        note=(
            f"Kopia karty (Rev. 2.0): konfiguracja {opis} — moc AC {p_kw} kW, energia "
            f"nominalna {e_kwh} kWh (25 °C), moc pozorna falownika maks. {s_kva} kVA "
            "(skalowalna od 400 kVA co 50 kVA), 480 V AC 3-faz., 50 lub 60 Hz. Karta nie "
            "podaje zakresu mocy biernej ani cos φ (pola puste). Wykluczona z doboru "
            "szablonu do czasu karty z kanału producenta."
        ),
        card_field_status=_status_pol_kopii(_ZRODLO_TESLA_MEGAPACK_2XL, pola=_POLA_KARTY_MEGAPACK),
    )
    for token, opis, p_kw, pmax_mw, e_kwh, s_kva, sn_mva in (
        ("2h-c010", "2-Hour C010/C011", 1927, 1.927, 3854, 2400, 2.4),
        ("4h-c010", "4-Hour C010/C011", 979, 0.979, 3916, 1320, 1.32),
        ("4h-c012", "4-Hour C012", 1075, 1.075, 4300, 1320, 1.32),
    )
]
CONVERTER_BESS_NN.extend(CONVERTER_BESS_NN_KOPIE_KART)


CONVERTER_WIND_NN: list[dict[str, Any]] = [
    record
    for _voltage in _NN_INVERTER_VOLTAGES_KV
    for record in _build_nn_converter_family(
        kind="WIND",
        voltage_kv=_voltage,
        powers_mw=_FW_POWER_MW,
        manufacturer="MV-DESIGN-PRO reference",
        model_prefix="FW full-converter",
        name_prefix="Falownik FW",
    )
]


# =============================================================================
# FARMY FOTOWOLTAICZNE (PV)
# =============================================================================

CONVERTER_PV: list[dict[str, Any]] = [
    {
        "id": "conv-pv-0.5mw-15kv",
        "name": "Farma PV 0.5 MW / 15 kV",
        "params": {
            "kind": "PV",
            "un_kv": 15.0,
            "sn_mva": 0.55,
            "pmax_mw": 0.5,
            "qmin_mvar": -0.18,
            "qmax_mvar": 0.18,
            "cosphi_min": 0.9,
            "cosphi_max": 1.0,
            "manufacturer": "FIMER",
            "source_reference": ZRODLO_MODELU_REFERENCYJNEGO,
            "model": "FIMER utility PV 0.5 MW / 15 kV",
            "control_mode": "STALY_COS_PHI",
            "grid_code": "NC_RfG",
        },
    },
    {
        "id": "conv-pv-1mw-15kv",
        "name": "Farma PV 1 MW / 15 kV",
        "params": {
            "kind": "PV",
            "un_kv": 15.0,
            "sn_mva": 1.1,
            "pmax_mw": 1.0,
            "qmin_mvar": -0.36,
            "qmax_mvar": 0.36,
            "cosphi_min": 0.9,
            "cosphi_max": 1.0,
            "manufacturer": "SMA",
            "source_reference": ZRODLO_MODELU_REFERENCYJNEGO,
            "model": "SMA utility PV 1 MW / 15 kV",
            "control_mode": "STALY_COS_PHI",
            "grid_code": "NC_RfG",
        },
    },
    {
        "id": "conv-pv-2mw-15kv",
        "name": "Farma PV 2 MW / 15 kV",
        "params": {
            "kind": "PV",
            "un_kv": 15.0,
            "sn_mva": 2.2,
            "pmax_mw": 2.0,
            "qmin_mvar": -0.73,
            "qmax_mvar": 0.73,
            "cosphi_min": 0.9,
            "cosphi_max": 1.0,
            "manufacturer": "SUNGROW",
            "source_reference": ZRODLO_MODELU_REFERENCYJNEGO,
            "model": "Sungrow utility PV 2 MW / 15 kV",
            "control_mode": "STALY_COS_PHI",
            "grid_code": "NC_RfG",
        },
    },
    {
        "id": "conv-pv-5mw-15kv",
        "name": "Farma PV 5 MW / 15 kV",
        "params": {
            "kind": "PV",
            "un_kv": 15.0,
            "sn_mva": 5.5,
            "pmax_mw": 5.0,
            "qmin_mvar": -1.82,
            "qmax_mvar": 1.82,
            "cosphi_min": 0.9,
            "cosphi_max": 1.0,
            "manufacturer": "HUAWEI",
            "source_reference": ZRODLO_MODELU_REFERENCYJNEGO,
            "model": "Huawei utility PV 5 MW / 15 kV",
            "control_mode": "STALY_COS_PHI",
            "grid_code": "NC_RfG",
        },
    },
    _converter_record(
        item_id="conv-pv-sma-1p5mw-15kv",
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        name="Farma PV 1.5 MW / 15 kV / SMA",
        kind="PV",
        un_kv=15.0,
        sn_mva=1.65,
        pmax_mw=1.5,
        qmin_mvar=-0.54,
        qmax_mvar=0.54,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="SMA",
        model="SMA utility PV 1.5 MW / 15 kV",
        control_mode="STALY_COS_PHI",
        grid_code="NC_RfG",
    ),
    _converter_record(
        item_id="conv-pv-sungrow-3mw-15kv",
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        name="Farma PV 3 MW / 15 kV / Sungrow",
        kind="PV",
        un_kv=15.0,
        sn_mva=3.3,
        pmax_mw=3.0,
        qmin_mvar=-1.09,
        qmax_mvar=1.09,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="SUNGROW",
        model="Sungrow utility PV 3 MW / 15 kV",
        control_mode="STALY_COS_PHI",
        grid_code="NC_RfG",
    ),
    _converter_record(
        item_id="conv-pv-sungrow-5mw-20kv",
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        name="Farma PV 5 MW / 20 kV / Sungrow",
        kind="PV",
        un_kv=20.0,
        sn_mva=5.5,
        pmax_mw=5.0,
        qmin_mvar=-1.82,
        qmax_mvar=1.82,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="SUNGROW",
        model="Sungrow utility PV 5 MW / 20 kV",
        control_mode="STALY_COS_PHI",
        grid_code="NC_RfG",
    ),
    _converter_record(
        item_id="conv-pv-huawei-1p5mw-15kv",
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        name="Farma PV 1.5 MW / 15 kV / Huawei",
        kind="PV",
        un_kv=15.0,
        sn_mva=1.65,
        pmax_mw=1.5,
        qmin_mvar=-0.54,
        qmax_mvar=0.54,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="HUAWEI",
        model="Huawei utility PV 1.5 MW / 15 kV",
        control_mode="STALY_COS_PHI",
        grid_code="NC_RfG",
    ),
    _converter_record(
        item_id="conv-pv-huawei-3mw-20kv",
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        name="Farma PV 3 MW / 20 kV / Huawei",
        kind="PV",
        un_kv=20.0,
        sn_mva=3.3,
        pmax_mw=3.0,
        qmin_mvar=-1.09,
        qmax_mvar=1.09,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="HUAWEI",
        model="Huawei utility PV 3 MW / 20 kV",
        control_mode="STALY_COS_PHI",
        grid_code="NC_RfG",
    ),
    _converter_record(
        item_id="conv-pv-abb-2mw-15kv",
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        name="Farma PV 2 MW / 15 kV / ABB",
        kind="PV",
        un_kv=15.0,
        sn_mva=2.2,
        pmax_mw=2.0,
        qmin_mvar=-0.73,
        qmax_mvar=0.73,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="ABB",
        model="ABB utility PV 2 MW / 15 kV",
        control_mode="STALY_COS_PHI",
        grid_code="NC_RfG",
    ),
    _converter_record(
        item_id="conv-pv-abb-4mw-20kv",
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        name="Farma PV 4 MW / 20 kV / ABB",
        kind="PV",
        un_kv=20.0,
        sn_mva=4.4,
        pmax_mw=4.0,
        qmin_mvar=-1.45,
        qmax_mvar=1.45,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="ABB",
        model="ABB utility PV 4 MW / 20 kV",
        control_mode="STALY_COS_PHI",
        grid_code="NC_RfG",
    ),
    _converter_record(
        item_id="conv-pv-fronius-1mw-15kv",
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        name="Farma PV 1 MW / 15 kV / Fronius",
        kind="PV",
        un_kv=15.0,
        sn_mva=1.1,
        pmax_mw=1.0,
        qmin_mvar=-0.36,
        qmax_mvar=0.36,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="FRONIUS",
        model="Fronius utility PV 1 MW / 15 kV",
        control_mode="STALY_COS_PHI",
        grid_code="NC_RfG",
    ),
    # === Produkcyjne 1500 V DC + grid-forming (nowoczesne instalacje 2024+) ===
    _converter_record(
        item_id="conv-pv-string-330kw-15kv",
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        name="Farma PV 330 kW string / 15 kV / SMA",
        kind="PV",
        un_kv=15.0,
        sn_mva=0.36,
        pmax_mw=0.33,
        qmin_mvar=-0.12,
        qmax_mvar=0.12,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="SMA",
        model="SMA Sunny Tripower CORE2 330 kW string / 1500 V DC",
        control_mode="Q_OF_U",
        grid_code="NC_RfG_typ_B",
        note="Falownik string 1500 V DC dla mid-size farm; standard NC RfG B.",
    ),
    _converter_record(
        item_id="conv-pv-central-2p5mw-1500vdc-15kv",
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        name="Farma PV 2.5 MW central 1500 V DC / 15 kV / SMA",
        kind="PV",
        un_kv=15.0,
        sn_mva=2.75,
        pmax_mw=2.5,
        qmin_mvar=-0.91,
        qmax_mvar=0.91,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="SMA",
        model="SMA Sunny Central 2500 EV / 1500 V DC",
        control_mode="Q_OF_U",
        grid_code="NC_RfG_typ_C",
        note="Centralny falownik 1500 V DC z FRT + Q(U); typ C wg NC RfG.",
    ),
    _converter_record(
        item_id="conv-pv-power-electronics-3p5mw-20kv",
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        name="Farma PV 3.5 MW central / 20 kV / Power Electronics",
        kind="PV",
        un_kv=20.0,
        sn_mva=3.85,
        pmax_mw=3.5,
        qmin_mvar=-1.27,
        qmax_mvar=1.27,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="POWER_ELECTRONICS",
        model="Power Electronics Freesun HEC FS3500K / 20 kV",
        control_mode="Q_OF_U",
        grid_code="NC_RfG_typ_C",
    ),
    _converter_record(
        item_id="conv-pv-gfm-2mw-15kv",
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        name="Farma PV 2 MW grid-forming / 15 kV",
        kind="PV",
        un_kv=15.0,
        sn_mva=2.2,
        pmax_mw=2.0,
        qmin_mvar=-0.73,
        qmax_mvar=0.73,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="SMA",
        model="SMA Sunny Central GFM 2.0 MW / 15 kV (virtual inertia 4 s)",
        control_mode="GRID_FORMING",
        grid_code="NC_RfG_typ_C",
        dynamic_profile_id="default_pv_gfm",
        note="Grid-forming PV — virtual inertia 4 s (IEEE 2800-2022, MIGRATE).",
    ),
    _converter_record(
        item_id="conv-pv-huawei-7mw-30kv",
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        name="Farma PV 7 MW / 30 kV / Huawei (utility scale)",
        kind="PV",
        un_kv=30.0,
        sn_mva=7.7,
        pmax_mw=7.0,
        qmin_mvar=-2.55,
        qmax_mvar=2.55,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="HUAWEI",
        model="Huawei SUN2000-7000KTL / 30 kV utility",
        control_mode="Q_OF_U",
        grid_code="NC_RfG_typ_C",
    ),
    _converter_record(
        item_id="conv-pv-sungrow-8p8mw-30kv",
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        name="Farma PV 8.8 MW / 30 kV / Sungrow (utility scale)",
        kind="PV",
        un_kv=30.0,
        sn_mva=9.7,
        pmax_mw=8.8,
        qmin_mvar=-3.20,
        qmax_mvar=3.20,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="SUNGROW",
        model="Sungrow SG8800-MV / 30 kV utility",
        control_mode="Q_OF_U",
        grid_code="NC_RfG_typ_C",
    ),
    _converter_record(
        item_id="conv-pv-residential-50kw-04kv",
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        name="Mikroinstalacja PV 50 kW / 0.4 kV (typ A NC RfG)",
        kind="PV",
        un_kv=0.4,
        sn_mva=0.055,
        pmax_mw=0.05,
        qmin_mvar=-0.018,
        qmax_mvar=0.018,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="FRONIUS",
        model="Fronius Symo 50.0-3 / 0.4 kV",
        control_mode="STALY_COS_PHI",
        grid_code="NC_RfG_typ_A",
        note="Mikroinstalacja PV 50 kW na nN — typ A, IEEE 1547-2018.",
    ),
]


# =============================================================================
# FARMY WIATROWE (WIND)
# =============================================================================

CONVERTER_WIND: list[dict[str, Any]] = [
    {
        "id": "conv-wind-2mw-15kv",
        "name": "Turbina wiatrowa 2 MW / 15 kV",
        "params": {
            "kind": "WIND",
            "un_kv": 15.0,
            "sn_mva": 2.2,
            "pmax_mw": 2.0,
            "qmin_mvar": -0.73,
            "qmax_mvar": 0.73,
            "cosphi_min": 0.9,
            "cosphi_max": 1.0,
            "manufacturer": "Vestas",
            "model": "V90-2.0",
            **_quality(
                _NOTA_MODELU_REFERENCYJNEGO,
                source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
            ),
        },
    },
    {
        "id": "conv-wind-3mw-15kv",
        "name": "Turbina wiatrowa 3 MW / 15 kV",
        "params": {
            "kind": "WIND",
            "un_kv": 15.0,
            "sn_mva": 3.3,
            "pmax_mw": 3.0,
            "qmin_mvar": -1.09,
            "qmax_mvar": 1.09,
            "cosphi_min": 0.9,
            "cosphi_max": 1.0,
            "manufacturer": "Vestas",
            "model": "V112-3.0",
            **_quality(
                _NOTA_MODELU_REFERENCYJNEGO,
                source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
            ),
        },
    },
    {
        "id": "conv-wind-4mw-20kv",
        "name": "Turbina wiatrowa 4 MW / 20 kV",
        "params": {
            "kind": "WIND",
            "un_kv": 20.0,
            "sn_mva": 4.4,
            "pmax_mw": 4.0,
            "qmin_mvar": -1.45,
            "qmax_mvar": 1.45,
            "cosphi_min": 0.9,
            "cosphi_max": 1.0,
            "manufacturer": "Siemens Gamesa",
            "model": "SG 4.5-145",
            **_quality(
                _NOTA_MODELU_REFERENCYJNEGO,
                source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
            ),
        },
    },
]

CONVERTER_WIND.extend(
    [
        _converter_record(
            item_id="wt_vestas_v117_3450",
            source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
            name="Vestas V117-3.45 MW / 15 kV",
            kind="WIND",
            un_kv=15.0,
            sn_mva=_sn_mva_for_power(3.45),
            pmax_mw=3.45,
            qmin_mvar=-_reactive_limit(3.45),
            qmax_mvar=_reactive_limit(3.45),
            cosphi_min=0.9,
            cosphi_max=1.0,
            manufacturer="VESTAS",
            model="V117-3450",
            control_mode="Q_U_DROOP",
            grid_code="NC_RfG_typ_C",
        ),
        _converter_record(
            item_id="wt_siemens_swt_2300_113",
            source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
            name="Siemens SWT-2.3-113 2.3 MW / 15 kV",
            kind="WIND",
            un_kv=15.0,
            sn_mva=_sn_mva_for_power(2.3),
            pmax_mw=2.3,
            qmin_mvar=-_reactive_limit(2.3),
            qmax_mvar=_reactive_limit(2.3),
            cosphi_min=0.9,
            cosphi_max=1.0,
            manufacturer="SIEMENS",
            model="SWT-2.3-113",
            control_mode="Q_U_DROOP",
            grid_code="NC_RfG_typ_B",
        ),
        _converter_record(
            item_id="wt_ge_158_5500",
            source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
            name="GE Cypress 5.5-158 5.5 MW / 15 kV",
            kind="WIND",
            un_kv=15.0,
            sn_mva=_sn_mva_for_power(5.5),
            pmax_mw=5.5,
            qmin_mvar=-_reactive_limit(5.5),
            qmax_mvar=_reactive_limit(5.5),
            cosphi_min=0.9,
            cosphi_max=1.0,
            manufacturer="GE_RENEWABLE",
            model="Cypress-5500-158",
            control_mode="Q_U_DROOP",
            grid_code="NC_RfG_typ_C",
        ),
    ]
)


# =============================================================================
# MAGAZYNY ENERGII (BESS)
# =============================================================================

CONVERTER_BESS: list[dict[str, Any]] = [
    {
        "id": "conv-bess-0.5mw-1mwh-15kv",
        "name": "BESS 0.5 MW / 1 MWh / 15 kV",
        "params": {
            "kind": "BESS",
            "un_kv": 15.0,
            "sn_mva": 0.55,
            "pmax_mw": 0.5,
            "qmin_mvar": -0.18,
            "qmax_mvar": 0.18,
            "cosphi_min": 0.9,
            "cosphi_max": 1.0,
            "e_kwh": 1000.0,
            "manufacturer": "SUNGROW",
            "model": "Sungrow utility BESS 0.5 MW / 1 MWh / 15 kV",
            **_quality(
                _NOTA_MODELU_REFERENCYJNEGO,
                source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
            ),
        },
    },
    {
        "id": "conv-bess-1mw-2mwh-15kv",
        "name": "BESS 1 MW / 2 MWh / 15 kV",
        "params": {
            "kind": "BESS",
            "un_kv": 15.0,
            "sn_mva": 1.1,
            "pmax_mw": 1.0,
            "qmin_mvar": -0.36,
            "qmax_mvar": 0.36,
            "cosphi_min": 0.9,
            "cosphi_max": 1.0,
            "e_kwh": 2000.0,
            "manufacturer": "BYD",
            "model": "BYD utility BESS 1 MW / 2 MWh / 15 kV",
            **_quality(
                _NOTA_MODELU_REFERENCYJNEGO,
                source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
            ),
        },
    },
    {
        "id": "conv-bess-2mw-4mwh-15kv",
        "name": "BESS 2 MW / 4 MWh / 15 kV",
        "params": {
            "kind": "BESS",
            "un_kv": 15.0,
            "sn_mva": 2.2,
            "pmax_mw": 2.0,
            "qmin_mvar": -0.73,
            "qmax_mvar": 0.73,
            "cosphi_min": 0.9,
            "cosphi_max": 1.0,
            "e_kwh": 4000.0,
            "manufacturer": "TESLA",
            "model": "Tesla utility BESS 2 MW / 4 MWh / 15 kV",
            **_quality(
                _NOTA_MODELU_REFERENCYJNEGO,
                source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
            ),
        },
    },
    {
        "id": "conv-bess-5mw-10mwh-15kv",
        "name": "BESS 5 MW / 10 MWh / 15 kV",
        "params": {
            "kind": "BESS",
            "un_kv": 15.0,
            "sn_mva": 5.5,
            "pmax_mw": 5.0,
            "qmin_mvar": -1.82,
            "qmax_mvar": 1.82,
            "cosphi_min": 0.9,
            "cosphi_max": 1.0,
            "e_kwh": 10000.0,
            "manufacturer": "FLUENCE",
            "model": "Fluence utility BESS 5 MW / 10 MWh / 15 kV",
            **_quality(
                _NOTA_MODELU_REFERENCYJNEGO,
                source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
            ),
        },
    },
    _converter_record(
        item_id="conv-bess-tesla-25mw-5mwh-15kv",
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        name="BESS 2.5 MW / 5 MWh / 15 kV / Tesla",
        kind="BESS",
        un_kv=15.0,
        sn_mva=2.75,
        pmax_mw=2.5,
        qmin_mvar=-0.91,
        qmax_mvar=0.91,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="TESLA",
        model="Tesla utility BESS 2.5 MW / 5 MWh / 15 kV",
        e_kwh=5000.0,
    ),
    _converter_record(
        item_id="conv-bess-nidec-3mw-6mwh-15kv",
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        name="BESS 3 MW / 6 MWh / 15 kV / Nidec",
        kind="BESS",
        un_kv=15.0,
        sn_mva=3.3,
        pmax_mw=3.0,
        qmin_mvar=-1.09,
        qmax_mvar=1.09,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="NIDEC",
        model="Nidec utility BESS 3 MW / 6 MWh / 15 kV",
        e_kwh=6000.0,
    ),
    _converter_record(
        item_id="conv-bess-byd-5mw-10mwh-20kv",
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        name="BESS 5 MW / 10 MWh / 20 kV / BYD",
        kind="BESS",
        un_kv=20.0,
        sn_mva=5.5,
        pmax_mw=5.0,
        qmin_mvar=-1.82,
        qmax_mvar=1.82,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="BYD",
        model="BYD utility BESS 5 MW / 10 MWh / 20 kV",
        e_kwh=10000.0,
    ),
    _converter_record(
        item_id="conv-bess-fluence-10mw-20kv",
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        name="BESS 10 MW / 20 MWh / 20 kV / Fluence",
        kind="BESS",
        un_kv=20.0,
        sn_mva=11.0,
        pmax_mw=10.0,
        qmin_mvar=-3.64,
        qmax_mvar=3.64,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="FLUENCE",
        model="Fluence utility BESS 10 MW / 20 MWh / 20 kV",
        e_kwh=20000.0,
    ),
    # === Tesla Megapack-class + grid-forming + utility scale ===
    _converter_record(
        item_id="conv-bess-tesla-megapack-3p9mw-15kv",
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        name="BESS Tesla Megapack 2 XL 3.9 MW / 15.6 MWh / 15 kV",
        kind="BESS",
        un_kv=15.0,
        sn_mva=4.3,
        pmax_mw=3.9,
        qmin_mvar=-1.42,
        qmax_mvar=1.42,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="TESLA",
        model="Tesla Megapack 2 XL / 4-hour duration",
        e_kwh=15600.0,
        control_mode="GRID_FORMING",
        grid_code="NC_RfG_typ_C",
        dynamic_profile_id="default_bess_gfm",
        note="Tesla Megapack 2 XL z grid-forming inverter (virtual inertia 6 s).",
    ),
    _converter_record(
        item_id="conv-bess-wartsila-gridforming-50mw-30kv",
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        name="BESS Wartsila Quantum GFM 50 MW / 100 MWh / 30 kV",
        kind="BESS",
        un_kv=30.0,
        sn_mva=55.0,
        pmax_mw=50.0,
        qmin_mvar=-18.2,
        qmax_mvar=18.2,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="WARTSILA",
        model="Wartsila Quantum 50 MW / 2h GFM",
        e_kwh=100000.0,
        control_mode="GRID_FORMING",
        grid_code="NC_RfG_typ_D",
        dynamic_profile_id="default_bess_gfm",
        note="Utility BESS 50 MW grid-forming — typ D wg NC RfG, dla pracy wyspowej.",
    ),
    _converter_record(
        item_id="conv-bess-ge-reservoir-15mw-30kv",
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        name="BESS GE Vernova Reservoir 15 MW / 60 MWh / 30 kV",
        kind="BESS",
        un_kv=30.0,
        sn_mva=16.5,
        pmax_mw=15.0,
        qmin_mvar=-5.45,
        qmax_mvar=5.45,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="GE_VERNOVA",
        model="GE Vernova Reservoir 15 MW / 4h",
        e_kwh=60000.0,
        control_mode="Q_OF_U",
        grid_code="NC_RfG_typ_C",
    ),
    _converter_record(
        item_id="conv-bess-sungrow-powertitan-3p7mw-15kv",
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        name="BESS Sungrow PowerTitan 2.0 3.7 MW / 7.7 MWh / 15 kV",
        kind="BESS",
        un_kv=15.0,
        sn_mva=4.07,
        pmax_mw=3.7,
        qmin_mvar=-1.35,
        qmax_mvar=1.35,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="SUNGROW",
        model="Sungrow PowerTitan 2.0 / liquid-cooled",
        e_kwh=7700.0,
        control_mode="Q_OF_U",
        grid_code="NC_RfG_typ_C",
    ),
    _converter_record(
        item_id="conv-bess-residential-100kw-04kv",
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        name="BESS przemysłowy 100 kW / 215 kWh / 0.4 kV",
        kind="BESS",
        un_kv=0.4,
        sn_mva=0.11,
        pmax_mw=0.1,
        qmin_mvar=-0.036,
        qmax_mvar=0.036,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="HUAWEI",
        model="Huawei LUNA2000 100 kW / 0.4 kV",
        e_kwh=215.0,
        control_mode="STALY_COS_PHI",
        grid_code="NC_RfG_typ_A",
        note="BESS przemysłowy small-scale na nN — typ A.",
    ),
]

# =============================================================================
# KARTY REFERENCYJNE FALOWNIKOW (pelna "karta falownika" z jawna proweniencja per pole).
# Karty techniczne sa DEKLAROWANE — dokumentow nie dolaczono do repozytorium, wiec
# rekord ma status NIEWERYFIKOWANY (wykluczony z doboru szablonow), a ratingi sa
# ESTIMATED ze zrodlem „Deklarowane: …" (karta KATALOG-KOMPLETNY-PROWENIENCJA).
# Zalozenia rekordu (moc DC, pojemnosc magazynu) — ESTIMATED z nazwanym zalozeniem;
# pasma regulatorow = ESTIMATED (wartosc typowa dla klasy z literatury).
# Co najmniej jedna karta na klase: string PV, central PV, PCS BESS.
# =============================================================================

# String PV — Huawei SUN2000-215KTL-H3 (karta techniczna: 215 kW / 215 kVA,
# Un 800 V AC, cosphi nast. 0.8 ind...0.8 poj). Pn,AC=215 kW; Pzainst (DC)
# ~ 1.5x AC dla nowoczesnych string. Pasma regulatorow: oszacowanie typowe.
_REFERENCE_PV_STRING = _converter_record(
    item_id="conv-pv-card-huawei-sun2000-215ktl",
    source_reference=_zrodlo_deklarowane(
        "Karta techniczna Huawei SUN2000-215KTL-H3 (solar.huawei.com)"
    ),
    verification_status=CatalogVerificationStatus.NIEWERYFIKOWANY.value,
    name="Karta falownika string PV Huawei SUN2000-215KTL-H3 0.215 MW / 0.8 kV",
    kind="PV",
    un_kv=0.8,
    sn_mva=0.215,
    pmax_mw=0.215,
    qmin_mvar=-0.129,  # cosphi 0.8 => Q = 0.6*Sn
    qmax_mvar=0.129,
    cosphi_min=0.8,
    cosphi_max=1.0,
    manufacturer="HUAWEI",
    model="SUN2000-215KTL-H3",
    control_mode="Q_OF_U",
    grid_code="NC_RfG_typ_B",
    note="Karta techniczna Huawei SUN2000-215KTL-H3; pasma regulatorów oszacowane (typowe dla klasy).",
    p_installed_mw=0.3225,  # Pzainst DC ~ 1.5x Pn,AC (string 1500 V DC)
    pn_ac_mw=0.215,
    current_loop_bandwidth_hz=900.0,
    voltage_loop_bandwidth_hz=80.0,
    pll_bandwidth_hz=30.0,
    control_delay_ms=0.5,
    filter_l_pu=0.08,  # string PV LCL: niska indukcyjnosc, wysoka f_sw (typowa)
    filter_r_pu=0.005,
    # Krzywa P-Q: prostokat +/-0.6*Sn az do zwezenia przy p_max (limit S).
    # Profil referencyjny do potwierdzenia karta producenta.
    pq_curve=(
        (0.0, -0.129, 0.129),
        (0.108, -0.129, 0.129),
        (0.172, -0.129, 0.129),
        (0.215, -0.043, 0.043),
    ),
    # Wspolczynnik emisji migotania c(psi_k) [-] — wartosc analityczna klasy
    # (falownik string PV, praca ciagla, emisja niska), do potwierdzenia karta
    # zgodnosci; ESTIMATED (patrz card_field_status).
    flicker_c=0.30,
    card_field_status=_reference_card_field_status(
        datasheet_ref="Karta techniczna Huawei SUN2000-215KTL-H3 (solar.huawei.com)",
        rating_fields=_REFERENCE_RATING_FIELDS,
        power_hierarchy_fields=_REFERENCE_POWER_HIERARCHY_FIELDS,
        bandwidth_fields=_REFERENCE_BANDWIDTH_FIELDS,
        flicker_fields=("flicker_c",),
        assumption_fields={"p_installed_mw": _NOTA_P_INSTALLED},
    ),
)

# Central PV — Sungrow SG3150U-MV (karta techniczna: 3150 kW / 3150 kVA AC,
# Un 0.69 kV strona LV trafo, cosphi 0.8 ind...0.8 poj, 1500 V DC).
_REFERENCE_PV_CENTRAL = _converter_record(
    item_id="conv-pv-card-sungrow-sg3150u-mv",
    source_reference=_zrodlo_deklarowane("Karta techniczna Sungrow SG3150U-MV (sungrowpower.com)"),
    verification_status=CatalogVerificationStatus.NIEWERYFIKOWANY.value,
    name="Karta falownika central PV Sungrow SG3150U-MV 3.15 MW / 0.69 kV",
    kind="PV",
    un_kv=0.69,
    sn_mva=3.15,
    pmax_mw=3.15,
    qmin_mvar=-1.89,  # cosphi 0.8 => Q = 0.6*Sn
    qmax_mvar=1.89,
    cosphi_min=0.8,
    cosphi_max=1.0,
    manufacturer="SUNGROW",
    model="SG3150U-MV",
    control_mode="Q_OF_U",
    grid_code="NC_RfG_typ_C",
    note="Karta techniczna Sungrow SG3150U-MV; pasma regulatorów oszacowane (typowe dla klasy).",
    p_installed_mw=4.2,  # Pzainst DC ~ 1.33x Pn,AC (utility central 1500 V DC)
    pn_ac_mw=3.15,
    current_loop_bandwidth_hz=800.0,
    voltage_loop_bandwidth_hz=70.0,
    pll_bandwidth_hz=25.0,
    control_delay_ms=0.6,
    filter_l_pu=0.10,  # central PV LCL: wyzsza indukcyjnosc, nizsza f_sw (typowa)
    filter_r_pu=0.004,
    # Krzywa P-Q: prostokat +/-0.6*Sn az do zwezenia przy p_max (limit S).
    # Profil referencyjny do potwierdzenia karta producenta.
    pq_curve=(
        (0.0, -1.89, 1.89),
        (1.575, -1.89, 1.89),
        (2.52, -1.89, 1.89),
        (3.15, -0.63, 0.63),
    ),
    # Wspolczynnik emisji migotania c(psi_k) [-] — wartosc analityczna klasy
    # (falownik central PV, praca ciagla, emisja niska), do potwierdzenia karta
    # zgodnosci; ESTIMATED (patrz card_field_status).
    flicker_c=0.30,
    card_field_status=_reference_card_field_status(
        datasheet_ref="Karta techniczna Sungrow SG3150U-MV (sungrowpower.com)",
        rating_fields=_REFERENCE_RATING_FIELDS,
        power_hierarchy_fields=_REFERENCE_POWER_HIERARCHY_FIELDS,
        bandwidth_fields=_REFERENCE_BANDWIDTH_FIELDS,
        flicker_fields=("flicker_c",),
        assumption_fields={"p_installed_mw": _NOTA_P_INSTALLED},
    ),
)

# BESS PCS — Sungrow SC2000UD-MV (karta techniczna PCS: 2000 kW / 2000 kVA,
# Un 0.69 kV, cosphi 0.8 ind...0.8 poj; e_kwh dla bloku 2 h).
_REFERENCE_BESS_PCS = _converter_record(
    item_id="conv-bess-card-sungrow-sc2000ud-mv",
    source_reference=_zrodlo_deklarowane(
        "Karta techniczna Sungrow SC2000UD-MV PCS (sungrowpower.com)"
    ),
    verification_status=CatalogVerificationStatus.NIEWERYFIKOWANY.value,
    name="Karta falownika PCS BESS Sungrow SC2000UD-MV 2.0 MW / 4.0 MWh / 0.69 kV",
    kind="BESS",
    un_kv=0.69,
    sn_mva=2.0,
    pmax_mw=2.0,
    qmin_mvar=-1.2,  # cosphi 0.8 => Q = 0.6*Sn
    qmax_mvar=1.2,
    cosphi_min=0.8,
    cosphi_max=1.0,
    manufacturer="SUNGROW",
    model="SC2000UD-MV",
    e_kwh=4000.0,
    control_mode="Q_OF_U",
    grid_code="NC_RfG_typ_C",
    note="Karta techniczna Sungrow SC2000UD-MV PCS; pasma regulatorów oszacowane (typowe dla klasy).",
    p_installed_mw=2.0,  # PCS Pzainst = Pn,AC (magazyn nie ma nadwymiarowania DC)
    pn_ac_mw=2.0,
    current_loop_bandwidth_hz=1000.0,
    voltage_loop_bandwidth_hz=100.0,
    pll_bandwidth_hz=35.0,
    control_delay_ms=0.5,
    filter_l_pu=0.10,  # BESS PCS LCL: typowa indukcyjnosc filtra magazynu
    filter_r_pu=0.003,
    # Krzywa P-Q: prostokat +/-0.6*Sn az do zwezenia przy p_max (limit S).
    # Profil referencyjny do potwierdzenia karta producenta.
    pq_curve=(
        (0.0, -1.2, 1.2),
        (1.0, -1.2, 1.2),
        (1.6, -1.2, 1.2),
        (2.0, -0.4, 0.4),
    ),
    # Wspolczynnik emisji migotania c(psi_k) [-] — wartosc analityczna klasy
    # (PCS BESS, praca ciagla), do potwierdzenia karta zgodnosci; ESTIMATED
    # (patrz card_field_status).
    flicker_c=0.35,
    card_field_status=_reference_card_field_status(
        datasheet_ref="Karta techniczna Sungrow SC2000UD-MV PCS (sungrowpower.com)",
        rating_fields=_REFERENCE_RATING_FIELDS,
        power_hierarchy_fields=_REFERENCE_POWER_HIERARCHY_FIELDS,
        bandwidth_fields=_REFERENCE_BANDWIDTH_FIELDS,
        flicker_fields=("flicker_c",),
        assumption_fields={
            "p_installed_mw": _NOTA_P_INSTALLED,
            "e_kwh": "pojemność magazynu — założenie bloku 2 h; karta PCS nie podaje pojemności",
        },
    ),
)

# Full datasheet-card reference converters (one per class). Aggregated into the
# class lists so every access function and statistic naturally includes them.
CONVERTER_REFERENCE_CARDS: list[dict[str, Any]] = [
    _REFERENCE_PV_STRING,
    _REFERENCE_PV_CENTRAL,
    _REFERENCE_BESS_PCS,
]

CONVERTER_PV.extend([_REFERENCE_PV_STRING, _REFERENCE_PV_CENTRAL])
CONVERTER_BESS.append(_REFERENCE_BESS_PCS)


for _converter_type in (
    CONVERTER_PV
    + CONVERTER_PV_NN
    + CONVERTER_WIND
    + CONVERTER_WIND_NN
    + CONVERTER_BESS
    + CONVERTER_BESS_NN
):
    _apply_quality_defaults(_converter_type)


# =============================================================================
# FUNKCJE DOSTEPU
# =============================================================================


def get_all_converter_types() -> list[dict[str, Any]]:
    """Zwraca wszystkie typy zrodel konwerterowych i magazynow energii."""
    records = (
        CONVERTER_PV
        + CONVERTER_PV_NN
        + CONVERTER_WIND
        + CONVERTER_WIND_NN
        + CONVERTER_BESS
        + CONVERTER_BESS_NN
    )
    for record in records:
        _apply_quality_defaults(record)
    return [annotate_with_ptpiree_status(record) for record in records]


def get_pv_types() -> list[dict[str, Any]]:
    """Zwraca typy farm PV."""
    records = CONVERTER_PV + CONVERTER_PV_NN
    for record in records:
        _apply_quality_defaults(record)
    return [annotate_with_ptpiree_status(record) for record in records]


def get_wind_types() -> list[dict[str, Any]]:
    """Zwraca typy turbin wiatrowych."""
    records = CONVERTER_WIND + CONVERTER_WIND_NN
    for record in records:
        _apply_quality_defaults(record)
    return [annotate_with_ptpiree_status(record) for record in records]


def get_bess_types() -> list[dict[str, Any]]:
    """Zwraca typy magazynow energii."""
    records = CONVERTER_BESS + CONVERTER_BESS_NN
    for record in records:
        _apply_quality_defaults(record)
    return [annotate_with_ptpiree_status(record) for record in records]


def get_converter_catalog_statistics() -> dict[str, Any]:
    """Zwraca statystyki katalogu zrodel konwerterowych."""
    all_types = get_all_converter_types()
    kinds = sorted({t["params"]["kind"] for t in all_types})
    manufacturers = sorted(
        {
            str(t["params"].get("manufacturer") or "")
            for t in all_types
            if t["params"].get("manufacturer")
        }
    )

    return {
        "liczba_konwerterow_ogolem": len(all_types),
        "liczba_pv": len(CONVERTER_PV + CONVERTER_PV_NN),
        "liczba_wiatr": len(CONVERTER_WIND + CONVERTER_WIND_NN),
        "liczba_bess": len(CONVERTER_BESS + CONVERTER_BESS_NN),
        "rodzaje": kinds,
        "producenci": manufacturers,
        "verification_statuses": sorted({t["params"]["verification_status"] for t in all_types}),
        "catalog_statuses": sorted({t["params"]["catalog_status"] for t in all_types}),
    }
