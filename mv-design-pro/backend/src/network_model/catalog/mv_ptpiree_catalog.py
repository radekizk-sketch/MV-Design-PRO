"""Wykaz certyfikowanych urzadzen PTPiREE — JEDNO ZRODLO PRAWDY.

Modul stempluje `ptpiree_status` na rekordach katalogu urzadzen (kreator DER,
Etap 5, wniosek do OSD). Status „urzadzenie na wykazie PTPiREE" decyduje o
przyjeciu wniosku przez OSD, wiec falszywy NIEPOWIAZANY na certyfikowanym
falowniku jest defektem, a nie kosmetyka.

ZRODLO DANYCH
-------------
Rekordy pochodza WYLACZNIE ze znormalizowanego snapshotu wykazu
(`ptpiree_wykaz_snapshot.json`), ktory jest druga projekcja tego samego
przebiegu `scripts/generate_ptpiree_inverter_catalog.py`, co artefakt
frontendowy `ptpireeCertifiedInverters.generated.ts`. Do 2026-08 modul mial
WLASNY, recznie przepisany mini-snapshot 6 rekordow — kazde urzadzenie spoza
tej szostki dostawalo NIEPOWIAZANY mimo obecnosci w wykazie. Recznych rekordow
w tym module juz NIE MA; parytet obu artefaktow pilnuje
`tests/network_model/catalog/test_ptpiree_wykaz_snapshot.py`.

DOPASOWANIE JAKO KLASA, NIE LISTA PRZYPADKOW
--------------------------------------------
Wiersze wykazu nie sa czyste — niosa warianty zapisu, ktore trzeba znormalizowac
regula, nie wyliczeniem:

* warunek waznosci certyfikatu doklejony do nazwy modelu
  („EZHI - Tylko z modulem zdalnego pozyskiwania danych VCB-5131LN-WB");
  warunek NIE ZNIKA — trafia do `ptpiree_note`, bo projektant musi go zobaczyc,
* warianty zapisu producenta (wielkosc liter, interpunkcja, forma prawna
  „Inc." / „Co., Ltd." / „Sp. z o.o."),
* doklejony z kolumny PDF fragment rodzaju urzadzenia przed oznaczeniem modelu
  („PV SUN2000-215KTL-H3", „fotowoltaiczny CSI-15K-T4001A-E").

Dopasowanie jest RELACJA ROWNOSCI na znormalizowanych kluczach — nigdy
zawieraniem podciagu. Poprzednia implementacja dopasowywala dwukierunkowym
`in`, co przy pelnym wykazie (tysiace wierszy, klucze tak krotkie jak „QT2"
czy „R75") produkowaloby falszywe POWIAZANY, czyli zawyzalo zgodnosc wniosku
przylaczeniowego.

ZERO FABRYKACJI: pole, ktorego wiersz wykazu nie podaje (np. wersja WOS w
wykazie 1.2), zostaje puste — nie jest zgadywane.
"""

from __future__ import annotations

import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Any

from .types import (
    CATALOG_CONTRACT_VERSION,
    CatalogStatus,
    CatalogVerificationStatus,
)

PTPIREE_SOURCE_PAGE_URL = "https://ptpiree.pl/kodeksy-sieci/wykaz-certyfikatow/"

#: Data, od ktorej OSD akceptuja wykaz PTPiREE. To fakt regulacyjny, a NIE dana
#: z wiersza wykazu — dlatego zostaje stala modulu i jest stemplowana jednolicie.
PTPIREE_ACCEPTED_FROM = "2024-11-01"

SNAPSHOT_PATH = Path(__file__).with_name("ptpiree_wykaz_snapshot.json")
SNAPSHOT_SCHEMA = "ptpiree_wykaz_snapshot/v1"

_SOURCE_REFERENCE_TEMPLATE = "PTPiREE Wykaz urzadzen {version}, publikacja {published}"

# --------------------------------------------------------------------------
# NORMALIZACJA — jedno zrodlo prawdy dla obu stron porownania
# --------------------------------------------------------------------------

