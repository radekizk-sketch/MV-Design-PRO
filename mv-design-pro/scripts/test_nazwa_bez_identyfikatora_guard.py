"""Testy strażnika `nazwa_bez_identyfikatora_guard` (karta #144).

INTENCJA. Karta #144 naprawiła klasę „nazwa pokazywana projektantowi zbudowana
z identyfikatora maszynowego" w kilkudziesięciu miejscach; strażnik pilnuje, żeby klasa nie
wróciła. Testy sprawdzają to, co strażnik obiecuje w docstringu (reguła KLASA pkt 4 —
deklaracja bez testu to fałszywa pewność), jako ILOCZYN CECH, nie przykład z karty:

  * położenie wyrażenia nazwy (klucz, argument, indeks, atrybut, zmienna, zwrot, zapas
    `.get`/`getattr`/`setdefault`, zapas `or`) × rodzina (nazwa / tekst rekordu `*_pl`);
  * forma odwołania do identyfikatora (nazwa z tokenem, atrybut, klucz, `.get`, `getattr`,
    wycinek, `str()`, nośnik z przypisania, nośnik z napisu, nośnik pętli, element
    wyrażenia zbiorczego);
  * miejsca, gdzie trafienie byłoby FAŁSZYWE (odczyt nazwy po identyfikatorze, nazwy
    programowe, pola komunikatu, nośnik skasowany ponownym przypisaniem);
  * zapadka w obie strony, uzasadnienie każdego wpisu listy, PUSTY SKAN = kod 1;
  * drzewo repozytorium jest zgodne z listą (kod wyjścia `main()` odbierany wprost).
"""

from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from nazwa_bez_identyfikatora_guard import (  # noqa: E402
    DOZWOLONE,
    PustySkanError,
    main,
    policz,
    porownaj_z_lista,
    rodzaj_pola,
    trafienia_w_kodzie,
    zmierz,
)


def _polozenia(kod: str) -> list[tuple[str, str, str]]:
    return [(t.polozenie, t.cel, t.odwolanie) for t in trafienia_w_kodzie(kod, "m.py")]


# ---------------------------------------------------------------------------
# Położenie × rodzina
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("kod", "oczekiwane"),
    [
        ('def f(b):\n    return {"name": b.ref_id}\n', ("klucz", "name", ".ref_id")),
        ("def f(b):\n    return Szyna(name=b.ref_id)\n", ("argument", "name", ".ref_id")),
        ('def f(d, b):\n    d["name"] = b["ref_id"]\n', ("indeks", "name", '["ref_id"]')),
        ("def f(o, b):\n    o.name = b.ref_id\n", ("atrybut", "name", ".ref_id")),
        ("def f(b):\n    nazwa_szyny = b.ref_id\n", ("zmienna", "nazwa_szyny", ".ref_id")),
        (
            "def _nazwa_odcinka(seg):\n    return seg['ref_id']\n",
            ("zwrot", "_nazwa_odcinka", '["ref_id"]'),
        ),
        ('def f(n, bus_id):\n    return n.get("name", bus_id)\n', ("zapas_get", "name", "bus_id")),
        (
            'def f(n, bus_id):\n    return getattr(n, "name", bus_id)\n',
            ("zapas_get", "name", "bus_id"),
        ),
        (
            'def f(n, ref_id):\n    return n.setdefault("name", ref_id)\n',
            ("zapas_get", "name", "ref_id"),
        ),
        (
            'def f(g):\n    return g.get("name") or g.get("ref_id")\n',
            ("zapas_or", "name", '.get("ref_id")'),
        ),
        ("def f(s):\n    return s.name or s.ref_id\n", ("zapas_or", "name", ".ref_id")),
        (
            'def f(z):\n    return {"opis_pl": f"Źródło {z.source_id}"}\n',
            ("tekst_klucz", "opis_pl", ".source_id"),
        ),
        (
            "def f(p):\n    return Przedmiot(opis_pl=f'na elemencie {p.element_ref}')\n",
            ("tekst_argument", "opis_pl", ".element_ref"),
        ),
        (
            "def f(r, bus_ref):\n    r['zakres'] = f'szyna {bus_ref}'\n",
            ("tekst_indeks", "zakres", "bus_ref"),
        ),
        (
            "def f(o, b):\n    o.why_pl = f'w wezle {b.bus_ref}'\n",
            ("tekst_atrybut", "why_pl", ".bus_ref"),
        ),
    ],
)
def test_polozenie_wyrazenia_nazwy_i_tekstu(kod: str, oczekiwane: tuple[str, str, str]) -> None:
    assert _polozenia(kod) == [oczekiwane]


