"""Karta #142: komunikat operacji dla projektanta bez nazw pól kontraktu i kodów wartości.

PO CO. Operacje domenowe (``execute_domain_operation`` i operacje pokrewne: brama
katalogowa API, zastosowanie szablonu stacji, zapis wytwórcy) zwracają projektantowi
błąd, ostrzeżenia gotowości i podpowiedzi naprawy. Projektant nie zna kontraktu API —
dostaje nazwę pola formularza (jak w kreatorze), nazwę wartości i nazwę elementu z modelu.
Kod maszynowy zostaje w ``error_code`` (front mapuje po nim błąd na pole formularza),
identyfikator elementu — w ``element_ref``.

TRZY WARSTWY PILNOWANIA (reguła KLASA, NIE INSTANCJA):

1. **Strażnik klasy (AST).** Każdy literał i f-string tekstu dla człowieka w modułach
   komunikatów operacji (inwentarz ``MODULY_KOMUNIKATOW``) nie niesie tokenu
   ``snake_case`` z podkreślnikiem, kodu ``WIELKIE_LITERY_Z_PODKRESLNIKIEM``, znanego kodu
   wartości (rola pola, rodzaj aparatu, tryb…), fragmentu w odwróconych apostrofach ani
   interpolacji identyfikatora (``ref_id``, ``*_ref``, ``*_id``) podanego wprost, bez
   funkcji nazywającej. Skróty inżynierskie i symbole wielkości są jawnymi listami
   wyjątków; każde wykluczenie kontekstu ma uzasadnienie merytoryczne.
2. **Jedna mapa pól.** Każde wywołanie ``pole``/``nazwa_pola`` w kodzie rozwiązuje się
   w ``NAZWY_POL_KONTRAKTU_PL`` (brak wpisu nie może wyjść dopiero u projektanta), a nazwy
   z mapy i map wartości są słowami frontu (parytet z plikami ``strings.ts``/etykietami).
3. **Iloczyn cech w wykonaniu.** Operacja × rodzaj błędu (brak pola, zła wartość,
   sprzeczność topologii, brak katalogu) × miejsce (komunikat główny, ostrzeżenie
   gotowości, podpowiedź naprawy): polska nazwa pola obecna, kod nieobecny, identyfikator
   nieobecny, ``error_code`` bez zmian.
"""

from __future__ import annotations

import ast
import copy
import re
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any, get_args

import pytest
from enm import slownik_komunikatow as slownik
from enm.deklaracje_modulu import POLA_DEKLARACJI, POLA_NC_RFG_GENERATORA
from enm.domain_operations import _TRANSFORMER_REQUIRED_FIELDS, execute_domain_operation
from enm.domain_operations_v2 import _KATALOGI_WIAZAN_DER, rozbieznosci_tabliczki
from enm.katalog_projektu_karty import KLUCZ_KART_WIDMOWYCH
from enm.load_zip_model import KLUCZE_ODNIESIENIA_ZIP, KLUCZE_ZIP_ODBIORU
from enm.models import BayPrimaryDevice, Generator
from enm.nastawy_modulu import POLA_NASTAW
from enm.nazwy_elementow import nazwa_nadana_elementu, nazwa_nadana_pozycji_katalogu
from enm.rola_pola_sn import NAZWA_ROLI_POLA_SN_PL
from network_model.catalog.switchgear.complete_mv_bay_template import (
    NAZWY_RODZAJOW_POLA_KATALOGOWEGO_PL,
    OPIS_RODZAJU_POLA_KATALOGOWEGO,
    BayKind,
)
from network_model.catalog.switchgear.device_instance import (
    NAZWY_RODZAJOW_APARATU_PL,
    ApparatusKind,
)
from network_model.catalog.switchgear.switchgear_family import (
    NAZWY_TOROW_KONFIGURACJI_PL,
    POWODY_BLOKADY_RODZINY_PL,
    TorKonfiguracji,
)
from network_model.catalog.types import NAZWY_KATEGORII_KATALOGU_PL, CatalogNamespace

from tests.enm.test_station_field_apparatus_explicit import (
    APARAT_SN,
    _build_trunk_with_segment,
    _insert_payload,
)

BACKEND = Path(__file__).resolve().parents[2]
SRC = BACKEND / "src"
FRONT = BACKEND.parent / "frontend" / "src"

# ---------------------------------------------------------------------------
# Rozpoznawanie kodu w tekście dla projektanta
# ---------------------------------------------------------------------------

#: Rozszerzenia plików danych — ``nc_rfg.yaml`` to NAZWA PLIKU (wskazanie pliku, który
#: projektant albo opiekun danych otwiera), nie klucz pola.
_ROZSZERZENIA_PLIKOW = r"\.(?:yaml|yml|json|csv|xlsx|xls|txt|zip|pdf|docx)\b"
#: Nazwa pola kontraktu albo kod wartości w zapisie ``snake_case`` (z podkreślnikiem).
_SNAKE = re.compile(
    r"(?<![\w./-])[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?![\w-]|" + _ROZSZERZENIA_PLIKOW + ")"
)
#: Kod ``WIELKIE_LITERY_Z_PODKRESLNIKIEM``.
_WIELKIE_KODY = re.compile(r"(?<![\w./-])[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+(?![\w-])")
#: Kod kropkowy kanonu gotowości i walidacji (``source.sk_min_missing``,
#: ``przeksztaltnik.karta_ssci``): człony małymi literami rozdzielone kropką, co najmniej
#: jeden z podkreślnikiem — człon po kropce nie jest łapany przez ``_SNAKE`` (wykluczenie
#: poprzedzającej kropki chroni nazwy plików i ścieżek).
_KOD_KROPKOWY = re.compile(
    r"(?<![\w./-])[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+(?![\w-]|" + _ROZSZERZENIA_PLIKOW + ")"
)
#: Nazwa pliku (ostatni człon to rozszerzenie) — zapis formatu, nie kod kanonu.
_PLIK_KROPKOWY = re.compile(r"\.(?:yaml|yml|json|csv|xlsx|xls|txt|zip|pdf|docx|py|ts|tsx|md)$")
#: Fragment kodu w odwróconych apostrofach (zapis dokumentacji kodu, nie zdania).
_ODWROCONE = re.compile(r"`[^`]+`")
#: Słowo pisane wielkimi literami (kandydat na kod wartości bez podkreślnika).
_WIELKIE_SLOWO = re.compile(r"(?<![\w./-])[A-Z][A-Z0-9]+(?![\w-])")

#: Skróty inżynierskie — NIE są kodami (§0.3 karty). Każdy jest słowem, którego front
#: używa w etykietach i treściach (``ui2/**/strings.ts``, kreatory, inspektor).
SKROTY_INZYNIERSKIE: frozenset[str] = frozenset(
    {
        "SN",
        "WN",
        "GPZ",
        "PV",
        "BESS",
        "FW",
        "OSD",
        "PTPIREE",
        "IEC",
        "CT",
        "VT",
        "OZE",
        "DER",
        "TR",
        "NOP",
        "ZKSN",
        "RMU",
        "SCADA",
        "SZR",
        "SWZ",
        "OLTC",
        "DETC",
        "AVR",
        "LVRT",
        "HVRT",
        "FRT",
        "LFSM",
        "NC",
        "PN",
        "EN",
        "HD",
        "ZIP",
        "UPS",
        "XLPE",
        "PVC",
        "WOS",
        "WIPWC",
        "THD",
        "ROCOF",
        "MIN",
        "MAX",
        "PMSG",
        "DFIG",
        "SCIG",
        "AB",
        "BC",
        "CA",
        "YN",
        "ZN",
        "RMS",
        "BFS",
        "SOC",
        "SSCI",
        "SLD",
        "ZK",
        "TN",
        "TT",
        "IT",
        "MVA",
        "MW",
        "KVA",
        "KW",
        "KV",
        "LOM",
    }
)

#: Symbole wielkości fizycznych z indeksem dolnym — zapis inżynierski, nie pole kontraktu.
#: JEDNA lista: symbol → podstawa (norma albo dokument źródłowy i oznaczenie wielkości);
#: każdy wpis musi wystąpić w tekście dla projektanta w ``src`` i nieść odwołanie do normy
#: (``test_symbole_inzynierskie_maja_podstawe_i_sa_zywe``).
SYMBOLE_INZYNIERSKIE: dict[str, str] = {
    "R_N": "IEC 60909-0:2016 §6.3.3 — rezystancja R_N impedancji uziemienia punktu neutralnego",
    "X_N": "IEC 60909-0:2016 §6.3.3 — reaktancja X_N impedancji uziemienia punktu neutralnego",
    "Z_N": "IEC 60909-0:2016 §6.3.3 — impedancja uziemienia punktu neutralnego Z_N (3·Z_N w Z_(0))",
    "Z_Q": "IEC 60909-0:2016 §6.2 wzór (1) — impedancja zwarciowa sieci zasilającej Z_Q",
    "Z_T": "IEC 60909-0:2016 §6.3.1 wzór (7) — impedancja zwarciowa transformatora Z_T",
    "Z_T0": "IEC 60909-0:2016 §6.3.1 — impedancja składowej zerowej transformatora Z_T0 (Z_(0)T)",
    "Z_E": "PN-HD 60364-4-41 §411.4 / IEC 61936-1 §10 — impedancja uziemienia Z_E",
    "U_n": "IEC 60038 / IEC 60909-0:2016 §3.13 — napięcie znamionowe sieci U_n",
    "P_n": "IEC 61400-27-1 / rozporządzenie 2016/631 art. 2 — moc znamionowa czynna P_n",
    "S_n": "IEC 60076-1 §3.4.3 / IEC 60034-1 — moc znamionowa pozorna S_n",
    "k_j": "N SEP-E-002 / PN-HD 60364-3 — współczynnik jednoczesności k_j obciążenia",
    "k_obc": "IEC 60076-7 §7 — współczynnik obciążenia (przeciążalności) transformatora k_obc",
    "k_sc": "IEC 60909-0:2016 §6.9 — krotność prądu zwarciowego przekształtnika k_sc = I_k''/I_rG",
    "k_pf": "IEEE Task Force „Load representation for dynamic performance” (1993) — k_pf",
    "k_qf": "IEEE Task Force „Load representation for dynamic performance” (1993) — k_qf",
    "R_s": "IEC 60909-0:2016 §6.3 / Fortescue — rezystancja własna R_s gałęzi wielofazowej",
    "Z_m": "IEC 60909-0:2016 §6.3 / Fortescue — impedancja wzajemna Z_m faz gałęzi",
    "a_P": "IEEE Std 1110 / model ZIP (CIGRE TB 566) — udział stałoimpedancyjny a_P mocy P",
    "b_P": "IEEE Std 1110 / model ZIP (CIGRE TB 566) — udział stałoprądowy b_P mocy P",
    "c_P": "IEEE Std 1110 / model ZIP (CIGRE TB 566) — udział stałomocowy c_P mocy P",
    "a_Q": "IEEE Std 1110 / model ZIP (CIGRE TB 566) — udział stałoimpedancyjny a_Q mocy Q",
    "b_Q": "IEEE Std 1110 / model ZIP (CIGRE TB 566) — udział stałoprądowy b_Q mocy Q",
    "c_Q": "IEEE Std 1110 / model ZIP (CIGRE TB 566) — udział stałomocowy c_Q mocy Q",
    "c_max": "IEC 60909-0:2016 tab. 1 — współczynnik napięciowy c_max",
    "c_min": "IEC 60909-0:2016 tab. 1 — współczynnik napięciowy c_min",
    "i_p": "IEC 60909-0:2016 §8.1 — prąd udarowy i_p",
    "t_b": "IEC 60909-0:2016 §9.1 — minimalny czas wyłączenia t_b",
    "t_k": "IEC 60909-0:2016 §10 — czas trwania zwarcia t_k",
    "t_th": "IEC 62271-1 §5.6 / IEC 60909-0:2016 §4.8 — czas znamionowy t_th prądu cieplnego",
    "u_k": "IEC 60076-1 §3.7.1 — napięcie zwarcia u_k transformatora",
    "I_B": "PN-HD 60364-4-43 §433.1 — prąd obliczeniowy I_B obwodu",
    "R_A": "PN-HD 60364-4-41 §411.5.3 — rezystancja uziemienia R_A części przewodzących (TT)",
    "R_B": "PN-HD 60364-4-41 §411.5 — rezystancja uziemienia R_B punktu neutralnego (TT)",
    "b_0": "IEC 60909-0:2016 §3.6 / PN-HD 60364-4-41 §411.6 — susceptancja doziemna b_0 (IT)",
    "t_r": "IEC 60947-2 zał. K — zwłoka długozwłoczna t_r wyzwalacza elektronicznego",
    "t_sd": "IEC 60947-2 zał. K — zwłoka krótkozwłoczna t_sd wyzwalacza elektronicznego",
    "t_min": "PN-EN 60255-151 §5 — minimalny czas zwłoki t_min krzywej zależnej",
    "f_min": "IEC 61000-4-7 — dolna granica f_min pasma częstotliwości wpisu widma",
    "f_max": "IEC 61000-4-7 — górna granica f_max pasma częstotliwości wpisu widma",
    "U_1": "IEC 61000-2-2 / EN 50160 — napięcie składowej podstawowej U_1",
    "U_N": "EN 50160 §3 — napięcie znamionowe U_N",
    "U_C": "EN 50160 §3 — napięcie deklarowane U_C",
    "I_L": "IEEE Std 519-2022 §3 — prąd obciążenia I_L",
    "I_N": "IEC 61000-3-12 / IEEE Std 519-2022 — prąd znamionowy I_N",
    "t_a": "PN-HD 60364-4-41 §411.3.2 / IEC 61008-1 — czas zadziałania zabezpieczenia t_a",
    "D_AFB": "IEEE Std 1584-2018 §4.11 — granica łuku elektrycznego D_AFB",
    "t_f": "IEEE Std 80-2013 §16.2 — czas trwania prądu rażeniowego t_f",
    "t_wym": "PN-HD 60364-4-41 §411.3.2.2 tab. 41.1 — wymagany czas samoczynnego wyłączenia t_wym",
    "K_G": "IEC 60909-0:2016 §6.6.1 — współczynnik korekcyjny impedancji generatora K_G",
    "K_T": "IEC 60909-0:2016 §6.3.3 — współczynnik korekcyjny impedancji transformatora K_T",
    "R_M": "IEC 60909-0:2016 §6.8 — rezystancja R_M silnika asynchronicznego",
    "Z_M": "IEC 60909-0:2016 §6.8 — impedancja Z_M silnika asynchronicznego",
    "I_LR": "IEC 60909-0:2016 §6.8 — prąd rozruchowy (zablokowanego wirnika) I_LR silnika",
    "R_L": "IEC 60909-0:2016 §6.3.1 wzór (11) — rezystancja przewodu linii R_L w temperaturze",
    "U_0": "PN-HD 60364-4-41 §411.4.4 — napięcie fazowe względem ziemi U_0",
    "I_E": "IEC 61936-1 §10 — prąd uziomowy I_E",
    "k_cz": "PN-EN 60255-151 / wytyczne PTPiREE doboru nastaw — współczynnik czułości k_cz",
    "k_b": "PN-EN 60255-151 / wytyczne PTPiREE doboru nastaw — współczynnik bezpieczeństwa k_b",
}


