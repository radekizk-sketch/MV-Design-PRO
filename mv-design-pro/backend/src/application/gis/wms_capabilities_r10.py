"""GIS R10: kontrolowany rejestr usług WMS i parser GetCapabilities.

Laboratorium offline: brak HTTP do operatorów map, brak dostępu do ENM.
Wygenerowanie URL GetMap NIE dowodzi, że warstwa istnieje lub działa online.
"""
from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any
from urllib.parse import urlencode, urlsplit
import xml.etree.ElementTree as ET

from .psm_mdi_workflow_r08 import Rejected, require, hash_value

MAX_XML_CHARS = 250_000
MAX_LAYER_COUNT = 2_000
MAX_DEPTH = 24
SOURCES: dict[str, dict[str, str]] = {
    "GUGIK_ORTO": {
        "name": "Ortofotomapa GUGiK", "url":
        "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution",
        "category": "ortofotomapa",
    },
    "GUGIK_KIEG": {
        "name": "Krajowa Integracja Ewidencji Gruntów", "url":
        "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow",
        "category": "działki i budynki",
    },
    "GUGIK_KIUT": {
        "name": "Krajowa Integracja Uzbrojenia Terenu", "url":
        "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu",
        "category": "obraz uzbrojenia",
    },
    "GUGIK_KIBDOT": {
        "name": "Krajowa Integracja BDOT", "url":
        "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaBazDanychObiektowTopograficznych",
        "category": "obiekty topograficzne",
    },
}


def _tag(elem: ET.Element) -> str:
    return elem.tag.rsplit("}", 1)[-1]


def _child(elem: ET.Element, tag: str) -> ET.Element | None:
    return next((x for x in elem if _tag(x) == tag), None)


def _text(elem: ET.Element, tag: str) -> str | None:
    x = _child(elem, tag)
    if x is None or x.text is None:
        return None
    return x.text.strip()


def _list_text(elem: ET.Element, tag: str) -> list[str]:
    return [x.text.strip() for x in elem if _tag(x) == tag and x.text and x.text.strip()]


def source_catalog() -> list[dict[str, Any]]:
    return [{"id": key, **value, "verified_online": False, "enabled": False}
            for key, value in sorted(SOURCES.items())]


def parse_capabilities(source_id: str, xml_text: str) -> dict[str, Any]:
    require(source_id in SOURCES, "WMS_SOURCE_NOT_ALLOWLISTED")
    require(type(xml_text) is str and 0 < len(xml_text) <= MAX_XML_CHARS,
            "WMS_XML_SIZE_INVALID")
    require(not re.search(r"<!\s*(?:DOCTYPE|ENTITY)\b", xml_text, re.IGNORECASE),
            "WMS_XML_DTD_FORBIDDEN")
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise Rejected("WMS_XML_INVALID") from exc
    require(_tag(root) in {"WMS_Capabilities", "WMT_MS_Capabilities"},
            "WMS_ROOT_INVALID")
    version = root.attrib.get("version")
    require(version == "1.3.0", "WMS_VERSION_UNSUPPORTED")
    capability = _child(root, "Capability")
    require(capability is not None, "WMS_CAPABILITY_MISSING")
    top = _child(capability, "Layer")
    require(top is not None, "WMS_LAYER_MISSING")
    service = _child(root, "Service")
    title = _text(service, "Title") if service is not None else None
    layers: list[dict[str, Any]] = []
    count = 0

    def visit(layer: ET.Element, inherited_crs: frozenset[str], depth: int) -> None:
        nonlocal count
        require(depth <= MAX_DEPTH, "WMS_NESTING_TOO_DEEP")
        count += 1
        require(count <= MAX_LAYER_COUNT, "WMS_TOO_MANY_LAYERS")
        crs = inherited_crs | frozenset(_list_text(layer, "CRS"))
        name = _text(layer, "Name")
        if name:
            require(len(name) <= 180, "WMS_LAYER_NAME_TOO_LONG")
            layers.append({
                "name": name, "title": (_text(layer, "Title") or name)[:240],
                "epsg3857": "EPSG:3857" in crs,
                "queryable": layer.attrib.get("queryable") == "1",
            })
        for child in layer:
            if _tag(child) == "Layer":
                visit(child, crs, depth + 1)

    visit(top, frozenset(), 0)
    require(len({x["name"] for x in layers}) == len(layers),
            "WMS_DUPLICATE_LAYER_NAME")
    return {
        "source_id": source_id, "service_title": title or SOURCES[source_id]["name"],
        "version": version, "capabilities_digest": hash_value(xml_text),
        "layers": layers, "verified_online": False,
        "origin": "USER_SUPPLIED_XML_UNVERIFIED",
        "warnings": [
            "Dokument GetCapabilities przekazany przez użytkownika; nie potwierdzono autentyczności.",
            "WMS jest obrazem, nie źródłem topologii ENM ani danych kolizyjnych.",
            "Żądanie GetMap ujawni serwerowi obszar przeglądanej mapy (BBOX).",
        ],
    }


def prepare_raster_layer(
    parsed: dict[str, Any], *, source_id: str, layer_name: str,
    user_consented: bool,
) -> dict[str, Any]:
    require(source_id in SOURCES, "WMS_SOURCE_NOT_ALLOWLISTED")
    require(type(user_consented) is bool and user_consented,
            "WMS_EXPLICIT_CONSENT_REQUIRED")
    require(type(layer_name) is str and bool(layer_name) and len(layer_name) <= 180,
            "WMS_LAYER_INVALID")
    require(parsed.get("source_id") == source_id, "WMS_SOURCE_MISMATCH")
    matches = [x for x in parsed.get("layers", [])
               if x["name"] == layer_name and x["epsg3857"]]
    require(len(matches) == 1, "WMS_LAYER_OR_CRS_UNVERIFIED")
    base = SOURCES[source_id]["url"]
    parts = urlsplit(base)
    require(parts.scheme == "https" and parts.hostname is not None
            and not parts.username and not parts.password and not parts.query
            and not parts.fragment, "WMS_ENDPOINT_UNSAFE")
    params = {
        "SERVICE": "WMS", "REQUEST": "GetMap", "VERSION": "1.3.0",
        "LAYERS": layer_name, "STYLES": "", "FORMAT": "image/png",
        "TRANSPARENT": "TRUE", "CRS": "EPSG:3857",
        "BBOX": "{bbox-epsg-3857}", "WIDTH": "256", "HEIGHT": "256",
    }
    url = base + "?" + urlencode(params, safe="{}-:,")
    return {
        "type": "raster", "tiles": [url], "tileSize": 256,
        "attribution": SOURCES[source_id]["name"],
        "source_id": source_id, "layer_name": layer_name,
        "capabilities_digest": parsed["capabilities_digest"],
        "network_request_executed": False,
        "access_verified": False,
        "user_consented": True,
        "not_for_enm": True,
    }
