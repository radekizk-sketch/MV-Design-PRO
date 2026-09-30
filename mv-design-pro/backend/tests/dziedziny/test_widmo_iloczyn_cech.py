"""Kontrakt modelu źródła widmowego — ILOCZYN CECH z niezależną wyrocznią (karta AB-H0 §2 A).

Cechy (pełny iloczyn, 22 680 przypadków w jednym przebiegu — ``hypothesis`` nie jest
w zależnościach): rodzaj modelu (6) × dziedzina (2) × faza (znana / nieznana z powodem /
nieznana bez powodu) × amplituda (A / V / % każdej z czterech baz / % bez bazy) × pomiar
(komplet / niepełny / brak) × stan podstawy (3) × częstotliwość (wielokrotność f₁ /
interharmoniczna / ≤ 0 / duplikat / poza zakresem modelu) × częstotliwość przełączania
(brak / podana).

Wyrocznia ``oczekiwane_odrzucenia`` jest napisana od nowa z tabeli reguł karty (§0.4, §0.5)
— NIE woła ``bledy_modelu``. Każdy przypadek sprawdza: model powstaje ⇔ wyrocznia nie
przewiduje odrzucenia; odrzucenie zawiera fragment komunikatu KAŻDEJ przewidzianej reguły.
"""

from __future__ import annotations

import itertools
from typing import Any

import pytest
from dziedziny.pomiar import ParametryPomiaru
from dziedziny.widmo import (
    ModelZrodlaWidmowego,
    OdniesienieAmplitudy,
    SkladowaWidma,
    ZakresCzestotliwosci,
    faza_znana,
    rzad_harmonicznej,
)
from pydantic import ValidationError
from werdykt.kontrakt import Wielkosc

from tests.dziedziny import fabryki as f

RODZAJE = (
    "CURRENT_SPECTRUM",
    "VOLTAGE_SPECTRUM",
    "NORTON_EQUIVALENT",
    "THEVENIN_EQUIVALENT",
    "MEASURED_SPECTRUM",
    "FREQUENCY_DEPENDENT_EQUIVALENT",
)
DZIEDZINY = ("HARMONIC_FREQUENCY_DOMAIN", "SUPRAHARMONIC_FREQUENCY_DOMAIN")
FAZY = ("znana", "nieznana", "nieznana_bez_powodu")
AMPLITUDY = ("A", "V", "%I_N_URZADZENIA", "%I_1_W_PUNKCIE_PRACY", "%U_1", "%U_N", "%bez_bazy")
POMIARY = ("komplet", "niepelny", "brak")
STANY = ("ZWERYFIKOWANE", "WSKAZANE", "NIEUSTALONE")
CZESTOTLIWOSCI = ("wielokrotnosc", "interharmoniczna", "niedodatnia", "duplikat", "poza_pasmem")
FSW = (None, 20000.0)

PRADOWE = {"CURRENT_SPECTRUM", "NORTON_EQUIVALENT"}
NAPIECIOWE = {"VOLTAGE_SPECTRUM", "THEVENIN_EQUIVALENT"}
SIATKI = {
    "wielokrotnosc": (250.0, 350.0),
    "interharmoniczna": (250.0, 375.0),
    "niedodatnia": (0.0, 350.0),
    "duplikat": (250.0, 250.0),
    "poza_pasmem": (250.0, 3000.0),
}


def _pomiar(rodzaj: str) -> ParametryPomiaru | None:
    if rodzaj == "komplet":
        return f.pomiar_kompletny(rbw=True)
    if rodzaj == "niepelny":
        return ParametryPomiaru(metoda="IEC 61000-4-7", rozdzielczosc_hz=5.0)
    return None


