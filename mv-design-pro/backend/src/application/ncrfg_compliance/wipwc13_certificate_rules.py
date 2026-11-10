"""WiPWC1.3 rozdziały 5/6: oficjalne drogi certyfikacji PPM/SYPGM A–D.

NIE jest drugą regułą werdyktu. Informuje, czy obowiązkowy certyfikat
może zastępować próbę lub symulację; zakres testów PTPiREE v3 ma innego
właściciela: test_scope.py.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

TypMwe = Literal["A", "B", "C", "D"]
Rodzina = Literal["PPM", "SYPGM"]
StanCert = Literal[
    "CERT_REQUIRED", "CERT_OPTIONAL", "NO_CERT_SUBSTITUTION", "NOT_APPLICABLE"
]
_SOURCE = Path(__file__).parents[2] / "catalog" / "profiles" / "nc_rfg" / "wipwc13_cert_rules.json"
URL = "https://ptpiree.pl/wp-content/uploads/2024/12/wipwc_2024_10_01-1.pdf"


class WymogCertyfikatu(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    zdolnosc: str
    status: StanCert
    klauzula: str
    pdf_strona: int
    opis_pl: str
    podstawa_url: str = URL
    wymaga_certyfikatu: bool
    # Bezwarunkowe zwolnienie z prób miejscowych jest zabronione.
    mozna_zastapic_test: bool


class ZasadyCertyfikacji(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    typ_mwe: TypMwe
    rodzina: Rodzina
    wipwc_wydanie: str = "1.3"
    reguly: tuple[WymogCertyfikatu, ...]
    formalna_zgodnosc: Literal[False] = False
    dodatkowe_zastrzezenie: str = (
        "Certyfikat musi mieć autentyczny, zweryfikowany zakres, podpis, "
        "jednostkę akredytowaną i aktualne okno akceptacji. Certyfikat "
        "nie zastępuje obowiązkowych prób w miejscu instalacji."
    )


@lru_cache(maxsize=1)
def _rules() -> dict[str, Any]:
    with _SOURCE.open(encoding="utf-8") as f:
        data: dict[str, Any] = json.load(f)
    rules = data.get("rules")
    if data.get("schema") != "wipwc13_cert_rules.v1" or len(rules) != 32:
        raise ValueError("Niekompletna tabela WiPWC 1.3")
    keys = {(x["family"], x["ability"]) for x in rules}
    if len(keys) != len(rules):
        raise ValueError("Podwójne zasady WiPWC1.3.")
    return data


def zasady_wipwc13(typ: TypMwe, rodzina: Rodzina) -> ZasadyCertyfikacji:
    """Dane źródłowe; nie sprawdza faktycznego dokumentu producenta."""
    if typ not in ("A", "B", "C", "D") or rodzina not in ("PPM", "SYPGM"):
        raise ValueError("WiPWC1.3: nieznany typ/rodzina PGM.")
    data = _rules()
    result = []
    for x in data["rules"]:
        if x["family"] != rodzina:
            continue
        state: StanCert = x["types"][typ]
        result.append(WymogCertyfikatu(
            zdolnosc=x["ability"], status=state, klauzula=x["clause"],
            pdf_strona=x["printed_page"], opis_pl=data["rule_names"][state],
            wymaga_certyfikatu=state=="CERT_REQUIRED",
            mozna_zastapic_test=False
        ))
    return ZasadyCertyfikacji(typ_mwe=typ, rodzina=rodzina, reguly=tuple(result))


def agreguj_zakres_badan(typ: TypMwe, rodzina: Rodzina) -> dict[str, Any]:
    """Różne pytania normatywne: CERT(required/optional) i SITE TEST.

    Nie zlicza dowodów i nie daje pozytywnego Werdyktu. Wyróżnia
    WiPWC 6.1: gdy PPC realizuje LFSM-O, próbę miejscową trzeba wykonać.
    """
    from .test_scope import zakres_badan

    cert = zasady_wipwc13(typ, rodzina)
    testy = zakres_badan(typ, rodzina)
    by_test = {x.zdolnosc: x for x in testy.punkty}
    rows = []
    for rule in cert.reguly:
        test = by_test.pop(rule.zdolnosc, None)
        rows.append({
            "zdolnosc":rule.zdolnosc,
            "cert":rule.status,
            "test":test.status if test else "POZA_TABELA_PTPIREE_3",
            "wipwc_klauzula":rule.klauzula,
            "wipwc_pdf_strona":rule.pdf_strona,
            "wipwc_zrodlo":rule.podstawa_url,
            "test_zrodlo":test.zrodlo_url if test else None,
            "dodatkowy_test_wymagany_gdy_ppc":{
                "dotyczy":rodzina=="PPM" and rule.zdolnosc=="LFSM_O",
                "wymaga":rodzina=="PPM" and rule.zdolnosc=="LFSM_O",
                "jednostka_redakcyjna":"WiPWC 1.3 §6.1"
            },
            "status_wykonania":"NIE_OCENIONO",
        })
    for test in by_test.values():
        rows.append({
            "zdolnosc":test.zdolnosc,
            "cert":"POZA_TABELA_WIPWC_1_3",
            "test":test.status,
            "test_zrodlo":test.zrodlo_url,
            "status_wykonania":"NIE_OCENIONO"
        })
    return {
        "typ":typ,"rodzina":rodzina,"cert_wydanie":"1.3",
        "program_testow_wydanie":"3.0",
        "zasady":rows,
        "finalna_zgodnosc":False,
        "uwaga":"Wynik jest macierzą obowiązków, bez dowodu wykonania testów, "
                "zaakceptowania certyfikatu i wydania pozwolenia operatora."
    }