def _znane_kody_wartosci() -> frozenset[str]:
    """Kody wartości bez podkreślnika, które mogłyby udawać słowo (rola pola, rodzaj
    aparatu, uzwojenie, tryb, rodzaj pomiaru…) — zebrane z kontraktów, nie wpisane z ręki."""
    kody: set[str] = set()
    kody.update(get_args(BayPrimaryDevice.model_fields["kind"].annotation))
    kody.update(get_args(BayPrimaryDevice.model_fields["placement"].annotation))
    kody.update({"IN", "OUT", "TR", "COUPLER", "FEEDER", "MEASUREMENT", "OZE"})
    kody.update(NAZWA_ROLI_POLA_SN_PL)
    kody.update(slownik.NAZWY_UZWOJEN_REGULOWANYCH_PL)
    kody.update(slownik.NAZWY_RODZAJOW_REGULACJI_ZACZEPOW_PL)
    kody.update(slownik.NAZWY_TRYBOW_STEROWANIA_ZACZEPAMI_PL)
    kody.update(slownik.NAZWY_RODZAJOW_UKLADU_POMIAROWEGO_PL)
    kody.update(slownik.NAZWY_STATUSOW_WERYFIKACJI_PL)
    kody.update(slownik.NAZWY_STATUSOW_KATALOGU_PL)
    kody.update(namespace.value for namespace in CatalogNamespace)
    kody.update(get_args(TorKonfiguracji))
    kody.update({"OVERRIDE", "CATALOG", "KATALOG", "MIGRACJA", "HV_110", "RATIO"})
    return frozenset(kod for kod in kody if isinstance(kod, str) and kod.upper() == kod)


ZNANE_KODY_WARTOSCI = _znane_kody_wartosci()


#: Dopisek kodu PO polskim zdaniu — rozstrzygnięcie architekta 2026-10-29: kod jest dowodem
#: audytowym wyłącznie jako dopisek ``(<etykieta>: <kod>)`` na KOŃCU tekstu, którego zdanie
#: obywa się bez kodu. Etykieta nazywa rodzaj kodu słowami; każda ma podstawę i test
#: żywotności (``test_dopiski_kodu_sa_zywe``). Kod w innym miejscu tekstu albo dopisek o
#: etykiecie spoza listy pozostaje naruszeniem.
DOPISKI_KODU: dict[str, str] = {
    "kod reguły": (
        "twarda reguła katalogu `KAT-T-…` (`network_model/catalog/niezmienniki_katalogu.py::"
        "odmowa_twarda`) — rozstrzygnięcie architekta 2026-10-29, przypięte "
        "`test_kod_reguly_katalogu_jest_dopiskiem_po_zdaniu`"
    ),
    "kod gotowości": (
        "kod rejestru gotowości `READINESS_CODES` (`domain/readiness_codes.py`) w pozycji "
        "listy braków gotowości i w odmowie biegu złożenia wejścia — ten sam kod co pole "
        "maszynowe odmowy (`kod`), czytany przez audyt bramek fizycznych"
    ),
    "kod odmowy": (
        "kod rejestru odmów rdzenia dynamiki `KODY_ODMOW` (`network_model/solvers/dynamika/"
        "kontrakty.py`) — treść bez kodu niesie pole `komunikat` odmowy"
    ),
}
_DOPISEK_KODU = re.compile(r"\((?P<etykieta>kod [^:()]+):\s*(?P<kod>⟨⟩|[\w.\-]+)\s*\)\s*\.?\s*$")


def bez_dopisku_kodu(tekst: str) -> str:
    """Tekst bez końcowego dopisku kodu ``(<etykieta z DOPISKI_KODU>: <kod>)`` — dopisek jest
    dowodem audytowym po zdaniu, nie treścią zdania (ta sama reguła co strażnik statyczny
    ``test_klucze_pol_w_komunikatach_src._w_dopisku_kodu``). Dopisek o etykiecie spoza listy
    zostaje w tekście i jest kodem jak każdy inny."""
    dopisek = _DOPISEK_KODU.search(tekst)
    if dopisek is None or dopisek.group("etykieta") not in DOPISKI_KODU:
        return tekst
    return tekst[: dopisek.start()]


def kody_w_tekscie(tekst: str) -> list[str]:
    """Tokeny kodu w tekście dla projektanta (pusta lista = tekst czysty). Kod w dopisku
    po zdaniu (``bez_dopisku_kodu``) nie jest treścią zdania."""
    tekst = bez_dopisku_kodu(tekst)
    znalezione: list[str] = []
    for token in (*_SNAKE.findall(tekst), *_WIELKIE_KODY.findall(tekst)):
        if token not in SYMBOLE_INZYNIERSKIE:
            znalezione.append(token)
    znalezione.extend(
        k for k in _KOD_KROPKOWY.findall(tekst) if "_" in k and not _PLIK_KROPKOWY.search(k)
    )
    znalezione.extend(_ODWROCONE.findall(tekst))
    for slowo in _WIELKIE_SLOWO.findall(tekst):
        if slowo in ZNANE_KODY_WARTOSCI and slowo not in SKROTY_INZYNIERSKIE:
            znalezione.append(slowo)
    return znalezione


def test_skroty_i_symbole_nie_sa_kodami_wartosci_zabronionymi() -> None:
    """Lista skrótów jest jawna i rozłączna z kodami ról pól (rola nie jest skrótem)."""
    assert not ({"IN", "OUT", "COUPLER", "FEEDER", "MEASUREMENT"} & SKROTY_INZYNIERSKIE)
    assert kody_w_tekscie("Pole liniowe wejściowe w stacji SN/nN, R_N [Ω], k_j = 0,8") == []
    assert kody_w_tekscie("Pole IN nie ma aparatu") == ["IN"]
    assert kody_w_tekscie("wymagane apparatus_catalog_ref") == ["apparatus_catalog_ref"]
    assert kody_w_tekscie("rola LINIA_IN") == ["LINIA_IN"]


@pytest.mark.parametrize("etykieta", sorted(DOPISKI_KODU))
def test_dopisek_kodu_po_zdaniu_nie_jest_kodem_zdania(etykieta: str) -> None:
    """Iloczyn: etykieta dopisku (każda z ``DOPISKI_KODU``) × położenie kodu (wyłącznie
    w dopisku / także w zdaniu) × etykieta spoza listy. Kod w dopisku na końcu tekstu nie jest
    treścią zdania (sprawdzenie w biegu = strażnik statyczny); ten sam kod w zdaniu albo
    dopisek o nieznanej etykiecie pozostaje kodem."""
    zdanie = "Krok całkowania leży poza granicami nastaw."
    assert kody_w_tekscie(f"{zdanie} ({etykieta}: dynamika.nastawy_sprzeczne)") == []
    assert kody_w_tekscie(f"{zdanie} ({etykieta}: dynamika.nastawy_sprzeczne).") == []
    w_zdaniu = f"Odmowa dynamika.nastawy_sprzeczne. ({etykieta}: dynamika.nastawy_sprzeczne)"
    assert kody_w_tekscie(w_zdaniu) == ["dynamika.nastawy_sprzeczne"]
    assert kody_w_tekscie(f"{zdanie} (kod pola: u_n_kv)") == ["u_n_kv"]


# ---------------------------------------------------------------------------
# 1. Strażnik klasy — AST na modułach komunikatów operacji
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ZakresModulu:
    """Moduł komunikatów operacji i zakres jego tekstów dla projektanta.

    ``wywolania`` — gdy niepuste, skanowane są wyłącznie argumenty wywołań o tych nazwach
    (moduł niesie też teksty, które nie są komunikatami operacji — uzasadnienie w
    ``powod``). ``slowa_kluczowe`` — to samo dla argumentów nazwanych; ``klucze_slownika``
    — wartości słownika pod tym kluczem (``{"reason_pl": …}``, ``wynik["reason_pl"] = …``);
    ``listy`` — elementy dokładane do listy komunikatów o tej nazwie (``bledy.append(…)``).
    """

    sciezka: str
    powod: str = ""
    wywolania: frozenset[str] = frozenset()
    slowa_kluczowe: frozenset[str] = frozenset()
    funkcje: frozenset[str] = frozenset()
    klucze_slownika: frozenset[str] = frozenset()
    listy: frozenset[str] = frozenset()


#: INWENTARZ KLASY — każdy moduł, którego tekst trafia do projektanta w odpowiedzi
#: operacji (komunikat główny, ostrzeżenie/blokada gotowości, podpowiedź naprawy,
#: kwestie semantyczne, odmowa bramy API, zastosowanie szablonu stacji).
MODULY_KOMUNIKATOW: tuple[ZakresModulu, ...] = (
    ZakresModulu("enm/domain_operations.py"),
    ZakresModulu("enm/domain_operations_v2.py"),
    ZakresModulu("enm/topology_ops.py"),
    ZakresModulu("enm/validator.py"),
    ZakresModulu("enm/slownik_komunikatow.py"),
    ZakresModulu("enm/pole_katalogowe.py"),
    ZakresModulu("enm/pole_transformatorowe.py"),
    ZakresModulu("enm/katalog_projektu.py"),
    ZakresModulu("enm/katalog_projektu_karty.py"),
    ZakresModulu("enm/deklaracje_modulu.py"),
    ZakresModulu("enm/nastawy_modulu.py"),
    ZakresModulu("enm/load_zip_model.py"),
    ZakresModulu("enm/der_sn_validation.py"),
    ZakresModulu("enm/fazy_odbioru.py"),
    ZakresModulu("enm/zrodlo_zwarcie.py"),
    ZakresModulu("enm/grupa_polaczen.py"),
    ZakresModulu("enm/operacje_lacznikow.py"),
    ZakresModulu("enm/wyposazenie_pola.py"),
    ZakresModulu(
        "enm/uziemienie.py",
        powod=(
            "raport migracji wczytania (`RaportMigracjiUziemienia`) jest wpisem dziennika "
            "zmian magazynu z identyfikatorami jako treścią dowodową migracji, nie "
            "komunikatem operacji — skanowany jest predykat konfiguracji punktu neutralnego"
        ),
        funkcje=frozenset({"blad_konfiguracji_uziemienia"}),
    ),
    ZakresModulu("network_model/catalog/switchgear/family_validation.py"),
    ZakresModulu("network_model/catalog/materialization.py"),
    ZakresModulu("network_model/validation/semantic_rules.py"),
    ZakresModulu("reference_engine/validation.py"),
    ZakresModulu("reference_engine/compliance.py"),
    ZakresModulu("api/domain_ops_policy.py"),
    ZakresModulu("api/generators.py"),
    ZakresModulu(
        "api/enm.py",
        powod=(
            "moduł niesie też końcówki biegów obliczeniowych (inna klasa: odczyt wyników); "
            "komunikaty operacji domenowych rodzi brama wyniku i końcówka operacji"
        ),
        funkcje=frozenset({"rozbieznosc_wobec_bramy", "_domain_ops_pod_blokada"}),
    ),
    ZakresModulu(
        "application/station_templates/apply.py",
        powod="komunikat zastosowania szablonu niesie wyłącznie odmowa `TemplateApplyError`",
        wywolania=frozenset({"TemplateApplyError"}),
    ),
    ZakresModulu(
        "domain/canonical_operations.py",
        powod=(
            "rejestr kanoniczny: do projektanta idą treści gotowości (`message_pl`) i opis "
            "operacji (`description_pl`, cytowany w komunikacie awarii operacji); reszta to "
            "dane rejestru (warstwa docelowa, nazwy kodowe)"
        ),
        slowa_kluczowe=frozenset({"message_pl", "description_pl"}),
    ),
    ZakresModulu(
        "domain/generator_validation.py",
        powod=(
            "do operacji trafia wyłącznie odmowa kontroli mocy (`OdmowaKontroliMocy`); "
            "`validate_generator_connections` nie ma konsumenta w produkcie (tylko testy)"
        ),
        wywolania=frozenset({"OdmowaKontroliMocy"}),
    ),
)

