"""Prototyp modelu zaufania (D-09): status dowodowy WYPROWADZANY, nie nadawany.

KOD BADAWCZY — patrz `backend/research/README.md`.

Testy sprawdzają jedną hipotezę: czy da się skonstruować rejestr, w którym
„to jest zwalidowana symulacja” jest FUNKCJĄ danych i którego **nie da się
oszukać przypisaniem wartości**. Każdy test opisuje jeden sposób, w jaki dziś
(przy stopniu nadawanym) fałszywy pozytyw byłby osiągalny.

Druga warstwa testów (sekcje A1–A5 niżej) pochodzi z audytu kontradyktoryjnego
samego prototypu. Audyt pokazał, że warstwa dowodowa potrafiła uznać dowód za
ważny tam, gdzie nie obowiązuje: odcisk dowodu nie obejmował ZAKRESU, a brak
danych o punkcie pracy czytała jako brak zastrzeżeń.
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, replace

import pytest
from dynamic_lab.dowod_walidacji import (
    DowodWalidacji,
    KonfiguracjaSolvera,
    MetrykiAkceptacji,
    NiezadeklarowanaOsZakresuError,
    PrzypadekWalidacji,
    PunktPracy,
    RejestrDowodow,
    RodzajOsi,
    StopienDowodowy,
    TozsamoscModelu,
    TozsamoscProfiluWymagan,
    TozsamoscScenariusza,
    TrybOrzekania,
    Wyrocznia,
    ZakresWalidacji,
    os_zakresu,
)
from dynamic_lab.regulatory import RegulatorNapiecia
from dynamic_lab.siec import Bocznik, Galaz, TopologiaSieci
from dynamic_lab.tozsamosc import odcisk_topologii, postac_kanoniczna
from dynamic_lab.urzadzenia import (
    FalownikGFM,
    KandydatOgraniczeniaImpedancjaWirtualna,
    KandydatOgraniczeniaNasycenieZadania,
    MaszynaSynchroniczna4Rzedu,
    ZespolSynchroniczny,
)

ANDES = Wyrocznia(nazwa="ANDES", wersja="2.0.0", metoda="wartości własne")

KONFIGURACJA = KonfiguracjaSolvera(
    integrator="trapez_niejawny",
    krok_s=0.005,
    tolerancja_sieci=1.0e-12,
    tolerancja_rownowagi=1.0e-6,
    maks_iteracji_sieci=40,
)

PUNKT_W_ZAKRESIE = PunktPracy(napiecie_pu=1.0, moc_pu=0.5, scr=10.0, rodzaj_zdarzenia="zwarcie_3f")

TRESC_PROFILU_2024 = {
    "utrzymanie_pracy_przy_zapadzie_u_pu": 0.15,
    "czas_utrzymania_s": 0.25,
    "prad_biernego_wsparcia_k": 2.0,
}


def _scenariusz(
    *, migawka: str = "migawka-smib-c1", punkt: PunktPracy = PUNKT_W_ZAKRESIE
) -> TozsamoscScenariusza:
    return TozsamoscScenariusza(
        odcisk_migawki=migawka,
        punkt_pracy=punkt,
        konfiguracja=KONFIGURACJA,
        czas_koncowy_s=2.0,
        parametry={"czas_trwania_zwarcia_s": 0.12},
    )


def _przypadki(*nazwy: str, migawka: str = "migawka-smib-c1") -> tuple[PrzypadekWalidacji, ...]:
    return tuple(
        PrzypadekWalidacji(nazwa=nazwa, scenariusz=_scenariusz(migawka=migawka)) for nazwa in nazwy
    )


def _metryka(
    blad: float = 1.0e-8, *, nazwa: str = "maksymalne odchylenie kąta wirnika"
) -> MetrykiAkceptacji:
    return MetrykiAkceptacji(nazwa=nazwa, maks_blad_wzgledny=1.0e-4, zmierzony_blad_wzgledny=blad)


def _profil(
    *, wersja: str = "2024.1", tresc: dict[str, float] | None = None
) -> TozsamoscProfiluWymagan:
    return TozsamoscProfiluWymagan(
        identyfikator="NC RfG / enea",
        wersja=wersja,
        obowiazuje_od="2024-01-01",
        tresc=dict(TRESC_PROFILU_2024 if tresc is None else tresc),
    )


def _model(
    *, odcisk_kodu: str = "kod-a", wersja: str = "1", **nadpisania: float
) -> TozsamoscModelu:
    parametry = {"h_s": 4.0, "xd_prim_pu": 0.30, "d_tlumienie": 0.0}
    parametry.update(nadpisania)
    return TozsamoscModelu.prosta(
        klasa="MaszynaSynchroniczna4Rzedu",
        wersja=wersja,
        odcisk_kodu=odcisk_kodu,
        parametry=parametry,
    )


def _zakres() -> ZakresWalidacji:
    return ZakresWalidacji(
        napiecie_pu=(0.90, 1.10),
        moc_pu=(0.20, 0.80),
        scr=(3.0, 20.0),
        rodzaje_zdarzen=frozenset({"zwarcie_3f", "skok_obciazenia"}),
    )


def _dowod(model: TozsamoscModelu | None = None, blad: float = 1.0e-8) -> DowodWalidacji:
    return DowodWalidacji(
        model=model or _model(),
        wyrocznia=ANDES,
        zakres=_zakres(),
        metryki=(_metryka(blad),),
        przypadki=_przypadki("SMIB H=2", "SMIB H=4", "SMIB H=8"),
    )


def test_model_bez_dowodu_nie_jest_przydatny_dowodowo() -> None:
    """Domyślny stan to BRAK dowodu — fail closed, jak w produkcyjnym D-00."""
    orzeczenie = RejestrDowodow().orzeknij(_model(), PUNKT_W_ZAKRESIE)
    assert orzeczenie.stopien is StopienDowodowy.MODEL_NIEZWALIDOWANY
    assert orzeczenie.przydatny_dowodowo is False
    assert "Brak zapisanego dowodu" in orzeczenie.powody[0]


def test_model_zwalidowany_w_zakresie_jest_przydatny_dowodowo() -> None:
    """Kierunek przeciwny: model z dowodem MUSI go dostać, inaczej rejestr blokuje wszystko."""
    rejestr = RejestrDowodow()
    rejestr.zarejestruj(_dowod())
    orzeczenie = rejestr.orzeknij(_model(), PUNKT_W_ZAKRESIE)
    assert orzeczenie.stopien is StopienDowodowy.ZWALIDOWANA_SYMULACJA
    assert orzeczenie.przydatny_dowodowo is True
    assert "ANDES 2.0.0" in orzeczenie.powody[0]


@pytest.mark.parametrize(
    ("punkt", "fragment"),
    [
        (
            PunktPracy(napiecie_pu=1.30, moc_pu=0.5, scr=10.0, rodzaj_zdarzenia="zwarcie_3f"),
            "napięcie",
        ),
        (
            PunktPracy(napiecie_pu=1.0, moc_pu=0.95, scr=10.0, rodzaj_zdarzenia="zwarcie_3f"),
            "moc",
        ),
        (
            PunktPracy(napiecie_pu=1.0, moc_pu=0.5, scr=1.5, rodzaj_zdarzenia="zwarcie_3f"),
            "SCR",
        ),
        (
            PunktPracy(napiecie_pu=1.0, moc_pu=0.5, scr=10.0, rodzaj_zdarzenia="black_start"),
            "zdarzenie",
        ),
    ],
)
def test_poza_zakresem_walidacji_dowod_znika(punkt: PunktPracy, fragment: str) -> None:
    """Dowód jest RELACJĄ model–zakres–punkt, nie atrybutem modelu.

    To jest sedno prototypu: ten sam, w pełni zwalidowany model przestaje być
    przydatny dowodowo, gdy pytamy o punkt pracy poza zbadanym obszarem —
    automatycznie, bez niczyjej decyzji i bez pamiętania o tym.
    """
    rejestr = RejestrDowodow()
    rejestr.zarejestruj(_dowod())
    orzeczenie = rejestr.orzeknij(_model(), punkt)
    assert orzeczenie.przydatny_dowodowo is False
    assert any(fragment in p for p in orzeczenie.powody), orzeczenie.powody


def test_wymiar_niebadany_nie_znaczy_dowolny() -> None:
    """„Nie badano” to brak pokrycia, nie zgoda milcząca."""
    rejestr = RejestrDowodow()
    dowod = _dowod()
    rejestr.zarejestruj(
        replace(
            dowod,
            zakres=ZakresWalidacji(
                napiecie_pu=(0.9, 1.1), rodzaje_zdarzen=frozenset({"zwarcie_3f"})
            ),
        )
    )
    orzeczenie = rejestr.orzeknij(_model(), PUNKT_W_ZAKRESIE)
    assert orzeczenie.przydatny_dowodowo is False
    assert any("nie był walidowany w tym wymiarze" in p for p in orzeczenie.powody)


def test_zmiana_parametru_uniewaznia_dowod() -> None:
    """Rejestr indeksuje ODCISKIEM, nie nazwą — cicha zmiana stałej gubi dowód.

    Bez tego „ten sam model” obejmowałby też model po zmianie bezwładności,
    czyli dowód przenosiłby się na coś, czego nie zmierzono.
    """
    rejestr = RejestrDowodow()
    rejestr.zarejestruj(_dowod(_model(h_s=4.0)))
    assert rejestr.orzeknij(_model(h_s=4.0), PUNKT_W_ZAKRESIE).przydatny_dowodowo is True
    assert rejestr.orzeknij(_model(h_s=4.5), PUNKT_W_ZAKRESIE).przydatny_dowodowo is False


def test_niespelniona_metryka_odbiera_stopien_dowodowy() -> None:
    """Walidacja wykonana ≠ walidacja zdana."""
    rejestr = RejestrDowodow()
    rejestr.zarejestruj(_dowod(blad=1.0e-2))
    orzeczenie = rejestr.orzeknij(_model(), PUNKT_W_ZAKRESIE)
    assert orzeczenie.przydatny_dowodowo is False
    assert any("NIE są spełnione" in p for p in orzeczenie.powody)
    assert any(
        "odchylenie kąta wirnika" in p for p in orzeczenie.powody
    ), "komunikat musi nazwać metrykę, która nie przeszła"


def test_dowod_bez_przypadkow_jest_odrzucany() -> None:
    """Pułapka `all([]) == True` — pusta walidacja nie może być dowodem.

    Ta sama pułapka została znaleziona w produkcyjnym `NcRfgComplianceReport`
    podczas wdrażania D-00; tutaj jest zamknięta konstrukcyjnie.
    """
    with pytest.raises(ValueError, match="nieobecność dowodu"):
        DowodWalidacji(
            model=_model(),
            wyrocznia=ANDES,
            zakres=ZakresWalidacji(napiecie_pu=(0.9, 1.1)),
            metryki=(_metryka(),),
            przypadki=(),
        )


def test_dowod_bez_metryk_jest_odrzucany() -> None:
    with pytest.raises(ValueError, match="bez metryk akceptacji"):
        DowodWalidacji(
            model=_model(),
            wyrocznia=ANDES,
            zakres=ZakresWalidacji(napiecie_pu=(0.9, 1.1)),
            metryki=(),
            przypadki=_przypadki("SMIB"),
        )


def test_orzeczenie_zawsze_niesie_uzasadnienie() -> None:
    """Odmowa bez powodu jest bezużyteczna dla projektanta — i nieweryfikowalna."""
    rejestr = RejestrDowodow()
    rejestr.zarejestruj(_dowod())
    for punkt in (PUNKT_W_ZAKRESIE, PunktPracy(napiecie_pu=1.4, moc_pu=0.5, scr=10.0)):
        orzeczenie = rejestr.orzeknij(_model(), punkt)
        assert orzeczenie.powody, "orzeczenie bez powodów"
        assert all(p.strip() for p in orzeczenie.powody)


def test_odcisk_dowodu_zalezy_od_wersji_wyroczni() -> None:
    """Nowa wersja narzędzia wzorcowego zmienia odcisk — dowód wymaga przeglądu."""
    a = _dowod()
    b = replace(a, wyrocznia=Wyrocznia(nazwa="ANDES", wersja="2.1.0", metoda="wartości własne"))
    assert a.odcisk != b.odcisk


# ---------------------------------------------------------------------------
# ROZSZERZENIE PO PRZEGLĄDZIE: cztery osie tożsamości, wycofanie, wiele zakresów
# ---------------------------------------------------------------------------


def test_zmiana_KODU_przy_tych_samych_parametrach_uniewaznia_dowod() -> None:
    """„Ten sam parametr + nowy kod = stary dowód nadal ważny” — to była luka.

    Przepisanie równania stojana bez zmiany ani jednej stałej jest zmianą, po
    której dowód musi wygasnąć. Jeden wspólny odcisk parametrów tego nie łapał.
    """
    rejestr = RejestrDowodow()
    rejestr.zarejestruj(_dowod(_model(odcisk_kodu="kod-a")))
    assert rejestr.orzeknij(_model(odcisk_kodu="kod-a"), PUNKT_W_ZAKRESIE).przydatny_dowodowo
    orzeczenie = rejestr.orzeknij(_model(odcisk_kodu="kod-b"), PUNKT_W_ZAKRESIE)
    assert orzeczenie.przydatny_dowodowo is False
    assert any("implementacja" in p for p in orzeczenie.powody), orzeczenie.powody


def test_ten_sam_identyfikator_publiczny_inny_kod_jest_NAZWANY() -> None:
    """Najgroźniejszy przypadek: wersja publiczna bez zmian, kod inny.

    Komunikat musi to powiedzieć wprost, bo inaczej inżynier widzi „brak dowodu”
    dla modelu, który „przecież jest ten sam”.
    """
    rejestr = RejestrDowodow()
    rejestr.zarejestruj(_dowod(_model(odcisk_kodu="kod-a", wersja="1")))
    orzeczenie = rejestr.orzeknij(_model(odcisk_kodu="kod-b", wersja="1"), PUNKT_W_ZAKRESIE)
    assert any(
        "ten sam identyfikator publiczny, inny kod" in p for p in orzeczenie.powody
    ), orzeczenie.powody


def test_zmiana_jednej_stalej_regulatora_uniewaznia_dowod() -> None:
    """Parametr regulatora to też parametr — nie ma parametrów „nieistotnych”."""
    rejestr = RejestrDowodow()
    rejestr.zarejestruj(_dowod(_model()))
    zmieniony = _model(k_a=200.0)
    assert rejestr.orzeknij(zmieniony, PUNKT_W_ZAKRESIE).przydatny_dowodowo is False


def test_wycofanie_dowodu_odbiera_stopien_i_podaje_powod() -> None:
    """Błąd w wyroczni zdarza się częściej niż zmiana modelu — musi dać się cofnąć."""
    rejestr = RejestrDowodow()
    dowod = _dowod()
    rejestr.zarejestruj(dowod)
    assert rejestr.orzeknij(_model(), PUNKT_W_ZAKRESIE).przydatny_dowodowo is True
    assert rejestr.wycofaj(dowod.odcisk, "błąd w skrypcie porównawczym wyroczni") is True
    orzeczenie = rejestr.orzeknij(_model(), PUNKT_W_ZAKRESIE)
    assert orzeczenie.przydatny_dowodowo is False
    assert any("WYCOFANY" in p for p in orzeczenie.powody)
    assert any("skrypcie porównawczym" in p for p in orzeczenie.powody)


def test_wycofanie_bez_powodu_jest_odrzucane() -> None:
    with pytest.raises(ValueError, match="powód jest częścią wycofania"):
        DowodWalidacji(
            model=_model(),
            wyrocznia=ANDES,
            zakres=ZakresWalidacji(napiecie_pu=(0.9, 1.1)),
            metryki=(_metryka(),),
            przypadki=_przypadki("SMIB"),
            wycofany=True,
        )


def test_dwa_zestawy_benchmarkow_o_roznych_zakresach() -> None:
    """Model może mieć wiele dowodów; wystarczy jeden pokrywający punkt SAMODZIELNIE."""
    rejestr = RejestrDowodow()
    model = _model()
    for scr in ((3.0, 8.0), (8.0, 25.0)):
        rejestr.zarejestruj(
            DowodWalidacji(
                model=model,
                wyrocznia=ANDES,
                zakres=ZakresWalidacji(
                    napiecie_pu=(0.9, 1.1),
                    moc_pu=(0.2, 0.8),
                    scr=scr,
                    rodzaje_zdarzen=frozenset({"zwarcie_3f"}),
                ),
                metryki=(_metryka(),),
                przypadki=_przypadki(f"SMIB SCR {scr[0]}-{scr[1]}"),
            )
        )
    for scr_punktu in (5.0, 20.0):
        punkt = PunktPracy(
            napiecie_pu=1.0, moc_pu=0.5, scr=scr_punktu, rodzaj_zdarzenia="zwarcie_3f"
        )
        assert rejestr.orzeknij(model, punkt).przydatny_dowodowo is True, scr_punktu


def test_zakresy_NIE_sa_sklejane_w_jeden_wiekszy() -> None:
    """Dwa pokrycia 3–8 i 12–25 NIE dają pokrycia 8–12.

    Sklejanie byłoby ekstrapolacją między zakresami — twierdzeniem, którego
    nikt nie zmierzył. To jest różnica między sumą pokryć a sumą przedziałów.
    """
    rejestr = RejestrDowodow()
    model = _model()
    for scr in ((3.0, 8.0), (12.0, 25.0)):
        rejestr.zarejestruj(
            DowodWalidacji(
                model=model,
                wyrocznia=ANDES,
                zakres=ZakresWalidacji(
                    napiecie_pu=(0.9, 1.1),
                    moc_pu=(0.2, 0.8),
                    scr=scr,
                    rodzaje_zdarzen=frozenset({"zwarcie_3f"}),
                ),
                metryki=(_metryka(),),
                przypadki=_przypadki(f"SMIB {scr}"),
            )
        )
    luka = PunktPracy(napiecie_pu=1.0, moc_pu=0.5, scr=10.0, rodzaj_zdarzenia="zwarcie_3f")
    orzeczenie = rejestr.orzeknij(model, luka)
    assert orzeczenie.przydatny_dowodowo is False
    assert any("Żaden z 2" in p for p in orzeczenie.powody), orzeczenie.powody


def test_zmiana_redakcji_wymagania_uniewaznia_dowod() -> None:
    """Model zwalidowany wobec profilu z 2024 nie dowodzi wymagania z 2026."""
    profil_2024 = _profil(wersja="2024.1")
    profil_2026 = TozsamoscProfiluWymagan(
        identyfikator="NC RfG / enea",
        wersja="2026.1",
        obowiazuje_od="2026-01-01",
        tresc={**TRESC_PROFILU_2024, "prad_biernego_wsparcia_k": 4.0},
    )
    rejestr = RejestrDowodow()
    rejestr.zarejestruj(replace(_dowod(), profil_wymagan=profil_2024))
    assert (
        rejestr.orzeknij(_model(), PUNKT_W_ZAKRESIE, profil=profil_2024).przydatny_dowodowo is True
    )
    orzeczenie = rejestr.orzeknij(_model(), PUNKT_W_ZAKRESIE, profil=profil_2026)
    assert orzeczenie.przydatny_dowodowo is False
    assert any("2024.1" in p and "2026.1" in p for p in orzeczenie.powody)


def test_dowod_bez_profilu_nie_odpowiada_na_pytanie_o_profil() -> None:
    """Walidacja czysto fizyczna nie jest automatycznie dowodem wobec normy."""
    rejestr = RejestrDowodow()
    rejestr.zarejestruj(_dowod())
    profil = TozsamoscProfiluWymagan(
        identyfikator="NC RfG / pse",
        wersja="2026.1",
        obowiazuje_od="2026-01-01",
        tresc=TRESC_PROFILU_2024,
    )
    orzeczenie = rejestr.orzeknij(_model(), PUNKT_W_ZAKRESIE, profil=profil)
    assert orzeczenie.przydatny_dowodowo is False
    assert any("nie jest powiązany z żadną redakcją" in p for p in orzeczenie.powody)


def test_odmowa_wymienia_powody_WSZYSTKICH_kandydatow() -> None:
    """Komunikat o pierwszym napotkanym problemie ukrywa pozostałe."""
    rejestr = RejestrDowodow()
    model = _model()
    rejestr.zarejestruj(_dowod(model, blad=1.0e-2))
    rejestr.zarejestruj(
        DowodWalidacji(
            model=model,
            wyrocznia=ANDES,
            zakres=ZakresWalidacji(napiecie_pu=(0.5, 0.6)),
            metryki=(_metryka(),),
            przypadki=_przypadki("waski zakres"),
        )
    )
    orzeczenie = rejestr.orzeknij(model, PUNKT_W_ZAKRESIE)
    assert orzeczenie.przydatny_dowodowo is False
    assert len(orzeczenie.powody) >= 3
    assert any("metryki" in p for p in orzeczenie.powody)
    assert any("poza zakresem" in p for p in orzeczenie.powody)


# ---------------------------------------------------------------------------
# A1 — ODCISK DOWODU MUSI OBEJMOWAĆ CAŁĄ JEGO TREŚĆ
# ---------------------------------------------------------------------------


def _mutacje_dowodu() -> dict[str, tuple[DowodWalidacji, DowodWalidacji]]:
    """Dla KAŻDEGO pola dowodu: para (bazowy, zmieniony w tym polu).

    Klucze tego słownika są porównywane z polami dataklasy w
    ``test_mutacje_pokrywaja_KAZDE_pole_dowodu`` — pole dołożone w przyszłości bez
    mutacji zapali test, zamiast cicho wypaść z pokrycia.
    """
    baza = _dowod()
    wycofany = replace(baza, wycofany=True, powod_wycofania_pl="błąd wyroczni")
    return {
        "model": (baza, replace(baza, model=_model(h_s=4.5))),
        "wyrocznia": (
            baza,
            replace(baza, wyrocznia=Wyrocznia(nazwa="PSCAD", wersja="2.0.0", metoda="EMT")),
        ),
        "zakres": (baza, replace(baza, zakres=replace(_zakres(), scr=(0.1, 100.0)))),
        "metryki": (
            baza,
            replace(baza, metryki=(_metryka(nazwa="RMS błędu napięcia"),)),
        ),
        "przypadki": (baza, replace(baza, przypadki=_przypadki("SMIB H=2", "SMIB H=4"))),
        "profil_wymagan": (baza, replace(baza, profil_wymagan=_profil())),
        "wycofany": (baza, wycofany),
        "powod_wycofania_pl": (
            wycofany,
            replace(wycofany, powod_wycofania_pl="błąd w mapowaniu parametrów"),
        ),
    }


def test_mutacje_pokrywaja_KAZDE_pole_dowodu() -> None:
    """Pokrycie liczone z DEFINICJI dataklasy, nie z listy wpisanej w teście."""
    assert set(_mutacje_dowodu()) == {p.name for p in dataclasses.fields(DowodWalidacji)}


@pytest.mark.parametrize("pole", sorted(_mutacje_dowodu()))
def test_zmiana_dowolnego_pola_dowodu_zmienia_odcisk(pole: str) -> None:
    """Odcisk musi obejmować SEMANTYCZNĄ TREŚĆ dowodu, a nie wybrane sześć pozycji."""
    bazowy, zmieniony = _mutacje_dowodu()[pole]
    assert bazowy.odcisk != zmieniony.odcisk, f"pole `{pole}` wypada z odcisku dowodu"


def test_postac_kanoniczna_dowodu_zawiera_KOMPLET_pol() -> None:
    """Bezpiecznik na PRZYSZŁOŚĆ: nowe pole dowodu wchodzi do odcisku samo.

    To jest naprawa KLASY defektu, nie instancji: poprzedni odcisk składał się z
    ręcznie wypisanych pozycji, więc każde pole dołożone później wypadało z
    tożsamości po cichu (dokładnie tak wypadł ``zakres``).
    """
    postac = postac_kanoniczna(_dowod())
    assert set(postac["@pola"]) == {p.name for p in dataclasses.fields(DowodWalidacji)}


def test_rozny_ZAKRES_daje_rozny_odcisk_dowodu() -> None:
    """Defekt potwierdzony w audycie: zakres (0,9–1,1) i (0,1–1,3) miały ten sam odcisk."""
    waski = replace(_dowod(), zakres=replace(_zakres(), napiecie_pu=(0.90, 1.10)))
    szeroki = replace(_dowod(), zakres=replace(_zakres(), napiecie_pu=(0.10, 1.30)))
    assert waski.odcisk != szeroki.odcisk


@pytest.mark.parametrize(
    "zmiana",
    [
        {"napiecie_pu": (0.80, 1.10)},
        {"moc_pu": (0.0, 1.0)},
        {"scr": (1.0, 50.0)},
        {"rodzaje_zdarzen": frozenset({"zwarcie_3f"})},
    ],
)
def test_kazdy_wymiar_zakresu_wchodzi_do_odcisku(zmiana: dict[str, object]) -> None:
    """Iloczyn cech, nie przykład z karty: KAŻDA oś osobno."""
    bazowy = _dowod()
    zmieniony = replace(bazowy, zakres=replace(_zakres(), **zmiana))  # type: ignore[arg-type]
    assert bazowy.odcisk != zmieniony.odcisk


def test_kolejnosc_rodzajow_zdarzen_nie_zmienia_odcisku() -> None:
    """Zbiór zdarzeń ma porządek deterministyczny — inaczej odcisk nie jest odciskiem."""
    a = replace(
        _dowod(), zakres=replace(_zakres(), rodzaje_zdarzen=frozenset({"zwarcie_3f", "skok"}))
    )
    b = replace(
        _dowod(), zakres=replace(_zakres(), rodzaje_zdarzen=frozenset({"skok", "zwarcie_3f"}))
    )
    assert a.odcisk == b.odcisk


def test_podmiana_metryki_o_TYCH_SAMYCH_liczbach_zmienia_odcisk() -> None:
    """Defekt potwierdzony: z metryk odcisk brał dwie liczby i gubił, CO zmierzono.

    „Maksymalne odchylenie kąta ≤ 1e-4” i „RMS błędu napięcia ≤ 1e-4” to dwa
    różne twierdzenia o modelu — przy tych samych liczbach były nieodróżnialne.
    """
    kat = replace(_dowod(), metryki=(_metryka(nazwa="maksymalne odchylenie kąta wirnika"),))
    napiecie = replace(_dowod(), metryki=(_metryka(nazwa="RMS błędu napięcia"),))
    assert kat.odcisk != napiecie.odcisk


def test_metryka_bez_nazwy_jest_odrzucana() -> None:
    with pytest.raises(ValueError, match="bez nazwy"):
        MetrykiAkceptacji(nazwa="  ", maks_blad_wzgledny=1e-4, zmierzony_blad_wzgledny=1e-8)


def test_odcisk_dowodu_siega_w_ZAGNIEZDZONE_parametry_modelu() -> None:
    """Tożsamość modelu wchodzi do dowodu CAŁA, łącznie ze strukturami zagnieżdżonymi."""
    plytki = _dowod(_model(**{"h_s": 4.0}))
    glebszy = _dowod(
        TozsamoscModelu.prosta(
            klasa="MaszynaSynchroniczna4Rzedu",
            wersja="1",
            odcisk_kodu="kod-a",
            parametry={"h_s": 4.0, "xd_prim_pu": 0.30, "d_tlumienie": 0.0, "avr": {"k_a": 200.0}},
        )
    )
    assert plytki.odcisk != glebszy.odcisk


def test_kolejnosc_przypadkow_nie_zmienia_odcisku() -> None:
    """Ten sam zestaw przypadków podany w innej kolejności to TEN SAM dowód."""
    a = replace(_dowod(), przypadki=_przypadki("SMIB H=2", "SMIB H=4", "SMIB H=8"))
    b = replace(_dowod(), przypadki=_przypadki("SMIB H=8", "SMIB H=2", "SMIB H=4"))
    assert a.odcisk == b.odcisk


def test_powtorzony_przypadek_jest_odrzucany() -> None:
    """Dowód „na 10 przypadkach”, gdzie 10 razy występuje ten sam, liczy powtórzenia."""
    with pytest.raises(ValueError, match="wielokrotnie"):
        replace(_dowod(), przypadki=_przypadki("SMIB H=4", "SMIB H=4"))


# ---------------------------------------------------------------------------
# A2 — BRAK DANYCH NIE JEST POKRYCIEM (fail-closed)
# ---------------------------------------------------------------------------


def test_nieznane_SCR_przy_zdefiniowanym_zakresie_to_BRAK_POKRYCIA() -> None:
    """Defekt potwierdzony: ``if wartosc is None: return None`` = UNKNOWN → covered.

    Dowód obowiązuje dla SCR 3–20. Punkt pracy o NIEZNANYM SCR nie jest punktem
    w tym zakresie — jest punktem, o którym nie wiadomo, gdzie leży.
    """
    rejestr = RejestrDowodow()
    rejestr.zarejestruj(_dowod())
    bez_scr = PunktPracy(napiecie_pu=1.0, moc_pu=0.5, scr=None, rodzaj_zdarzenia="zwarcie_3f")
    orzeczenie = rejestr.orzeknij(_model(), bez_scr)
    assert orzeczenie.przydatny_dowodowo is False
    assert any(
        "SCR" in p and "nie można potwierdzić pokrycia" in p for p in orzeczenie.powody
    ), orzeczenie.powody


@pytest.mark.parametrize(
    ("brakujaca_os", "etykieta"),
    [
        ("napiecie_pu", "napięcie"),
        ("moc_pu", "moc"),
        ("scr", "SCR"),
        ("rodzaj_zdarzenia", "rodzaj zdarzenia"),
    ],
)
def test_nieznana_wspolrzedna_KAZDEJ_osi_odbiera_pokrycie(brakujaca_os: str, etykieta: str) -> None:
    """Iloczyn cech: fail-open nie może zostać w żadnym wymiarze.

    Naprawa jednej osi (tej z audytu) zostawiłaby defekt w trzech pozostałych —
    to jest dokładnie błąd „instancja zamiast klasy”.
    """
    punkt = dataclasses.replace(PUNKT_W_ZAKRESIE, **{brakujaca_os: None})
    braki = _zakres().braki_pokrycia(punkt)
    assert any(etykieta in b and "nie można potwierdzić pokrycia" in b for b in braki), (
        etykieta,
        braki,
    )


def test_punkt_pracy_bez_zadnej_wspolrzednej_nie_jest_pokryty() -> None:
    """Pusty punkt pracy nie może „pasować do wszystkiego”."""
    braki = _zakres().braki_pokrycia(PunktPracy())
    assert len(braki) == len(dataclasses.fields(ZakresWalidacji))


def test_wymiar_niebadany_przy_nieznanej_wspolrzednej_tez_nie_jest_pokryciem() -> None:
    """Dwa braki naraz (dowód nie badał osi + punkt jej nie zna) to nadal brak."""
    zakres = ZakresWalidacji(napiecie_pu=(0.9, 1.1), rodzaje_zdarzen=frozenset({"zwarcie_3f"}))
    punkt = PunktPracy(napiecie_pu=1.0, rodzaj_zdarzenia="zwarcie_3f")
    braki = zakres.braki_pokrycia(punkt)
    assert any("moc" in b for b in braki)
    assert any("SCR" in b for b in braki)


def test_punkt_w_pelni_znany_i_w_zakresie_nie_ma_brakow() -> None:
    """Kontrola kierunku przeciwnego: fail-closed nie może blokować wszystkiego."""
    assert _zakres().braki_pokrycia(PUNKT_W_ZAKRESIE) == ()


def test_nowa_OS_zakresu_bez_deklaracji_jest_bledem() -> None:
    """Bezpiecznik na przyszłość: wymiar bez deklaracji poszerzałby dowód po cichu."""

    @dataclass(frozen=True)
    class ZakresZZapomnianaOsia(ZakresWalidacji):
        temperatura_c: tuple[float, float] | None = None

    with pytest.raises(NiezadeklarowanaOsZakresuError, match="temperatura_c"):
        ZakresZZapomnianaOsia(napiecie_pu=(0.9, 1.1)).braki_pokrycia(PUNKT_W_ZAKRESIE)


def test_os_wskazujaca_NIEISTNIEJACY_atrybut_punktu_jest_bledem() -> None:
    """Deklaracja osi rozjechana z punktem pracy = wymiar niesprawdzalny."""

    @dataclass(frozen=True)
    class ZakresZeZlymWiazaniem(ZakresWalidacji):
        temperatura_c: tuple[float, float] | None = os_zakresu(
            etykieta_pl="temperatura",
            atrybut_punktu="temperatura_c",
            rodzaj=RodzajOsi.PRZEDZIAL,
            default=None,
        )

    with pytest.raises(NiezadeklarowanaOsZakresuError, match="temperatura_c"):
        ZakresZeZlymWiazaniem(napiecie_pu=(0.9, 1.1)).braki_pokrycia(PUNKT_W_ZAKRESIE)


def test_odwrocony_przedzial_zakresu_jest_odrzucany() -> None:
    """Zakres [1,1; 0,9] nie obejmuje żadnego punktu — to zapis błędny, nie pusty."""
    with pytest.raises(ValueError, match="odwrócony"):
        ZakresWalidacji(napiecie_pu=(1.1, 0.9))


# ---------------------------------------------------------------------------
# A3 — TOŻSAMOŚĆ TREŚCI PROFILU WYMAGAŃ
# ---------------------------------------------------------------------------


def test_zmiana_TRESCI_profilu_przy_tej_samej_wersji_odbiera_zgodnosc() -> None:
    """Operator poprawia próg w dokumencie, zostawiając etykietę „2024.1”.

    Bez odcisku treści dowód wystawiony wobec starej redakcji dalej wyglądałby na
    ważny — etykieta wersji jest deklaracją człowieka, nie tożsamością treści.
    """
    stary = _profil()
    poprawiony = _profil(tresc={**TRESC_PROFILU_2024, "czas_utrzymania_s": 0.60})
    assert stary.wersja == poprawiony.wersja
    assert stary.odcisk_tresci != poprawiony.odcisk_tresci

    rejestr = RejestrDowodow()
    rejestr.zarejestruj(replace(_dowod(), profil_wymagan=stary))
    assert rejestr.orzeknij(_model(), PUNKT_W_ZAKRESIE, profil=stary).przydatny_dowodowo is True

    orzeczenie = rejestr.orzeknij(_model(), PUNKT_W_ZAKRESIE, profil=poprawiony)
    assert orzeczenie.przydatny_dowodowo is False
    assert any("INNĄ TREŚĆ" in p for p in orzeczenie.powody), orzeczenie.powody


def test_profil_bez_tresci_jest_odrzucany() -> None:
    """Sama etykieta wersji nie jest profilem — nie da się jej porównać z modelem."""
    with pytest.raises(ValueError, match="bez treści"):
        TozsamoscProfiluWymagan(
            identyfikator="NC RfG / enea", wersja="2024.1", obowiazuje_od="2024-01-01", tresc={}
        )


def test_zmiana_tresci_profilu_zmienia_odcisk_dowodu() -> None:
    """Profil wchodzi do odcisku dowodu CAŁY, razem z treścią."""
    a = replace(_dowod(), profil_wymagan=_profil())
    b = replace(
        _dowod(),
        profil_wymagan=_profil(tresc={**TRESC_PROFILU_2024, "czas_utrzymania_s": 0.60}),
    )
    assert a.odcisk != b.odcisk


def test_tryb_regulacyjny_bez_profilu_jest_FAIL_CLOSED() -> None:
    """Pytanie „czy to dowodzi zgodności” bez redakcji wymagań nie ma treści."""
    rejestr = RejestrDowodow()
    rejestr.zarejestruj(replace(_dowod(), profil_wymagan=_profil()))
    orzeczenie = rejestr.orzeknij(
        _model(), PUNKT_W_ZAKRESIE, profil=None, tryb=TrybOrzekania.REGULACYJNY
    )
    assert orzeczenie.przydatny_dowodowo is False
    assert any("Brak profilu NIE jest zgodnością" in p for p in orzeczenie.powody)


def test_tryb_regulacyjny_ze_wskazanym_profilem_dziala() -> None:
    """Kontrola kierunku przeciwnego — tryb regulacyjny nie blokuje wszystkiego."""
    rejestr = RejestrDowodow()
    profil = _profil()
    rejestr.zarejestruj(replace(_dowod(), profil_wymagan=profil))
    orzeczenie = rejestr.orzeknij(
        _model(), PUNKT_W_ZAKRESIE, profil=profil, tryb=TrybOrzekania.REGULACYJNY
    )
    assert orzeczenie.przydatny_dowodowo is True


def test_tryb_fizyczny_bez_profilu_nadal_odpowiada() -> None:
    """Pytanie o fizykę wolno zadać bez normy — inaczej rejestr byłby bezużyteczny."""
    rejestr = RejestrDowodow()
    rejestr.zarejestruj(_dowod())
    assert rejestr.orzeknij(_model(), PUNKT_W_ZAKRESIE).przydatny_dowodowo is True


# ---------------------------------------------------------------------------
# A5 — PRZYPADEK WALIDACYJNY WSKAZUJE SCENARIUSZ
# ---------------------------------------------------------------------------


def test_zmiana_MIGAWKI_przypadku_zmienia_odcisk_dowodu() -> None:
    """Ten sam benchmark policzony na innej sieci to inny dowód."""
    a = replace(_dowod(), przypadki=_przypadki("SMIB H=4", migawka="migawka-1"))
    b = replace(_dowod(), przypadki=_przypadki("SMIB H=4", migawka="migawka-2"))
    assert a.odcisk != b.odcisk


def test_zmiana_KONFIGURACJI_SOLVERA_przypadku_zmienia_odcisk_dowodu() -> None:
    """Różnica wyniku bywa różnicą nastaw solvera, nie fizyki — musi być w tożsamości."""
    bazowy = _dowod()
    inny_krok = replace(
        bazowy,
        przypadki=(
            PrzypadekWalidacji(
                nazwa="SMIB H=4",
                scenariusz=TozsamoscScenariusza(
                    odcisk_migawki="migawka-smib-c1",
                    punkt_pracy=PUNKT_W_ZAKRESIE,
                    konfiguracja=dataclasses.replace(KONFIGURACJA, krok_s=0.0005),
                    czas_koncowy_s=2.0,
                    parametry={"czas_trwania_zwarcia_s": 0.12},
                ),
            ),
        ),
    )
    ten_sam_krok = replace(bazowy, przypadki=_przypadki("SMIB H=4"))
    assert inny_krok.odcisk != ten_sam_krok.odcisk


def test_przypadek_bez_nazwy_jest_odrzucany() -> None:
    with pytest.raises(ValueError, match="musi mieć nazwę"):
        PrzypadekWalidacji(nazwa="   ", scenariusz=_scenariusz())


def test_ten_sam_benchmark_na_dwoch_scenariuszach_to_dwa_przypadki() -> None:
    """Nazwa nie jest tożsamością przypadku — scenariusz jest jej częścią."""
    dowod = replace(
        _dowod(),
        przypadki=(
            PrzypadekWalidacji(nazwa="SMIB H=4", scenariusz=_scenariusz(migawka="migawka-1")),
            PrzypadekWalidacji(nazwa="SMIB H=4", scenariusz=_scenariusz(migawka="migawka-2")),
        ),
    )
    assert len(dowod.przypadki) == 2


# ---------------------------------------------------------------------------
# WPIĘCIE A4 i A6 W ŚCIEŻKĘ REJESTRU — tożsamość liczona z REALNYCH obiektów
# ---------------------------------------------------------------------------


def _zespol(k_a: float) -> ZespolSynchroniczny:
    return ZespolSynchroniczny(
        maszyna=MaszynaSynchroniczna4Rzedu(ref="G1", szyna="B1", h_s=4.0),
        avr=RegulatorNapiecia(k_a=k_a),
    )


def _tozsamosc(urzadzenie: object) -> TozsamoscModelu:
    return TozsamoscModelu.z_urzadzenia(urzadzenie, wersja="1", odcisk_kodu="kod-a")


def _dowod_dla(urzadzenie: object, *, migawka: str = "migawka-smib-c1") -> DowodWalidacji:
    return DowodWalidacji(
        model=_tozsamosc(urzadzenie),
        wyrocznia=ANDES,
        zakres=_zakres(),
        metryki=(_metryka(),),
        przypadki=_przypadki("SMIB H=4", migawka=migawka),
    )


def test_zmiana_stalej_REGULATORA_realnego_urzadzenia_gubi_dowod_w_rejestrze() -> None:
    """A4 wpięte w ścieżkę rejestru, nie tylko w test jednostkowy odcisku.

    ``k_a`` siedzi w zagnieżdżonej dataklasie AVR-a. Przy płaskim odcisku
    parametrów zespół z ``k_a=400`` byłby dla rejestru TYM SAMYM modelem co
    ``k_a=200`` — i dziedziczyłby cudzy dowód walidacji.
    """
    rejestr = RejestrDowodow()
    rejestr.zarejestruj(_dowod_dla(_zespol(200.0)))
    assert rejestr.orzeknij(_tozsamosc(_zespol(200.0)), PUNKT_W_ZAKRESIE).przydatny_dowodowo is True
    orzeczenie = rejestr.orzeknij(_tozsamosc(_zespol(400.0)), PUNKT_W_ZAKRESIE)
    assert orzeczenie.przydatny_dowodowo is False
    assert any("parametry" in p for p in orzeczenie.powody), orzeczenie.powody


def test_podmiana_STRATEGII_ogranicznika_GFM_gubi_dowod_w_rejestrze() -> None:
    """Strategia ograniczenia prądu jest OBIEKTEM — i jest częścią modelu."""
    przez_impedancje = FalownikGFM(
        ref="GFM1",
        szyna="B1",
        ogranicznik=KandydatOgraniczeniaImpedancjaWirtualna(i_max_pu=1.2, k_impedancji_pu=1.0),
    )
    przez_nasycenie = FalownikGFM(
        ref="GFM1", szyna="B1", ogranicznik=KandydatOgraniczeniaNasycenieZadania(i_max_pu=1.2)
    )
    rejestr = RejestrDowodow()
    rejestr.zarejestruj(_dowod_dla(przez_impedancje))
    assert rejestr.orzeknij(_tozsamosc(przez_impedancje), PUNKT_W_ZAKRESIE).przydatny_dowodowo
    assert (
        rejestr.orzeknij(_tozsamosc(przez_nasycenie), PUNKT_W_ZAKRESIE).przydatny_dowodowo is False
    )


def _siec(*, z_bocznikiem: bool) -> TopologiaSieci:
    return TopologiaSieci(
        szyny=("B1", "B2"),
        galezie=[Galaz("B1", "B2", r_pu=0.01, x_pu=0.10)],
        boczniki=[Bocznik("B2", b_pu=0.05)] if z_bocznikiem else [],
        szyny_sztywne={"B1": complex(1.0, 0.0)},
    )


def test_dowod_wiaze_sie_z_MIGAWKA_SIECI_przez_odcisk_topologii() -> None:
    """A6 wpięte w ścieżkę dowodu: przypadek policzony na innej sieci to inny dowód.

    ``odcisk_migawki`` scenariusza jest tu liczony z REALNEJ topologii, więc
    zdjęcie kompensacji (zmiana Ybus) zmienia odcisk dowodu — bez niczyjej pamięci.
    """
    z_kompensacja = odcisk_topologii(_siec(z_bocznikiem=True), s_bazowa_mva=100.0)
    bez_kompensacji = odcisk_topologii(_siec(z_bocznikiem=False), s_bazowa_mva=100.0)
    assert z_kompensacja != bez_kompensacji
    urzadzenie = _zespol(200.0)
    assert (
        _dowod_dla(urzadzenie, migawka=z_kompensacja).odcisk
        != _dowod_dla(urzadzenie, migawka=bez_kompensacji).odcisk
    )