def zbuduj(cechy: dict[str, Any]) -> ModelZrodlaWidmowego:
    rodzaj = cechy["rodzaj"]
    siatka = SIATKI[cechy["czestotliwosc"]]
    amplituda = cechy["amplituda"]
    jednostka = "%" if amplituda.startswith("%") else amplituda
    odniesienie: OdniesienieAmplitudy | None = None
    if amplituda.startswith("%") and amplituda != "%bez_bazy":
        baza = amplituda[1:]
        pola = ("sn_mva", "un_kv") if baza.startswith("I") else ("un_kv",)
        odniesienie = OdniesienieAmplitudy(rodzaj=baza, pola_karty=pola)
    skladowe: tuple[SkladowaWidma, ...] = ()
    if rodzaj != "FREQUENCY_DEPENDENT_EQUIVALENT":
        skladowe = tuple(
            SkladowaWidma(
                f_hz=czest,
                amplituda=Wielkosc(wartosc=2.0, jednostka=jednostka),
                faza_deg=30.0 if cechy["faza"] == "znana" else None,
                faza_nieznana_powod_pl=(
                    "karta nie podaje fazy" if cechy["faza"] == "nieznana" else None
                ),
            )
            for czest in siatka
        )
    else:
        odniesienie = None
    dane: dict[str, Any] = {
        "ident": "m",
        "rodzaj": rodzaj,
        "dziedzina": cechy["dziedzina"],
        "f1_hz": f.F1,
        "zakres_czestotliwosci": ZakresCzestotliwosci(f_min_hz=0.0, f_max_hz=2500.0),
        "skladowe": skladowe,
        "punkt_pracy": f.punkt_pracy(),
        "odniesienie_amplitudy": odniesienie,
        "odniesienie_fazy": (
            f.odniesienie_fazy()
            if cechy["faza"] == "znana" and rodzaj != "FREQUENCY_DEPENDENT_EQUIVALENT"
            else None
        ),
        "pomiar": _pomiar(cechy["pomiar"]),
        "podstawa": f.podstawa(status=cechy["stan"]),
        "wersja": "1",
        "czestotliwosc_przelaczania_hz": cechy["fsw"],
    }
    if rodzaj in ("NORTON_EQUIVALENT", "FREQUENCY_DEPENDENT_EQUIVALENT"):
        dane["admitancja"] = f.admitancja(*siatka)
    if rodzaj == "THEVENIN_EQUIVALENT":
        dane["impedancja"] = f.impedancja(*siatka)
    return ModelZrodlaWidmowego(**dane)


def oczekiwane_odrzucenia(cechy: dict[str, Any]) -> set[str]:
    """Niezależna wyrocznia: fragmenty komunikatów reguł, które MUSZĄ odrzucić model."""
    rodzaj = cechy["rodzaj"]
    czest = cechy["czestotliwosc"]
    ma_zrodlo = rodzaj != "FREQUENCY_DEPENDENT_EQUIVALENT"
    amplituda = cechy["amplituda"]
    supra = cechy["dziedzina"] == "SUPRAHARMONIC_FREQUENCY_DOMAIN"
    # Częstotliwość ≤ 0 odrzuca już konstruktor punktu (składowej albo admitancji/impedancji).
    if czest == "niedodatnia":
        return {"greater than 0"}
    if ma_zrodlo and cechy["faza"] == "nieznana_bez_powodu":
        return {"faza nieznana wymaga powodu"}
    odrzucenia: set[str] = set()
    if czest == "duplikat":
        odrzucenia.add("duplikat częstotliwości")
    if czest == "poza_pasmem":
        odrzucenia.add("poza zakresem modelu")
    if ma_zrodlo and czest == "interharmoniczna" and cechy["faza"] == "znana":
        odrzucenia.add("jest interharmoniczną")
    if ma_zrodlo:
        if amplituda == "A" and rodzaj in NAPIECIOWE:
            odrzucenia.add("jest źródłem napięciowym")
        if amplituda == "V" and rodzaj in PRADOWE:
            odrzucenia.add("jest źródłem prądowym")
        if amplituda == "%bez_bazy":
            odrzucenia.add("bez nazwanej bazy")
        if amplituda in ("%U_1", "%U_N") and rodzaj in PRADOWE:
            odrzucenia.add("źródło prądowe z bazą napięciową")
        if amplituda in ("%I_N_URZADZENIA", "%I_1_W_PUNKCIE_PRACY") and rodzaj in NAPIECIOWE:
            odrzucenia.add("źródło napięciowe z bazą prądową")
    if rodzaj == "MEASURED_SPECTRUM":
        if cechy["pomiar"] == "brak":
            odrzucenia.add("widmo zmierzone wymaga parametrów pomiaru")
        elif cechy["pomiar"] == "niepelny":
            odrzucenia.add("bez kompletu parametrów pomiaru")
    elif cechy["pomiar"] == "niepelny" and supra:
        odrzucenia.add("wymaga pasma rozdzielczości rbw_hz")
    if cechy["fsw"] is not None and not supra:
        odrzucenia.add("częstotliwość przełączania dopuszczalna wyłącznie")
    return odrzucenia