#: Klucze słowników, których wartości NIE są komunikatem dla projektanta (uzasadnienie):
_KLUCZE_POZA_KOMUNIKATEM: dict[str, str] = {
    "action": "wpis dziennika audytu operacji (`audit_trail`) — front przenosi, nie renderuje",
    "name": "nazwa nadawana elementowi — klasa kart #144 (nazwa nigdy z identyfikatora)",
    "field_name": "nazwa nadawana polu — klasa kart #144",
    "wzor": "proweniencja white-box (wzór w zapisie symbolicznym)",
    "zalozenie": "proweniencja white-box (założenie w zapisie symbolicznym)",
    "source": "metadane manifestu katalogu (nazwa źródła danych), nie komunikat",
}
#: Argumenty nazwane poza komunikatem (uzasadnienie):
_SLOWA_POZA_KOMUNIKATEM: dict[str, str] = {
    "name": "nazwa nadawana elementowi — klasa kart #144",
    "description": "opis pola schematu API (dokumentacja OpenAPI), nie odpowiedź operacji",
    "target_layer": "dana rejestru operacji kanonicznych",
}
#: Wywołania, których argumenty są rejestrem deweloperskim, nie komunikatem:
_WYWOLANIA_POZA_KOMUNIKATEM: dict[str, str] = {
    "PozycjaBramyKatalogowejV2": (
        "inwentarz bramy katalogowej operacji V2 — kontrakt testu klasy, nie komunikat"
    ),
    "PozycjaBramyApi": "inwentarz bramy katalogowej API — kontrakt testu klasy, nie komunikat",
    "Field": "dokumentacja pola schematu (OpenAPI)",
}
#: Funkcje nazywające — interpolacja identyfikatora PRZEZ nie jest nazwą elementu, nie ref.
_FUNKCJE_NAZYWAJACE: frozenset[str] = frozenset(
    {
        "opis_elementu",
        "opis_obiektu",
        "opis_nazwy",
        "opis_pozycji_katalogu",
        "nazwa_elementu",
        "pole",
        "nazwa_pola",
        "etykieta_parametru",
        "_opis_pola",
        "_nazwa_pola",
        "_nazwa_pola_w_modelu",
        "nazwa_roli_pola_sn",
        "_opis_karty",
        "_opis_typu",
        "_opis_transformatora",
        "opis_pola_katalogowego_pl",
        "nazwa_rodziny_pl",
        "nazwa_kategorii_katalogu",
        "_nazwa_typu",
    }
)
#: Interpolacje wartości o nazwie identyfikatora, które są DANĄ WPISANĄ PRZEZ PROJEKTANTA
#: (jego własne oznaczenie cytowane w odpowiedzi), a nie identyfikatorem nadanym przez
#: system — uzasadnienie przy każdej.
_INTERPOLACJE_DOZWOLONE: dict[str, str] = {
    "karta.id": "identyfikator karty widmowej z arkusza projektanta (dana wejściowa)",
    "identyfikator": "identyfikator pozycji katalogu projektu z arkusza projektanta",
}

#: Kolekcje, które komunikaty sklejają w zdanie (``separator.join(...)``, ``lista_pl``) — każdy
#: element jest już tekstem dla projektanta (uzasadnienie przy wpisie). Sklejenie INNEJ
#: kolekcji (lista kluczy payloadu, kodów rodzajów, danych ``pole=wartość``) wstawiłoby kod
#: do zdania z pominięciem funkcji nazywającej — tę drogę strażnik łapie osobną regułą,
#: bo nie przechodzi ona przez interpolację f-stringu. Klucz ``moduł:nazwa`` — ta sama
#: nazwa zmiennej w INNYM module nie korzysta z wpisu (tam może nieść kody).
_KOLEKCJE_TEKSTOW: dict[str, str] = {
    "enm/validator.py:braki": "opisy braków danych regulacji napięcia generatora z `pole()`",
    "enm/validator.py:sprzeczne": "porównania Sk''/Ik'' min–max w zapisie symboli wielkości",
    "enm/domain_operations_v2.py:rozbieznosci": (
        "rozbieżności tabliczki z `rozbieznosci_tabliczki` (nazwy z `etykieta_parametru`)"
    ),
    "api/enm.py:rozbieznosci": "rozbieżności bramy wyniku — elementy nazwane `opis_elementu`",
    "enm/katalog_projektu_karty.py:obce": "zdania o kartach z `_opis_karty`/`_opis_typu`",
    "enm/topology_ops.py:deps": "elementy zależne szyny nazwane `opis_elementu`",
    "network_model/validation/semantic_rules.py:brakujace_strony": (
        "strony transformatora słowami („górnego napięcia”, „dolnego napięcia”)"
    ),
    "enm/domain_operations.py:missing": "nazwy pól tabliczki transformatora z `pole()`",
    "reference_engine/compliance.py:missing": (
        "nazwy pomiarów słowami („napięcia (VT)”, „prądu (CT)”)"
    ),
    "enm/domain_operations_v2.py:brakujace_pola_agregatu": (
        "nazwy pól tabliczki agregatu z `pole()`"
    ),
    "enm/domain_operations_v2.py:bledy": (
        "zdania sprzeczności nastaw z `bledy_nastaw` — funkcje nazwane `etykieta_funkcji`, "
        "pola nazwami polskimi (karta BIEG-ZABEZPIECZEN-Z-MODELU)"
    ),
    "enm/slownik_komunikatow.py:opisy": (
        "opisy błędów walidacji złożone z nazw pól formularza i opisów rodzaju błędu"
    ),
    "enm/slownik_komunikatow.py:elementy": (
        "wnętrze `lista_pl` — elementy sprawdza ta sama reguła w miejscu wywołania"
    ),
    "enm/domain_operations.py:UKLADY_SIECI_NN": (
        "układy sieci nN wg PN-HD 60364 (TN-C, TN-S, TN-C-S, TT, IT) — zapis normy"
    ),
    "enm/fazy_odbioru.py:FAZY_PRZYLACZENIA": (
        "oznaczenia faz A/B/C/AB/BC/CA — ten sam zapis co pomoc kreatora odbioru"
    ),
    "enm/grupa_polaczen.py:GRUPY_POLACZEN_IEC60076": (
        "grupy połączeń transformatora wg IEC 60076-1 (Dyn11, Yyn0…) — zapis normy"
    ),
}
#: Wywołania sklejające kolekcję w zdanie — ta sama reguła co ``separator.join``.
_SKLEJAJACE: frozenset[str] = frozenset({"lista_pl", "_lista_nazw"})
#: Mapa etykiet po polsku (konwencja nazw: ``NAZWY_…``, ``ETYKIETA_PL_…``, ``…_PL``) — jej
#: wartości i odczyty ``MAPA[klucz]`` są tekstem dla projektanta.
_MAPA_PL = re.compile(r"^(?:NAZWY_\w+|ETYKIETA_PL_\w+|\w+_PL)$")
#: Atrybut elementu, który JEST tekstem dla człowieka (nazwa, opis PL, oznaczenie aparatu).
_ATRYBUT_TEKSTOWY = re.compile(
    r"(?:^|\.)(?:name|name_pl|\w+_name|\w+_name_pl|\w+_pl|oznaczenie|designation)$"
)

_ID_W_WYRAZENIU = re.compile(r"(?:^|\.)(?:ref_id|ref|id|\w+_ref|\w+_refs|\w+_id)$")
_LUDZKI = re.compile(r"[a-ząćęłńóśźż]{3,}")


@dataclass(frozen=True)
class Naruszenie:
    plik: str
    linia: int
    powod: str
    tekst: str

    def __str__(self) -> str:
        return f"{self.plik}:{self.linia}: {self.powod} :: {self.tekst[:160]!r}"


def _nazwa_wywolania(wezel: ast.Call) -> str:
    funkcja = wezel.func
    if isinstance(funkcja, ast.Attribute):
        return funkcja.attr
    if isinstance(funkcja, ast.Name):
        return funkcja.id
    return ""


def _docstringi(drzewo: ast.AST) -> set[int]:
    wynik: set[int] = set()
    for wezel in ast.walk(drzewo):
        if isinstance(wezel, ast.Module | ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef):
            cialo = wezel.body
            if (
                cialo
                and isinstance(cialo[0], ast.Expr)
                and isinstance(cialo[0].value, ast.Constant)
                and isinstance(cialo[0].value.value, str)
            ):
                wynik.add(id(cialo[0].value))
    return wynik


def _rodzice(drzewo: ast.AST) -> dict[int, ast.AST]:
    rodzice: dict[int, ast.AST] = {}
    for wezel in ast.walk(drzewo):
        for dziecko in ast.iter_child_nodes(wezel):
            rodzice[id(dziecko)] = wezel
    return rodzice


def _przodkowie(wezel: ast.AST, rodzice: dict[int, ast.AST]) -> Iterator[tuple[ast.AST, ast.AST]]:
    """Pary (przodek, dziecko na ścieżce) od bezpośredniego rodzica w górę."""
    dziecko = wezel
    rodzic = rodzice.get(id(wezel))
    while rodzic is not None:
        yield rodzic, dziecko
        dziecko = rodzic
        rodzic = rodzice.get(id(rodzic))


def _poza_komunikatem(wezel: ast.AST, rodzice: dict[int, ast.AST]) -> bool:
    if isinstance(rodzice.get(id(wezel)), ast.Expr):
        return True  # samodzielny napis-instrukcja: opis atrybutu/stałej (dokumentacja)
    for przodek, dziecko in _przodkowie(wezel, rodzice):
        if isinstance(przodek, ast.Assert):
            return True  # komunikat asercji programisty (niezmiennik kodu)
        if isinstance(przodek, ast.Call):
            nazwa = _nazwa_wywolania(przodek)
            if nazwa in _WYWOLANIA_POZA_KOMUNIKATEM:
                return True
            funkcja = przodek.func
            if (
                isinstance(funkcja, ast.Attribute)
                and isinstance(funkcja.value, ast.Name)
                and funkcja.value.id in {"logger", "logging", "log", "_logger"}
            ):
                return True  # dziennik serwera
        if isinstance(przodek, ast.keyword) and przodek.arg in _SLOWA_POZA_KOMUNIKATEM:
            return True
        if isinstance(przodek, ast.Dict):
            for klucz, wartosc in zip(przodek.keys, przodek.values, strict=True):
                if (
                    wartosc is dziecko
                    and isinstance(klucz, ast.Constant)
                    and klucz.value in _KLUCZE_POZA_KOMUNIKATEM
                ):
                    return True
    return False


#: Metody dokładające element do listy komunikatów.
_DOKLADAJACE_DO_LISTY: frozenset[str] = frozenset({"append", "extend", "insert", "add"})


def _w_kanale_wprost(wezel: ast.AST, rodzice: dict[int, ast.AST], zakres: ZakresModulu) -> bool:
    if not (
        zakres.wywolania
        or zakres.slowa_kluczowe
        or zakres.funkcje
        or zakres.klucze_slownika
        or zakres.listy
    ):
        return True
    for przodek, dziecko in _przodkowie(wezel, rodzice):
        if zakres.klucze_slownika and isinstance(przodek, ast.Dict):
            if any(
                wartosc is dziecko
                and isinstance(klucz, ast.Constant)
                and klucz.value in zakres.klucze_slownika
                for klucz, wartosc in zip(przodek.keys, przodek.values, strict=True)
            ):
                return True
        if (
            zakres.klucze_slownika
            and isinstance(przodek, ast.Assign)
            and przodek.value is dziecko
            and any(
                isinstance(cel, ast.Subscript)
                and isinstance(cel.slice, ast.Constant)
                and cel.slice.value in zakres.klucze_slownika
                for cel in przodek.targets
            )
        ):
            return True
        if (
            zakres.listy
            and isinstance(przodek, ast.Call)
            and isinstance(przodek.func, ast.Attribute)
            and przodek.func.attr in _DOKLADAJACE_DO_LISTY
            and isinstance(przodek.func.value, ast.Name)
            and przodek.func.value.id in zakres.listy
        ):
            return True
        if (
            zakres.wywolania
            and isinstance(przodek, ast.Call)
            and _nazwa_wywolania(przodek) in zakres.wywolania
        ):
            return True
        if (
            zakres.wywolania
            and isinstance(przodek, ast.Call)
            and _wywolanie_konstruktora_bazy(przodek)
            and _klasa_otaczajaca(przodek, rodzice) in zakres.wywolania
        ):
            # ``super().__init__(f"…")`` w konstruktorze wyjątku z kanału: tekst przekazany
            # klasie bazowej JEST treścią wyjątku (``str(wyjątek)``) — ten sam kanał co
            # argument wywołania klasy.
            return True
        if (
            zakres.slowa_kluczowe
            and isinstance(przodek, ast.keyword)
            and przodek.arg in zakres.slowa_kluczowe
        ):
            return True
        if (
            zakres.funkcje
            and isinstance(przodek, ast.FunctionDef)
            and przodek.name in zakres.funkcje
        ):
            return True
    return False


