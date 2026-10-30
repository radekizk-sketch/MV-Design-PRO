"""D4 (RECENZJA_DER_SN_DOBORY_2026-07, wymaganie 13): raport zgodności toru DER-SN.

Checklista agregująca stan modelu po kreatorze (bez ponownego liczenia fizyki):
  (a) wyniki twardych walidacji doborowych D1 (``enm.der_sn_validation``) — kody i
      komunikaty 1:1, bez parafraz — odtworzone ze ZMATERIALIZOWANEGO toru,
  (b) kaskada prądu znamionowego transformator blokowy → kabel SN → pole SN (wymaganie 5b),
  (c) zgodność zastosowanego doboru z propozycją D2 (pozycja INFORMACYJNA — odstępstwo od
      propozycji nie jest naruszeniem wymagania, tylko uwagą dla projektanta),
  (d) stan biegu analiz (ukończony/nieudany/w toku + kody readiness).

WERDYKT WYJAŚNIALNY (karta WERDYKT-MIGRACJA-190). Każda pozycja (a), (b), (d) niesie rekord
K kontraktu werdyktu (``ocena`` + ``wyjasnienie``): co oceniono, wobec jakiego wymagania, z jaką
podstawą, z jakim dowodem (dane znamionowe modelu — metoda ``DEKLARACJA``). Kod ``status``
pozycji (``PASS``/``FAIL``/``WARN``) jest PROJEKCJĄ rekordu: ``WARN`` = ocena nierozstrzygnięta
(brak danych w modelu, bieg w toku) — nigdy spełnienie. Ogniwo bez danych NIE jest pomijane po
cichu: daje rekord ``NIE_OCENIONO`` z nazwanym brakiem. Raport niesie rekord W
(``ocena_wymagania``) nad wszystkimi rekordami pozycji; ``werdykt`` jest jego projekcją
(``ZGODNY`` / ``ZGODNY_Z_UWAGAMI`` przy uwagach D2 / ``NIEZGODNY`` / ``NIEROZSTRZYGNIETY``).

Przy naruszeniu (rekord ``NIE_SPELNIA``) raport oznajmia „Nie można wygenerować projektu."
(kanon), ale NIE blokuje — walidacje D1 odrzucają u źródła; raport odzwierciedla stan.

ZERO fizyki: porównania napięć/mocy oraz prąd znamionowy z tabliczki to walidacja
DOBOROWA (nameplate) reużyta z D1, nie obliczenia rozpływu/zwarcia. Rozstrzygnięcie każdej
pozycji pochodzi z TEJ SAMEJ funkcji co walidacja zapisu (jedno źródło prawdy, bez drugiej
kopii warunku). Determinizm: stała kolejność pozycji, brak timestampów w treści (metadane
niesie magazyn F-E8.3).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Final

from application.analyses.der_sn_track import (
    DerSnTrack,
    extract_der_sn_track,
    transformer_current_a,
)
from domain.generator_validation import sprawdz_moc_generatora
from enm.der_sn_validation import (
    build_current_cascade_warnings,
    validate_inverter_lv_voltage,
    validate_sn_voltage,
)
from enm.domain_operations_v2 import moc_transformatorow_mva
from solver_input.provenance import classify_dynamic_capability
from werdykt import OcenaKryterium, PodstawaWymagania, Przedmiot, WynikWymagania, ZakresWaznosci
from werdykt.porownanie import (
    Porownanie,
    ocena_porownania,
    podstawa_zalozenia,
    projekcja_statusu,
    rozstrzygniecie,
    wymaganie_z_ocen,
)
from werdykt.wyjasnienie import format_liczba

# Kanoniczny komunikat błędu krytycznego (RECENZJA_DER_SN_DOBORY_2026-07, wymaganie 13).
KOMUNIKAT_KRYTYCZNY = "Nie można wygenerować projektu."

ZDOLNOSC_DOBOROW: Final = "der_sn.dobory_toru"
WYMAGANIE_DOBOROW: Final = "der_sn.dobory_toru"

_STATUS_PASS: Final = "PASS"
_STATUS_WARN: Final = "WARN"
_STATUS_FAIL: Final = "FAIL"
#: Pozycja informacyjna bez werdyktu (zgodność z propozycją D2, układ połączeń z typu).
STATUS_INFORMACJA: Final = "INFORMACJA"

#: Kody werdyktu raportu — projekcja rekordu W (``_kod_werdyktu``).
WERDYKT_ZGODNY: Final = "ZGODNY"
WERDYKT_ZGODNY_Z_UWAGAMI: Final = "ZGODNY_Z_UWAGAMI"
WERDYKT_NIEZGODNY: Final = "NIEZGODNY"
WERDYKT_NIEROZSTRZYGNIETY: Final = "NIEROZSTRZYGNIETY"

_DOKUMENT: Final = "Walidacje doborowe toru DER-SN (RECENZJA_DER_SN_DOBORY_2026-07)"

_PODSTAWA_WYMAGANIA: Final = podstawa_zalozenia(
    _DOKUMENT,
    "wymaganie 13 — raport zgodności doborów toru przyłączenia źródła",
    uwagi_pl="reguły doborowe programu oparte na danych znamionowych urządzeń toru",
)
_PODSTAWA_NAPIECIA_FALOWNIKA: Final = podstawa_zalozenia(
    _DOKUMENT,
    "wymaganie 2 — napięcie AC falownika zgodne z napięciem strony nN transformatora blokowego",
)
_PODSTAWA_NAPIECIA_SN: Final = podstawa_zalozenia(
    _DOKUMENT,
    "wymaganie 6 — napięcie strony SN transformatora blokowego zgodne z napięciem szyny SN",
)
_PODSTAWA_MOCY: Final = podstawa_zalozenia(
    _DOKUMENT,
    "wymaganie 5 (decyzja O-53) — moc transformatorów grupy nie mniejsza od mocy wymaganej źródeł",
)
_PODSTAWA_KASKADY: Final = podstawa_zalozenia(
    _DOKUMENT,
    "wymaganie 5b — kaskada prądu znamionowego I_TR ≤ I_z kabla SN ≤ I_n pola SN",
)
_PODSTAWA_BIEGU: Final = podstawa_zalozenia(
    _DOKUMENT,
    "wymaganie 13 — raport obejmuje stan biegu analiz toru (rozpływ mocy i zwarcia)",
)

_ZAKRES: Final = ZakresWaznosci(
    opis_pl=(
        "Dane znamionowe toru przyłączenia źródła zapisane w modelu w chwili budowy raportu "
        "(napięcia szyn, transformator blokowy, kabel SN, aparat pola)."
    ),
    wykluczenia=(
        "obciążalność i spadki napięć w stanie pracy (osobne kryteria analiz rozpływu)",
        "wytrzymałość zwarciowa aparatury toru (osobne kryteria analiz zwarciowych)",
    ),
)

#: Kody ostrzeżeń kaskady o braku danych ogniwa (ogniwo nie zostało ocenione).
#: Ogniwa kaskady prądowej bez danych: kod ostrzeżenia D1 → wielkość, której brakuje.
_KASKADA_BRAKI: Final[dict[str, str]] = {
    "converter.der_sn.kaskada_prad_tr_brak": "prąd znamionowy transformatora blokowego",
    "converter.der_sn.kaskada_prad_kabel_brak": "obciążalność długotrwała kabla SN",
    "converter.der_sn.kaskada_prad_pole_brak": "prąd znamionowy pola SN",
}
_KASKADA_KABEL_PRZEKROCZONY: Final = "converter.der_sn.kaskada_prad_kabel_przekroczony"


def _as_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _bez_znaku(komunikat: str) -> str:
    """Komunikat bez znaku graficznego statusu (✓/⚠️/❌ — stan niesie rekord)."""
    tekst = komunikat.strip()
    for znak in ("✓", "⚠️", "⚠", "❌"):
        if tekst.startswith(znak):
            tekst = tekst[len(znak) :].strip()
    return tekst


def _kv(wartosc: float | None) -> str:
    return "brak danej" if wartosc is None else f"{format_liczba(wartosc)} kV"


def _przedmiot(track: DerSnTrack) -> Przedmiot:
    return Przedmiot(
        element_ref=track.source_ref,
        nazwa_pl=track.source_name or "źródło wytwórcze",
        opis_pl="Tor przyłączenia źródła wytwórczego do sieci SN (dane znamionowe modelu)",
    )


def _ocena(
    track: DerSnTrack,
    *,
    kryterium_id: str,
    opis_pl: str,
    wielkosc_pl: str,
    podstawa: PodstawaWymagania,
    spelniony: bool | None,
    stan_pl: str | None,
    braki: tuple[str, ...] = (),
) -> OcenaKryterium:
    """Rekord K kryterium logicznego toru: ``spelniony`` z rozstrzygnięcia walidacji D1
    (jedno źródło), ``None`` — ogniwa nie oceniono (``braki`` nazywają, czego brakuje)."""
    return ocena_porownania(
        Porownanie(
            kryterium_id=f"der_sn.{kryterium_id}",
            opis_pl=opis_pl,
            relacja="LOGICZNE",
            wielkosc_pl=wielkosc_pl,
            spelniony=spelniony,
            stan_pl=stan_pl,
            braki=braki,
            metoda_wyniku="DEKLARACJA",
        ),
        przedmiot=_przedmiot(track),
        podstawa=podstawa,
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_DOBOROW),
        zakres=_ZAKRES,
        odniesienie="application/analyses/raport_zgodnosci.py",
    )


def _pozycja(
    check_id: str,
    kategoria: str,
    ocena: OcenaKryterium,
    *,
    code: str,
    message_pl: str,
) -> dict[str, Any]:
    """Pozycja raportu z rekordem K; ``status`` jest projekcją rekordu."""
    return {
        "check_id": check_id,
        "kategoria": kategoria,
        "status": projekcja_statusu(
            (ocena,),
            spelnia=_STATUS_PASS,
            nie_spelnia=_STATUS_FAIL,
            nierozstrzygniete=_STATUS_WARN,
        ),
        "code": code,
        "message_pl": message_pl,
        "ocena": ocena.model_dump(mode="json"),
        "wyjasnienie": ocena.wyjasnienie.model_dump(mode="json"),
    }


def _d1_items(track: DerSnTrack) -> list[tuple[dict[str, Any], OcenaKryterium]]:
    """Twarde walidacje D1 ze zmaterializowanego toru (kody/komunikaty 1:1) z rekordami."""
    items: list[tuple[dict[str, Any], OcenaKryterium]] = []
    tr = track.block_transformer

    # 1. U_AC falownika ↔ strona nN TR blokowego (wymaganie 2).
    inverter_kv = _as_float(track.producer_bus.get("voltage_kv")) if track.producer_bus else None
    block_secondary_kv = _as_float(tr.get("ulv_kv")) if tr else None
    napiecia_nn = (
        f"U_AC falownika {_kv(inverter_kv)}, strona nN TR blokowego {_kv(block_secondary_kv)}"
    )
    if inverter_kv is not None and block_secondary_kv is not None:
        error = validate_inverter_lv_voltage(inverter_kv, block_secondary_kv)
        komunikat = (
            error.message_pl if error else "✓ Napięcie falownika zgodne ze stroną nN TR blokowego."
        )
        ocena = _ocena(
            track,
            kryterium_id="napiecie_falownika",
            opis_pl="Napięcie AC falownika zgodne z napięciem strony nN transformatora blokowego",
            wielkosc_pl="zgodność napięcia falownika ze stroną nN transformatora blokowego",
            podstawa=_PODSTAWA_NAPIECIA_FALOWNIKA,
            spelniony=error is None,
            stan_pl=f"{_bez_znaku(komunikat)} ({napiecia_nn})",
        )
        code = error.code if error else "der_sn.ok.napiecie_falownika"
    else:
        komunikat = (
            "⚠️ Zgodności napięcia falownika ze stroną nN TR blokowego nie oceniono — "
            "brak napięcia w modelu."
        )
        ocena = _ocena(
            track,
            kryterium_id="napiecie_falownika",
            opis_pl="Napięcie AC falownika zgodne z napięciem strony nN transformatora blokowego",
            wielkosc_pl="zgodność napięcia falownika ze stroną nN transformatora blokowego",
            podstawa=_PODSTAWA_NAPIECIA_FALOWNIKA,
            spelniony=None,
            stan_pl=None,
            braki=(f"napięcie znamionowe w modelu ({napiecia_nn})",),
        )
        code = "der_sn.brak.napiecie_falownika"
    items.append(
        (
            _pozycja("napiecie_falownika", "walidacja_D1", ocena, code=code, message_pl=komunikat),
            ocena,
        )
    )

    # 2. Strona SN TR blokowego ↔ napięcie szyny SN przyłączenia (wymaganie 6).
    block_primary_kv = None
    if track.block_hv_bus:
        block_primary_kv = _as_float(track.block_hv_bus.get("voltage_kv"))
    if block_primary_kv is None and tr:
        block_primary_kv = _as_float(tr.get("uhv_kv"))
    sn_bus_kv = _as_float(track.mv_bus.get("voltage_kv")) if track.mv_bus else None
    napiecia_sn = f"strona SN TR blokowego {_kv(block_primary_kv)}, szyna SN {_kv(sn_bus_kv)}"
    if block_primary_kv is not None and sn_bus_kv is not None:
        error = validate_sn_voltage(block_primary_kv, sn_bus_kv)
        komunikat = (
            error.message_pl if error else "✓ Strona SN TR blokowego zgodna z napięciem szyny SN."
        )
        ocena = _ocena(
            track,
            kryterium_id="napiecie_sn",
            opis_pl="Napięcie strony SN transformatora blokowego zgodne z napięciem szyny SN",
            wielkosc_pl="zgodność strony SN transformatora blokowego z szyną SN",
            podstawa=_PODSTAWA_NAPIECIA_SN,
            spelniony=error is None,
            stan_pl=f"{_bez_znaku(komunikat)} ({napiecia_sn})",
        )
        code = error.code if error else "der_sn.ok.napiecie_sn"
    else:
        komunikat = (
            "⚠️ Zgodności strony SN TR blokowego z szyną SN nie oceniono — brak napięcia "
            "w modelu."
        )
        ocena = _ocena(
            track,
            kryterium_id="napiecie_sn",
            opis_pl="Napięcie strony SN transformatora blokowego zgodne z napięciem szyny SN",
            wielkosc_pl="zgodność strony SN transformatora blokowego z szyną SN",
            podstawa=_PODSTAWA_NAPIECIA_SN,
            spelniony=None,
            stan_pl=None,
            braki=(f"napięcie znamionowe w modelu ({napiecia_sn})",),
        )
        code = "der_sn.brak.napiecie_sn"
    items.append(
        (
            _pozycja("napiecie_sn", "walidacja_D1", ocena, code=code, message_pl=komunikat),
            ocena,
        )
    )

    # 3. Moc TR blokowego (wymaganie 5 = decyzja O-53): TA SAMA kontrola co operacje
    # zapisu, z jawnymi wejściami zapisanymi przez tor tworzenia (`meta.kontrola_mocy_zrodla`).
    if tr is not None:
        # Suma po grupie transformatorów zasilających (punkt 1 karty O-53b) — ta sama grupa
        # i ta sama moc transformatorów, które sprawdza operacja zapisu.
        moc_tr = moc_transformatorow_mva(track.transformatory_grupy)
        odmowa = sprawdz_moc_generatora(
            track.generator,
            moc_transformatorow_mva=moc_tr,
            sprawdz_nastawe=False,
            pozostale_zrodla=track.pozostale_zrodla_grupy,
        )
        komunikat = (
            odmowa.komunikat_pl if odmowa else "✓ Moc transformatora blokowego wystarczająca."
        )
        ocena = _ocena(
            track,
            kryterium_id="moc_transformatora",
            opis_pl="Moc transformatorów grupy nie mniejsza od mocy wymaganej źródeł",
            wielkosc_pl="wystarczalność mocy transformatora blokowego",
            podstawa=_PODSTAWA_MOCY,
            spelniony=odmowa is None,
            stan_pl=_bez_znaku(komunikat),
        )
        code = odmowa.kod if odmowa else "der_sn.ok.moc_transformatora"
    else:
        komunikat = (
            "⚠️ Mocy transformatora blokowego nie oceniono — tor nie ma transformatora blokowego."
        )
        ocena = _ocena(
            track,
            kryterium_id="moc_transformatora",
            opis_pl="Moc transformatorów grupy nie mniejsza od mocy wymaganej źródeł",
            wielkosc_pl="wystarczalność mocy transformatora blokowego",
            podstawa=_PODSTAWA_MOCY,
            spelniony=None,
            stan_pl=None,
            braki=("transformator blokowy toru w modelu",),
        )
        code = "der_sn.brak.moc_transformatora"
    items.append(
        (
            _pozycja("moc_transformatora", "walidacja_D1", ocena, code=code, message_pl=komunikat),
            ocena,
        )
    )
    return items


def _informacje_typu(track: DerSnTrack) -> list[dict[str, Any]]:
    """Układ połączeń TR blokowego — parametr modelu z typu katalogowego (wymaganie 7).

    Pozycja INFORMACYJNA: układ połączeń pochodzi z typu katalogowego transformatora, więc
    „zgodność z typem" zachodzi z konstrukcji modelu — to nie jest ocena kryterium.
    """
    tr = track.block_transformer
    vector_group = tr.get("vector_group") if tr else None
    if not vector_group:
        return []
    return [
        {
            "check_id": "grupa_polaczen",
            "kategoria": "walidacja_D1",
            "status": STATUS_INFORMACJA,
            "code": "der_sn.info.grupa_polaczen",
            "message_pl": (f"Układ połączeń TR blokowego z typu katalogowego: {vector_group}."),
        }
    ]


def _cascade_items(track: DerSnTrack) -> list[tuple[dict[str, Any], OcenaKryterium]]:
    """Kaskada prądowa (wymaganie 5b) odtworzona ze stanu modelu (kody 1:1 z D1).

    Rozstrzygnięcie pochodzi z ``build_current_cascade_warnings`` (ta sama funkcja co
    walidacja zapisu): ogniwo bez danych → rekord ``NIE_OCENIONO`` z komunikatem D1 jako
    brakiem; przekroczenie I_TR > I_z → ``NIE_SPELNIA``; oba prądy znane bez przekroczenia →
    ``SPELNIA``. Ogniwo prądu znamionowego pola SN nie jest przechowywane liczbowo w modelu —
    gdy aparat ma powiązanie katalogowe, ogniwo sprawdziła operacja zapisu u źródła; brak
    powiązania sygnalizujemy rekordem ``kaskada_prad_pole_brak``.
    """
    cable_in_a = None
    if track.mv_cable and isinstance(track.mv_cable.get("rating"), dict):
        cable_in_a = _as_float(track.mv_cable["rating"].get("in_a"))
    apparatus_has_catalog = bool(track.apparatus and track.apparatus.get("catalog_ref"))
    i_tr = transformer_current_a(track)
    warnings = build_current_cascade_warnings(
        transformer_current_a=i_tr,
        cable_ampacity_a=cable_in_a,
        # Link pola zweryfikowany katalogowo → nie zgłaszaj „pole_brak"; wtedy sentinel
        # dodatni wyłącza ogniwo bez fabrykowania konkretnej wartości do porównań kaskady.
        field_rated_current_a=(float("inf") if apparatus_has_catalog else None),
    )
    items: list[tuple[dict[str, Any], OcenaKryterium]] = []
    for warning in warnings:
        if warning.code not in _KASKADA_BRAKI:
            continue
        ocena = _ocena(
            track,
            kryterium_id=warning.code.rsplit(".", 1)[-1],
            opis_pl=(
                "Kaskada prądu znamionowego toru (I_TR ≤ I_z kabla SN ≤ I_n pola SN) — "
                f"ogniwo: {_KASKADA_BRAKI[warning.code]}"
            ),
            wielkosc_pl=_KASKADA_BRAKI[warning.code],
            podstawa=_PODSTAWA_KASKADY,
            spelniony=None,
            stan_pl=None,
            braki=(_bez_znaku(warning.message_pl),),
        )
        items.append(
            (
                _pozycja(
                    warning.code,
                    "kaskada_pradowa",
                    ocena,
                    code=warning.code,
                    message_pl=warning.message_pl,
                ),
                ocena,
            )
        )
    if i_tr is not None and cable_in_a is not None:
        przekroczenie = next((w for w in warnings if w.code == _KASKADA_KABEL_PRZEKROCZONY), None)
        liczby = f"I_TR = {format_liczba(i_tr)} A, I_z kabla SN = {format_liczba(cable_in_a)} A"
        komunikat = (
            przekroczenie.message_pl
            if przekroczenie
            else "✓ Kaskada prądowa: prąd znamionowy TR blokowego nie przekracza obciążalności "
            "kabla SN."
        )
        ocena = _ocena(
            track,
            kryterium_id="kaskada_prad_kabel",
            opis_pl="Prąd znamionowy transformatora blokowego nie większy od obciążalności kabla SN",
            wielkosc_pl="ogniwo kaskady prądowej transformator blokowy → kabel SN",
            podstawa=_PODSTAWA_KASKADY,
            spelniony=przekroczenie is None,
            stan_pl=f"{_bez_znaku(komunikat)} ({liczby})",
        )
        code = przekroczenie.code if przekroczenie else "der_sn.ok.kaskada_prad_kabel"
        items.append(
            (
                _pozycja(
                    przekroczenie.code if przekroczenie else "kaskada_prad_kabel",
                    "kaskada_pradowa",
                    ocena,
                    code=code,
                    message_pl=komunikat,
                ),
                ocena,
            )
        )
    return items


def _d2_items(d2_deviations: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """Pozycje zgodności z propozycją D2 — INFORMACYJNE (bez werdyktu).

    Propozycja D2 to najmniejsza jednostka katalogu spełniająca wymaganie przy założeniach
    doboru; zastosowanie innej jednostki nie narusza wymagania (wystarczalność ocenia rekord
    D1 mocy i kaskady), więc odstępstwo jest uwagą dla projektanta, nie statusem oceny.
    """
    if not d2_deviations:
        return []
    items: list[dict[str, Any]] = []
    for deviation in d2_deviations:
        if deviation.get("nieoceniono"):
            # Odmowa danych przy liczeniu propozycji D2 (karta #151) — sekcja nie
            # została oceniona i raport mówi to wprost, z powodem, zamiast milczeć.
            items.append(
                {
                    "check_id": "d2.nieoceniono",
                    "kategoria": "zgodnosc_D2",
                    "status": STATUS_INFORMACJA,
                    "code": "der_sn.d2.nieoceniono",
                    "message_pl": (
                        "Zgodności z propozycją D2 nie oceniono: " f"{deviation.get('powod_pl')}"
                    ),
                    "odstepstwo": False,
                    "nieoceniono": True,
                }
            )
            continue
        parametr = str(deviation.get("parametr") or "")
        zastosowano = deviation.get("zastosowano")
        propozycja = deviation.get("propozycja")
        odstepstwo = bool(deviation.get("odstepstwo"))
        if odstepstwo:
            message = (
                f"Odstępstwo od propozycji D2 dla „{parametr}”: zastosowano "
                f"{zastosowano}, proponowano {propozycja}."
            )
        else:
            message = f"Dobór „{parametr}” zgodny z propozycją D2."
        items.append(
            {
                "check_id": f"d2.{parametr}",
                "kategoria": "zgodnosc_D2",
                "status": STATUS_INFORMACJA,
                "code": "der_sn.d2.odstepstwo" if odstepstwo else "der_sn.d2.zgodne",
                "message_pl": message,
                "parametr": parametr,
                "zastosowano": zastosowano,
                "propozycja": propozycja,
                "odstepstwo": odstepstwo,
                "nieoceniono": False,
            }
        )
    return items


def _run_item(
    track: DerSnTrack, run_status: str | None, readiness_codes: list[str] | None
) -> tuple[dict[str, Any], OcenaKryterium] | None:
    """Pozycja stanu biegu analiz (ukończony/nieudany/w toku + kody readiness) z rekordem."""
    if run_status is None:
        return None
    normalized = str(run_status).upper()
    completed = normalized in {"DONE", "COMPLETED", "SUCCESS", "SUCCEEDED"}
    failed = normalized in {"FAILED", "ERROR"}
    if completed:
        message = "✓ Bieg analiz (rozpływ + zwarcia) ukończony."
        spelniony: bool | None = True
    elif failed:
        message = "❌ Bieg analiz nieudany — wyniki niedostępne."
        spelniony = False
    else:
        message = "⚠️ Bieg analiz w toku — wyniki jeszcze niedostępne."
        spelniony = None
    ocena = _ocena(
        track,
        kryterium_id="bieg_analiz",
        opis_pl="Bieg analiz toru (rozpływ mocy i zwarcia) zakończony z wynikami",
        wielkosc_pl="stan biegu analiz toru",
        podstawa=_PODSTAWA_BIEGU,
        spelniony=spelniony,
        stan_pl=_bez_znaku(message) if spelniony is not None else None,
        braki=() if spelniony is not None else ("wyniki biegu analiz toru (bieg w toku)",),
    )
    pozycja = _pozycja(
        "bieg_analiz",
        "bieg_analiz",
        ocena,
        code=f"der_sn.run.{normalized.lower()}",
        message_pl=message,
    )
    pozycja["readiness_codes"] = list(readiness_codes or [])
    return pozycja, ocena


def ocena_doborow(track: DerSnTrack, oceny: Sequence[OcenaKryterium]) -> WynikWymagania:
    """Rekord W doborów toru nad rekordami pozycji (agregacja §2.3 kontraktu werdyktu)."""
    return wymaganie_z_ocen(
        wymaganie_id=WYMAGANIE_DOBOROW,
        nazwa_pl=(f"Dobory toru przyłączenia źródła {track.source_name or 'bez nazwy'} (DER-SN)"),
        podstawa=_PODSTAWA_WYMAGANIA,
        oceny=oceny,
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_DOBOROW),
        zakres=_ZAKRES,
        odniesienie="application/analyses/raport_zgodnosci.py",
        powod_stosowalnosci_pl="model zawiera tor przyłączenia źródła wytwórczego do sieci SN",
        sposob_wykazania="DEKLARACJA",
    )


def _kod_werdyktu(oceny: Sequence[OcenaKryterium], *, uwagi: bool) -> str:
    """Kod werdyktu raportu — projekcja rozstrzygnięcia rekordów (jedno źródło)."""
    wynik = rozstrzygniecie(oceny)
    if wynik is None:
        return WERDYKT_NIEROZSTRZYGNIETY
    if wynik == "NIE_SPELNIA":
        return WERDYKT_NIEZGODNY
    return WERDYKT_ZGODNY_Z_UWAGAMI if uwagi else WERDYKT_ZGODNY


def build_compliance_report_from_track(
    track: DerSnTrack,
    *,
    run_status: str | None = None,
    readiness_codes: list[str] | None = None,
    d2_deviations: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Zbuduj raport zgodności z gotowego widoku toru (deterministyczny)."""
    d1 = _d1_items(track)
    informacje = _informacje_typu(track)
    kaskada = _cascade_items(track)
    informacje_d2 = _d2_items(d2_deviations)
    bieg = _run_item(track, run_status, readiness_codes)
    z_rekordem = [*d1, *kaskada, *([bieg] if bieg is not None else [])]

    oceny = [ocena for _, ocena in z_rekordem]
    ocena_wymagania = ocena_doborow(track, oceny)
    uwagi = any(i["odstepstwo"] or i["nieoceniono"] for i in informacje_d2)
    werdykt = _kod_werdyktu(oceny, uwagi=uwagi)
    # Kolejność prezentacji (determinizm): D1, układ połączeń, kaskada, D2, bieg analiz.
    items = [
        *(pozycja for pozycja, _ in d1),
        *informacje,
        *(pozycja for pozycja, _ in kaskada),
        *informacje_d2,
        *([bieg[0]] if bieg is not None else []),
    ]

    return {
        "wersja": "1.0",
        "source_ref": track.source_ref,
        "source_name": track.source_name,
        "werdykt": werdykt,
        # Komunikat krytyczny kanonu z rekordu wymagania: jest naruszone kryterium składowe.
        "komunikat_krytyczny": (
            KOMUNIKAT_KRYTYCZNY if ocena_wymagania.kryteria_naruszone else None
        ),
        "pozycje": items,
        "podsumowanie": {
            "pass": sum(1 for i in items if i["status"] == _STATUS_PASS),
            "warn": sum(1 for i in items if i["status"] == _STATUS_WARN),
            "fail": sum(1 for i in items if i["status"] == _STATUS_FAIL),
            "informacja": sum(1 for i in items if i["status"] == STATUS_INFORMACJA),
            "razem": len(items),
        },
        "ocena_wymagania": ocena_wymagania.model_dump(mode="json"),
        "wyjasnienie": ocena_wymagania.wyjasnienie.model_dump(mode="json"),
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