# ---------------------------------------------------------------------------
# Forma odwołania do identyfikatora (w jednym położeniu: klucz „name")
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("wyrazenie", "odwolanie"),
    [
        ("ref_id", "ref_id"),
        ("branch_ref", "branch_ref"),
        ("edge_id", "edge_id"),
        ("seed", "seed"),
        ("catalog_ref", "catalog_ref"),
        ("x.ref", ".ref"),
        ("x.id", ".id"),
        ('x["id"]', '["id"]'),
        ('x.get("ref_id")', '.get("ref_id")'),
        ('getattr(x, "ref_id")', 'getattr("ref_id")'),
        ("ref_id[-8:]", "ref_id"),
        ("str(x.uuid)", ".uuid"),
        ('f"Odcinek {branch_ref[-8:]}"', "branch_ref"),
        ('"Pole " + field_ref', "field_ref"),
        ('"Pole %s" % field_ref', "field_ref"),
        ("x.name if x.name else x.ref_id", ".ref_id"),
        ('f"{x.ref_id}".strip()', ".ref_id"),
        ('", ".join(v.bus_ref for v in naruszenia)', ".bus_ref"),
        ('", ".join([v.bus_ref for v in naruszenia])', ".bus_ref"),
    ],
)
def test_forma_odwolania(wyrazenie: str, odwolanie: str) -> None:
    kod = "def f(x, ref_id, branch_ref, edge_id, seed, catalog_ref, field_ref, naruszenia):\n"
    kod += f'    return {{"name": {wyrazenie}}}\n'
    assert [o for _, _, o in _polozenia(kod)] == [odwolanie]


def test_nosnik_z_przypisania_identyfikatora() -> None:
    kod = "def f(r):\n" '    identyfikator = str(r["id"])\n' '    return {"name": identyfikator}\n'
    assert _polozenia(kod) == [("klucz", "name", "identyfikator")]


def test_nosnik_z_napisu_zlozonego_z_identyfikatora() -> None:
    kod = (
        "def f(branch_ref):\n"
        '    etykieta_robocza = f"Odcinek {branch_ref}"\n'
        '    return {"name": etykieta_robocza}\n'
    )
    # Pierwsze trafienie: zmienna nazwy (token „etykieta"), drugie: klucz przez nośnik.
    assert _polozenia(kod) == [
        ("zmienna", "etykieta_robocza", "branch_ref"),
        ("klucz", "name", "etykieta_robocza"),
    ]


def test_nosnik_petli_po_kolekcji_identyfikatorow() -> None:
    kod = (
        "def f(bus_refs):\n"
        "    for szyna in sorted(bus_refs):\n"
        '        yield {"name": szyna}\n'
    )
    assert _polozenia(kod) == [("klucz", "name", "szyna")]


def test_nosnik_wyrazenia_zbiorczego() -> None:
    kod = 'def f(bus_refs):\n    return [{"name": b} for b in bus_refs]\n'
    assert _polozenia(kod) == [("klucz", "name", "b")]


def test_nosnik_kasowany_ponownym_przypisaniem() -> None:
    kod = "def f(r, nazwy):\n" '    x = r["id"]\n' "    x = nazwy[x]\n" '    return {"name": x}\n'
    assert _polozenia(kod) == []


def test_nosnik_nie_przecieka_miedzy_funkcjami() -> None:
    kod = (
        "def a(r):\n" '    x = r["id"]\n' "    return x\n" "def b(x):\n" '    return {"name": x}\n'
    )
    assert _polozenia(kod) == []


# ---------------------------------------------------------------------------
# Brak fałszywych trafień
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "kod",
    [
        # Odczyt nazwy PO identyfikatorze to nie nazwa Z identyfikatora.
        'def f(nazwy, ref_id):\n    return {"name": nazwy[ref_id]}\n',
        'def f(nazwy, ref_id):\n    return {"name": nazwy.get(ref_id)}\n',
        'def f(ref_id, m):\n    return {"name": nazwa_po_identyfikatorze(ref_id, m)}\n',
        'def f(b):\n    return {"name": nazwa_elementu(b, "buses")}\n',
        # Nazwy programowe (plik, kolumna, operacja) nie są nazwami elementów sieci.
        'def f(run_id):\n    nazwa_pliku = f"pakiet__{run_id}.zip"\n',
        'def f(run_id):\n    return {"filename": f"x_{run_id}.json"}\n',
        'def f(r):\n    return {"column_name": r["id"]}\n',
        # Pola KOMUNIKATU to osobna klasa (karta #142), nie ten strażnik.
        'def f(bus_ref):\n    return {"message_pl": f"Szyna {bus_ref} nie istnieje"}\n',
        "def f(bus_ref):\n    raise HTTPException(detail=f'Szyna {bus_ref}')\n",
        'def f(bus_ref):\n    return {"error": f"Szyna {bus_ref}"}\n',
        # Identyfikator w polu identyfikatora jest w porządku.
        'def f(b):\n    return {"name": b.name, "ref_id": b.ref_id}\n',
        # Opis rodzaju zamiast nazwy.
        'def f(b):\n    return {"name": b.name or "Szyna bez nazwy"}\n',
        # Zapas `or` bez odczytu nazwy przed nim nie jest zapasem nazwy.
        "def f(x):\n    return x.ref_id or x.id\n",
    ],
)
def test_brak_trafienia(kod: str) -> None:
    assert _polozenia(kod) == []


