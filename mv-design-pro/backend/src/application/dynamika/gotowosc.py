"""Odczyt gotowości biegu `dynamika_rms` dla ekranu dynamiki (karta AB-P1 §0.3, §0.7).

Jedno złożenie z TRZECH źródeł prawdy, bez własnych warunków:

* bramka gotowości `dynamika_rms` (`application.calculation_readiness.service.
  _check_dynamika_rms`) — ta sama, której wynik jest parą z odmową biegu;
* braki modelowe adaptera (`enm.adapter_dynamiki.braki_modelu_dynamiki`) — kod, komunikat
  (identyfikatory wskazanych elementów zamienione na ich nazwy) i elementy z nazwami każdego
  braku, żeby interfejs pokazał odmowę PRZED biegiem, a nie po nim;
* stan modelu dynamicznego każdego wytwórcy (`enm.dynamika_z_katalogu.
  stan_dynamiki_generatorow`) — wiązanie katalogowe, powód odmowy materializacji, lista
  profili zgodnych z rodzajem wytwórcy i akcja naprawcza kanonu `der.dynamika_missing`
  (komunikat i nawigacja z `READINESS_CODES`, nie z tej warstwy).

Punkt pracy: zakończone biegi rozpływu przypadku liczone na TEJ SAMEJ migawce, na której
powstanie bieg dynamiki (adapter odmawia punktu pracy z innej migawki kodem
`dynamika.punkt_pracy_inna_migawka`) — lista wyboru pokazuje wyłącznie takie biegi.
"""

from __future__ import annotations

from typing import Any

from application.calculation_readiness.service import CalculationReadinessService
from application.dynamika.opis_wyniku import komunikat_z_nazwami
from domain.canonical_operations import READINESS_CODES
from enm.adapter_dynamiki import braki_modelu_dynamiki
from enm.dynamika_z_katalogu import braki_kopii_dynamiki, stan_dynamiki_generatorow
from enm.models import EnergyNetworkModel
from enm.nazwy_elementow import nazwa_po_identyfikatorze, zbuduj_indeks_nazw

#: Kod kanonu, którego akcja naprawcza prowadzi do wiązania z katalogowym modelem.
KOD_BRAKU_MODELU = "der.dynamika_missing"


def _akcja_naprawcza() -> dict[str, Any]:
    spec = READINESS_CODES[KOD_BRAKU_MODELU]
    if spec.fix_navigation is None:
        raise RuntimeError(f"Kod kanonu {KOD_BRAKU_MODELU} bez akcji naprawczej w rejestrze.")
    return {
        "kod": spec.code,
        "komunikat_pl": spec.message_pl,
        "nawigacja": dict(spec.fix_navigation),
    }


def gotowosc_dynamiki(
    enm: EnergyNetworkModel, biegi_rozplywu: list[dict[str, Any]]
) -> dict[str, Any]:
    """Odczyt gotowości (patrz docstring modułu). `biegi_rozplywu` — zakończone biegi PF tej
    samej migawki (lista przygotowana przez warstwę API, która zna rejestr biegów)."""
    migawka = enm.model_dump(mode="json")
    nazwy = zbuduj_indeks_nazw(migawka)
    raport = CalculationReadinessService().evaluate_single(
        enm, "dynamika_rms", punkt_pracy_rozplywu=bool(biegi_rozplywu)
    )
    akcja = _akcja_naprawcza()
    zrodla = []
    for stan in stan_dynamiki_generatorow(migawka):
        wpis = stan.to_dict()
        wpis["akcja_naprawcza"] = akcja if stan.stan in ("brak", "odmowa", "nieaktualna") else None
        zrodla.append(wpis)
    return {
        "gotowosc": raport.model_dump(mode="json"),
        "braki_modelu": [
            {
                "kod": brak.kod,
                "komunikat_pl": komunikat_z_nazwami(brak.komunikat_pl, brak.elementy, nazwy),
                "elementy": [
                    {"ref_id": ref, "nazwa": nazwa_po_identyfikatorze(ref, indeks=nazwy)}
                    for ref in brak.elementy
                ],
            }
            for brak in braki_modelu_dynamiki(enm)
        ],
        "kopie_nieaktualne": list(braki_kopii_dynamiki(migawka)),
        "zrodla": zrodla,
        "biegi_rozplywu": biegi_rozplywu,
    }


__all__ = ["KOD_BRAKU_MODELU", "gotowosc_dynamiki"]
