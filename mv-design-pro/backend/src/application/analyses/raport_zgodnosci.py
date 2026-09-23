"""D4 (RECENZJA_DER_SN_DOBORY_2026-07, wymaganie 13): raport zgodności toru DER-SN.

Checklista ✓/⚠/❌ agregująca stan modelu po kreatorze (bez ponownego liczenia fizyki):
  (a) wyniki twardych walidacji doborowych D1 (``enm.der_sn_validation``) — kody i
      komunikaty 1:1, bez parafraz — odtworzone ze ZMATERIALIZOWANEGO toru,
  (b) zgodność zastosowanego doboru z propozycją D2 (odstępstwo = pozycja ⚠, nie błąd),
  (c) status biegu analiz (ukończony/nieudany + kody readiness).

Przy błędzie krytycznym (❌ z D1) raport oznajmia „Nie można wygenerować projektu."
(kanon), ale NIE blokuje — walidacje D1 odrzucają u źródła; raport odzwierciedla stan.

ZERO fizyki: porównania napięć/mocy oraz prąd znamionowy z tabliczki to walidacja
DOBOROWA (nameplate) reużyta z D1, nie obliczenia rozpływu/zwarcia. Determinizm:
stała kolejność pozycji, brak timestampów w treści (metadane niesie magazyn F-E8.3).
"""

from __future__ import annotations

from typing import Any

from application.analyses.der_sn_track import (
    DerSnTrack,
    extract_der_sn_track,
    sum_apparent_power_mva,
    transformer_current_a,
)
from enm.der_sn_validation import (
    build_current_cascade_warnings,
    validate_inverter_lv_voltage,
    validate_sn_voltage,
    validate_transformer_power,
)

# Kanoniczny komunikat błędu krytycznego (RECENZJA_DER_SN_DOBORY_2026-07, wymaganie 13).
KOMUNIKAT_KRYTYCZNY = "Nie można wygenerować projektu."

_STATUS_PASS = "PASS"
_STATUS_WARN = "WARN"
_STATUS_FAIL = "FAIL"


def _as_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


#: Podstawa walidacji doborowych D1 (karta AB-1a D7): reguły doborowe toru z tabliczek
#: (`enm/der_sn_validation.py`) — reguła projektowa repozytorium, nie klauzula dokumentu.
_PODSTAWA_D1: dict[str, Any] = {
    "dokument": None,
    "wersja": None,
    "klauzula": None,
    "zrodlo_status": "UNVERIFIED_SOURCE",
    "uwaga_pl": (
        "Reguła doborowa toru przyłączenia źródła porównująca dane z tabliczek "
        "(walidacje doborowe D1); nie cytuje dokumentu normowego."
    ),
}


#: Podstawa porównania z propozycją doboru D2 — propozycja jest wynikiem reguł doboru
#: repozytorium, nie wymaganiem dokumentu; odstępstwo jest decyzją projektanta.
_PODSTAWA_D2: dict[str, Any] = {
    "dokument": None,
    "wersja": None,
    "klauzula": None,
    "zrodlo_status": "UNVERIFIED_SOURCE",
    "uwaga_pl": (
        "Porównanie zastosowanego doboru z propozycją reguł doboru D2; propozycja nie "
        "jest wymaganiem dokumentu normowego."
    ),
}


