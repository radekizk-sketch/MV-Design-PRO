"""Samotest klucz_katalogu_guard (karta JEDEN-KLUCZ-KATALOGU).

ILOCZYN CECH: poziom {pola operacji, kształt poziomu 1, kształt poziomu 2} × klucz wiązania
{``catalog_binding``, ``<rola>_catalog_binding``} × zamiennik {``catalog_ref``,
``catalog_item_id``, ``catalog_namespace``, ``<rola>_catalog_ref``} × kształt wiązania
{wspólny, brak, z zamiennikiem pola}; do tego pole modelu bez wiązania (przepuszczone)
i kontrakt bieżący (czysty).
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field

import klucz_katalogu_guard as guard
import pytest

sys.path.insert(0, str(guard.BACKEND_SRC))


@dataclass(frozen=True)
class _Spec:
    required_fields: tuple[str, ...] = ()
    optional_fields: tuple[str, ...] = ()


@dataclass(frozen=True)
class _Ksztalt:
    pola: frozenset[str] = frozenset()
    zagniezdzone: dict = field(default_factory=dict)


WIAZANIE = _Ksztalt(pola=frozenset({"catalog_item_id", "catalog_namespace"}))


def test_kontrakt_biezacy_czysty() -> None:
    assert guard.main() == 0


@pytest.mark.parametrize(
    ("klucz", "zamiennik"),
    [
        ("catalog_binding", "catalog_ref"),
        ("catalog_binding", "catalog_item_id"),
        ("catalog_binding", "catalog_namespace"),
        ("transformer_catalog_binding", "transformer_catalog_ref"),
    ],
)
def test_zamiennik_w_polach_operacji_wykryty(klucz: str, zamiennik: str) -> None:
    operacje = {"op": _Spec(optional_fields=(klucz, zamiennik))}
    wynik = guard.naruszenia_kontraktu(operacje, {"op": {klucz: WIAZANIE}}, WIAZANIE)
    # Zamiennik o nazwie `*catalog_ref` łamie też regułę 4 (osobny wpis, test niżej).
    assert [w for w in wynik if "zamiennik" in w] == [
        f"op: zamiennik „{zamiennik}” obok wiązania „{klucz}” — pozycję wskazuje "
        "wyłącznie wiązanie"
    ]


@pytest.mark.parametrize("glebokosc", [1, 2])
def test_zamiennik_w_ksztalcie_zagniezdzonym_wykryty(glebokosc: int) -> None:
    wezel = _Ksztalt(
        pola=frozenset({"cable_catalog_binding", "cable_catalog_ref"}),
        zagniezdzone={"cable_catalog_binding": WIAZANIE},
    )
    ksztalt = (
        {"a": wezel}
        if glebokosc == 1
        else {"a": _Ksztalt(pola=frozenset({"b"}), zagniezdzone={"b": wezel})}
    )
    wynik = guard.naruszenia_kontraktu(
        {"op": _Spec(optional_fields=("a",))}, {"op": ksztalt}, WIAZANIE
    )
    sciezka = "op.a" if glebokosc == 1 else "op.a.b"
    assert [w for w in wynik if "zamiennik" in w] == [
        f"{sciezka}: zamiennik „cable_catalog_ref” obok wiązania „cable_catalog_binding” — "
        "pozycję wskazuje wyłącznie wiązanie"
    ]


def test_klucz_wiazania_bez_ksztaltu_wiazania_wykryty() -> None:
    wynik = guard.naruszenia_kontraktu(
        {"op": _Spec(optional_fields=("catalog_binding",))}, {"op": {}}, WIAZANIE
    )
    assert wynik == ["op.catalog_binding: klucz wiązania bez kształtu wiązania katalogowego"]
    zly = guard.naruszenia_kontraktu(
        {"op": _Spec(optional_fields=("catalog_binding",))},
        {"op": {"catalog_binding": _Ksztalt(pola=frozenset({"catalog_item_id"}))}},
        WIAZANIE,
    )
    assert zly == ["op.catalog_binding: klucz wiązania bez kształtu wiązania katalogowego"]


def test_zamiennik_pola_w_ksztalcie_wiazania_wykryty() -> None:
    zatrute = _Ksztalt(pola=frozenset({"catalog_item_id", "catalog_ref"}))
    wynik = guard.naruszenia_kontraktu({}, {}, zatrute)
    assert wynik == ["kształt wiązania: zamiennik pola „catalog_ref”"]


def test_pole_modelu_bez_wiazania_przepuszczone() -> None:
    """``set_bay_equipment.devices[].catalog_ref`` — pole urządzenia w modelu, jedyna droga."""
    ksztalt = {"devices": _Ksztalt(pola=frozenset({"catalog_ref", "kind", "placement"}))}
    wynik = guard.naruszenia_kontraktu(
        {"set_bay_equipment": _Spec(optional_fields=("devices",))},
        {"set_bay_equipment": ksztalt},
        WIAZANIE,
    )
    assert wynik == []


# Reguła 4 (decyzja architekta): klucz ``catalog_ref``/``<rola>_catalog_ref`` w ładunku operacji.
# Iloczyn: klucz {catalog_ref, rola_catalog_ref} × poziom {pola operacji, kształt 1, kształt 2}
# × obecność wiązania w węźle {bez, z}; plus pole modelu na liście i ta sama nazwa POZA listą.
@pytest.mark.parametrize("klucz", ["catalog_ref", "battery_catalog_ref", "device_catalog_ref"])
@pytest.mark.parametrize("glebokosc", [0, 1, 2])
@pytest.mark.parametrize("z_wiazaniem", [False, True])
def test_klucz_ref_w_ladunku_wykryty(klucz: str, glebokosc: int, z_wiazaniem: bool) -> None:
    pola = frozenset({klucz, "name"} | ({"inny_catalog_binding"} if z_wiazaniem else set()))
    zagn = {"inny_catalog_binding": WIAZANIE} if z_wiazaniem else {}
    if glebokosc == 0:
        operacje = {"op": _Spec(optional_fields=tuple(sorted(pola)))}
        ksztalty: dict = {"op": dict(zagn)}
        sciezka = "op"
    elif glebokosc == 1:
        operacje = {"op": _Spec(optional_fields=("blok",))}
        ksztalty = {"op": {"blok": _Ksztalt(pola=pola, zagniezdzone=zagn)}}
        sciezka = "op.blok"
    else:
        operacje = {"op": _Spec(optional_fields=("blok",))}
        wewn = _Ksztalt(pola=pola, zagniezdzone=zagn)
        ksztalty = {
            "op": {
                "blok": _Ksztalt(pola=frozenset({"pod"}), zagniezdzone={"pod": wewn}),
            }
        }
        sciezka = "op.blok.pod"
    wynik = guard.naruszenia_kontraktu(operacje, ksztalty, WIAZANIE)
    assert any(w.startswith(f"{sciezka}: klucz „{klucz}”") for w in wynik), wynik


def test_pole_modelu_spoza_listy_wykryte() -> None:
    """Ta sama nazwa ``devices[].catalog_ref`` w INNEJ operacji nie jest polem modelu z listy."""
    ksztalt = {"devices": _Ksztalt(pola=frozenset({"catalog_ref", "kind"}))}
    wynik = guard.naruszenia_kontraktu(
        {"inna_operacja": _Spec(optional_fields=("devices",))},
        {"inna_operacja": ksztalt},
        WIAZANIE,
    )
    assert wynik and "inna_operacja.devices: klucz „catalog_ref”" in wynik[0]


def test_lista_pol_modelu_zamknieta() -> None:
    assert guard.POLA_MODELU_W_LADUNKU == frozenset({"set_bay_equipment.devices.catalog_ref"})
