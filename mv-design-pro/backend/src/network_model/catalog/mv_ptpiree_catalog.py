from __future__ import annotations

from typing import Any

from .types import (
    CATALOG_CONTRACT_VERSION,
    CatalogStatus,
    CatalogVerificationStatus,
    normalize_ptpiree_key,
)


PTPIREE_SOURCE_PAGE_URL = "https://ptpiree.pl/kodeksy-sieci/wykaz-certyfikatow/"
PTPIREE_WIPWC_13_PDF_URL = (
    "https://ptpiree.pl/wp-content/uploads/2026/05/2026-05-20-Wykaz-urzadzen_1.3.pdf"
)
PTPIREE_PUBLICATION_DATE = "2026-05-20"
PTPIREE_ACCEPTED_FROM = "2024-11-01"


def get_ptpiree_catalog_manifest() -> dict[str, Any]:
    return {
        "source": "PTPiREE Wykaz certyfikowanych urzadzen",
        "source_page_url": PTPIREE_SOURCE_PAGE_URL,
        "current_wipwc_version": "1.3",
        "publication_date": PTPIREE_PUBLICATION_DATE,
        "accepted_from": PTPIREE_ACCEPTED_FROM,
        "update_policy": "PTPiREE publikuje aktualizacje wykazu nie rzadziej niz raz w miesiacu.",
        "integration_policy": (
            "MV-DESIGN-PRO przechowuje znormalizowany snapshot wykazu i zapisuje "
            "source_url/publication_date przy kazdym rekordzie. Ostateczna akceptacja "
            "przylaczeniowa pozostaje po stronie wlasciwego OSD."
        ),
    }


def _record(
    *,
    item_id: str,
    manufacturer: str,
    model: str,
    device_type: str,
    document_number: str,
    document_acceptance_date: str,
    wos_version: str,
    ppm_scope: str,
    firmware_version: str | None,
    note: str | None = None,
) -> dict[str, Any]:
    return {
        "id": item_id,
        "name": f"{manufacturer} {model}",
        "params": {
            "manufacturer": manufacturer,
            "model": model,
            "device_type": device_type,
            "document_number": document_number,
            "document_acceptance_date": document_acceptance_date,
            "wos_version": wos_version,
            "wipwc_version": "1.3",
            "ppm_scope": ppm_scope,
            "firmware_version": firmware_version,
            "source_url": PTPIREE_WIPWC_13_PDF_URL,
            "publication_date": PTPIREE_PUBLICATION_DATE,
            "accepted_from": PTPIREE_ACCEPTED_FROM,
            "verification_status": CatalogVerificationStatus.ZWERYFIKOWANY.value,
            "catalog_status": CatalogStatus.PRODUKCYJNY_V1.value,
            "source_reference": (
                "PTPiREE Wykaz urzadzen 1.3, publikacja 2026-05-20, "
                "wykaz akceptowany od 2024-11-01"
            ),
            "contract_version": CATALOG_CONTRACT_VERSION,
            "verification_note": note,
        },
    }


