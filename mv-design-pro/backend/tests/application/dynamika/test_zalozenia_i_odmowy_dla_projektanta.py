"""Założenia i odmowy biegu `dynamika_rms` po polsku z NAZWAMI z modelu (karta modeli odbiorów,
§0 pkt 6).

Rdzeń oddaje założenie jako rekord (kod, elementy, wielkości z jednostką, pozycje), a odmowę
jako kod z komunikatem niosącym identyfikatory — zdania dla projektanta składa warstwa
aplikacji z jednego źródła nazw. Deklaracje z dokstringów modułów przypięte tu testem:

* słownik zdań jest ZAMKNIĘTY wobec rejestru kodów rdzenia w obie strony, a każda rodzina
  urządzeń rdzenia ma nazwę;
* ILOCZYN: każdy kod rekordu x każdy wariant pozycji (rodzaj miejsca zwarcia, sprzężenie
  stanowiska, liczba odbiorów czułych) x migawka {elementy z nazwami, elementy bez nazw}
  — zdanie po polsku, zakończone kropką, bez identyfikatorów elementów i bez kluczy kodu;
* odmowy rdzenia z identyfikatorem odbioru (punkt pracy poniżej napięcia przejścia, czynnik
  częstotliwościowy niedodatni) i adresem stanu docierają do projektanta z NAZWĄ odbioru.
"""

from __future__ import annotations

import re

import pytest
from application.dynamika.odmowy import komunikat_dla_projektanta
from application.dynamika.zalozenia import (
    NAZWY_RODZIN_PL,
    ZDANIA_ZALOZEN,
    zdania_zalozen_rdzenia,
)
from network_model.solvers.dynamika import (
    GalazDynamiki,
    HarmonogramDynamiki,
    OdbiorDynamiki,
    OdmowaDynamiki,
    PunktPracy,
    SilnikDynamiki,
    WejscieDynamiki,
    WezelDynamiki,
    ZwarcieWezla,
)
from network_model.solvers.dynamika.odbiory import charakterystyka_z_wielomianu
from network_model.solvers.dynamika.urzadzenia import zbuduj_szyne_sztywna
from network_model.solvers.dynamika.urzadzenia.fabryka import RODZINY_OBSLUGIWANE
from network_model.solvers.dynamika.wynik import (
    KODY_ZALOZEN_RDZENIA,
    WielkoscZalozenia,
    ZalozenieRdzenia,
    rekord_zalozenia,
)

from tests.walidacja_fizyczna import stanowisko

#: Identyfikatory elementów o kształcie identyfikatorów modelu (z myślnikami), których NIE
#: może być w zdaniu dla projektanta.
ODBIOR_A = "odb-stacja-polnoc"
ODBIOR_B = "odb-stacja-poludnie"
SZYNA = "b-sn-odbiorow"
GALAZ = "kab-odcinek-2"
ZRODLO = "zrodlo-stanowiska"

MIGAWKA_Z_NAZWAMI = {
    "buses": [{"ref_id": SZYNA, "name": "Szyna SN odbiorów"}],
    "branches": [{"ref_id": GALAZ, "name": "Kabel odcinek drugi"}],
    "loads": [
        {"ref_id": ODBIOR_A, "name": "Odbiór stacji Północ"},
        {"ref_id": ODBIOR_B, "name": "Odbiór stacji Południe"},
    ],
    "sources": [{"ref_id": ZRODLO, "name": "Źródło stanowiska"}],
}
#: Te same elementy BEZ nazw — jedno źródło nazw daje opis rodzaju, nigdy identyfikator.
MIGAWKA_BEZ_NAZW = {
    kolekcja: [{"ref_id": element["ref_id"]} for element in elementy]
    for kolekcja, elementy in MIGAWKA_Z_NAZWAMI.items()
}
IDENTYFIKATORY = (ODBIOR_A, ODBIOR_B, SZYNA, GALAZ, ZRODLO)
#: Klucz kodu w zdaniu: słowo z podkreśleniem (`u_min_pu`, `tryb_stanowiska`).
KLUCZ_KODU = re.compile(r"\b[a-z0-9]+_[a-z0-9_]+\b")
POLSKIE_ZNAKI = re.compile("[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]")


def _zwarcie(rodzaj: str) -> ZalozenieRdzenia:
    wielkosci = [WielkoscZalozenia("t_s", 0.1, "s"), WielkoscZalozenia("t_usuniecia_s", 0.2, "s")]
    if rodzaj == "galaz":
        wielkosci.append(WielkoscZalozenia("polozenie_wzgledne", 0.35, "-"))
    miejsce = GALAZ if rodzaj == "galaz" else SZYNA
    return ZalozenieRdzenia("zwarcie_usuniete_samoczynnie", (miejsce,), tuple(wielkosci), (rodzaj,))


