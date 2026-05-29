"""
Canonical RDF/XML writer built on stdlib ``xml.etree.ElementTree``.

Determinism requirements (D-02 §Determinism Rule):
  - fixed namespace prefixes (cim:/rdf:/md:) declared in a fixed order
  - attributes emitted in sorted order
  - child elements emitted in the order they were appended (callers sort)
  - NO timestamps anywhere in the XML body
  - UTF-8 output

``ElementTree.tostring`` does not guarantee attribute ordering or prefix
control across Python builds, so we implement a small, explicit serializer.
Element tags and attribute names use Clark notation ``{uri}local`` and are
mapped back to ``prefix:local`` using the fixed prefix table.

ZERO physics; imports neither solvers nor analysis.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape, quoteattr

from .profiles import NAMESPACES

# Reverse map: uri -> prefix (fixed, deterministic).
_URI_TO_PREFIX: dict[str, str] = {uri: prefix for prefix, uri in NAMESPACES.items()}


def _split_clark(name: str) -> tuple[str | None, str]:
    """Split a Clark-notation ``{uri}local`` name into (uri, local)."""
    if name.startswith("{"):
        uri, _, local = name[1:].partition("}")
        return uri, local
    return None, name


def _qname(name: str) -> str:
    """Map a Clark-notation name to ``prefix:local`` using the fixed table."""
    uri, local = _split_clark(name)
    if uri is None:
        return local
    prefix = _URI_TO_PREFIX.get(uri)
    if prefix is None:
        raise ValueError(f"Unknown namespace URI (no fixed prefix): {uri}")
    return f"{prefix}:{local}"


def make_root() -> ET.Element:
    """Create the ``rdf:RDF`` root element."""
    return ET.Element(f"{{{NAMESPACES['rdf']}}}RDF")


def _serialize_element(elem: ET.Element, out: list[str], indent: int) -> None:
    pad = "  " * indent
    tag = _qname(elem.tag)

    # Sorted attributes by qname for determinism.
    attr_pairs = sorted((_qname(k), v) for k, v in elem.attrib.items())
    attr_str = "".join(f" {k}={quoteattr(v)}" for k, v in attr_pairs)

    children = list(elem)
    text = (elem.text or "").strip()

    if not children and not text:
        out.append(f"{pad}<{tag}{attr_str}/>\n")
        return

    if not children and text:
        out.append(f"{pad}<{tag}{attr_str}>{escape(text)}</{tag}>\n")
        return

    out.append(f"{pad}<{tag}{attr_str}>\n")
    for child in children:
        _serialize_element(child, out, indent + 1)
    out.append(f"{pad}</{tag}>\n")


def to_bytes(root: ET.Element) -> bytes:
    """Serialize the RDF tree to canonical, deterministic UTF-8 bytes."""
    out: list[str] = ['<?xml version="1.0" encoding="utf-8"?>\n']

    # Root element with fixed-order namespace declarations.
    ns_decls = "".join(f" xmlns:{prefix}={quoteattr(uri)}" for prefix, uri in NAMESPACES.items())
    root_tag = _qname(root.tag)

    children = list(root)
    if not children:
        out.append(f"<{root_tag}{ns_decls}/>\n")
        return "".join(out).encode("utf-8")

    out.append(f"<{root_tag}{ns_decls}>\n")
    for child in children:
        _serialize_element(child, out, 1)
    out.append(f"</{root_tag}>\n")
    return "".join(out).encode("utf-8")