_PL_TO_ASCII = str.maketrans(
    {
        "ą": "a",
        "ć": "c",
        "ę": "e",
        "ł": "l",
        "ń": "n",
        "ó": "o",
        "ś": "s",
        "ź": "z",
        "ż": "z",
        "Ą": "A",
        "Ć": "C",
        "Ę": "E",
        "Ł": "L",
        "Ń": "N",
        "Ó": "O",
        "Ś": "S",
        "Ź": "Z",
        "Ż": "Z",
    }
)

#: Formy prawne spolek. Pomijane przy porownaniu producenta, bo ten sam podmiot
#: bywa zapisany „Co., Ltd", „Co.,Ltd", „Co, Ltd" i „Co. , Ltd" w jednym wykazie.
_LEGAL_FORM_TOKENS = frozenset(
    {
        "CO",
        "LTD",
        "LTDA",
        "INC",
        "INCORPORATED",
        "GMBH",
        "HMBG",
        "MBH",
        "AG",
        "OY",
        "OYJ",
        "AB",
        "SA",
        "SAS",
        "SL",
        "SP",
        "SPA",
        "SRL",
        "BV",
        "NV",
        "AS",
        "APS",
        "LLC",
        "LLP",
        "PLC",
        "KFT",
        "ZOO",
        "OO",
        "Z",
        "SPZOO",
        "LIMITED",
        "COMPANY",
        "CORPORATION",
        "CORP",
        "KG",
        "SE",
        "DOO",
    }
)

#: Fragmenty rodzaju urzadzenia, ktore parser PDF-ow doklei przed oznaczeniem
#: modelu. Lista ZAMKNIETA — wywodzi sie z kolumny „Rodzaj urzadzenia" wykazu
#: i jest przypieta testem `test_klasa_prefiksow_rodzaju_urzadzenia_jest_zamknieta`.
_DEVICE_KIND_PREFIX_TOKENS = frozenset(
    {
        "PV",
        "FOTOWOLTAICZNY",
        "FOTOWOLTAICZNA",
        "FOTOWOLTAIKA",
        "SOLARNY",
        "HYBRYDOWY",
        "HYBRYDOWA",
        "TROJFAZOWY",
        "JEDNOFAZOWY",
        "DWUKIERUNKOWY",
        "INTERAKTYWNY",
        "MAGAZYNUJACY",
        "AKUMULATOROWY",
        "FALOWNIK",
        "INWERTER",
        "MIKROINWERTER",
        "PRZEKSZTALTNIK",
        "KONWERTER",
    }
)

#: Klasa „warunek waznosci certyfikatu": ogon nazwy modelu otwarty slowem
#: „tylko" (opcjonalnie po myslniku/przecinku). Nie jest to konkretna fraza,
#: tylko regula — kazdy warunek „tylko z ..." zostaje odciety i zachowany.
_CERTIFICATE_CONDITION_RE = re.compile(r"\s*[-–—,]?\s*\btylko\b.*$", re.IGNORECASE)

_WIPWC_VERSION_RE = re.compile(r"(\d+(?:\.\d+)*)")


def _fold(value: Any) -> str:
    """Znormalizowany klucz porownania: bez diakrytykow, bez interpunkcji, WERSALIKI."""

    text = str(value or "").translate(_PL_TO_ASCII)
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^A-Za-z0-9]+", " ", text)
    return " ".join(text.upper().split())


def split_certificate_condition(model: Any) -> tuple[str, str | None]:
    """Rozdziela oznaczenie modelu od warunku waznosci certyfikatu.

    Zwraca (oznaczenie, warunek). Warunek to tekst wprost z wykazu — nie jest
    parafrazowany, bo jest czescia tresci certyfikatu.
    """

    raw = " ".join(str(model or "").split())
    match = _CERTIFICATE_CONDITION_RE.search(raw)
    if not match:
        return raw, None
    base = raw[: match.start()].strip(" -,–—")
    condition = raw[match.start() :].strip(" -,–—")
    if not base:
        # Cala nazwa jest warunkiem — nie ma czego odcinac.
        return raw, None
    return base, condition


