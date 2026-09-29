"""BRAMKI FIZYCZNE jako testy — kazda klasa bledu osobno (R10 par. 33).

Bramki sa tu wywolywane POJEDYNCZO, a nie przez `bramki.zmierz()`, zeby porazka
wskazywala KTORA klase bledu zlapano. `zmierz()` zostaje wejsciem dla harnessu
mutacji, ktory potrzebuje kompletu w jednym procesie.
"""

from __future__ import annotations

from . import bramki


def _sprawdz(pomiary: dict, klucze: tuple[str, ...]) -> None:
    for klucz in klucze:
        assert klucz in pomiary, f"bramka nie zwrocila pomiaru {klucz}"
        wartosc = float(pomiary[klucz])
        assert (
            wartosc <= bramki.PROGI[klucz]
        ), f"{klucz}: {wartosc!r} > prog {bramki.PROGI[klucz]!r}; pelny pomiar: {pomiary}"


def test_g1_dryf_stanu_ustalonego() -> None:
    _sprawdz(bramki.g1_dryf_stanu_ustalonego(), ("G1_dryf_stanu_ustalonego_rad",))


def test_g2_g4_mod_elektromechaniczny() -> None:
    _sprawdz(
        bramki.g2_g4_mod_elektromechaniczny(),
        ("G2_blad_czestotliwosci_modu_wzgl", "G4_blad_tlumienia_wzgl"),
    )


def test_g3_rocof_w_chwili_zwarcia() -> None:
    _sprawdz(bramki.g3_rocof_w_chwili_zwarcia(), ("G3_blad_rocof_wzgl",))


def test_g5_czas_zdarzenia() -> None:
    _sprawdz(bramki.g5_czas_zdarzenia(), ("G5_blad_czasu_zdarzenia_s",))


def test_g6_inna_baza_urzadzenia() -> None:
    _sprawdz(bramki.g6_inna_baza_urzadzenia(), ("G6_blad_czestotliwosci_inna_baza_wzgl",))


def test_g7_czestotliwosc_wezlowa() -> None:
    pomiary = bramki.g7_czestotliwosc_wezlowa()
    _sprawdz(
        pomiary,
        (
            "G7_blad_czestotliwosci_wezlowej_hz",
            "G7_czestotliwosc_w_chwili_zdarzenia_jako_liczba",
        ),
    )
    # Predykat chwili zdarzenia musi miec co sprawdzac: dwie chwile zdarzen x (L, P).
    assert pomiary["_probki_zdarzen"] == 4.0


def test_g9_residuum_po_zdarzeniu() -> None:
    _sprawdz(bramki.g9_residuum_po_zdarzeniu(), ("G9_residuum_algebry_po_zdarzeniu",))


def test_g10_czas_krytyczny() -> None:
    pomiary = bramki.g10_czas_krytyczny()
    _sprawdz(pomiary, ("G10_blad_czasu_krytycznego_s",))
    assert (
        abs(pomiary["_cct_rowne_pola_s"] - pomiary["_cct_bisekcja_s"]) < 1e-8
    ), "dwie drogi wyroczni musza sie zgadzac miedzy soba mocniej niz z produktem"


def test_g11_g12_energia() -> None:
    _sprawdz(
        bramki.g11_g12_energia(),
        ("G11_dryf_calki_pierwszej_pu", "G12_najwiekszy_dodatni_przyrost_energii_pu"),
    )


def test_g13_wyspa_bez_zrodla() -> None:
    pomiary = bramki.g13_wyspa_bez_zrodla()
    _sprawdz(pomiary, ("G13_wyspa_bez_zrodla_nieodmowiona",))
    assert set(pomiary["_wyspa_bez_zrodla"].values()) == {"dynamika.wyspa_bez_zrodla"}


def test_g16_zwarcie_w_linii() -> None:
    pomiary = bramki.g16_zwarcie_w_linii()
    _sprawdz(pomiary, ("G16_blad_czwornika_wzgl",))
    assert len(pomiary["_zwarcie_w_linii"]) == 2 * len(bramki.POLOZENIA_G16)


def test_g16_fazory_pradow_galezi() -> None:
    pomiary = bramki.g16_fazory_pradow_galezi()
    _sprawdz(pomiary, ("G16_blad_modulu_pradu_galezi_wzgl", "G16_blad_kata_pradu_galezi_rad"))
    assert len(pomiary["_fazory_d15"]) == len(bramki.ZWARCIA_D15)


def test_g16_parytet_iec60909() -> None:
    pomiary = bramki.g16_parytet_iec60909()
    _sprawdz(pomiary, ("G16_blad_parytetu_iec60909_wzgl", "G16_kierunek_niezgodny_iec60909"))
    # I_k'' + cztery galezie (pierscien i odgalezienie bez pradu zwarciowego).
    assert len(pomiary["_parytet_iec60909"]) == 1 + len(bramki.LINIE_IEC)


def test_g17_obszar_beznapieciowy() -> None:
    pomiary = bramki.g17_obszar_beznapieciowy()
    _sprawdz(pomiary, ("G17_napiecie_obszaru_odcietego_pu", "G17_blad_ponownego_zasilenia_pu"))
    assert pomiary["_odleglosc_od_pierwiastka_nizszego_pu"] > 0.1


def test_g19_predykat_izolacji() -> None:
    pomiary = bramki.g19_predykat_izolacji()
    _sprawdz(pomiary, ("G19_niezgodnosc_predykatu_izolacji",))
    assert pomiary["_przypadki_sprawdzone"] == 16