#: (etykieta, rekord) — KAŻDY kod rejestru i każdy wariant jego pozycji/elementów.
PRZYPADKI: tuple[tuple[str, ZalozenieRdzenia], ...] = (
    ("model_rms", ZalozenieRdzenia("model_rms_skladowej_zgodnej", (), (), ())),
    ("model_odbiorow", ZalozenieRdzenia("model_odbiorow", (), (), ())),
    ("zwarcia_3f", ZalozenieRdzenia("zwarcia_trojfazowe", (), (), ())),
    ("rodziny", ZalozenieRdzenia("rodziny_urzadzen", (), (), tuple(RODZINY_OBSLUGIWANE))),
    ("probki", ZalozenieRdzenia("probki_obustronne", (), (), ())),
    (
        "estymator_jeden",
        ZalozenieRdzenia("estymator_czestotliwosci_odbiorow", (ODBIOR_A,), (), ()),
    ),
    (
        "estymator_dwa",
        ZalozenieRdzenia("estymator_czestotliwosci_odbiorow", (ODBIOR_A, ODBIOR_B), (), ()),
    ),
    ("obszar", ZalozenieRdzenia("obszar_beznapieciowy", (), (), ())),
    ("start", ZalozenieRdzenia("start_ponownego_zasilenia", (), (), ())),
    ("reinicjalizacja", ZalozenieRdzenia("reinicjalizacja_estymatora_odbioru", (), (), ())),
    ("przypisanie", ZalozenieRdzenia("przypisanie_stanu", (), (), ())),
    ("utrata", ZalozenieRdzenia("utrata_czesciowa_zrodla", (), (), ())),
    (
        "stanowisko_idealne",
        ZalozenieRdzenia("tryb_stanowiska", (ZRODLO, SZYNA), (), ("idealne",)),
    ),
    (
        "stanowisko_za_impedancja",
        ZalozenieRdzenia("tryb_stanowiska", (ZRODLO, SZYNA), (), ("za_impedancja",)),
    ),
    ("zwarcie_wezel", _zwarcie("wezel")),
    ("zwarcie_galaz", _zwarcie("galaz")),
)


def test_slownik_zdan_zamkniety_wobec_rejestru_kodow_rdzenia() -> None:
    assert set(ZDANIA_ZALOZEN) == set(KODY_ZALOZEN_RDZENIA)
    # Iloczyn przypadków pokrywa każdy kod rejestru (kod bez przypadku = zdanie bez testu).
    assert {rekord.kod for _, rekord in PRZYPADKI} == set(KODY_ZALOZEN_RDZENIA)


def test_kazda_rodzina_urzadzen_rdzenia_ma_nazwe_dla_projektanta() -> None:
    assert set(RODZINY_OBSLUGIWANE) == set(NAZWY_RODZIN_PL)


@pytest.mark.parametrize("migawka", [MIGAWKA_Z_NAZWAMI, MIGAWKA_BEZ_NAZW], ids=["nazwy", "bez"])
@pytest.mark.parametrize("etykieta,rekord", PRZYPADKI, ids=[e for e, _ in PRZYPADKI])
def test_zdanie_po_polsku_z_nazwami_bez_identyfikatorow_i_kluczy(
    etykieta: str, rekord: ZalozenieRdzenia, migawka: dict
) -> None:
    (zdanie,) = zdania_zalozen_rdzenia([rekord_zalozenia(rekord)], migawka)
    assert zdanie.endswith("."), zdanie
    assert POLSKIE_ZNAKI.search(zdanie), zdanie
    assert not KLUCZ_KODU.search(zdanie), (etykieta, KLUCZ_KODU.findall(zdanie))
    for ref in IDENTYFIKATORY:
        assert ref not in zdanie, (etykieta, ref, zdanie)
    for ref in rekord.elementy:
        nazwy = {e["ref_id"]: e.get("name") for els in migawka.values() for e in els}
        if nazwy[ref] is not None:
            assert f"„{nazwy[ref]}”" in zdanie, (etykieta, zdanie)


def test_zdanie_zwarcia_niesie_wielkosci_rekordu_po_polsku() -> None:
    (zdanie,) = zdania_zalozen_rdzenia([rekord_zalozenia(_zwarcie("galaz"))], MIGAWKA_Z_NAZWAMI)
    assert "x = 0,35 długości" in zdanie and "t = 0,1 s" in zdanie and "t = 0,2 s" in zdanie


