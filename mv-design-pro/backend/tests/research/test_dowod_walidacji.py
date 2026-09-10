"""Prototyp modelu zaufania (D-09): status dowodowy WYPROWADZANY, nie nadawany.

KOD BADAWCZY — patrz `backend/research/README.md`.

Testy sprawdzają jedną hipotezę: czy da się skonstruować rejestr, w którym
„to jest zwalidowana symulacja" jest FUNKCJĄ danych i którego **nie da się
oszukać przypisaniem wartości**. Każdy test opisuje jeden sposób, w jaki dziś
(przy stopniu nadawanym) fałszywy pozytyw byłby osiągalny.
"""

from __future__ import annotations

import pytest
from dynamic_lab.dowod_walidacji import (
    DowodWalidacji,
    MetrykiAkceptacji,
    PunktPracy,
    RejestrDowodow,
    StopienDowodowy,
    TozsamoscModelu,
    TozsamoscProfiluWymagan,
    Wyrocznia,
    ZakresWalidacji,
)

ANDES = Wyrocznia(nazwa="ANDES", wersja="2.0.0", metoda="wartości własne")


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


def _dowod(model: TozsamoscModelu | None = None, blad: float = 1.0e-8) -> DowodWalidacji:
    return DowodWalidacji(
        model=model or _model(),
        wyrocznia=ANDES,
        zakres=ZakresWalidacji(
            napiecie_pu=(0.90, 1.10),
            moc_pu=(0.20, 0.80),
            scr=(3.0, 20.0),
            rodzaje_zdarzen=frozenset({"zwarcie_3f", "skok_obciazenia"}),
        ),
        metryki=(MetrykiAkceptacji(maks_blad_wzgledny=1.0e-4, zmierzony_blad_wzgledny=blad),),
        przypadki=("SMIB H=2", "SMIB H=4", "SMIB H=8"),
    )


PUNKT_W_ZAKRESIE = PunktPracy(napiecie_pu=1.0, moc_pu=0.5, scr=10.0, rodzaj_zdarzenia="zwarcie_3f")


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
        (PunktPracy(napiecie_pu=1.30, moc_pu=0.5, scr=10.0), "napięcie"),
        (PunktPracy(napiecie_pu=1.0, moc_pu=0.95, scr=10.0), "moc"),
        (PunktPracy(napiecie_pu=1.0, moc_pu=0.5, scr=1.5), "SCR"),
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
    """„Nie badano" to brak pokrycia, nie zgoda milcząca."""
    rejestr = RejestrDowodow()
    dowod = _dowod()
    rejestr.zarejestruj(
        DowodWalidacji(
            model=dowod.model,
            wyrocznia=dowod.wyrocznia,
            zakres=ZakresWalidacji(
                napiecie_pu=(0.9, 1.1), rodzaje_zdarzen=frozenset({"zwarcie_3f"})
            ),
            metryki=dowod.metryki,
            przypadki=dowod.przypadki,
        )
    )
    orzeczenie = rejestr.orzeknij(_model(), PUNKT_W_ZAKRESIE)
    assert orzeczenie.przydatny_dowodowo is False
    assert any("nie był walidowany w tym wymiarze" in p for p in orzeczenie.powody)


