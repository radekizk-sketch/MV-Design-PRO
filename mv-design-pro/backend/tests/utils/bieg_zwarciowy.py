"""REALNY bieg zwarciowy dla testów konsumentów miarodajnych.

PO CO TO ISTNIEJE. Od naprawy §3 planu audytu dowód doboru aparatury nie powstaje
z liczb przysłanych w żądaniu — powstaje z ZAPISANEGO BIEGU. Testy, które badają
treść, determinizm i nazwy artefaktów, muszą więc mieć bieg, tak samo jak ma go
produkt. Budowanie „prawie biegu" w teście (słownik udający artefakt) byłoby
obejściem realnej ścieżki, czyli dokładnie tym, co kanon repo nazywa testem
maskującym defekt.

Bieg powstaje TĄ SAMĄ drogą co w produkcie: model → `set_enm` → `run_short_circuit_now`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from enm.canonical_analysis import CanonicalRun, run_short_circuit_now
from enm.models import EnergyNetworkModel
from enm.store import set_enm


@dataclass(frozen=True)
class BiegZwarciowyTestowy:
    """Bieg + punkt zwarcia + liczby miarodajne w kształcie kontraktu klienta."""

    bieg: CanonicalRun
    punkt_zwarcia: str
    wiersz: dict[str, Any]

    @property
    def run_id(self) -> str:
        return str(self.bieg.id)

    @property
    def case_id(self) -> str:
        return self.bieg.case_id

    def echo_wielkosci(self, **nadpisania: float) -> dict[str, Any]:
        """Liczby w kluczach kontraktu klienta; ``nadpisania`` służą PODMIANIE.

        Podmiana jest tu pierwszorzędnym zastosowaniem, nie dodatkiem: test
        odporności na podmianę polega właśnie na zmianie jednej liczby.
        """
        echo = {
            "u_kv": float(self.wiersz["un_v"]) / 1000.0,
            "ikss_ka": float(self.wiersz["ikss_a"]) / 1000.0,
            "ip_ka": float(self.wiersz["ip_a"]) / 1000.0,
            "ith_ka": float(self.wiersz["ith_a"]) / 1000.0,
            "tk_s": float(self.wiersz["tk_s"]),
        }
        echo.update(nadpisania)
        return echo


def bieg_zwarciowy_z_migawki(
    snapshot: dict[str, Any],
    *,
    case_id: str,
    project_id: str = "PROJEKT-TESTOWY",
    un_v: float | None = None,
) -> BiegZwarciowyTestowy:
    """Zapisz model pod przypadkiem i policz na nim REALNY bieg zwarciowy.

    Punktem zwarcia jest PIERWSZY wiersz wyniku w porządku kanonicznym biegu —
    wybór jest deterministyczny, więc test nie zależy od kolejności słownika.

    ``un_v`` zawęża wybór do węzłów o danym napięciu znamionowym. Jest potrzebne,
    bo model stacji ma węzły SN i nN, a test aparatu SN musi dostać punkt zwarcia
    SN — inaczej porównywałby 17,5 kV aparatu z 400 V szyny nN i „przechodził"
    z powodu, którego nie bada.
    """
    set_enm(case_id, EnergyNetworkModel.model_validate(snapshot))
    bieg = run_short_circuit_now(case_id=case_id, project_id=project_id)
    if bieg.status != "FINISHED":
        raise AssertionError(
            f"Bieg zwarciowy nie zakończył się: {bieg.status} {bieg.error_message}"
        )
    wiersze = [dict(w) for w in ((bieg.raw_result or {}).get("results") or [])]
    if un_v is not None:
        wiersze = [w for w in wiersze if abs(float(w.get("un_v", 0.0)) - un_v) < 1.0]
    if not wiersze:
        raise AssertionError(
            f"Bieg zwarciowy nie zwrócił punktu zwarcia o un_v = {un_v}"
            if un_v is not None
            else "Bieg zwarciowy nie zwrócił żadnego punktu zwarcia"
        )
    wiersz = wiersze[0]
    return BiegZwarciowyTestowy(
        bieg=bieg, punkt_zwarcia=str(wiersz["fault_node_id"]), wiersz=wiersz
    )


def snapshot_sn_z_falownikiem(*, k_sc: float | None) -> dict[str, Any]:
    """Model SN ze stacją i JEDNYM źródłem falownikowym — z deklaracją albo bez.

    Obie wersje powstają TĄ SAMĄ operacją domenową, którą wykonuje kreator, więc
    różnią się dokładnie jedną rzeczą: obecnością deklaracji producenta. Model
    jest tu, a nie w pojedynczym module testowym, bo od naprawy §3 potrzebuje go
    każdy test konsumenta miarodajnego — a trzy kopie tego samego modelu to trzy
    miejsca, w których może się rozjechać.
    """
    from enm.domain_operations import execute_domain_operation

    from tests.enm.test_brama_katalogowa_operacji_v2 import (
        REF_BESS,
        _payload_zrodla,
        _siec_ze_stacja,
    )

    enm = _siec_ze_stacja()
    payload = (
        _payload_zrodla(enm, catalog_ref=REF_BESS, k_sc=k_sc)
        if k_sc is not None
        else _payload_zrodla(enm, catalog_ref=REF_BESS)
    )
    wynik = execute_domain_operation(enm_dict=enm, op_name="add_converter_source", payload=payload)
    if wynik.get("error"):
        raise AssertionError(f"Nie udało się zbudować modelu testowego: {wynik['error']}")
    return wynik["snapshot"]


def bieg_zwarciowy_domyslny(
    *,
    case_id: str,
    k_sc: float | None = 1.35,
    project_id: str = "PROJEKT-TESTOWY",
    un_v: float | None = None,
) -> BiegZwarciowyTestowy:
    """Realny bieg zwarciowy na modelu SN z falownikiem o zadeklarowanym ``k_sc``.

    Deklaracja jest wartością domyślną świadomie: testy badające TREŚĆ artefaktu
    mają mieć wejście miarodajne, żeby mierzyły to, co deklarują, a nie blokadę
    SI-110. Testy badające samą blokadę podają ``k_sc=None``.
    """
    return bieg_zwarciowy_z_migawki(
        snapshot_sn_z_falownikiem(k_sc=k_sc),
        case_id=case_id,
        project_id=project_id,
        un_v=un_v,
    )


@dataclass(frozen=True)
class BiegiKoordynacjiTestowe:
    """Para biegów zwarciowych (MAX i MIN) na TYM SAMYM modelu — wejście koordynacji.

    Koordynacja potrzebuje obu scenariuszy: maksymalnego (selektywność) i
    minimalnego (czułość). Kanoniczny bieg liczy jeden scenariusz, więc miarodajna
    koordynacja wymaga dwóch biegów policzonych na tej samej migawce.
    """

    bieg_max: CanonicalRun
    bieg_min: CanonicalRun
    lokalizacje: tuple[str, ...]
    prady_max_a: dict[str, float]
    prady_min_a: dict[str, float]

    @property
    def run_id_max(self) -> str:
        return str(self.bieg_max.id)

    @property
    def run_id_min(self) -> str:
        return str(self.bieg_min.id)

    def pozycje_pradow(self, *nadpisania: dict[str, Any]) -> list[dict[str, Any]]:
        """Pozycje ``fault_currents`` zbudowane WYŁĄCZNIE z liczb obu biegów."""
        pozycje = [
            {
                "location_id": lokalizacja,
                "ik_max_3f_a": self.prady_max_a[lokalizacja],
                "ik_min_3f_a": self.prady_min_a[lokalizacja],
            }
            for lokalizacja in self.lokalizacje
        ]
        for nadpisanie, pozycja in zip(nadpisania, pozycje, strict=False):
            pozycja.update(nadpisanie)
        return pozycje


def biegi_koordynacji(
    *,
    case_id: str,
    k_sc: float | None = 1.35,
    project_id: str = "PROJEKT-TESTOWY",
    un_v: float | None = 15000.0,
    liczba_lokalizacji: int = 2,
) -> BiegiKoordynacjiTestowe:
    """Dwa REALNE biegi zwarciowe (MAX i MIN) na tym samym modelu SN.

    Lokalizacje wybierane są po RÓŻNYM prądzie zwarciowym: łańcuch selektywności
    bez różnicy prądów nie bada niczego, bo oba zabezpieczenia widziałyby to samo.
    """
    from enm.canonical_analysis import create_run, execute_run

    snapshot = snapshot_sn_z_falownikiem(k_sc=k_sc)
    set_enm(case_id, EnergyNetworkModel.model_validate(snapshot))

    bieg_max = run_short_circuit_now(case_id=case_id, project_id=project_id)
    bieg_min = execute_run(
        create_run(
            case_id=case_id,
            analysis_type="short_circuit_sn",
            project_id=project_id,
            options={"scenario": "min"},
        ).id
    )
    for bieg, opis in ((bieg_max, "maksymalny"), (bieg_min, "minimalny")):
        if bieg.status != "FINISHED":
            raise AssertionError(
                f"Bieg {opis} nie zakończył się: {bieg.status} {bieg.error_message}"
            )

    def mapa(bieg: CanonicalRun) -> dict[str, float]:
        wynik: dict[str, float] = {}
        for wiersz in (bieg.raw_result or {}).get("results") or []:
            if un_v is not None and abs(float(wiersz.get("un_v", 0.0)) - un_v) >= 1.0:
                continue
            wynik[str(wiersz["fault_node_id"])] = float(wiersz["ikss_a"])
        return wynik

    prady_max = mapa(bieg_max)
    prady_min = mapa(bieg_min)
    wspolne = sorted(set(prady_max) & set(prady_min), key=lambda k: (-prady_max[k], k))
    rozne: list[str] = []
    for lokalizacja in wspolne:
        if all(abs(prady_max[lokalizacja] - prady_max[x]) > 1.0 for x in rozne):
            rozne.append(lokalizacja)
        if len(rozne) == liczba_lokalizacji:
            break
    if len(rozne) < liczba_lokalizacji:
        raise AssertionError(
            f"Model testowy ma {len(rozne)} lokalizacji o różnym prądzie zwarciowym, "
            f"a potrzeba {liczba_lokalizacji}"
        )
    return BiegiKoordynacjiTestowe(
        bieg_max=bieg_max,
        bieg_min=bieg_min,
        lokalizacje=tuple(rozne),
        prady_max_a={k: prady_max[k] for k in rozne},
        prady_min_a={k: prady_min[k] for k in rozne},
    )