def test_iloczyn_cech_modelu_widmowego_z_wyrocznia() -> None:
    przypadki = 0
    rozbieznosci: list[str] = []
    for wartosci in itertools.product(
        RODZAJE, DZIEDZINY, FAZY, AMPLITUDY, POMIARY, STANY, CZESTOTLIWOSCI, FSW
    ):
        cechy = dict(
            zip(
                (
                    "rodzaj",
                    "dziedzina",
                    "faza",
                    "amplituda",
                    "pomiar",
                    "stan",
                    "czestotliwosc",
                    "fsw",
                ),
                wartosci,
                strict=True,
            )
        )
        przypadki += 1
        oczekiwane = oczekiwane_odrzucenia(cechy)
        try:
            zbuduj(cechy)
        except ValidationError as blad:
            tekst = str(blad)
            if not oczekiwane:
                rozbieznosci.append(f"{cechy}: odrzucony bez reguły wyroczni — {tekst[:300]}")
                continue
            brakujace = [frag for frag in oczekiwane if frag not in tekst]
            if brakujace:
                rozbieznosci.append(f"{cechy}: brak komunikatu {brakujace} w {tekst[:400]}")
        else:
            if oczekiwane:
                rozbieznosci.append(f"{cechy}: przyjęty, a wyrocznia odrzuca {oczekiwane}")
    assert przypadki == 22680
    assert not rozbieznosci, f"{len(rozbieznosci)} rozbieżności, np.:\n" + "\n".join(
        rozbieznosci[:20]
    )


# ---------------------------------------------------------------------------
# Reguły przypięte osobno (nazwane w karcie)
# ---------------------------------------------------------------------------


def test_skladowe_sa_porzadkowane_a_permutacja_nie_zmienia_odcisku() -> None:
    a = f.model(skladowe=(f.skladowa(350.0, 2.0), f.skladowa(250.0)))
    b = f.model(skladowe=(f.skladowa(250.0), f.skladowa(350.0, 2.0)))
    assert [s.f_hz for s in a.skladowe] == [250.0, 350.0]
    assert a.odcisk() == b.odcisk()
    assert a.kanoniczny_json() == b.kanoniczny_json()


def test_dwa_importy_tej_samej_tresci_daja_ten_sam_odcisk() -> None:
    assert f.model().odcisk() == f.model().odcisk()
    assert f.model().odcisk() != f.model(wersja="2").odcisk()


def test_faza_nieznana_nie_jest_zerem() -> None:
    nieznana = f.model()
    assert all(s.faza_deg is None for s in nieznana.skladowe)
    assert faza_znana(nieznana) is False
    znana = f.model(
        skladowe=(f.skladowa(250.0, faza=10.0), f.skladowa(350.0, 2.0, faza=-20.0)),
        odniesienie_fazy=f.odniesienie_fazy(),
    )
    assert faza_znana(znana) is True
    mieszana = f.model(
        skladowe=(f.skladowa(250.0, faza=10.0), f.skladowa(350.0, 2.0)),
        odniesienie_fazy=f.odniesienie_fazy(),
    )
    assert faza_znana(mieszana) is False
    assert faza_znana(f.model_parametryczny()) is False


def test_faza_interharmonicznej_musi_byc_nieznana_z_powodem() -> None:
    with pytest.raises(ValidationError, match="jest interharmoniczną"):
        f.model(
            skladowe=(f.skladowa(275.0, faza=5.0),),
            odniesienie_fazy=f.odniesienie_fazy(),
        )
    model = f.model(
        skladowe=(
            f.skladowa(
                275.0,
                powod="faza składowej niestacjonarnej względem podstawowej nie jest określona",
            ),
        )
    )
    assert model.skladowe[0].faza_deg is None


def test_faza_bez_odniesienia_i_odniesienie_bez_fazy_sa_odrzucane() -> None:
    with pytest.raises(ValidationError, match="bez wielkości odniesienia fazy"):
        f.model(skladowe=(f.skladowa(250.0, faza=5.0),))
    with pytest.raises(ValidationError, match="odniesienie fazy podane"):
        f.model(odniesienie_fazy=f.odniesienie_fazy())


def test_odniesienie_amplitudy_wymaga_jednej_postaci_i_jednostki_bazy() -> None:
    with pytest.raises(ValidationError, match="dokładnie jedno z dwóch"):
        OdniesienieAmplitudy(rodzaj="I_N_URZADZENIA")
    with pytest.raises(ValidationError, match="dokładnie jedno z dwóch"):
        OdniesienieAmplitudy(
            rodzaj="I_N_URZADZENIA",
            wartosc=Wielkosc(wartosc=310.0, jednostka="A"),
            pola_karty=("sn_mva",),
        )
    with pytest.raises(ValidationError, match="oczekiwana 'A'"):
        OdniesienieAmplitudy(rodzaj="I_N_URZADZENIA", wartosc=Wielkosc(wartosc=1.0, jednostka="V"))
    with pytest.raises(ValidationError, match="oczekiwana 'V'"):
        OdniesienieAmplitudy(rodzaj="U_N", wartosc=Wielkosc(wartosc=1.0, jednostka="A"))
    assert OdniesienieAmplitudy(rodzaj="U_1", wartosc=Wielkosc(wartosc=230.0, jednostka="V"))