@pytest.mark.parametrize(
    ("pole", "rodzaj"),
    [
        ("name", "nazwa"),
        ("source_name", "nazwa"),
        ("label_pl", "nazwa"),
        ("nazwa_wezla", "nazwa"),
        ("title", "nazwa"),
        ("opis_pl", "tekst"),
        ("why_pl", "tekst"),
        ("czego_brakuje", "tekst"),
        ("substitution", "tekst"),
        ("przedmiot", "tekst"),
        ("message_pl", None),
        ("detail", None),
        ("fix_message_pl", None),
        ("komunikat_pl", None),
        ("filename", None),
        ("nazwa_pliku", None),
        ("value", None),
    ],
)
def test_rodzaj_pola(pole: str, rodzaj: str | None) -> None:
    assert rodzaj_pola(pole) == rodzaj


# ---------------------------------------------------------------------------
# Zapadka w obie strony i lista dozwolona
# ---------------------------------------------------------------------------


def test_zapadka_nowa_tozsamosc_jest_naruszeniem() -> None:
    bledy = porownaj_z_lista(Counter({"m.py:f:klucz:name:.ref_id": 1}), {})
    assert bledy == ["[nazwa-z-identyfikatora] m.py:f:klucz:name:.ref_id (1)"]


def test_zapadka_wzrost_jest_naruszeniem() -> None:
    bledy = porownaj_z_lista(Counter({"t": 2}), {"t": (1, "uzasadnienie merytoryczne")})
    assert bledy == ["[dlug-urosl] t: 1 -> 2"]


def test_zapadka_spadek_wymaga_obnizenia_wpisu() -> None:
    bledy = porownaj_z_lista(Counter({"t": 1}), {"t": (2, "uzasadnienie merytoryczne")})
    assert bledy and bledy[0].startswith("[dlug-zmalal] t: 2 -> 1")


def test_zapadka_wpis_bez_trafienia_wymaga_usuniecia() -> None:
    bledy = porownaj_z_lista(Counter(), {"t": (1, "uzasadnienie merytoryczne")})
    assert bledy and bledy[0].startswith("[dlug-zmalal] t: 0 wystapien")


def test_zapadka_zgodnosc_jest_zielona() -> None:
    assert porownaj_z_lista(Counter({"t": 1}), {"t": (1, "uzasadnienie merytoryczne")}) == []


@pytest.mark.parametrize("tozsamosc", sorted(DOZWOLONE))
def test_kazdy_wpis_listy_ma_uzasadnienie_merytoryczne(tozsamosc: str) -> None:
    ile, uzasadnienie = DOZWOLONE[tozsamosc]
    assert ile >= 1
    # Uzasadnienie merytoryczne, nie „poza zakresem karty": zdanie, nie etykieta.
    assert len(uzasadnienie) >= 80, tozsamosc
    assert "poza zakresem" not in uzasadnienie.lower()


def test_pusty_skan_to_blad_nie_zielen(tmp_path: Path) -> None:
    with pytest.raises(PustySkanError):
        zmierz(tmp_path)
    assert main([], korzen=tmp_path) == 1


# ---------------------------------------------------------------------------
# Drzewo repozytorium
# ---------------------------------------------------------------------------


def test_drzewo_zrodel_zgodne_z_lista_dozwolona() -> None:
    trafienia = zmierz()
    assert trafienia, "skan drzewa zrodel backendu nie moze byc pusty"
    assert porownaj_z_lista(policz(trafienia), DOZWOLONE) == []
    assert main([]) == 0


def test_miejsca_naprawione_w_karcie_nie_wracaja() -> None:
    """Instancje z inwentarza karty #144 (tożsamości sprzed naprawy) nie występują."""
    tozsamosci = set(policz(zmierz()))
    for dawne in (
        "enm/domain_operations.py:continue_trunk_segment_sn:klucz:name:branch_ref",
        "enm/topology_ops.py:create_node:zapas_get:name:ref_id",
        "application/field_read_model.py:collect_bays:argument:name:field_ref",
        "application/proof_engine/pakiet_biegu.py:_nazwa_przypadku:zwrot:_nazwa_przypadku:.case_id",
        "application/protection_read_model.py:_resolve_device_name:zwrot:"
        "_resolve_device_name:.ref_id",
    ):
        assert dawne not in tozsamosci, dawne