def _wywolanie_konstruktora_bazy(wywolanie: ast.Call) -> bool:
    """``super().__init__(…)`` albo ``Baza.__init__(self, …)``."""
    funkcja = wywolanie.func
    if not (isinstance(funkcja, ast.Attribute) and funkcja.attr == "__init__"):
        return False
    cel = funkcja.value
    return (
        isinstance(cel, ast.Call) and isinstance(cel.func, ast.Name) and cel.func.id == "super"
    ) or isinstance(cel, ast.Name)


def _klasa_otaczajaca(wezel: ast.AST, rodzice: dict[int, ast.AST]) -> str | None:
    """Nazwa klasy, w której metodzie stoi ``wezel`` (``None`` poza klasą)."""
    przodek = rodzice.get(id(wezel))
    while przodek is not None and not isinstance(przodek, ast.ClassDef):
        przodek = rodzice.get(id(przodek))
    return przodek.name if isinstance(przodek, ast.ClassDef) else None


#: Głębokość śledzenia tekstu do kanału przez zmienną lokalną, parametr funkcji i wynik
#: funkcji modułu (``komunikat = f"…"; raise X(komunikat)``, ``_odmowa(tekst=f"…")``,
#: ``return f"…"`` w funkcji, której wynik idzie do kanału). Trzy przejścia obejmują
#: łańcuch „zmienna → parametr pomocnika → kanał” z zapasem jednego kroku.
GLEBOKOSC_PRZEPLYWU = 3
#: Metody dokładające element do listy lokalnej, przez którą tekst płynie dalej do kanału.
_DOKLADAJACE_DO_LISTY_PRZEPLYWU: frozenset[str] = frozenset({"append", "insert", "add"})


def _nazwa_funkcji_wywolania(wywolanie: ast.Call) -> str | None:
    funkcja = wywolanie.func
    if isinstance(funkcja, ast.Attribute):
        return funkcja.attr
    return funkcja.id if isinstance(funkcja, ast.Name) else None


class _PrzeplywModulu:
    """Indeks modułu dla śledzenia tekstu do kanału: definicje funkcji po nazwie,
    wywołania po nazwie, odczyty nazw w funkcji. Budowany raz na drzewo modułu."""

    def __init__(self, drzewo: ast.AST, rodzice: dict[int, ast.AST], zakres: ZakresModulu):
        self.rodzice = rodzice
        self.zakres = zakres
        self.funkcje: dict[str, list[ast.FunctionDef | ast.AsyncFunctionDef]] = {}
        self.wywolania: dict[str, list[ast.Call]] = {}
        self._odczyty: dict[int, dict[str, list[ast.Name]]] = {}
        self._wynik: dict[tuple[int, int], bool] = {}
        for wezel in ast.walk(drzewo):
            if isinstance(wezel, ast.FunctionDef | ast.AsyncFunctionDef):
                self.funkcje.setdefault(wezel.name, []).append(wezel)
            elif isinstance(wezel, ast.Call):
                nazwa = _nazwa_funkcji_wywolania(wezel)
                if nazwa is not None:
                    self.wywolania.setdefault(nazwa, []).append(wezel)

    def odczyty(self, funkcja: ast.AST, nazwa: str) -> list[ast.Name]:
        indeks = self._odczyty.get(id(funkcja))
        if indeks is None:
            indeks = {}
            for wezel in ast.walk(funkcja):
                if isinstance(wezel, ast.Name) and isinstance(wezel.ctx, ast.Load):
                    indeks.setdefault(wezel.id, []).append(wezel)
            self._odczyty[id(funkcja)] = indeks
        return indeks.get(nazwa, [])

    def funkcja_zawierajaca(self, wezel: ast.AST) -> ast.AST | None:
        for przodek, _dziecko in _przodkowie(wezel, self.rodzice):
            if isinstance(przodek, ast.FunctionDef | ast.AsyncFunctionDef | ast.Lambda):
                return przodek
            if isinstance(przodek, ast.ClassDef):
                return None
        return None

    def parametry_wywolania(
        self, wywolanie: ast.Call, argument: ast.AST
    ) -> list[tuple[ast.AST, str]]:
        """(funkcja modułu, nazwa parametru), do których trafia ``argument`` wywołania."""
        nazwa = _nazwa_funkcji_wywolania(wywolanie)
        wynik: list[tuple[ast.AST, str]] = []
        for definicja in self.funkcje.get(nazwa or "", []):
            if isinstance(argument, ast.keyword):
                if argument.arg is not None:
                    wynik.append((definicja, argument.arg))
                continue
            if argument not in wywolanie.args:
                continue
            pozycyjne = [a.arg for a in (*definicja.args.posonlyargs, *definicja.args.args)]
            if (
                pozycyjne
                and pozycyjne[0] in {"self", "cls"}
                and isinstance(wywolanie.func, ast.Attribute)
            ):
                pozycyjne = pozycyjne[1:]
            indeks = wywolanie.args.index(argument)  # type: ignore[arg-type]
            if indeks < len(pozycyjne):
                wynik.append((definicja, pozycyjne[indeks]))
        return wynik

    def w_zakresie(self, wezel: ast.AST, glebokosc: int = 0) -> bool:
        klucz = (id(wezel), glebokosc)
        if klucz not in self._wynik:
            self._wynik[klucz] = False  # cykl (rekurencja funkcji) nie jest kanałem
            self._wynik[klucz] = self._oblicz(wezel, glebokosc)
        return self._wynik[klucz]

    def _oblicz(self, wezel: ast.AST, glebokosc: int) -> bool:
        if _w_kanale_wprost(wezel, self.rodzice, self.zakres):
            return True
        if glebokosc >= GLEBOKOSC_PRZEPLYWU:
            return False
        nastepne: list[ast.AST] = []
        for przodek, dziecko in _przodkowie(wezel, self.rodzice):
            if isinstance(przodek, ast.Assign | ast.AnnAssign | ast.AugAssign):
                if przodek.value is dziecko:
                    cele = przodek.targets if isinstance(przodek, ast.Assign) else [przodek.target]
                    funkcja = self.funkcja_zawierajaca(przodek)
                    if funkcja is not None:
                        for cel in cele:
                            if isinstance(cel, ast.Name):
                                nastepne.extend(self.odczyty(funkcja, cel.id))
                break
            if (
                isinstance(przodek, ast.Call)
                and dziecko in przodek.args
                and isinstance(przodek.func, ast.Attribute)
                and przodek.func.attr in _DOKLADAJACE_DO_LISTY_PRZEPLYWU
                and isinstance(przodek.func.value, ast.Name)
            ):
                # Element dokładany do listy lokalnej: lista idzie dalej (``missing.append(
                # f"…")`` → ``missing_fields_pl=missing``) — odczyty listy w tej funkcji.
                funkcja = self.funkcja_zawierajaca(przodek)
                if funkcja is not None:
                    nastepne.extend(self.odczyty(funkcja, przodek.func.value.id))
                break
            if isinstance(przodek, ast.Call) and (
                dziecko in przodek.args or dziecko in przodek.keywords
            ):
                for definicja, parametr in self.parametry_wywolania(przodek, dziecko):
                    nastepne.extend(self.odczyty(definicja, parametr))
                if nastepne:
                    break
            if isinstance(przodek, ast.Return):
                funkcja = self.funkcja_zawierajaca(przodek)
                if isinstance(funkcja, ast.FunctionDef | ast.AsyncFunctionDef):
                    nastepne.extend(self.wywolania.get(funkcja.name, []))
                break
            if isinstance(przodek, ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef):
                break
        return any(self.w_zakresie(dalej, glebokosc + 1) for dalej in nastepne)


def _w_zakresie(wezel: ast.AST, przeplyw: _PrzeplywModulu) -> bool:
    """Tekst w kanale komunikatu: wprost (argument wywołania kanału, wartość klucza,
    element listy komunikatów, ciało funkcji-kanału) albo przez zmienną lokalną, parametr
    funkcji modułu lub wynik funkcji modułu, które trafiają do kanału (``GLEBOKOSC_PRZEPLYWU``)."""
    return przeplyw.w_zakresie(wezel)


def _interpolacja_identyfikatora(wyrazenie: ast.expr) -> str | None:
    """Źródło wyrażenia, gdy f-string wstawia identyfikator wprost (bez nazywania)."""
    if isinstance(wyrazenie, ast.Call):
        nazwa = _nazwa_wywolania(wyrazenie)
        if nazwa in {"str", "repr"} and wyrazenie.args:
            return _interpolacja_identyfikatora(wyrazenie.args[0])
        return None
    if isinstance(wyrazenie, ast.Subscript):
        return (
            _interpolacja_identyfikatora(wyrazenie.value)
            if isinstance(wyrazenie.slice, ast.Slice)
            else None
        )
    zrodlo = ast.unparse(wyrazenie)
    if zrodlo in _INTERPOLACJE_DOZWOLONE:
        return None
    if isinstance(wyrazenie, ast.Name | ast.Attribute) and _ID_W_WYRAZENIU.search(zrodlo):
        return zrodlo
    return None


def _funkcja_nazywajaca(nazwa: str) -> bool:
    """Funkcja zwracająca tekst dla projektanta: jawna lista albo konwencja nazw modułów
    komunikatów (``nazwa_…``, ``opis_…``, ``etykieta_…``, sufiks ``_pl``)."""
    return (
        nazwa in _FUNKCJE_NAZYWAJACE
        or nazwa.endswith("_pl")
        or re.match(r"^_?(?:nazwa|opis|etykieta)_", nazwa) is not None
    )


def _element_nazwany(element: ast.expr) -> bool:
    """Element sklejanej kolekcji jest tekstem dla projektanta (nie kodem ani kluczem)."""
    if isinstance(element, ast.JoinedStr | ast.Constant):
        return True  # f-string elementu skanują reguły tokenów i identyfikatorów
    if isinstance(element, ast.IfExp):
        return _element_nazwany(element.body) and _element_nazwany(element.orelse)
    if isinstance(element, ast.BoolOp):
        return all(_element_nazwany(wartosc) for wartosc in element.values)
    if isinstance(element, ast.Attribute | ast.Name):
        return bool(_ATRYBUT_TEKSTOWY.search(ast.unparse(element)))
    if isinstance(element, ast.Subscript):
        mapa = element.value
        return isinstance(mapa, ast.Name) and _MAPA_PL.match(mapa.id) is not None
    if isinstance(element, ast.Call):
        nazwa = _nazwa_wywolania(element)
        if nazwa == "str" and element.args:
            return _element_nazwany(element.args[0])
        if nazwa == "getattr" and len(element.args) >= 2:
            atrybut = element.args[1]
            return isinstance(atrybut, ast.Constant) and bool(
                _ATRYBUT_TEKSTOWY.search(str(atrybut.value))
            )
        return _funkcja_nazywajaca(nazwa)
    return False


def _rdzen_kolekcji(kolekcja: ast.expr) -> ast.expr:
    """Kolekcja bez opakowań porządkujących (``sorted``, ``list``, wycinek, cudzysłów)."""
    rdzen = kolekcja
    while True:
        if (
            isinstance(rdzen, ast.Call)
            and _nazwa_wywolania(rdzen)
            in {"sorted", "list", "tuple", "set", "fromkeys", "w_cudzyslowie"}
            and rdzen.args
        ):
            rdzen = rdzen.args[0]
        elif isinstance(rdzen, ast.Subscript) and isinstance(rdzen.slice, ast.Slice):
            rdzen = rdzen.value
        else:
            return rdzen


def _sklejenie_bez_nazywania(wywolanie: ast.Call, sciezka: str) -> str | None:
    """Źródło kolekcji, gdy ``separator.join``/``lista_pl`` wkleja w zdanie elementy
    nienazwane (klucze, kody rodzajów, dane maszynowe); ``None`` = sklejenie czyste."""
    if not wywolanie.args:
        return None
    kolekcja = wywolanie.args[0]
    rdzen = _rdzen_kolekcji(kolekcja)
    if isinstance(rdzen, ast.GeneratorExp | ast.ListComp | ast.SetComp):
        return None if _element_nazwany(rdzen.elt) else ast.unparse(kolekcja)
    if isinstance(rdzen, ast.Call) and _nazwa_wywolania(rdzen) == "map" and rdzen.args:
        funkcja = rdzen.args[0]
        nazwana = isinstance(funkcja, ast.Name) and _funkcja_nazywajaca(funkcja.id)
        return None if nazwana else ast.unparse(kolekcja)
    if (
        isinstance(rdzen, ast.Call)
        and isinstance(rdzen.func, ast.Attribute)
        and rdzen.func.attr == "values"
        and isinstance(rdzen.func.value, ast.Name)
        and _MAPA_PL.match(rdzen.func.value.id)
    ):
        return None  # wartości mapy etykiet po polsku
    if f"{sciezka}:{ast.unparse(rdzen)}" in _KOLEKCJE_TEKSTOW:
        return None
    return ast.unparse(kolekcja)