def test_odniesienie_amplitudy_bez_procentu_jest_odrzucane() -> None:
    with pytest.raises(ValidationError, match="żadna składowa nie jest w %"):
        f.model(skladowe=(f.skladowa(250.0, 12.0, "A"),))


def test_procent_powyzej_stu_i_amplituda_ujemna_sa_odrzucane() -> None:
    with pytest.raises(ValidationError, match="przekracza 100 %"):
        f.skladowa(250.0, 100.5)
    with pytest.raises(ValidationError, match="amplituda jest nieujemna"):
        f.skladowa(250.0, -1.0, "A")
    with pytest.raises(ValidationError, match="spoza kontraktu"):
        f.skladowa(250.0, 1.0, "kA")


def test_rodzaje_wymagaja_wlasciwej_czesci_wewnetrznej() -> None:
    with pytest.raises(ValidationError, match="Nortona wymaga admitancji"):
        f.model(rodzaj="NORTON_EQUIVALENT")
    with pytest.raises(ValidationError, match="TEJ SAMEJ siatce"):
        f.model(rodzaj="NORTON_EQUIVALENT", admitancja=f.admitancja(250.0, 400.0))
    with pytest.raises(ValidationError, match="Thévenina wymaga impedancji"):
        f.model(
            rodzaj="THEVENIN_EQUIVALENT",
            skladowe=(f.skladowa(250.0, 1.0, "V"),),
            odniesienie_amplitudy=None,
        )
    with pytest.raises(ValidationError, match="wyłącznie źródło"):
        f.model(admitancja=f.admitancja(250.0, 350.0))
    with pytest.raises(ValidationError, match="DOKŁADNIE jednej postaci"):
        f.model(
            rodzaj="FREQUENCY_DEPENDENT_EQUIVALENT",
            skladowe=(),
            odniesienie_amplitudy=None,
            admitancja=f.admitancja(250.0),
            impedancja=f.impedancja(250.0),
        )
    with pytest.raises(ValidationError, match="bez składowych źródła"):
        f.model(rodzaj="FREQUENCY_DEPENDENT_EQUIVALENT", admitancja=f.admitancja(250.0, 350.0))
    with pytest.raises(ValidationError, match="model parametryczny impedancji dopuszczalny"):
        f.model(model_parametryczny=f.model_parametryczny().model_parametryczny)
    assert f.model_parametryczny().rodzaj == "FREQUENCY_DEPENDENT_EQUIVALENT"


def test_widmo_zmierzone_nie_miesza_pradu_i_napiecia() -> None:
    with pytest.raises(ValidationError, match="miesza składowe prądu"):
        f.model_zmierzony(
            skladowe=(f.skladowa(250.0, 1.0, "A"), f.skladowa(350.0, 1.0, "V")),
            odniesienie_amplitudy=None,
        )


def test_podstawa_widma_tylko_producent_albo_zalozenie_projektowe() -> None:
    with pytest.raises(ValidationError, match="podstawa rodzaju NORMA"):
        f.model(podstawa=f.podstawa(rodzaj="NORMA"))
    assert f.model(podstawa=f.podstawa(rodzaj="ZALOZENIE_PROJEKTOWE", status="NIEUSTALONE"))


def test_rzad_harmonicznej_jest_pochodna_bez_zaokraglania() -> None:
    assert rzad_harmonicznej(250.0, 50.0) == 5
    assert rzad_harmonicznej(7 * 49.8, 49.8) == 7
    assert rzad_harmonicznej(251.0, 50.0) is None
    assert rzad_harmonicznej(20.0, 50.0) is None
    with pytest.raises(ValueError, match="dodatnie"):
        rzad_harmonicznej(0.0, 50.0)


def test_czestotliwosc_przelaczania_tylko_supraharmoniczna() -> None:
    with pytest.raises(ValidationError, match="częstotliwość przełączania"):
        f.model(czestotliwosc_przelaczania_hz=16000.0)
    supra = f.model(
        dziedzina="SUPRAHARMONIC_FREQUENCY_DOMAIN",
        zakres_czestotliwosci=ZakresCzestotliwosci(f_min_hz=2000.0, f_max_hz=150000.0),
        skladowe=(f.skladowa(16000.0, 0.5),),
        czestotliwosc_przelaczania_hz=16000.0,
    )
    assert supra.czestotliwosc_przelaczania_hz == 16000.0


def test_nan_i_nieskonczonosc_sa_odrzucane() -> None:
    with pytest.raises(ValidationError):
        f.skladowa(float("nan"))
    with pytest.raises(ValidationError):
        f.skladowa(float("inf"))
    with pytest.raises(ValidationError):
        ZakresCzestotliwosci(f_min_hz=0.0, f_max_hz=float("inf"))