def test_zmiana_parametru_uniewaznia_dowod() -> None:
    """Rejestr indeksuje ODCISKIEM, nie nazwą — cicha zmiana stałej gubi dowód.

    Bez tego „ten sam model" obejmowałby też model po zmianie bezwładności,
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
            metryki=(MetrykiAkceptacji(1e-4, 1e-8),),
            przypadki=(),
        )


def test_dowod_bez_metryk_jest_odrzucany() -> None:
    with pytest.raises(ValueError, match="bez metryk akceptacji"):
        DowodWalidacji(
            model=_model(),
            wyrocznia=ANDES,
            zakres=ZakresWalidacji(napiecie_pu=(0.9, 1.1)),
            metryki=(),
            przypadki=("SMIB",),
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
    b = DowodWalidacji(
        model=a.model,
        wyrocznia=Wyrocznia(nazwa="ANDES", wersja="2.1.0", metoda="wartości własne"),
        zakres=a.zakres,
        metryki=a.metryki,
        przypadki=a.przypadki,
    )
    assert a.odcisk != b.odcisk


# ---------------------------------------------------------------------------
# ROZSZERZENIE PO PRZEGLĄDZIE: cztery osie tożsamości, wycofanie, wiele zakresów
# ---------------------------------------------------------------------------


def test_zmiana_KODU_przy_tych_samych_parametrach_uniewaznia_dowod() -> None:
    """„Ten sam parametr + nowy kod = stary dowód nadal ważny" — to była luka.

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

    Komunikat musi to powiedzieć wprost, bo inaczej inżynier widzi „brak dowodu"
    dla modelu, który „przecież jest ten sam".
    """
    rejestr = RejestrDowodow()
    rejestr.zarejestruj(_dowod(_model(odcisk_kodu="kod-a", wersja="1")))
    orzeczenie = rejestr.orzeknij(_model(odcisk_kodu="kod-b", wersja="1"), PUNKT_W_ZAKRESIE)
    assert any(
        "ten sam identyfikator publiczny, inny kod" in p for p in orzeczenie.powody
    ), orzeczenie.powody


def test_zmiana_jednej_stalej_regulatora_uniewaznia_dowod() -> None:
    """Parametr regulatora to też parametr — nie ma parametrów „nieistotnych"."""
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
            metryki=(MetrykiAkceptacji(1e-4, 1e-8),),
            przypadki=("SMIB",),
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
                metryki=(MetrykiAkceptacji(1.0e-4, 1.0e-8),),
                przypadki=(f"SMIB SCR {scr[0]}-{scr[1]}",),
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
                metryki=(MetrykiAkceptacji(1.0e-4, 1.0e-8),),
                przypadki=(f"SMIB {scr}",),
            )
        )
    luka = PunktPracy(napiecie_pu=1.0, moc_pu=0.5, scr=10.0, rodzaj_zdarzenia="zwarcie_3f")
    orzeczenie = rejestr.orzeknij(model, luka)
    assert orzeczenie.przydatny_dowodowo is False
    assert any("Żaden z 2" in p for p in orzeczenie.powody), orzeczenie.powody


def test_zmiana_redakcji_wymagania_uniewaznia_dowod() -> None:
    """Model zwalidowany wobec profilu z 2024 nie dowodzi wymagania z 2026."""
    profil_2024 = TozsamoscProfiluWymagan(
        identyfikator="NC RfG / enea", wersja="2024.1", obowiazuje_od="2024-01-01"
    )
    profil_2026 = TozsamoscProfiluWymagan(
        identyfikator="NC RfG / enea", wersja="2026.1", obowiazuje_od="2026-01-01"
    )
    rejestr = RejestrDowodow()
    dowod = _dowod()
    rejestr.zarejestruj(
        DowodWalidacji(
            model=dowod.model,
            wyrocznia=dowod.wyrocznia,
            zakres=dowod.zakres,
            metryki=dowod.metryki,
            przypadki=dowod.przypadki,
            profil_wymagan=profil_2024,
        )
    )
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
        identyfikator="NC RfG / pse", wersja="2026.1", obowiazuje_od="2026-01-01"
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
            metryki=(MetrykiAkceptacji(1.0e-4, 1.0e-8),),
            przypadki=("waski zakres",),
        )
    )
    orzeczenie = rejestr.orzeknij(model, PUNKT_W_ZAKRESIE)
    assert orzeczenie.przydatny_dowodowo is False
    assert len(orzeczenie.powody) >= 3
    assert any("metryki" in p for p in orzeczenie.powody)
    assert any("poza zakresem" in p for p in orzeczenie.powody)