def _strip_device_kind_prefix(folded_model: str) -> str:
    tokens = folded_model.split()
    index = 0
    while index < len(tokens) - 1 and tokens[index] in _DEVICE_KIND_PREFIX_TOKENS:
        index += 1
    return " ".join(tokens[index:])


def model_match_keys(model: Any) -> tuple[str, ...]:
    """Klucze, pod ktorymi model jest dopasowywany (kolejnosc = malejaca dokladnosc)."""

    base, _condition = split_certificate_condition(model)
    keys: list[str] = []
    for candidate in (_fold(model), _fold(base)):
        if candidate and candidate not in keys:
            keys.append(candidate)
        stripped = _strip_device_kind_prefix(candidate)
        if stripped and stripped not in keys:
            keys.append(stripped)
    return tuple(keys)


def manufacturer_tokens(manufacturer: Any) -> tuple[str, ...]:
    """Tokeny nazwy producenta bez formy prawnej."""

    return tuple(token for token in _fold(manufacturer).split() if token not in _LEGAL_FORM_TOKENS)


def manufacturers_match(left: Any, right: Any) -> bool:
    """Czy dwa zapisy wskazuja tego samego producenta.

    Regula: po odrzuceniu formy prawnej i sklejeniu tokenow jedna nazwa jest
    PREFIKSEM drugiej. Dzieki temu „SUNGROW" (karta katalogowa) spotyka sie z
    „Sungrow Power Supply Co., Ltd" (wykaz), a rozjazdy spacji i apostrofu w
    samym wykazie („(Zhe jiang)" / „(Zhejiang)", „Xi'an" / „Xi’an") przestaja
    dzielic jednego producenta na dwoch.

    Prefiks, a nie zawieranie: „BYD" NIE zlewa sie z „Shanwei BYD Auto Co.,
    Ltd" — trafienie w srodku nazwy jest odrzucane, bo to inny podmiot.

    POMIAR (wykaz 2026-05, 245 producentow): regula scala wszystkie 29 grup
    wariantow zapisu, a jedyne 5 par dopasowanych ponad regula tokenowa to
    warianty zapisu TEGO SAMEGO podmiotu (SolaX, SolarEdge, TBEA).
    """

    left_key = "".join(manufacturer_tokens(left))
    right_key = "".join(manufacturer_tokens(right))
    if not left_key or not right_key:
        return False
    return left_key.startswith(right_key) or right_key.startswith(left_key)


# --------------------------------------------------------------------------
# SNAPSHOT WYKAZU
# --------------------------------------------------------------------------


@lru_cache(maxsize=1)
def _load_snapshot() -> dict[str, Any]:
    with SNAPSHOT_PATH.open(encoding="utf-8") as handle:
        snapshot: dict[str, Any] = json.load(handle)
    schema = snapshot.get("schema")
    if schema != SNAPSHOT_SCHEMA:
        raise ValueError(f"nieobslugiwany schemat snapshotu PTPiREE: {schema!r}")
    return snapshot


def _wipwc_version(source_version: Any) -> str:
    match = _WIPWC_VERSION_RE.search(str(source_version or ""))
    return match.group(1) if match else ""


def _record_from_row(row: dict[str, Any], publication_date: str) -> dict[str, Any]:
    manufacturer = str(row.get("manufacturer") or "")
    model = str(row.get("model") or "")
    _base, condition = split_certificate_condition(model)
    version = _wipwc_version(row.get("source_version"))
    return {
        "id": str(row.get("id") or ""),
        "name": f"{manufacturer} {model}".strip(),
        "params": {
            "manufacturer": manufacturer,
            "model": model,
            "device_type": str(row.get("device_kind") or ""),
            "document_number": str(row.get("document_number") or ""),
            "document_acceptance_date": str(row.get("acceptance_date") or ""),
            # Wykaz 1.2 nie podaje wersji WOS — puste, nie zgadywane.
            "wos_version": str(row.get("wos_version") or ""),
            "wipwc_version": version,
            "ppm_scope": ",".join(row.get("module_types") or []),
            "firmware_version": row.get("firmware") or None,
            "source_url": str(row.get("source_url") or ""),
            "source_page": row.get("source_page"),
            "source_row": row.get("source_row"),
            "publication_date": publication_date,
            "accepted_from": PTPIREE_ACCEPTED_FROM,
            "certificate_condition": condition,
            "verification_status": CatalogVerificationStatus.ZWERYFIKOWANY.value,
            "catalog_status": CatalogStatus.PRODUKCYJNY_V1.value,
            "source_reference": _SOURCE_REFERENCE_TEMPLATE.format(
                version=version, published=publication_date
            ),
            "contract_version": CATALOG_CONTRACT_VERSION,
            "verification_note": condition,
        },
    }