# ---------------------------------------------------------------------------
# Odmowy rdzenia docierające do projektanta
# ---------------------------------------------------------------------------


def _uklad_z_odbiorem(*, u_min_pu: float, k_pf: float, t_f_s: float | None) -> WejscieDynamiki:
    """Szyna sztywna — linia — odbiór stałej mocy (identyfikatory w kształcie modelu)."""
    z_s = complex(0.01, 0.10)
    z_l = complex(0.02, 0.08)
    y = 1.0 / (z_s + z_l)
    # Punkt pracy: odbiór S = 0,3 + j0,1 pu — napięcie z równania kwadratowego (górny
    # pierwiastek) liczone iteracją stałopunktową (sieć liniowa, zbieżność monotoniczna).
    v_l = complex(1.0, 0.0)
    for _ in range(200):
        v_l = 1.0 - (z_s + z_l) * (complex(0.3, 0.1) / v_l).conjugate()
    prad = y * (1.0 - v_l)
    v_s = 1.0 - z_s * prad
    charakterystyka = charakterystyka_z_wielomianu(
        a_p=0.0,
        b_p=0.0,
        c_p=1.0,
        a_q=0.0,
        b_q=0.0,
        c_q=1.0,
        v0_pu=1.0,
        k_pf=k_pf,
        k_qf=0.0,
        f0_hz=50.0,
        u_min_pu=u_min_pu,
        t_pomiaru_czestotliwosci_s=t_f_s,
    )
    szyna = zbuduj_szyne_sztywna(
        ident="SYS",
        wezel="S",
        s_zwarciowa_mva=100.0,
        r_pu=z_s.real,
        x_pu=z_s.imag,
        s_bazowa_mva=100.0,
    )
    return WejscieDynamiki(
        wezly=(WezelDynamiki("S", 15.0), WezelDynamiki(SZYNA, 15.0)),
        galezie=(GalazDynamiki(GALAZ, "S", SZYNA, 1.0 / z_l, 0.0, 1 + 0j, True, "linia"),),
        odsprzegi=(),
        odbiory=(OdbiorDynamiki(ODBIOR_A, SZYNA, 0.3, 0.1, charakterystyka),),
        urzadzenia=(szyna,),
        punkt_pracy=PunktPracy({"S": v_s, SZYNA: v_l}, {"SYS": v_s * prad.conjugate()}),
        harmonogram=HarmonogramDynamiki(
            (
                ZwarcieWezla(
                    t_s=0.05,
                    wezel=SZYNA,
                    typ="3F",
                    r_f_ohm=0.0,
                    x_f_ohm=0.05,
                    t_usuniecia_s=0.08,
                    sposob_usuniecia="samoczynne",
                ),
            )
        ),
        nastawy=stanowisko.nastawy(dt_s=1e-3, horyzont_s=0.2, krok_wyjscia_s=1e-2),
        s_bazowa_mva=100.0,
        f_bazowa_hz=50.0,
    )


@pytest.mark.parametrize(
    "przypadek,parametry,kod",
    [
        (
            "punkt_pracy_ponizej_u_min",
            {"u_min_pu": 0.99, "k_pf": 0.0, "t_f_s": None},
            "dynamika.odbior_ponizej_napiecia_przejscia",
        ),
        (
            "czynnik_czestotliwosci_niedodatni",
            {"u_min_pu": 0.7, "k_pf": 40.0, "t_f_s": 0.002},
            "dynamika.zakres_waznosci_przekroczony",
        ),
    ],
)
@pytest.mark.parametrize("migawka", [MIGAWKA_Z_NAZWAMI, MIGAWKA_BEZ_NAZW], ids=["nazwy", "bez"])
def test_odmowa_rdzenia_z_odbiorem_dociera_do_projektanta_z_nazwa(
    przypadek: str, parametry: dict, kod: str, migawka: dict
) -> None:
    with pytest.raises(OdmowaDynamiki) as blad:
        SilnikDynamiki(_uklad_z_odbiorem(**parametry)).uruchom()
    assert blad.value.kod == kod
    # Rdzeń niesie identyfikator odbioru (nie zna nazw) — i to jest to, co zamienia warstwa
    # aplikacji; bez identyfikatora projektant nie wiedziałby, KTÓRY odbiór odmówił.
    assert ODBIOR_A in blad.value.komunikat, blad.value.komunikat
    tekst = komunikat_dla_projektanta(blad.value.komunikat, migawka)
    for ref in IDENTYFIKATORY:
        assert ref not in tekst, (przypadek, tekst)
    nazwa = "Odbiór stacji Północ" if migawka is MIGAWKA_Z_NAZWAMI else None
    if nazwa is not None:
        assert f"„{nazwa}”" in tekst, tekst


