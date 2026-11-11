"""Źródłowa macierz BRAKÓW DOWODOWYCH NC RfG (WOS/WiPWC/PTPiREE).

Orchestracja istniejących właścicieli danych: jeden model ENM, jeden loader
NC RfG, jeden katalog certyfikatów, jeden zakres prób PTPiREE.
Zero nowego solvera/Werdyktu, zero fabrykowanego PASS.
"""
from __future__ import annotations

from datetime import date
from typing import Any

from catalog.profiles.nc_rfg import klasyfikacja_modulu
from enm.models import EnergyNetworkModel

from .bieg import wejscia_ncrfg_przypadku
from .certificate_review import oceny_certyfikatow_przypadku
from .dossier import plan_dossier
from .regulatory_effectivity import wybierz_procedure, wybierz_wos
from .source_audit import audyt_zrodel
from .test_scope import zakres_badan
from .wipwc13_certificate_rules import zasady_wipwc13


def analiza_brakow_przypadku(
    enm: EnergyNetworkModel, *, operator_id: str, data_oceny: date,
) -> dict[str, Any]:
    """Macierz dokumentacyjna; statusy wynikają z prawdziwych źródeł.

    Obowiązku certyfikatu nie może wykonać sam wpis w starym wykazie.
    Wszystkie testy wymagające rzeczywistych wyników na PCC zachowują
    BRAK_WYNIKOW; dokumentacja operatora nie może być automatycznie OK.
    """
    inputs = wejscia_ncrfg_przypadku(
        enm, operator_id=operator_id, case_id="macierz-dowodowa",
    )
    by_ref = {g.ref_id:g for g in enm.generators}
    certs = oceny_certyfikatow_przypadku(
        enm, operator_id=operator_id, data_oceny=data_oceny
    )
    cert_map = {x["der_ref"]:x for x in certs["urzadzenia"]}
    audit = audyt_zrodel(operator_id)
    results: list[dict[str, Any]] = []
    for module in inputs.modules:
        if module.der_kind == "BESS":
            results.append({
                "der_ref":module.der_ref,
                "status":"POZA_NC_RFG_MAGAZYN",
                "wymagania":[],
                "braki":[
                    "Wymagania krajowe magazynowania i indywidualne warunki "
                    "przyłączenia — odrębny profil źródłowy."
                ],
            })
            continue
        typ = klasyfikacja_modulu(module.p_max_kw, module.voltage_kv).modul
        if typ is None:
            results.append({
                "der_ref":module.der_ref,
                "status":"PONIZEJ_PROGU_NC_RFG", "wymagania":[], "braki":[]
            })
            continue
        gene = by_ref[module.der_ref]
        wos = wybierz_wos(
            typ, gene.wydarzenia_regulacyjne, gene.modul_istniejacy
        )
        procedure = wybierz_procedure(typ, gene.wydarzenia_regulacyjne)
        missing = [item["kod"] for item in audit["blokery"]]
        if wos.status != "USTALONO":
            missing.append("BRAK_WLASCIWEJ_EDYCJI_WOS")
        elif wos.wydanie == "2025":
            missing.append("BRAK_ZWERYFIKOWANYCH_PARAMETROW_WOS2025")
        if procedure.wydanie != "3.0":
            missing.append("BRAK_POTWIERDZONEJ_PROCEDURY_TESTOWANIA")
        if module.module_family != "PPM":
            results.append({
                "der_ref":module.der_ref, "typ":typ,
                "status":"NIEOBSLUGIWANA_RODZINA_PGM",
                "braki":missing+["Brak zatwierdzonego odwzorowania tej rodziny w mostku."],
                "wymagania":[],
            })
            continue
        reg_rules = zasady_wipwc13(typ,"PPM").reguly
        test_scopes = (
            {x.zdolnosc:x for x in zakres_badan(typ,"PPM").punkty}
            if procedure.wydanie == "3.0" else {}
        )
        cert = cert_map.get(module.der_ref)
        cert_status = str(cert.get("status")) if cert else "NIE_OCENIONO"
        # certificate_review intentionally never claims verified issuer / operator acceptance.
        # Do not turn a tentative match into formal proof.
        rows: list[dict[str, Any]]=[]
        for rule in reg_rules:
            test = test_scopes.pop(rule.zdolnosc, None)
            has_cert_duty=rule.status=="CERT_REQUIRED"
            on_site_duty = (
                test.status if test is not None else "BRAK_POTWIERDZONEJ_METODY"
            )
            if rule.status=="NOT_APPLICABLE" and on_site_duty in (
                "NONE", "BRAK_POTWIERDZONEJ_METODY"
            ):
                result="POZA_ZAKRESEM_TABEL"
            elif has_cert_duty:
                result="BRAK_ZWERYFIKOWANEGO_CERTYFIKATU"
            elif on_site_duty in (
                "TEST", "TEST_OR_STATEMENT", "CONDITIONAL_OPERATOR",
                "CONDITIONAL_WOS2018_P20",
            ):
                result="BRAK_PROTOKOLU_PROBY"
            else:
                result="NIE_OCENIONO_INNE_DOWODY"
            if rule.zdolnosc=="LFSM_O" and rule.status=="CERT_REQUIRED":
                # WiPWC1.3 §6.1: when PPC realizes LFSM-O, test additionally required.
                missing.append("DO_USTALENIA_REALIZACJA_LFSM_O_PPC")
            rows.append({
                "zdolnosc":rule.zdolnosc,
                "wipwc":rule.status,
                "cert_status_z_wykazu":cert_status,
                "test_wg_ptpiree_3":on_site_duty,
                "wipwc_zrodlo":rule.podstawa_url,
                "wipwc_klauzula":rule.klauzula,
                "test_zrodlo":test.zrodlo_url if test is not None else None,
                "status_wykazania":result,
            })
        for extra in test_scopes.values():
            rows.append({
                "zdolnosc":extra.zdolnosc,
                "wipwc":"POZA_TABELA_CERTYFIKATOW",
                "cert_status_z_wykazu":cert_status,
                "test_wg_ptpiree_3":extra.status,
                "test_zrodlo":extra.zrodlo_url,
                "status_wykazania":"BRAK_PROTOKOLU_PROBY"
                if extra.status != "NONE" else "POZA_ZAKRESEM_TABEL"
            })
        dossier = plan_dossier(typ, operator_id=operator_id)
        results.append({
            "der_ref":module.der_ref,
            "typ":typ,"rodzina":"PPM",
            "wos_wybrany":wos.wydanie,
            "ptpiree_wybrana":procedure.wydanie,
            "certyfikat_weryfikacja":cert_status,
            "stan":"BRAK_PELNEGO_DOWODU",
            "wymagania":rows,
            "braki":list(dict.fromkeys(missing)),
            "dokumenty":[x.kod for x in dossier.dokumenty],
            "decyzja_operatora":"BRAK_DOWODU",
        })
    return {
        "operator_id":operator_id,
        "data_oceny":data_oceny.isoformat(),
        "wyniki":results,
        "pominiete":[p.model_dump(mode="json") for p in inputs.pominiete],
        "wykaz":certs["rejestr"],
        "gotowosc_zgodnosci":False,
        "reason":"Kontrola źródeł i dowodów. Brak weryfikowanych certyfikatów "
                 "oraz zatwierdzonych raportów prób i decyzji OSD.",
    }