PTPIREE_GENERATOR_CERTIFICATES: list[dict[str, Any]] = [
    _record(
        item_id="ptpiree-wos2025-altenergy-ezhi",
        manufacturer="ALTENERGY POWER SYSTEM INC.",
        model="EZHI - tylko z modulem zdalnego pozyskiwania danych VCB-5131LN-WB",
        device_type="Falownik",
        document_number="4479923053408",
        document_acceptance_date="05.02.2029",
        wos_version="WOS 2025",
        ppm_scope="A",
        firmware_version="REV 1.0",
    ),
    _record(
        item_id="ptpiree-wos2025-altenergy-ezhi-m",
        manufacturer="ALTENERGY POWER SYSTEM INC.",
        model="EZHI-M - tylko z modulem zdalnego pozyskiwania danych VCB-5131LN-WB",
        device_type="Falownik",
        document_number="4479923053408",
        document_acceptance_date="05.02.2029",
        wos_version="WOS 2025",
        ppm_scope="A",
        firmware_version="REV 1.0",
    ),
    _record(
        item_id="ptpiree-wos2025-altenergy-ezhi-l",
        manufacturer="ALTENERGY POWER SYSTEM INC.",
        model="EZHI-L - tylko z modulem zdalnego pozyskiwania danych VCB-5131LN-WB",
        device_type="Falownik",
        document_number="4479923053408",
        document_acceptance_date="05.02.2029",
        wos_version="WOS 2025",
        ppm_scope="A",
        firmware_version="REV 1.0",
    ),
    _record(
        item_id="ptpiree-wos2018-danfoss-nxi-0520-5",
        manufacturer="Danfoss Drives Oy",
        model="NXI_0520_5",
        device_type="Dwukierunkowy konwerter energii elektrycznej",
        document_number="240127-2-CER-E1",
        document_acceptance_date="31.12.2026",
        wos_version="WOS 2018",
        ppm_scope="A,B,C,D",
        firmware_version="ARFIF106",
        note=(
            "WOS 2018 w okresie przejsciowym; wymaga sprawdzenia daty akceptacji "
            "i warunkow WiPWC dla konkretnego projektu."
        ),
    ),
    _record(
        item_id="ptpiree-wos2018-danfoss-nxa-1300-5",
        manufacturer="Danfoss Drives Oy",
        model="NXA_1300_5",
        device_type="Dwukierunkowy konwerter energii elektrycznej",
        document_number="240127-2-CER-E1",
        document_acceptance_date="31.12.2026",
        wos_version="WOS 2018",
        ppm_scope="A,B,C,D",
        firmware_version="ARFIF106",
        note=(
            "WOS 2018 w okresie przejsciowym; wymaga sprawdzenia daty akceptacji "
            "i warunkow WiPWC dla konkretnego projektu."
        ),
    ),
    _record(
        item_id="ptpiree-wos2018-dunext-dn3h-25k-h3",
        manufacturer="Dunext Technology Suzhou Co., Ltd.",
        model="DN3H-25K-H3",
        device_type="Falownik fotowoltaiczny z opcja akumulatora",
        document_number="25-377-00",
        document_acceptance_date="31.12.2026",
        wos_version="WOS 2018",
        ppm_scope="A",
        firmware_version="V1.00",
        note=(
            "WOS 2018 w okresie przejsciowym; wymaga potwierdzenia aktualnego "
            "statusu przed warunkami przylaczenia."
        ),
    ),
]


def get_all_ptpiree_generator_certificates() -> list[dict[str, Any]]:
    return list(PTPIREE_GENERATOR_CERTIFICATES)


def match_ptpiree_certificate(
    *,
    manufacturer: str | None,
    model: str | None,
    certificates: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    manufacturer_key = normalize_ptpiree_key(manufacturer)
    model_key = normalize_ptpiree_key(model)
    if not manufacturer_key or not model_key:
        return None

    for record in certificates or PTPIREE_GENERATOR_CERTIFICATES:
        params = record.get("params") or {}
        cert_manufacturer = normalize_ptpiree_key(params.get("manufacturer"))
        cert_model = normalize_ptpiree_key(params.get("model"))
        if manufacturer_key == cert_manufacturer and (
            model_key == cert_model or model_key in cert_model or cert_model in model_key
        ):
            return record
    return None


def annotate_with_ptpiree_status(record: dict[str, Any]) -> dict[str, Any]:
    params = dict(record.get("params") or {})
    match = match_ptpiree_certificate(
        manufacturer=params.get("manufacturer"),
        model=params.get("model"),
    )
    if match is None:
        params.setdefault("ptpiree_status", "NIEPOWIAZANY")
        params.setdefault("ptpiree_note", "Brak dopasowania do lokalnego snapshotu PTPiREE.")
    else:
        match_params = match.get("params") or {}
        params.update(
            {
                "ptpiree_status": "POWIAZANY",
                "ptpiree_certificate_ref": match["id"],
                "ptpiree_document_number": match_params.get("document_number"),
                "ptpiree_document_acceptance_date": match_params.get(
                    "document_acceptance_date"
                ),
                "ptpiree_wos_version": match_params.get("wos_version"),
                "ptpiree_wipwc_version": match_params.get("wipwc_version"),
                "ptpiree_ppm_scope": match_params.get("ppm_scope"),
                "ptpiree_source_url": match_params.get("source_url"),
                "ptpiree_publication_date": match_params.get("publication_date"),
            }
        )
    return {"id": record["id"], "name": record["name"], "params": params}