def test_adres_stanu_i_cytowany_identyfikator_zamienione_na_opis_i_nazwe() -> None:
    tekst = komunikat_dla_projektanta(
        f"Stan {ODBIOR_A}.kat_pomiaru_rad poza zakresem; odbiór '{ODBIOR_B}' i \"{SZYNA}\" "
        f"oraz obcy element spoza-modelu.nieznany_stan.",
        MIGAWKA_Z_NAZWAMI,
    )
    assert "„Odbiór stacji Północ”" in tekst and ODBIOR_A not in tekst
    assert "kat_pomiaru_rad" not in tekst, tekst
    assert "„Odbiór stacji Południe”" in tekst and f"'{ODBIOR_B}'" not in tekst
    assert "„Szyna SN odbiorów”" in tekst and f'"{SZYNA}"' not in tekst
    # Identyfikator spoza migawki zostaje bez zmian (nie ma nazwy do podstawienia).
    assert "spoza-modelu.nieznany_stan" in tekst


def test_dluzszy_identyfikator_nie_jest_podmieniany_przez_krotszy_prefiks() -> None:
    migawka = {
        "loads": [
            {"ref_id": "odb-1", "name": "Odbiór jeden"},
            {"ref_id": "odb-10", "name": "Odbiór dziesięć"},
        ]
    }
    tekst = komunikat_dla_projektanta("Odbiory odb-10 i odb-1 odmówiły.", migawka)
    assert tekst == "Odbiory „Odbiór dziesięć” i „Odbiór jeden” odmówiły."


def _klucze_w_komunikatach_odmow() -> dict[str, set[str]]:
    """Klucze kodu (`klucz`) cytowane w treści KAŻDEGO miejsca odmowy rdzenia dynamiki
    (`OdmowaDynamiki`, `_odmowa_charakterystyki`) i adaptera (`OdmowaWejsciaDynamiki`,
    `BrakDynamiki.komunikat_pl`) — skan drzewa składniowego, nie przykład."""
    import ast
    from pathlib import Path

    zrodla = Path(__file__).resolve().parents[3] / "src"
    pliki = [
        *sorted((zrodla / "network_model" / "solvers" / "dynamika").rglob("*.py")),
        zrodla / "enm" / "adapter_dynamiki.py",
    ]
    wynik: dict[str, set[str]] = {}
    for plik in pliki:
        drzewo = ast.parse(plik.read_text(encoding="utf-8"))
        for wezel in ast.walk(drzewo):
            if not isinstance(wezel, ast.Call):
                continue
            nazwa = getattr(wezel.func, "id", getattr(wezel.func, "attr", None))
            tresci: list[ast.AST] = []
            if nazwa in ("OdmowaDynamiki", "_odmowa_charakterystyki", "OdmowaWejsciaDynamiki"):
                tresci = list(wezel.args[:2])
            elif nazwa == "BrakDynamiki":
                tresci = [s.value for s in wezel.keywords if s.arg == "komunikat_pl"]
            for tresc in tresci:
                for czesc in ast.walk(tresc):
                    if isinstance(czesc, ast.Constant) and isinstance(czesc.value, str):
                        for klucz in re.findall(r"`([A-Za-z_][A-Za-z0-9_]*)`", czesc.value):
                            wynik.setdefault(klucz, set()).add(
                                f"{plik.relative_to(zrodla)}:{wezel.lineno}"
                            )
    return wynik


def test_kazdy_klucz_kodu_w_odmowach_ma_etykiete_dla_projektanta() -> None:
    """KLASA: klucz pola albo wartości cytowany w komunikacie odmowy rdzenia/adaptera trafia
    do projektanta jako etykieta z opisu kontraktu scenariusza (ta sama, co w formularzu)."""
    from application.dynamika.odmowy import etykieta_klucza

    klucze = _klucze_w_komunikatach_odmow()
    assert klucze, "skan odmów stracił kotwicę"
    bez_etykiety = {k: sorted(v) for k, v in klucze.items() if etykieta_klucza(k) is None}
    assert not bez_etykiety, bez_etykiety
    for klucz in klucze:
        tekst = komunikat_dla_projektanta(f"Pole `{klucz}` odrzucone.", {})
        assert f"`{klucz}`" not in tekst and "„" in tekst, (klucz, tekst)