def _czy_sklejajace(wezel: ast.Call) -> bool:
    funkcja = wezel.func
    if (
        isinstance(funkcja, ast.Attribute)
        and funkcja.attr == "join"
        and isinstance(funkcja.value, ast.Constant)
        and isinstance(funkcja.value.value, str)
    ):
        return True
    return _nazwa_wywolania(wezel) in _SKLEJAJACE


def _korzen_tekstu(wezel: ast.AST, rodzice: dict[int, ast.AST]) -> ast.AST:
    """Całe wyrażenie tekstu: łańcuch ``+`` (i warunek ``a if c else b``) wokół literału."""
    korzen = wezel
    rodzic = rodzice.get(id(korzen))
    while isinstance(rodzic, ast.BinOp | ast.IfExp) and (
        not isinstance(rodzic, ast.BinOp) or isinstance(rodzic.op, ast.Add)
    ):
        korzen = rodzic
        rodzic = rodzice.get(id(korzen))
    return korzen


@dataclass(frozen=True)
class TekstKomunikatu:
    """Tekst przekazywany kanałem komunikatu: węzeł literału albo f-stringu, jego treść
    (wstawki jako `` ⟨⟩ ``) i wyrażenia wstawek — JEDNA definicja „tekstu dla projektanta”
    dla wszystkich reguł (kody, identyfikatory, sklejenia, nazwy klas)."""

    wezel: ast.Constant | ast.JoinedStr
    tekst: str
    wstawki: tuple[ast.expr, ...]


def teksty_komunikatow(
    zakres: ZakresModulu, drzewo: ast.Module
) -> Iterator[tuple[TekstKomunikatu, dict[int, ast.AST]]]:
    """Teksty dla projektanta w module (zdanie: fragment ze spacją i słowem po polsku,
    w zakresie kanału, poza docstringiem, asercją i dziennikiem)."""
    docstringi = _docstringi(drzewo)
    rodzice = _rodzice(drzewo)
    przeplyw = _PrzeplywModulu(drzewo, rodzice, zakres)
    w_fstringach = {
        id(czesc)
        for wezel in ast.walk(drzewo)
        if isinstance(wezel, ast.JoinedStr)
        for czesc in wezel.values
    }
    for wezel in ast.walk(drzewo):
        if id(wezel) in docstringi or id(wezel) in w_fstringach:
            continue
        if isinstance(wezel, ast.Constant) and isinstance(wezel.value, str):
            tekst = wezel.value
            wstawki: tuple[ast.expr, ...] = ()
        elif isinstance(wezel, ast.JoinedStr):
            tekst = "".join(
                czesc.value if isinstance(czesc, ast.Constant) else " ⟨⟩ " for czesc in wezel.values
            )
            wstawki = tuple(
                czesc.value for czesc in wezel.values if isinstance(czesc, ast.FormattedValue)
            )
        else:
            continue
        stale = tekst.replace(" ⟨⟩ ", "\x00")
        if not (any(" " in fragment.strip() for fragment in stale.split("\x00"))):
            continue
        if not _LUDZKI.search(stale):
            continue
        if not _w_zakresie(wezel, przeplyw) or _poza_komunikatem(wezel, rodzice):
            continue
        yield TekstKomunikatu(wezel, tekst, wstawki), rodzice


def naruszenia_modulu(zakres: ZakresModulu, plik: Path | None = None) -> list[Naruszenie]:
    plik = plik or SRC / zakres.sciezka
    drzewo = ast.parse(plik.read_text(encoding="utf-8"))
    wynik: list[Naruszenie] = []
    sprawdzone_sklejenia: set[int] = set()
    for komunikat, rodzice in teksty_komunikatow(zakres, drzewo):
        wezel, tekst, wstawki = komunikat.wezel, komunikat.tekst, komunikat.wstawki
        for token in kody_w_tekscie(tekst):
            wynik.append(Naruszenie(zakres.sciezka, wezel.lineno, f"kod {token}", tekst))
        for wstawka in wstawki:
            zrodlo = _interpolacja_identyfikatora(wstawka)
            if zrodlo is not None:
                wynik.append(
                    Naruszenie(zakres.sciezka, wezel.lineno, f"identyfikator {zrodlo}", tekst)
                )
        for wywolanie in ast.walk(_korzen_tekstu(wezel, rodzice)):
            if not isinstance(wywolanie, ast.Call) or not _czy_sklejajace(wywolanie):
                continue
            if id(wywolanie) in sprawdzone_sklejenia:
                continue
            sprawdzone_sklejenia.add(id(wywolanie))
            zrodlo = _sklejenie_bez_nazywania(wywolanie, zakres.sciezka)
            if zrodlo is not None:
                wynik.append(Naruszenie(zakres.sciezka, wezel.lineno, f"sklejenie {zrodlo}", tekst))
    return wynik


@pytest.mark.parametrize("zakres", MODULY_KOMUNIKATOW, ids=lambda z: z.sciezka)
def test_komunikaty_modulu_bez_kodow_i_identyfikatorow(zakres: ZakresModulu) -> None:
    naruszenia = naruszenia_modulu(zakres)
    assert not naruszenia, "\n".join(str(n) for n in naruszenia)


def test_kazdy_wpis_kolekcji_tekstow_jest_uzywany() -> None:
    """Lista kolekcji tekstów jest zapadką: wpis bez sklejenia w module to furtka, przez
    którą przyszła kolekcja kodów o tej nazwie przeszłaby bez sprawdzenia."""
    uzyte: set[str] = set()
    for zakres in MODULY_KOMUNIKATOW:
        drzewo = ast.parse((SRC / zakres.sciezka).read_text(encoding="utf-8"))
        for wezel in ast.walk(drzewo):
            if isinstance(wezel, ast.Call) and _czy_sklejajace(wezel) and wezel.args:
                uzyte.add(f"{zakres.sciezka}:{ast.unparse(_rdzen_kolekcji(wezel.args[0]))}")
    assert set(_KOLEKCJE_TEKSTOW) <= uzyte, sorted(set(_KOLEKCJE_TEKSTOW) - uzyte)


def test_inwentarz_obejmuje_kazdy_modul_wolajacy_error_response() -> None:
    """Każdy moduł ``src/**``, który buduje odpowiedź błędu operacji (``_error_response``)
    albo ``OpIssue``/``ValidationIssue`` dla projektanta, jest w inwentarzu strażnika —
    nowy emiter komunikatów nie może powstać poza nim."""
    w_inwentarzu = {zakres.sciezka for zakres in MODULY_KOMUNIKATOW}
    emitery = set()
    for plik in SRC.rglob("*.py"):
        tresc = plik.read_text(encoding="utf-8")
        if re.search(r"\b_error_response\(|\bOpIssue\(|\b_werdykt_niezgodnosci\(", tresc):
            emitery.add(plik.relative_to(SRC).as_posix())
    assert emitery <= w_inwentarzu, sorted(emitery - w_inwentarzu)


def test_strazenik_wykrywa_wstrzykniety_kod_i_identyfikator(tmp_path: Path) -> None:
    """Strażnik czerwienieje na każdym rodzaju naruszenia (iniekcja w kopii modułu)."""
    wzor = SRC / "enm" / "topology_ops.py"
    kopia = tmp_path / "topology_ops_z_iniekcja.py"
    kopia.write_text(
        wzor.read_text(encoding="utf-8")
        + "\n\ndef _iniekcja(enm, ref_id, klucze, rodzaje):\n"
        + "    a = 'Uzupełnij pole apparatus_catalog_ref w formularzu.'\n"
        + '    b = f"Pole rodzaju LINIA_IN nie ma aparatu {ref_id}."\n'
        + "    c = 'Rola pola IN nie pasuje do katalogu.'\n"
        + "    d = 'Ustaw `parameter_source` w modelu.'\n"
        + "    e = 'Brak pozycji w katalogu: ' + ', '.join(sorted(klucze)) + '.'\n"
        + '    f = f"Aparaty bez symbolu: {lista_pl(k for k in rodzaje)}."\n'
        + "    return a, b, c, d, e, f\n",
        encoding="utf-8",
    )
    naruszenia = naruszenia_modulu(ZakresModulu("enm/topology_ops.py"), kopia)
    powody = {n.powod for n in naruszenia}
    assert {
        "kod apparatus_catalog_ref",
        "kod LINIA_IN",
        "kod IN",
        "kod `parameter_source`",
        "identyfikator ref_id",
        "sklejenie sorted(klucze)",
        "sklejenie (k for k in rodzaje)",
    } <= powody, powody
    # Kopia bez iniekcji jest czysta — naruszenia pochodzą wyłącznie z iniekcji.
    assert all(n.linia > len(wzor.read_text(encoding="utf-8").splitlines()) for n in naruszenia)


# ---------------------------------------------------------------------------
# 2. Jedna mapa pól — kompletność wywołań i parytet ze słowami frontu
# ---------------------------------------------------------------------------


def _wywolania_pola() -> Iterator[tuple[str, int, str, str | None]]:
    """Każde wywołanie ``pole``/``nazwa_pola`` z literałem klucza w modułach inwentarza."""
    for zakres in MODULY_KOMUNIKATOW:
        plik = SRC / zakres.sciezka
        drzewo = ast.parse(plik.read_text(encoding="utf-8"))
        for wezel in ast.walk(drzewo):
            if not (
                isinstance(wezel, ast.Call)
                and _nazwa_wywolania(wezel) in {"pole", "nazwa_pola"}
                and wezel.args
                and isinstance(wezel.args[0], ast.Constant)
                and isinstance(wezel.args[0].value, str)
            ):
                continue
            operacja = None
            if len(wezel.args) > 1:
                if not (
                    isinstance(wezel.args[1], ast.Constant) and isinstance(wezel.args[1].value, str)
                ):
                    continue  # operacja dynamiczna — sprawdzana niżej jawnym zbiorem
                operacja = wezel.args[1].value
            yield zakres.sciezka, wezel.lineno, wezel.args[0].value, operacja


def test_kazde_wywolanie_pola_ma_wpis_w_mapie() -> None:
    braki = []
    for plik, linia, klucz, operacja in _wywolania_pola():
        try:
            slownik.nazwa_pola(klucz, operacja)
        except KeyError:
            braki.append(f"{plik}:{linia}: {klucz} ({operacja})")
    assert not braki, braki


@pytest.mark.parametrize(
    ("klucze", "operacja"),
    [
        (_TRANSFORMER_REQUIRED_FIELDS, None),
        (("sk3_min_mva", "ik3_min_ka", "rx_ratio_min"), None),
        (
            tuple(
                f"gpz_section.{k}"
                for k in (
                    "bus_ref",
                    "name",
                    "order",
                    "left_coupler_ref",
                    "right_coupler_ref",
                    "line_field_name",
                    "section_id",
                )
            ),
            None,
        ),
        (tuple(k for k, _ in _KATALOGI_WIAZAN_DER), None),
        (("dynamic_model_ref", "bess_operation_mode_refs", KLUCZ_KART_WIDMOWYCH), None),
        (POLA_NC_RFG_GENERATORA, None),
        (POLA_DEKLARACJI, "deklaracje_modulu"),
        (POLA_NASTAW, "nastawy_zabezpieczen"),
        (("zrodlo_pl",), "deklaracje_modulu"),
        (("zrodlo_pl",), "nastawy_zabezpieczen"),
        ((*KLUCZE_ZIP_ODBIORU, *KLUCZE_ODNIESIENIA_ZIP), None),
        (("u_set_pu", "q_min_mvar", "q_max_mvar", "control_mode", "lv_earthing_system"), None),
        (("grounding.r_ohm", "grounding.x_ohm"), None),
    ],
)
def test_klucze_dynamiczne_maja_wpis_w_mapie(klucze: tuple[str, ...], operacja: str | None) -> None:
    """Klucze budowane w czasie wykonania (listy pól, pętle) — ten sam wymóg co literały."""
    for klucz in klucze:
        nazwa = slownik.nazwa_pola(klucz, operacja)
        assert nazwa and not kody_w_tekscie(nazwa), (klucz, nazwa)


def test_mapa_pol_bez_kodow_w_nazwach() -> None:
    for klucz, nazwa in slownik.NAZWY_POL_KONTRAKTU_PL.items():
        assert nazwa.strip() == nazwa and nazwa, klucz
        assert not kody_w_tekscie(nazwa), (klucz, nazwa)


_WPIS_ZRODLA = re.compile(
    r'^\s*"(?P<klucz>[^"]+)": "(?P<nazwa>[^"]+)",\s*#\s*(?P<plik>[\w/.-]+\.tsx?)\s+(?P<tsklucz>\w+)'
)


def _front_plik(sciezka: str) -> Path | None:
    for kandydat in (FRONT / "ui2" / "kreatory" / sciezka, FRONT / sciezka):
        if kandydat.is_file():
            return kandydat
    return None