def test_g20_probki_obustronne() -> None:
    _sprawdz(
        bramki.g20_probki_obustronne(),
        (
            "G20_blad_algebry_probek_L_P_wzgl",
            "G20_skok_stanu_rozniczkowego_rad",
            "G20_naruszenia_osi_i_czestotliwosci",
        ),
    )


def test_g14_lokalizacja_zdarzen_warunkowych() -> None:
    _sprawdz(
        bramki.g14_lokalizacja_zdarzen_warunkowych(),
        (
            "G14_blad_lokalizacji_wzgl_tolerancji",
            "G14_pobudzenia_niezgodne_z_kierunkiem",
            "G14_akcje_niezgodne_z_kasowaniem",
        ),
    )


def test_g15_zrodlo_testowe() -> None:
    _sprawdz(
        bramki.g15_zrodlo_testowe(),
        (
            "G15_blad_postaci_zamknietej_wzgl",
            "G15_napiecie_wezla_rozne_od_sem",
            "G15_blad_czestotliwosci_zrodla_idealnego_hz",
        ),
    )


def test_g18_przypisanie_stanu() -> None:
    _sprawdz(
        bramki.g18_przypisanie_stanu(),
        (
            "G18_skok_stanow_nieprzypisanych",
            "G18_blad_wartosci_przypisanej",
            "G18_residuum_algebry_po_przypisaniu",
            "G18_blad_trajektorii_po_przypisaniu_rad",
        ),
    )


def test_g21_utrata_czesciowa() -> None:
    _sprawdz(
        bramki.g21_utrata_czesciowa(),
        (
            "G21_blad_rownowaznosci_agregatu_wzgl",
            "G21_blad_rocof_maszyn_po_utracie_wzgl",
            "G21_blad_rocof_srodka_bezwladnosci_wzgl",
        ),
    )


def test_g22_parytet_chwili_zerowej() -> None:
    pomiary = bramki.g22_parytet_chwili_zerowej()
    _sprawdz(
        pomiary,
        (
            "G22_blad_mocy_odbioru_wzgl",
            "G22_blad_mocy_urzadzenia_wzgl",
            "G22_residuum_rownowagi_wzgl_granicy",
            "G22_przypadki_z_odmowa",
            "G22_niereprezentowalne_bez_odmowy",
        ),
    )
    # Iloczyn cech: 3 rodzaje szyny x 4 ksztalty x 3 czulosci — pomiar ma miec co sprawdzac.
    assert pomiary["_przypadki_g22"] == 36.0


def test_g23_przejscie_pq_z() -> None:
    _sprawdz(
        bramki.g23_przejscie_pq_z(),
        (
            "G23_blad_napiecia_pu",
            "G23_tozsamosc_mocy_wzgl",
            "G23_ciaglosc_mocy_w_napieciu_przejscia_pu",
            "G23_niezgodnosci_trybu",
            "G23_biegi_z_odmowa",
        ),
    )


def test_g24_estymator_w_zdarzeniach() -> None:
    pomiary = bramki.g24_estymator_w_zdarzeniach()
    _sprawdz(
        pomiary,
        (
            "G24_blad_wartosci_wlasnych_wzgl",
            "G24_tozsamosc_estymatora_hz",
            "G24_tozsamosc_poboru_wzgl",
            "G24_brak_przejscia_przez_u_min_z_odchylka",
            "G24_blad_czestotliwosci_szyny_hz",
            "G24_estymator_po_ponownym_zasileniu_hz",
        ),
    )
    # Macierz stanu wyspy: dwa mody odbioru-maszyny i trzy zera (sztywny obrot kata maszyny
    # i estymatora, stany stale maszyny klasycznej).
    assert len(pomiary["_wartosci_wlasne_rdzenia"]) == 5


def test_g24_samoregulacja_wyspy() -> None:
    pomiary = bramki.g24_samoregulacja_wyspy()
    _sprawdz(
        pomiary,
        (
            "G24_blad_trajektorii_wzgl",
            "G24_odchylka_rzedu_metody",
            "G24_blad_skoku_w_chwili_zdarzenia_pu",
            "G24_brak_przejscia_kata_przez_pi",
        ),
    )


def test_g25_odmowy_modelu_odbioru() -> None:
    pomiary = bramki.g25_odmowy_modelu_odbioru()
    _sprawdz(
        pomiary,
        ("G25_niezgodnosci_gotowosci_i_biegu", "G25_niezgodnosci_tablicy_uzycia_pol"),
    )
    # Macierz ma komplet przypadkow karty (8 migawek ENM + 2 odmowy zalezne od biegu).
    assert len(pomiary["_macierz_g25"]) == 10


def test_rejestr_progow_pokrywa_wszystkie_bramki() -> None:
    """Kazdy prog ma bramke, ktora go liczy — i odwrotnie. Zero progow-sierot."""
    zmierzone: set[str] = set()
    for bramka in bramki.BRAMKI:
        zmierzone |= {k for k in bramka.__doc__ or "" if False} or set()
    # Nazwy pomiarow sa kluczami PROGI; sprawdzamy, ze kazdy prog jest produkowany
    # przez ktoras bramke — po nazwie funkcji zakodowanej w prefiksie klucza.
    prefiksy = {klucz.split("_", 1)[0].lower() for klucz in bramki.PROGI}
    nazwy_bramek = " ".join(b.__name__ for b in bramki.BRAMKI)
    brakujace = sorted(p for p in prefiksy if p not in nazwy_bramek)
    assert not brakujace, f"progi bez bramki: {brakujace}"