@lru_cache(maxsize=1)
def _certificates() -> tuple[dict[str, Any], ...]:
    snapshot = _load_snapshot()
    published = {
        str(source["source_id"]): str(source["publication_date"])
        for source in snapshot.get("sources") or []
    }
    records = [
        _record_from_row(row, published.get(str(row.get("source_id")), ""))
        for row in snapshot.get("records") or []
    ]
    records.sort(key=lambda record: str(record["id"]))
    return tuple(records)


def _certificate_order_key(record: dict[str, Any]) -> tuple[Any, ...]:
    """Deterministyczna kolejnosc: najnowszy wykaz wygrywa, potem numer wiersza."""

    params = record.get("params") or {}
    published = str(params.get("publication_date") or "")
    # Malejaco po dacie publikacji bez odwracania calego klucza.
    date_key = tuple(-int(part) for part in published.split("-") if part.isdigit())
    row = params.get("source_row")
    return (date_key, row if isinstance(row, int) else 0, str(record.get("id") or ""))


def _build_index(records: tuple[dict[str, Any], ...]) -> dict[str, tuple[dict[str, Any], ...]]:
    buckets: dict[str, list[dict[str, Any]]] = {}
    for record in records:
        for key in model_match_keys((record.get("params") or {}).get("model")):
            buckets.setdefault(key, []).append(record)
    return {
        key: tuple(sorted(bucket, key=_certificate_order_key)) for key, bucket in buckets.items()
    }


@lru_cache(maxsize=1)
def _default_index() -> dict[str, tuple[dict[str, Any], ...]]:
    return _build_index(_certificates())


# --------------------------------------------------------------------------
# API MODULU
# --------------------------------------------------------------------------


def get_ptpiree_catalog_manifest() -> dict[str, Any]:
    """Metadane wykazu — licznosc i daty pochodza Z ARTEFAKTU, nie z literalu."""

    snapshot = _load_snapshot()
    sources = sorted(
        snapshot.get("sources") or [],
        key=lambda source: str(source.get("publication_date") or ""),
    )
    newest = sources[-1] if sources else {}
    return {
        "source": "PTPiREE Wykaz certyfikowanych urzadzen",
        "source_page_url": PTPIREE_SOURCE_PAGE_URL,
        "current_wipwc_version": _wipwc_version(newest.get("source_version")),
        "publication_date": str(newest.get("publication_date") or ""),
        "accepted_from": PTPIREE_ACCEPTED_FROM,
        "record_count": int(snapshot.get("record_count") or 0),
        "sources": [
            {
                "source_id": str(source.get("source_id") or ""),
                "wipwc_version": _wipwc_version(source.get("source_version")),
                "source_url": str(source.get("source_url") or ""),
                "publication_date": str(source.get("publication_date") or ""),
                "record_count": int(source.get("record_count") or 0),
            }
            for source in sources
        ],
        "update_policy": "PTPiREE publikuje aktualizacje wykazu nie rzadziej niz raz w miesiacu.",
        "integration_policy": (
            "MV-DESIGN-PRO przechowuje znormalizowany snapshot wykazu i zapisuje "
            "source_url/publication_date przy kazdym rekordzie. Ostateczna akceptacja "
            "przylaczeniowa pozostaje po stronie wlasciwego OSD."
        ),
    }


def get_all_ptpiree_generator_certificates() -> list[dict[str, Any]]:
    # Kopiowana jest LISTA, nie rekordy — tak samo jak przed przejsciem na pelny
    # wykaz. Przy 6887 wierszach kopiowanie kazdego slownika kosztowaloby ~37 ms
    # na kazde zbudowanie repozytorium katalogu, a odbiorcy tylko czytaja.
    return list(_certificates())