def _wartosc_frontu(tresc: str, tsklucz: str, klucz_kontraktu: str) -> str | tuple[str, ...] | None:
    """Etykieta frontu: ``tsklucz: '…'``, ``tsklucz: warunek ? '…' : '…'`` (etykieta zależna
    od rodzaju — obie warianty), definicja pola ``{ key: 'tsklucz', label: '…' }`` (także
    ``{ klucz: 'tsklucz', etykieta: '…' }``) albo wpis
    ``klucz_kontraktu: '…'`` w stałej ``tsklucz`` (etykiety kluczowane polem kontraktu)."""
    prosty = re.search(rf"\b{re.escape(tsklucz)}: '([^']*)'", tresc)
    if prosty:
        return prosty.group(1)
    warunkowy = re.search(rf"\b{re.escape(tsklucz)}: [^?\n]+\? '([^']*)' : '([^']*)'", tresc)
    if warunkowy:
        return (warunkowy.group(1), warunkowy.group(2))
    definicja = re.search(rf"key: '{re.escape(tsklucz)}', label: '([^']*)'", tresc)
    if definicja:
        return definicja.group(1)
    # Definicja pola formularza parametrów analizy (``{ klucz: 'x', etykieta: '…' }``,
    # ``ui2/wyniki/akademickie/parametry.ts``) — także rozpisana na kilka wierszy.
    definicja_pl = re.search(rf"klucz: '{re.escape(tsklucz)}',\s*etykieta: '([^']*)'", tresc)
    if definicja_pl:
        return definicja_pl.group(1)
    blok = re.search(rf"\b{re.escape(tsklucz)}\b[^=]*=\s*\{{(.*?)\n\}}", tresc, re.S)
    if blok:
        wpis = re.search(rf"\b{re.escape(klucz_kontraktu)}: '([^']*)'", blok.group(1))
        if wpis:
            return wpis.group(1)
    return None


def test_nazwy_pol_sa_slowami_frontu() -> None:
    """Każdy wpis mapy ze wskazanym źródłem etykiety frontu (``plik.ts klucz``) ma DOKŁADNIE
    słowa tej etykiety — projektant widzi w komunikacie to, co w formularzu."""
    zrodlo = (SRC / "enm" / "slownik_komunikatow.py").read_text(encoding="utf-8")
    sprawdzone = 0
    rozjazdy = []
    for linia in zrodlo.splitlines():
        dopasowanie = _WPIS_ZRODLA.match(linia)
        if not dopasowanie:
            continue
        plik = _front_plik(dopasowanie["plik"])
        if plik is None:
            rozjazdy.append(f"brak pliku frontu {dopasowanie['plik']} ({dopasowanie['klucz']})")
            continue
        klucz_kontraktu = dopasowanie["klucz"].rsplit(":", 1)[-1].rsplit(".", 1)[-1]
        front = _wartosc_frontu(
            plik.read_text(encoding="utf-8"), dopasowanie["tsklucz"], klucz_kontraktu
        )
        sprawdzone += 1
        zgodna = (
            dopasowanie["nazwa"] in front
            if isinstance(front, tuple)
            else front == dopasowanie["nazwa"]
        )
        if not zgodna:
            rozjazdy.append(
                f"{dopasowanie['klucz']}: backend {dopasowanie['nazwa']!r}, front {front!r}"
            )
    assert not rozjazdy, rozjazdy
    assert sprawdzone >= 100, sprawdzone


def _stala_ts(plik: Path, nazwa: str) -> dict[str, str]:
    tresc = plik.read_text(encoding="utf-8")
    blok = re.search(rf"\b{re.escape(nazwa)}\b[^=]*=\s*\{{(.*?)\n\}}", tresc, re.S)
    assert blok, (plik, nazwa)
    return dict(re.findall(r"^\s*'?([\w-]+)'?: '([^']*)',", blok.group(1), re.M))


def _male_pierwsze(tekst: str) -> str:
    return tekst[:1].lower() + tekst[1:]


@pytest.mark.parametrize(
    ("mapa", "plik", "stala", "przeksztalcenie"),
    [
        (
            NAZWY_KATEGORII_KATALOGU_PL,
            "ui/catalog/elementCatalogRegistry.ts",
            "NAMESPACE_LABEL_PL",
            None,
        ),
        # `slownik.NAZWY_RODZAJOW_GENERATORA_PL` był tu porównywany z `GEN_TYPE_LABELS`
        # z `ui/topology/modals/LoadDERModal.tsx` — modalu bez montażu, skasowanego
        # 2026-10-22 jako martwy kod (karta PODSTAWA-Q, commit 3). Parytet przypięty do
        # martwego pliku nie dowodził, że użytkownik widzi te słowa. Żywy front nazywa
        # rodzaje generatora pięcioma różnymi mapami (`ui/shared/generatorTypeLabels.ts`,
        # `ui/network-build/InspectorEngineeringView.tsx`, `ui/shell/context-panels/
        # OzContextPanel.tsx`, `ui/sld/shared/detailDrawerData.ts`, `ui2/wyniki/wzorzec/
        # useNazwaObiektu.ts`), żadna nie jest równa słownikowi backendu — rozbieżność
        # terminologii zgłoszona w meldunku karty do rozstrzygnięcia słownika kanonicznego.
        (
            slownik.NAZWY_STATUSOW_WERYFIKACJI_PL,
            "ui2/spaces/model/katalog/strings.ts",
            "ETYKIETY_WERYFIKACJI",
            None,
        ),
        (
            slownik.NAZWY_STATUSOW_KATALOGU_PL,
            "ui2/spaces/model/katalog/strings.ts",
            "ETYKIETY_STATUSU_KATALOGU",
            None,
        ),
        (
            slownik.NAZWY_RODZAJOW_ZABEZPIECZENIA_PL,
            "ui/shared/etykietyZabezpieczen.ts",
            "ETYKIETA_RODZAJU_ZABEZPIECZENIA",
            _male_pierwsze,
        ),
        (
            POWODY_BLOKADY_RODZINY_PL,
            "ui/catalog/SwitchgearFamilyPicker.tsx",
            "POWOD_BLOKADY_PL",
            lambda t: _male_pierwsze(t).rstrip("."),
        ),
    ],
)
def test_mapy_wartosci_sa_slowami_frontu(
    mapa: dict[str, str], plik: str, stala: str, przeksztalcenie: Any
) -> None:
    front = _stala_ts(FRONT / plik, stala)
    wspolne = set(mapa) & set(front)
    assert wspolne, (plik, stala)
    for klucz in sorted(wspolne):
        oczekiwana = przeksztalcenie(front[klucz]) if przeksztalcenie else front[klucz]
        assert mapa[klucz] == oczekiwana, (klucz, mapa[klucz], oczekiwana)


def test_mapy_opcji_kreatorow_sa_slowami_frontu() -> None:
    """Opcje kreatorów (``{ value, label }`` / ``{ id, etykieta: T.x }``) — ten sam wymóg."""
    model_oze = (FRONT / "ui2/kreatory/zrodlo-oze/zrodloOzeModel.ts").read_text(encoding="utf-8")
    opcje = dict(re.findall(r"\{ value: '(\w+)', label: '([^']*)' \}", model_oze))
    for kod in ("PV", "BESS", "FW"):
        assert slownik.NAZWY_TECHNOLOGII_ZRODLA_PL[kod] == opcje[kod]
    for kod, nazwa in slownik.NAZWY_WARIANTOW_PRZYLACZENIA_ZRODLA_PL.items():
        assert nazwa == opcje[kod]
    aparat_nn = (FRONT / "ui2/kreatory/aparat-nn/strings.ts").read_text(encoding="utf-8")
    assert f"rodzajSwitch: '{slownik.NAZWY_KLAS_APARATU_NN_PL['switch']}'" in aparat_nn
    assert f"rodzajFuse: '{slownik.NAZWY_KLAS_APARATU_NN_PL['fuse']}'" in aparat_nn
    stacja = (FRONT / "ui2/kreatory/stacja/strings.ts").read_text(encoding="utf-8")
    assert f"torModularnyTytul: '{NAZWY_TOROW_KONFIGURACJI_PL['MODULARNY']}'" in stacja
    assert f"torBlokTytul: '{NAZWY_TOROW_KONFIGURACJI_PL['BLOK_RMU']}'" in stacja


def test_opis_rodzajow_pola_katalogowego_zgodny_z_frontem() -> None:
    """Nazwy rodzajów pól katalogu po obu stronach z JEDNEJ tablicy opisu (rola kanonu +
    określenie albo nazwa rodzaju bez roli): backend `OPIS_RODZAJU_POLA_KATALOGOWEGO` ≡ front
    `OPIS_RODZAJU_POLA` (`ui/catalog/BayTemplatePicker.tsx`, karta #141). Stała frontu z
    gotowymi napisami zniknęła — termin roli bierze się z kanonu, więc parytet dotyczy opisu."""
    tekst = (FRONT / "ui/catalog/BayTemplatePicker.tsx").read_text(encoding="utf-8")
    blok = tekst[tekst.index("const OPIS_RODZAJU_POLA") :]
    blok = blok[: blok.index("};")]
    front: dict[str, tuple[str, str] | str] = {}
    for wiersz in re.finditer(r"^\s*(\w+): \{ (.*?) \},?$", blok, re.MULTILINE):
        rodzaj, cialo = wiersz.group(1), wiersz.group(2)
        bez_roli = re.fullmatch(r"nazwaBezRoli: '([^']*)'", cialo)
        if bez_roli:
            front[rodzaj] = bez_roli.group(1)
            continue
        z_rola = re.fullmatch(r"rola: '(\w+)'(?:, okreslenie: '([^']*)')?", cialo)
        assert z_rola, f"nierozpoznany opis rodzaju {rodzaj}: {cialo}"
        front[rodzaj] = (z_rola.group(1), z_rola.group(2) or "")
    assert front == OPIS_RODZAJU_POLA_KATALOGOWEGO


def test_mapy_wartosci_kompletne_wobec_kontraktow() -> None:
    """Każda wartość kontraktu ma nazwę — kod spoza mapy nie może wypaść do treści."""
    assert set(get_args(BayKind)) == set(NAZWY_RODZAJOW_POLA_KATALOGOWEGO_PL)
    assert set(get_args(ApparatusKind)) == set(NAZWY_RODZAJOW_APARATU_PL)
    assert set(get_args(TorKonfiguracji)) == set(NAZWY_TOROW_KONFIGURACJI_PL)
    # `mv_branch_points` — przestrzeń rekordów katalogu punktów rozgałęzienia SN
    # (`mv_branch_point_catalog.py`), spoza enumu, ale nazwana w przeglądarce katalogu.
    assert {n.value for n in CatalogNamespace} | {"mv_branch_points"} == set(
        NAZWY_KATEGORII_KATALOGU_PL
    )
    rodzaje = get_args(get_args(Generator.model_fields["gen_type"].annotation)[0])
    assert set(rodzaje) == set(slownik.NAZWY_RODZAJOW_GENERATORA_PL)


def test_komunikaty_statyczne_uzywaja_nazw_z_mapy() -> None:
    """Treści, które nie mogą wołać słownika (warstwa niżej w grafie importów), cytują
    nazwy pól DOKŁADNIE z mapy — jedna prawda słów, przypięta testem."""
    from domain.canonical_operations import READINESS_CODES
    from enm.uziemienie import blad_konfiguracji_uziemienia

    tresc = READINESS_CODES["generator.voltage_setpoint_missing"].message_pl
    for klucz in ("u_set_pu", "q_min_mvar", "q_max_mvar"):
        assert slownik.pole(klucz) in tresc, klucz
    assert slownik.pole("grounding.r_ohm") in str(
        blad_konfiguracji_uziemienia("resistor_grounded", None, None)
    )
    assert slownik.pole("grounding.x_ohm") in str(
        blad_konfiguracji_uziemienia("petersen_coil", None, None)
    )


# ---------------------------------------------------------------------------
# 3. Iloczyn cech w wykonaniu: operacja × rodzaj błędu × miejsce komunikatu
# ---------------------------------------------------------------------------


_HEX = "0f3a9c2e7b1d4f6a8c0e2b4d6f8a1c3e"


@pytest.mark.parametrize(
    ("ref_id", "nazwa", "oczekiwany"),
    [
        ("stn-c", "Stacja C", "Stacja „Stacja C”"),
        # Oznaczenie z arkusza importu równe identyfikatorowi JEST nazwą ze schematu.
        ("RGN-2", "RGN-2", "Stacja „RGN-2”"),
        ("stn-1", "  Stacja 1 ", "Stacja „Stacja 1”"),
        # Nazwa ze spacją i ukośnikiem (zapis napięć) to nazwa, nie identyfikator.
        ("stn-5", "Stacja 15/0,4 kV", "Stacja „Stacja 15/0,4 kV”"),
        # Kanon karty NAZWY-JEDNO-ZRODLO: nazwa nadana przez projektanta jest nazwą bez względu
        # na kształt (kod, ukośnik, długi hex) — ta sama odpowiedź co w etykiecie wyniku
        # (`enm.nazwy_elementow`). Dawny predykat kształtu (#142) chował ją w zdaniu jako „bez
        # nazwy", choć schemat i tabele wyników ją pokazywały. Intencja przypięta: brak nazwy
        # (pusta, same spacje, brak pola) = słowo rodzaju, nigdy identyfikator.
        ("tr_sn_nn", "tr_sn_nn", "Stacja „tr_sn_nn”"),
        ("stn-2", "QF-03_zrodlo", "Stacja „QF-03_zrodlo”"),
        ("stn/abc/1", "stn/abc/1", "Stacja „stn/abc/1”"),
        (_HEX, _HEX, f"Stacja „{_HEX}”"),
        ("stn-3", "", "Stacja bez nazwy"),
        ("stn-6", "   ", "Stacja bez nazwy"),
        ("stn-4", None, "Stacja bez nazwy"),
    ],
)
def test_nazwa_w_zdaniu_z_modelu_nigdy_z_identyfikatora_ani_kodu(
    ref_id: str, nazwa: str | None, oczekiwany: str
) -> None:
    """Ta sama reguła dla elementu-słownika migawki, obiektu modelu i nazwy w ręku
    (iloczyn: postać elementu × kształt nazwy)."""
    from enm.models import Substation

    slownikowy = {"ref_id": ref_id, "name": nazwa}
    assert slownik.opis_obiektu(slownikowy, "Stacja") == oczekiwany
    assert slownik.opis_elementu({"substations": [slownikowy]}, ref_id, "Stacja") == oczekiwany
    assert slownik.opis_nazwy(nazwa, "Stacja") == oczekiwany
    if nazwa is not None:
        obiekt = Substation(ref_id=ref_id, name=nazwa, station_type="mv_lv", bus_refs=[])
        assert slownik.opis_obiektu(obiekt, "Stacja") == oczekiwany