def _pozycja(
    kategoria: str,
    check_id: str,
    status: str,
    code: str,
    message_pl: str,
    *,
    podstawa: dict[str, Any] | None,
    element_id: str | None,
    wartosc: float | None = None,
    odniesienie: float | None = None,
    jednostka: str | None = None,
    margines: float | None = None,
    dodatkowe: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Pozycja raportu jako wynik wyjaśnialny (karta AB-1a D7) — JEDEN kształt dla
    wszystkich kategorii raportu (D1, kaskada prądowa, D2, bieg analiz): obok kodu i
    komunikatu 1:1 z regułą niesie wartość i wymaganie (te same liczby, które
    porównała reguła), zapas tam, gdzie reguła jest nierównością, podstawę i dowód
    (element toru). Brak liczby albo podstawy = ``None``, nigdy wartość zastępcza.

    ``dodatkowe`` — pola kategorii sprzed karty, wstawiane ZARAZ po komunikacie, żeby
    kolejność dotychczasowych kluczy pozycji się nie zmieniła (towarzysze na końcu)."""
    return {
        "check_id": check_id,
        "kategoria": kategoria,
        "status": status,
        "code": code,
        "message_pl": message_pl,
        **(dodatkowe or {}),
        "wartosc": wartosc,
        "odniesienie": odniesienie,
        "jednostka": jednostka,
        "margines": margines,
        "podstawa": dict(podstawa) if podstawa is not None else None,
        "dowod": {"run_id": None, "element_id": element_id, "trace_ref": None},
    }


def _liczba(value: Any) -> float | None:
    """Liczba z danej doboru albo ``None`` (np. układ połączeń „Dyn11" nie jest liczbą)."""
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _pass(
    check_id: str,
    etykieta: str,
    *,
    element_id: str | None,
    wartosc: float | None = None,
    odniesienie: float | None = None,
    jednostka: str | None = None,
    margines: float | None = None,
) -> dict[str, Any]:
    return _pozycja(
        "walidacja_D1",
        check_id,
        _STATUS_PASS,
        f"der_sn.ok.{check_id}",
        f"✓ {etykieta}",
        podstawa=_PODSTAWA_D1,
        element_id=element_id,
        wartosc=wartosc,
        odniesienie=odniesienie,
        jednostka=jednostka,
        margines=margines,
    )


def _fail(
    check_id: str,
    code: str,
    message_pl: str,
    *,
    element_id: str | None,
    wartosc: float | None = None,
    odniesienie: float | None = None,
    jednostka: str | None = None,
    margines: float | None = None,
) -> dict[str, Any]:
    # Kod i komunikat 1:1 z D1 der_sn_validation (bez parafraz).
    return _pozycja(
        "walidacja_D1",
        check_id,
        _STATUS_FAIL,
        code,
        message_pl,
        podstawa=_PODSTAWA_D1,
        element_id=element_id,
        wartosc=wartosc,
        odniesienie=odniesienie,
        jednostka=jednostka,
        margines=margines,
    )


def _d1_items(track: DerSnTrack) -> list[dict[str, Any]]:
    """Odtwórz twarde walidacje D1 ze zmaterializowanego toru (kody/komunikaty 1:1)."""
    items: list[dict[str, Any]] = []
    tr = track.block_transformer
    zrodlo = track.source_ref

    # 1. U_AC falownika ↔ strona nN TR blokowego (wymaganie 2).
    inverter_kv = _as_float(track.producer_bus.get("voltage_kv")) if track.producer_bus else None
    block_secondary_kv = _as_float(tr.get("ulv_kv")) if tr else None
    if inverter_kv is not None and block_secondary_kv is not None:
        error = validate_inverter_lv_voltage(inverter_kv, block_secondary_kv)
        liczby = {
            "element_id": zrodlo,
            "wartosc": inverter_kv,
            "odniesienie": block_secondary_kv,
            "jednostka": "kV",
        }
        items.append(
            _fail("napiecie_falownika", error.code, error.message_pl, **liczby)
            if error
            else _pass(
                "napiecie_falownika",
                "Napięcie falownika zgodne ze stroną nN TR blokowego.",
                **liczby,
            )
        )

    # 2. Strona SN TR blokowego ↔ napięcie szyny SN przyłączenia (wymaganie 6).
    block_primary_kv = None
    if track.block_hv_bus:
        block_primary_kv = _as_float(track.block_hv_bus.get("voltage_kv"))
    if block_primary_kv is None and tr:
        block_primary_kv = _as_float(tr.get("uhv_kv"))
    sn_bus_kv = _as_float(track.mv_bus.get("voltage_kv")) if track.mv_bus else None
    if block_primary_kv is not None and sn_bus_kv is not None:
        error = validate_sn_voltage(block_primary_kv, sn_bus_kv)
        liczby = {
            "element_id": zrodlo,
            "wartosc": block_primary_kv,
            "odniesienie": sn_bus_kv,
            "jednostka": "kV",
        }
        items.append(
            _fail("napiecie_sn", error.code, error.message_pl, **liczby)
            if error
            else _pass(
                "napiecie_sn", "Strona SN TR blokowego zgodna z napięciem szyny SN.", **liczby
            )
        )

    # 3. Moc TR blokowego ≥ ΣS falowników (wymaganie 5).
    if tr is not None:
        suma_s = sum_apparent_power_mva(track)
        sn_mva = _as_float(tr.get("sn_mva"))
        error = validate_transformer_power(
            sum_apparent_power_mva=suma_s,
            transformer_sn_mva=sn_mva or 0.0,
            loadability_pu=None,
            simultaneity_factor=None,
        )
        liczby_mocy: dict[str, Any] = {
            "element_id": zrodlo,
            "wartosc": suma_s,
            "odniesienie": sn_mva,
            "jednostka": "MVA",
            # Zapas mocy TR = S_n − ΣS (arytmetyka prezentacji z dwóch liczb reguły).
            "margines": (
                round(sn_mva - suma_s, 6) if sn_mva is not None and suma_s is not None else None
            ),
        }
        items.append(
            _fail("moc_transformatora", error.code, error.message_pl, **liczby_mocy)
            if error
            else _pass(
                "moc_transformatora",
                "Moc transformatora blokowego wystarczająca.",
                **liczby_mocy,
            )
        )
        # 4. Układ połączeń = parametr modelu z typu katalogowego (wymaganie 7).
        vector_group = tr.get("vector_group")
        if vector_group:
            items.append(
                _pass(
                    "grupa_polaczen",
                    f"Układ połączeń TR blokowego zgodny z typem katalogowym ({vector_group}).",
                    element_id=zrodlo,
                )
            )
    return items


def _cascade_items(track: DerSnTrack) -> list[dict[str, Any]]:
    """Ostrzeżenia kaskady prądowej (⚠) odtworzone ze stanu modelu (kody 1:1 z D1).

    Ogniwo prądu znamionowego pola SN nie jest przechowywane liczbowo w modelu —
    gdy aparat ma powiązanie katalogowe, link istnieje (op przeszła u źródła); brak
    powiązania sygnalizujemy jawnym ostrzeżeniem ``kaskada_prad_pole_brak``.
    """
    cable_in_a = None
    if track.mv_cable and isinstance(track.mv_cable.get("rating"), dict):
        cable_in_a = _as_float(track.mv_cable["rating"].get("in_a"))
    apparatus_has_catalog = bool(track.apparatus and track.apparatus.get("catalog_ref"))
    warnings = build_current_cascade_warnings(
        transformer_current_a=transformer_current_a(track),
        cable_ampacity_a=cable_in_a,
        # Link pola zweryfikowany katalogowo → nie zgłaszaj „pole_brak"; wtedy sentinel
        # dodatni wyłącza ogniwo bez fabrykowania konkretnej wartości do porównań kaskady.
        field_rated_current_a=(float("inf") if apparatus_has_catalog else None),
    )
    prad_tr_a = transformer_current_a(track)
    items: list[dict[str, Any]] = []
    for warning in warnings:
        # Ostrzeżenie „kabel > pole" na sentinelu inf nie powstanie; pomijamy je jawnie.
        if warning.code == "converter.der_sn.kaskada_prad_pole_przekroczony":
            continue
        # Liczby ogniwa tylko dla przekroczenia kabla (I_TR wobec Iz) — ogniwo „brak"
        # nie ma czego porównać (None, nie zero).
        przekroczenie = warning.code == "converter.der_sn.kaskada_prad_kabel_przekroczony"
        items.append(
            _pozycja(
                "kaskada_pradowa",
                warning.code,
                _STATUS_WARN,
                warning.code,
                warning.message_pl,
                podstawa=_PODSTAWA_D1,
                element_id=track.source_ref,
                wartosc=prad_tr_a if przekroczenie else None,
                odniesienie=cable_in_a if przekroczenie else None,
                jednostka="A" if przekroczenie else None,
                margines=(
                    round(cable_in_a - prad_tr_a, 6)
                    if przekroczenie and cable_in_a is not None and prad_tr_a is not None
                    else None
                ),
            )
        )
    return items


def _d2_items(d2_deviations: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """Pozycje odstępstw od propozycji D2 (⚠). Zgodność ⇒ pozycja PASS."""
    if not d2_deviations:
        return []
    items: list[dict[str, Any]] = []
    for deviation in d2_deviations:
        parametr = str(deviation.get("parametr") or "")
        zastosowano = deviation.get("zastosowano")
        propozycja = deviation.get("propozycja")
        odstepstwo = bool(deviation.get("odstepstwo"))
        if odstepstwo:
            message = (
                f"⚠️ Odstępstwo od propozycji D2 dla „{parametr}”: zastosowano "
                f"{zastosowano}, proponowano {propozycja}."
            )
            status = _STATUS_WARN
        else:
            message = f"✓ Dobór „{parametr}” zgodny z propozycją D2."
            status = _STATUS_PASS
        items.append(
            _pozycja(
                "zgodnosc_D2",
                f"d2.{parametr}",
                status,
                "der_sn.d2.odstepstwo" if odstepstwo else "der_sn.d2.zgodne",
                message,
                podstawa=_PODSTAWA_D2,
                element_id=None,
                # Wartość = zastosowano, odniesienie = propozycja — wyłącznie gdy liczbowe
                # (układ połączeń jest tekstem: pola `zastosowano`/`propozycja` niżej).
                wartosc=_liczba(zastosowano),
                odniesienie=_liczba(propozycja),
                dodatkowe={
                    "parametr": parametr,
                    "zastosowano": zastosowano,
                    "propozycja": propozycja,
                },
            )
        )
    return items


def _run_item(run_status: str | None, readiness_codes: list[str] | None) -> dict[str, Any] | None:
    """Pozycja statusu biegu analiz (ukończony/nieudany + kody readiness)."""
    if run_status is None:
        return None
    normalized = str(run_status).upper()
    completed = normalized in {"DONE", "COMPLETED", "SUCCESS", "SUCCEEDED"}
    failed = normalized in {"FAILED", "ERROR"}
    if completed:
        status = _STATUS_PASS
        message = "✓ Bieg analiz (rozpływ + zwarcia) ukończony."
    elif failed:
        status = _STATUS_FAIL
        message = "❌ Bieg analiz nieudany — wyniki niedostępne."
    else:
        status = _STATUS_WARN
        message = f"⚠️ Bieg analiz w toku (status: {run_status})."
    # Status biegu nie jest porównaniem z wymaganiem: bez wartości, wymagania i
    # podstawy normatywnej (None), kody gotowości w polu obok.
    return _pozycja(
        "bieg_analiz",
        "bieg_analiz",
        status,
        f"der_sn.run.{normalized.lower()}",
        message,
        podstawa=None,
        element_id=None,
        dodatkowe={"readiness_codes": list(readiness_codes or [])},
    )


def build_compliance_report_from_track(
    track: DerSnTrack,
    *,
    run_status: str | None = None,
    readiness_codes: list[str] | None = None,
    d2_deviations: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Zbuduj raport zgodności z gotowego widoku toru (deterministyczny)."""
    items: list[dict[str, Any]] = []
    items.extend(_d1_items(track))
    items.extend(_cascade_items(track))
    items.extend(_d2_items(d2_deviations))
    run_item = _run_item(run_status, readiness_codes)
    if run_item is not None:
        items.append(run_item)

    liczba_fail = sum(1 for i in items if i["status"] == _STATUS_FAIL)
    liczba_warn = sum(1 for i in items if i["status"] == _STATUS_WARN)
    liczba_pass = sum(1 for i in items if i["status"] == _STATUS_PASS)

    if liczba_fail > 0:
        werdykt = "NIEZGODNY"
        komunikat_krytyczny: str | None = KOMUNIKAT_KRYTYCZNY
    elif liczba_warn > 0:
        werdykt = "ZGODNY_Z_UWAGAMI"
        komunikat_krytyczny = None
    else:
        werdykt = "ZGODNY"
        komunikat_krytyczny = None

    return {
        "wersja": "1.0",
        "source_ref": track.source_ref,
        "source_name": track.source_name,
        "werdykt": werdykt,
        "komunikat_krytyczny": komunikat_krytyczny,
        "pozycje": items,
        "podsumowanie": {
            "pass": liczba_pass,
            "warn": liczba_warn,
            "fail": liczba_fail,
            "razem": len(items),
        },
    }


def build_compliance_report(
    enm: dict[str, Any],
    generator_ref: str | None = None,
    *,
    run_status: str | None = None,
    readiness_codes: list[str] | None = None,
    d2_deviations: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    """Zbuduj raport zgodności toru DER-SN z modelu. ``None`` gdy brak toru DER-SN."""
    track = extract_der_sn_track(enm, generator_ref)
    if track is None:
        return None
    return build_compliance_report_from_track(
        track,
        run_status=run_status,
        readiness_codes=readiness_codes,
        d2_deviations=d2_deviations,
    )