def match_ptpiree_certificate(
    *,
    manufacturer: str | None,
    model: str | None,
    certificates: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    """Zwraca wiersz wykazu odpowiadajacy urzadzeniu albo None.

    Producent i model musza pasowac JEDNOCZESNIE. Przy kilku wierszach na to
    samo urzadzenie (to samo urzadzenie bywa w wykazie 1.2 i 1.3) wygrywa
    najnowszy wykaz — wynik jest deterministyczny.
    """

    if not manufacturer or not model:
        return None

    index = _build_index(tuple(certificates)) if certificates is not None else _default_index()

    seen: set[str] = set()
    candidates: list[dict[str, Any]] = []
    for key in model_match_keys(model):
        for record in index.get(key, ()):
            record_id = str(record.get("id") or "")
            if record_id in seen:
                continue
            seen.add(record_id)
            candidates.append(record)

    matching = [
        record
        for record in candidates
        if manufacturers_match(manufacturer, (record.get("params") or {}).get("manufacturer"))
    ]
    if not matching:
        return None
    return min(matching, key=_certificate_order_key)


@lru_cache(maxsize=1)
def _no_match_note() -> str:
    # Nota jest funkcja samego snapshotu, a powstaje raz na KAZDY niedopasowany
    # rekord katalogu — bez pamieci podrecznej manifest budowalby sie 175 razy
    # przy jednym odczycie katalogu przetwornic.
    manifest = get_ptpiree_catalog_manifest()
    versions = "/".join(source["wipwc_version"] for source in manifest["sources"])
    return (
        f"Brak dopasowania w wykazie PTPiREE (snapshot: {manifest['record_count']} "
        f"rekordow, WiPWC {versions}, publikacja {manifest['publication_date']})."
    )


def _match_note(match_params: dict[str, Any]) -> str:
    condition = match_params.get("certificate_condition")
    published = match_params.get("publication_date") or ""
    version = match_params.get("wipwc_version") or ""
    base = f"Pozycja wykazu PTPiREE WiPWC {version} (publikacja {published})."
    if condition:
        # Warunek waznosci certyfikatu NIE moze zniknac — projektant musi go
        # zobaczyc, bo bez spelnienia warunku certyfikat nie obowiazuje.
        return f"{base} Warunek waznosci certyfikatu: {condition}"
    return base


def annotate_with_ptpiree_status(record: dict[str, Any]) -> dict[str, Any]:
    params = dict(record.get("params") or {})
    match = match_ptpiree_certificate(
        manufacturer=params.get("manufacturer"),
        model=params.get("model"),
    )
    if match is None:
        params.setdefault("ptpiree_status", "NIEPOWIAZANY")
        params.setdefault("ptpiree_note", _no_match_note())
    else:
        match_params = match.get("params") or {}
        params.update(
            {
                "ptpiree_status": "POWIAZANY",
                "ptpiree_certificate_ref": match["id"],
                "ptpiree_document_number": match_params.get("document_number"),
                "ptpiree_document_acceptance_date": match_params.get("document_acceptance_date"),
                "ptpiree_wos_version": match_params.get("wos_version") or None,
                "ptpiree_wipwc_version": match_params.get("wipwc_version"),
                "ptpiree_ppm_scope": match_params.get("ppm_scope"),
                "ptpiree_source_url": match_params.get("source_url"),
                "ptpiree_publication_date": match_params.get("publication_date"),
                "ptpiree_note": _match_note(match_params),
                # Styk P1/P2 (V12K-321): WARUNEK waznosci osobnym polem — nota
                # jest OPISEM dowodowym i istnieje dla kazdego dopasowania, wiec
                # tor gotowosci nie moze na niej kluczowac (falszywy alarm na
                # kazdym poprawnie powiazanym urzadzeniu).
                "ptpiree_certificate_condition": match_params.get("certificate_condition"),
            }
        )
    return {"id": record["id"], "name": record["name"], "params": params}