def _identyfikatory(snapshot: dict[str, Any] | None) -> set[str]:
    """Identyfikatory elementów migawki — z wyjątkiem identyfikatora RÓWNEGO nazwie nadanej
    elementowi (oznaczenie projektanta, np. „RGN-2” z arkusza importu): wtedy w treści stoi
    nazwa, którą projektant widzi na schemacie."""
    wynik: set[str] = set()
    for kolekcja in (snapshot or {}).values():
        if isinstance(kolekcja, list):
            for element in kolekcja:
                if not (isinstance(element, dict) and isinstance(element.get("ref_id"), str)):
                    continue
                if element["ref_id"] == nazwa_nadana_elementu(element):
                    continue
                wynik.add(element["ref_id"])
    return wynik


def _czysty(tekst: str, snapshot: dict[str, Any] | None) -> None:
    assert tekst, "pusty komunikat"
    assert not kody_w_tekscie(tekst), (kody_w_tekscie(tekst), tekst)
    for ref in _identyfikatory(snapshot):
        assert ref not in tekst, (ref, tekst)


@pytest.fixture(scope="module")
def magistrala() -> tuple[dict[str, Any], str, str]:
    return _build_trunk_with_segment()


def _stacja_z_nn(magistrala: tuple[dict[str, Any], str, str]) -> tuple[dict[str, Any], str]:
    snap, segment_ref, _ = magistrala
    wynik = execute_domain_operation(
        copy.deepcopy(snap),
        "insert_station_on_segment_sn",
        _insert_payload(segment_ref, field_apparatus_catalog_ref=APARAT_SN),
    )
    assert not wynik.get("error"), wynik.get("error")
    stan = wynik["snapshot"]
    szyna_nn = next(b["ref_id"] for b in stan["buses"] if float(b.get("voltage_kv") or 0) < 1.0)
    return stan, szyna_nn


def _dwie_szyny_nn(
    magistrala: tuple[dict[str, Any], str, str],
) -> tuple[dict[str, Any], str, str]:
    """Stacja z szyną nN i drugą szyną nN na końcu odcinka kabla nN."""
    stan, szyna_nn = _stacja_z_nn(magistrala)
    wynik = execute_domain_operation(
        copy.deepcopy(stan),
        "add_nn_cable_segment",
        {
            "from_bus_ref": szyna_nn,
            "length_m": 30.0,
            "catalog_ref": "kab_nn_yaky_4x150_al",
            "name": "Kabel odpływu 1",
        },
    )
    assert not wynik.get("error"), wynik.get("error")
    nowy = wynik["snapshot"]
    druga = next(
        b["ref_id"]
        for b in nowy["buses"]
        if b["ref_id"] not in {s["ref_id"] for s in stan["buses"]}
    )
    return nowy, szyna_nn, druga


def _szyna_sn_stacji(stan: dict[str, Any]) -> str:
    stacja = next(s for s in stan["substations"] if s.get("station_type") != "gpz")
    return next(
        ref
        for ref in stacja["bus_refs"]
        if any(b["ref_id"] == ref and float(b["voltage_kv"]) > 1.0 for b in stan["buses"])
    )


@dataclass(frozen=True)
class PrzypadekBledu:
    """Operacja × rodzaj błędu: oczekiwany kod maszynowy i nazwa pola w treści."""

    opis: str
    operacja: str
    rodzaj_bledu: str
    oczekiwany_kod: str
    nazwa_pola: str | None


def _przypadki(
    magistrala: tuple[dict[str, Any], str, str],
) -> list[tuple[PrzypadekBledu, dict[str, Any], dict[str, Any]]]:
    snap, segment_ref, koniec_ref = magistrala
    stan_nn, szyna_nn = _stacja_z_nn(magistrala)
    stan_dwie, szyna_a, szyna_b = _dwie_szyny_nn(magistrala)
    gpz = next(s for s in snap["substations"] if s.get("station_type") == "gpz")
    return [
        (
            PrzypadekBledu(
                "wstawienie stacji bez aparatu pola",
                "insert_station_on_segment_sn",
                "brak pola",
                "station.insert.field_apparatus_ref_missing",
                slownik.nazwa_pola("apparatus_catalog_ref"),
            ),
            snap,
            _insert_payload(segment_ref),
        ),
        (
            PrzypadekBledu(
                "aparat nN o nieznanym rodzaju",
                "add_nn_switch_device",
                "zła wartość",
                "nn.switch_device_class_invalid",
                slownik.nazwa_pola("device_class"),
            ),
            stan_dwie,
            {
                "from_bus_ref": szyna_a,
                "to_bus_ref": szyna_b,
                "device_class": "rozlacznik_x",
                "catalog_ref": "x",
            },
        ),
        (
            PrzypadekBledu(
                "odcinek nN bez typu kabla",
                "add_nn_cable_segment",
                "brak katalogu",
                "catalog.ref_required",
                slownik.nazwa_pola("catalog_ref", "add_nn_cable_segment"),
            ),
            stan_nn,
            {"from_bus_ref": szyna_nn, "length_m": 25.0},
        ),
        (
            PrzypadekBledu(
                "odcinek nN bez długości",
                "add_nn_cable_segment",
                "brak pola",
                "nn.segment_field_missing",
                slownik.nazwa_pola("length_m", "add_nn_cable_segment"),
            ),
            stan_nn,
            {"from_bus_ref": szyna_nn, "catalog_ref": "x"},
        ),
        (
            PrzypadekBledu(
                "źródło przekształtnikowe bez technologii",
                "add_converter_source",
                "brak pola",
                "converter.source_technology_missing",
                slownik.nazwa_pola("source_technology"),
            ),
            stan_nn,
            {"bus_nn_ref": szyna_nn},
        ),
        (
            PrzypadekBledu(
                "źródło przekształtnikowe bez sposobu przyłączenia",
                "add_converter_source",
                "brak pola",
                "converter.connection_variant_missing",
                slownik.nazwa_pola("connection_variant"),
            ),
            stan_nn,
            {"bus_nn_ref": szyna_nn, "source_technology": "PV"},
        ),
        (
            PrzypadekBledu(
                "deklaracje modułu poza kontraktem",
                "add_converter_source",
                "zła wartość",
                "generator.deklaracje_modulu_invalid",
                slownik.nazwa_pola("ramp_rate_pct_per_min", "deklaracje_modulu"),
            ),
            stan_nn,
            {
                "bus_nn_ref": szyna_nn,
                "source_technology": "PV",
                "deklaracje_modulu": {"ramp_rate_pct_per_min": -1.0, "zrodlo_pl": "karta"},
            },
        ),
        (
            PrzypadekBledu(
                "sekcja GPZ z niedozwolonym kluczem",
                "update_gpz_section",
                "zła wartość",
                "gpz_section.update.disallowed_keys",
                slownik.nazwa_pola("gpz_section.bus_ref"),
            ),
            snap,
            {
                "substation_ref": gpz["ref_id"],
                "section_id": gpz["gpz_sections"][0]["section_id"],
                "updates": {"voltage_kv": 20.0},
            },
        ),
    ]


def test_iloczyn_operacja_x_rodzaj_bledu_komunikat_glowny(
    magistrala: tuple[dict[str, Any], str, str],
) -> None:
    rodzaje = set()
    for przypadek, stan, ladunek in _przypadki(magistrala):
        wynik = execute_domain_operation(copy.deepcopy(stan), przypadek.operacja, ladunek)
        blad = wynik.get("error") or ""
        assert wynik.get("error_code") == przypadek.oczekiwany_kod, (przypadek.opis, wynik)
        _czysty(blad, stan)
        if przypadek.nazwa_pola:
            assert przypadek.nazwa_pola in blad, (przypadek.opis, blad)
        rodzaje.add(przypadek.rodzaj_bledu)
    assert rodzaje == {"brak pola", "zła wartość", "brak katalogu"}


def test_sprzecznosc_topologii_nazywa_elementy_nazwa_z_modelu(
    magistrala: tuple[dict[str, Any], str, str],
) -> None:
    """Rodzaj błędu „sprzeczność topologii": aparat nN między szynami różnych napięć i
    rola pola sprzeczna z katalogiem — elementy nazwane nazwą z modelu, bez kodów."""
    stan_nn, szyna_nn = _stacja_z_nn(magistrala)
    szyna_sn = next(b["ref_id"] for b in stan_nn["buses"] if float(b.get("voltage_kv") or 0) > 1)
    wynik = execute_domain_operation(
        copy.deepcopy(stan_nn),
        "add_nn_switch_device",
        {"from_bus_ref": szyna_nn, "to_bus_ref": szyna_sn, "device_class": "switch"},
    )
    assert wynik.get("error_code") == "nn.switch_not_nn_band"
    _czysty(wynik["error"], stan_nn)

    szyna_sn = _szyna_sn_stacji(stan_nn)
    for ladunek, fraza in (
        (
            {"complete_bay_template_ref": "ABB__UNIGEAR_ZS1__LINE_OUT", "bay_role": "TR"},
            "rolę „Pole liniowe wyjściowe”",
        ),
        ({"complete_bay_template_ref": "ABB__SAFERING__LINE_OUT"}, "„Blok fabryczny”"),
    ):
        rola = execute_domain_operation(
            copy.deepcopy(stan_nn),
            "add_sn_bay",
            {"bus_ref": szyna_sn, "dry_run": True, **ladunek},
        )
        assert rola.get("error_code") == "sn.pole_katalogowe_niezgodne", rola
        _czysty(rola["error"], stan_nn)
        assert fraza in rola["error"], rola["error"]
        assert rola["preview"]["komunikat_pl"] == rola["error"]


def test_ostrzezenia_i_podpowiedzi_gotowosci_bez_kodow(
    magistrala: tuple[dict[str, Any], str, str],
) -> None:
    """Miejsca „ostrzeżenie gotowości" i „podpowiedź naprawy": blokady, ostrzeżenia,
    akcje naprawcze i kwestie semantyczne odpowiedzi operacji — bez kodów i identyfikatorów
    (identyfikator zostaje w ``element_ref``)."""
    stan_nn, _ = _stacja_z_nn(magistrala)
    zepsuty = copy.deepcopy(stan_nn)
    for transformator in zepsuty["transformers"]:
        transformator["vector_group"] = None  # W004 — ostrzeżenie
    for szyna in zepsuty["buses"]:
        # Szyny bez nazwy: komunikat opisuje je słowem rodzaju, nigdy identyfikatorem (dawniej
        # nazwa = identyfikator ukrywana predykatem kształtu — kanon NAZWY-JEDNO-ZRODLO: nazwa
        # nadana jest nazwą, brak nazwy jest brakiem).
        szyna["name"] = ""
    wynik = execute_domain_operation(zepsuty, "refresh_snapshot", {})
    gotowosc = wynik.get("readiness") or {}
    teksty = [
        *(z["message_pl"] for z in gotowosc.get("blockers", [])),
        *(z["message_pl"] for z in gotowosc.get("warnings", [])),
        *(a["message_pl"] for a in wynik.get("fix_actions") or []),
        *(k.get("message") or "" for k in wynik.get("semantic_issues") or []),
    ]
    assert teksty, wynik
    for tekst in teksty:
        _czysty(tekst, zepsuty)


def test_rozbieznosc_tabliczki_nazywa_pola_tabliczki() -> None:
    """Rozbieżność tabliczki z katalogiem (brama i operacja jedną funkcją) — nazwa pola
    tabliczki, słowo „formularz", wartości bez zapisu języka programowania."""
    opisy = rozbieznosci_tabliczki(
        {"un_kv": 0.4, "vector_group": "Yyn0"}, {"un_kv": 15.0, "vector_group": "Dyn11"}
    )
    assert opisy
    for opis in opisy:
        assert not kody_w_tekscie(opis), opis
        assert "formularz" in opis and "'" not in opis


_LITEROWKA = "-literowka-ktorej-nie-ma"
_TRAFO = "tr-sn-nn-15-04-630kva-dyn11"
_STACJA_TR = {"create": True, "transformer_catalog_ref": _TRAFO}

#: Brama katalogowa API (przed operacją) — iloczyn: tor bramy × rodzaj błędu (brak
#: katalogu, pozycja spoza katalogu, zła grupa katalogu, wiązanie wytwórcy, referencja
#: dodatkowa, miejsce w stacji). Oczekiwany kod bez zmian; polska nazwa obecna.
_PRZYPADKI_BRAMY_API: tuple[tuple[str, dict[str, Any], str, tuple[str, ...]], ...] = (
    (
        "add_transformer_sn_nn",
        {},
        "catalog.ref_required",
        (slownik.nazwa_pola("transformer_catalog_ref", "add_transformer_sn_nn"),),
    ),
    (
        "add_transformer_sn_nn",
        {"transformer_catalog_ref": _TRAFO + _LITEROWKA},
        "catalog.item_not_found",
        (),
    ),
    (
        "add_transformer_sn_nn",
        {
            "catalog_binding": {
                "catalog_namespace": "NIE_MA_TAKIEJ_GRUPY",
                "catalog_item_id": "x" + _LITEROWKA,
                "catalog_item_version": "1",
            }
        },
        "catalog.ref_required",
        (),
    ),
    (
        "add_transformer_sn_nn",
        {"catalog_ref": _TRAFO, "transformer_tap_changer_catalog_ref": "zaczep" + _LITEROWKA},
        "catalog.item_not_found",
        (),
    ),
    (
        "set_der_catalog_bindings",
        {
            "generator_ref": "gen-1",
            "ct_catalog_ref": "ct" + _LITEROWKA,
            "protection_catalog_ref": "zab" + _LITEROWKA,
        },
        "catalog.item_not_found",
        (slownik.nazwa_pola("ct_catalog_ref"), slownik.nazwa_pola("protection_catalog_ref")),
    ),
    (
        "set_der_catalog_bindings",
        {"generator_ref": "gen-1", "bess_operation_mode_refs": ["tryb" + _LITEROWKA]},
        "catalog.item_not_found",
        (slownik.nazwa_pola("bess_operation_mode_refs"),),
    ),
    (
        "insert_zksn_on_segment_sn",
        {
            "segment_id": "odcinek",
            "catalog_binding": {
                "catalog_namespace": "ZKSN",
                "catalog_item_id": "zksn" + _LITEROWKA,
                "catalog_item_version": "1",
            },
        },
        "catalog.item_not_found",
        (),
    ),
    (
        "append_station_on_endpoint",
        {
            "sn_fields": [{"field_role": "LINIA_IN", "apparatus_catalog_ref": "ap" + _LITEROWKA}],
            "transformer": _STACJA_TR,
        },
        "catalog.item_not_found",
        ("Aparat pola SN nr 1",),
    ),
    (
        "append_station_on_endpoint",
        {
            "sn_fields": [
                {
                    "field_role": "LINIA_IN",
                    "apparatus_catalog_ref": APARAT_SN,
                    "equipment": {
                        "ct": {
                            "catalog_ref": "ct" + _LITEROWKA,
                            "ratio_primary_a": 400.0,
                            "ratio_secondary_a": 5.0,
                        }
                    },
                }
            ],
            "transformer": _STACJA_TR,
        },
        "catalog.item_not_found",
        ("Pole SN nr 1",),
    ),
)


@pytest.mark.parametrize(
    ("operacja", "payload", "kod", "nazwy"),
    _PRZYPADKI_BRAMY_API,
    ids=[f"{op}-{kod}-{i}" for i, (op, _, kod, _) in enumerate(_PRZYPADKI_BRAMY_API)],
)
def test_komunikat_bramy_katalogowej_api_bez_kodow(
    operacja: str, payload: dict[str, Any], kod: str, nazwy: tuple[str, ...]
) -> None:
    """Odmowa bramy API (przed operacją): nazwy pól formularza i grup katalogu słowami,
    bez kodu operacji, klucza ładunku, danych ``pole=wartość`` i wpisanej referencji —
    ``code`` (po nim front mapuje błąd) bez zmian."""
    from api.domain_ops_policy import validate_and_materialize_catalog_binding

    blad, _ = validate_and_materialize_catalog_binding(operacja, copy.deepcopy(payload))
    assert blad is not None and blad.code == kod, blad
    teksty = (blad.message_pl, *(e["message_pl"] for e in blad.errors))
    for tekst in teksty:
        assert not kody_w_tekscie(tekst), tekst
        assert _LITEROWKA not in tekst, tekst
    for nazwa in nazwy:
        assert any(nazwa in tekst for tekst in teksty), (nazwa, teksty)


# ---------------------------------------------------------------------------
# Błąd walidacji kształtu danych po polsku (``opis_bledu_walidacji``)
# ---------------------------------------------------------------------------


def _blad_walidacji(dane: dict[str, Any]) -> Any:
    """``ValidationError`` modelu o polach ze słownika pól (i jednym spoza niego)."""
    from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

    class _Model(BaseModel):
        model_config = ConfigDict(extra="forbid")
        sn_mva: float = Field(gt=0)
        dlugosc_m: float = Field(ge=1)
        pole_spoza_slownika: int = 0
        modele: list[int] = []

        @field_validator("modele")
        @classmethod
        def _niepuste(cls, wartosc: list[int]) -> list[int]:
            if not wartosc:
                raise ValueError(
                    "[widmo.niepuste] Karta widmowa wymaga co najmniej jednego modelu."
                )
            return wartosc

    with pytest.raises(ValidationError) as blad:
        _Model.model_validate(dane)
    return blad.value


@pytest.mark.parametrize(
    ("dane", "operacja", "oczekiwane"),
    [
        # brak pola × nazwa ogólna
        ({"dlugosc_m": 5}, None, "„Moc znamionowa” jest wymagana"),
        # zła wartość (granica) × nazwa kontekstowa operacji
        (
            {"sn_mva": 1, "dlugosc_m": 0},
            "start_branch_segment_sn",
            "„Długość odgałęzienia” nie może być mniejsza od 1",
        ),
        # zła wartość (typ) × pole spoza słownika — opis bez klucza
        (
            {"sn_mva": 1, "dlugosc_m": 5, "pole_spoza_slownika": "x"},
            None,
            "wartość musi być liczbą całkowitą",
        ),
        # pole nieznane formularzowi
        ({"sn_mva": 1, "dlugosc_m": 5, "obce_pole": 1}, None, "nie należy do tego formularza"),
        # reguła kontraktu dziedziny — zdanie reguły bez jej identyfikatora
        (
            {"sn_mva": 1, "dlugosc_m": 5, "modele": []},
            None,
            "Karta widmowa wymaga co najmniej jednego modelu",
        ),
    ],
)
def test_opis_bledu_walidacji_nazwy_pol_bez_kluczy_i_identyfikatorow_regul(
    dane: dict[str, Any], operacja: str | None, oczekiwane: str
) -> None:
    """Rodzaj błędu kształtu danych × nazwa pola (ogólna, kontekstowa, spoza słownika):
    nazwa pola formularza obecna, klucz kontraktu, identyfikator reguły i angielski opis
    biblioteki walidacji nieobecne."""
    tresc = slownik.opis_bledu_walidacji(_blad_walidacji(dane), operacja)
    assert oczekiwane in tresc, tresc
    assert not kody_w_tekscie(tresc), tresc
    assert "[" not in tresc and "widmo." not in tresc, tresc
    assert not re.search(r"\b(?:Field|Input|should|required|valid)\b", tresc), tresc
    for klucz in ("sn_mva", "dlugosc_m", "pole_spoza_slownika", "obce_pole", "modele"):
        assert klucz not in tresc, tresc


def test_odmowa_karty_widmowej_projektu_bez_kodu_reguly_i_identyfikatora() -> None:
    """Odmowa bramy rekordu karty widmowej (``OdmowaKatalogu``) dociera do projektanta
    zdaniem; kod reguły ``KAT-T`` w ``kod_reguly_katalogu`` (maszynowa część odpowiedzi)."""
    from enm.katalog_projektu_karty import BladKartWidmowych, dodaj_karte_do_sekcji
    from network_model.catalog.repository import get_default_mv_catalog

    from tests.enm.test_karty_widmowe_modelu import TYP_PV, _karta_projektu

    katalog = get_default_mv_catalog()
    rekord = {
        **_karta_projektu(TYP_PV, "karta-arkusza-7").model_dump(mode="json"),
        "modele": [],
    }
    with pytest.raises(BladKartWidmowych) as blad:
        dodaj_karte_do_sekcji(None, rekord, katalog)
    assert blad.value.kod == "karta_widmowa.odrzucona"
    assert blad.value.kod_reguly is not None and blad.value.kod_reguly.startswith("KAT-T-")
    tresc = str(blad.value)
    assert not kody_w_tekscie(tresc), tresc
    for zakazane in ("KAT-T", "karta-arkusza-7", "[widmo.", "Value error"):
        assert zakazane not in tresc, tresc


_WARUNKI_NN = {
    "environment": "grunt",
    "insulation": "XLPE",
    "ambient_temperature_c": 20,
    "circuit_count": 1,
    "soil_thermal_resistivity_km_w": 2.5,
}


@pytest.mark.parametrize(
    ("przekroj", "warunki", "oczekiwane"),
    [
        ("SN", {"set_name": "zestaw-nieznany"}, "Nieznany zestaw warunków ułożenia"),
        ("SN", {"set_name": "wlasne", "f_grunt": 1.0}, "współczynnik wiązki"),
        (
            "SN",
            {
                "set_name": "wlasne",
                "f_grunt": 2.0,
                "f_wiazka": 1.0,
                "f_grupa": 1.0,
                "opis_pl": "opis",
            },
            "Współczynnik gruntu musi leżeć",
        ),
        (
            "SN",
            {"set_name": "wlasne", "f_grunt": 1.0, "f_wiazka": 1.0, "f_grupa": 1.0},
            "wymagają opisu warunków",
        ),
        ("nN", {**_WARUNKI_NN, "environment": "woda"}, "Nieznane środowisko"),
        ("nN", {**_WARUNKI_NN, "insulation": "EPR"}, "Nieznany typ izolacji"),
        ("nN", {**_WARUNKI_NN, "circuit_count": 0}, "Liczba obwodów"),
        (
            "nN",
            {**_WARUNKI_NN, "soil_thermal_resistivity_km_w": None},
            "rezystywności cieplnej gruntu",
        ),
        (
            "nN",
            {**_WARUNKI_NN, "environment": "powietrze", "ambient_temperature_c": 30},
            "musi zostać puste",
        ),
        ("nN", {**_WARUNKI_NN, "ambient_temperature_c": 17}, "PN-HD 60364-5-52"),
        ("nN", {**_WARUNKI_NN, "soil_thermal_resistivity_km_w": 0.77}, "PN-HD 60364-5-52"),
        ("nN", {**_WARUNKI_NN, "circuit_count": 99}, "PN-HD 60364-5-52"),
    ],
)
def test_odmowa_rdzenia_obciazalnosci_slowami_projektanta(
    przekroj: str, warunki: dict[str, Any], oczekiwane: str
) -> None:
    """Każda odmowa rdzenia obciążalności kabla (SN: zestawy i współczynniki własne;
    nN: środowisko, izolacja, liczba obwodów, rezystywność, tablice temperatury, gruntu
    i grupowania) jest zdaniem projektanta U ŹRÓDŁA (rdzeń nie jest zamrożony — dawna
    granica tłumacząca klucze na słowa była drugim słownikiem i zniknęła): bez kluczy
    współczynników, nazw kodowych zestawów i nazwy rejestru tablic."""
    from enm.domain_operations_v2 import (
        _der_cable_laying_conditions,
        _nn_cable_laying_conditions,
    )

    parser = _der_cable_laying_conditions if przekroj == "SN" else _nn_cable_laying_conditions
    opis, tresc = parser({"cable_laying_conditions": warunki})
    assert opis is None and tresc, (opis, tresc)
    assert oczekiwane in tresc, tresc
    assert not kody_w_tekscie(tresc), tresc
    for zakazane in ("f_grunt", "f_wiazka", "f_grupa", "G-D1", "Współczynnik współczynnik"):
        assert zakazane not in tresc, tresc


@pytest.mark.parametrize(
    ("ref", "kategoria", "nazwa"),
    [
        ("conv-bess-nn-2mw-0p4kv", "CONVERTER", "PCS BESS 2 MW / 0.4 kV nN"),
        ("conv-bess-nn-2mw-0p4kv", None, "PCS BESS 2 MW / 0.4 kV nN"),
    ],
)
def test_nazwa_pozycji_katalogu_z_ukosnikiem_jest_nazwa(
    ref: str, kategoria: str | None, nazwa: str
) -> None:
    """Nazwa pozycji katalogu z ukośnikiem w zapisie napięć trafia do treści — dawniej
    kształt „ma ukośnik = identyfikator” zamieniał ją na „typ bez nazwy”. Nazwę pozycji daje
    moduł nazw (`nazwa_nadana_pozycji_katalogu`), słownik składa z niej zdanie."""
    from enm.katalog_projektu import katalog_biezacy
    from network_model.catalog.materialization import pozycja_w_katalogu

    pozycja = pozycja_w_katalogu(katalog_biezacy(), kategoria, ref)
    assert nazwa_nadana_pozycji_katalogu(pozycja) == nazwa
    assert slownik.opis_pozycji_katalogu(ref, kategoria, "typ") == f"typ „{nazwa}”"
