from __future__ import annotations


def get_all_lv_cable_types() -> list[dict]:
    """
    Katalog kabli niskiego napięcia (nN) 0.6/1 kV.

    Rodziny:
    - YAKY (Al, 4-żyłowy, PVC, 0.6/1 kV): przekroje 16-240 mm²
    - YKY (Cu, 4/5-żyłowy, PVC, 0.6/1 kV): przekroje 35-120 mm²
    - YKXS (Cu, 4-żyłowy, XLPE, 0.6/1 kV): przekroje 35-70 mm²

    Źródło: Tele-Fonika Kable / NKT / norma IEC 60502-1 / dane referencyjne.
    """
    return [
        # -----------------------------------------------------------------------
        # YAKY — aluminium, 4-żyłowy, izolacja PVC, 0.6/1 kV
        # -----------------------------------------------------------------------
        {
            "id": "kab_nn_yaky_4x16_al",
            "name": "YAKY 4x16 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 1.910,
                "x_ohm_per_km": 0.077,
                "i_max_a": 85.0,
                "conductor_material": "AL",
                "insulation_type": "PVC",
                "cross_section_mm2": 16.0,
                "number_of_cores": 4,
                "manufacturer": "Tele-Fonika Kable",
                "source_reference": "Tele-Fonika Kable / IEC 60502-1 / dane referencyjne",
            },
        },
        {
            "id": "kab_nn_yaky_4x25_al",
            "name": "YAKY 4x25 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 1.200,
                "x_ohm_per_km": 0.075,
                "i_max_a": 110.0,
                "conductor_material": "AL",
                "insulation_type": "PVC",
                "cross_section_mm2": 25.0,
                "number_of_cores": 4,
                "manufacturer": "Tele-Fonika Kable",
                "source_reference": "Tele-Fonika Kable / IEC 60502-1 / dane referencyjne",
            },
        },
        {
            "id": "kab_nn_yaky_4x35_al",
            "name": "YAKY 4x35 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.868,
                "x_ohm_per_km": 0.073,
                "i_max_a": 135.0,
                "conductor_material": "AL",
                "insulation_type": "PVC",
                "cross_section_mm2": 35.0,
                "number_of_cores": 4,
                "manufacturer": "Tele-Fonika Kable",
                "source_reference": "Tele-Fonika Kable / IEC 60502-1 / dane referencyjne",
            },
        },
        {
            "id": "kab_nn_yaky_4x50_al",
            "name": "YAKY 4x50 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.641,
                "x_ohm_per_km": 0.072,
                "i_max_a": 160.0,
                "conductor_material": "AL",
                "insulation_type": "PVC",
                "cross_section_mm2": 50.0,
                "number_of_cores": 4,
                "manufacturer": "Tele-Fonika Kable",
                "source_reference": "Tele-Fonika Kable / IEC 60502-1 / dane referencyjne",
            },
        },
        {
            "id": "kab_nn_4x70_al",
            "name": "YAKY 4x70 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.443,
                "x_ohm_per_km": 0.072,
                "i_max_a": 180.0,
                "conductor_material": "AL",
                "insulation_type": "PVC",
                "cross_section_mm2": 70.0,
                "number_of_cores": 4,
                "manufacturer": "Tele-Fonika",
                "source_reference": "Tele-Fonika Kable / IEC 60502-1 / dane referencyjne",
            },
        },
        {
            "id": "kab_nn_yaky_4x95_al",
            "name": "YAKY 4x95 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.320,
                "x_ohm_per_km": 0.070,
                "i_max_a": 215.0,
                "conductor_material": "AL",
                "insulation_type": "PVC",
                "cross_section_mm2": 95.0,
                "number_of_cores": 4,
                "manufacturer": "Tele-Fonika Kable",
                "source_reference": "Tele-Fonika Kable / IEC 60502-1 / dane referencyjne",
            },
        },
        {
            "id": "kab_nn_4x120_al",
            "name": "YAKY 4x120 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.253,
                "x_ohm_per_km": 0.069,
                "i_max_a": 240.0,
                "conductor_material": "AL",
                "insulation_type": "PVC",
                "cross_section_mm2": 120.0,
                "number_of_cores": 4,
                "manufacturer": "Tele-Fonika",
                "source_reference": "Tele-Fonika Kable / IEC 60502-1 / dane referencyjne",
            },
        },
        {
            "id": "kab_nn_yaky_4x150_al",
            "name": "YAKY 4x150 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.206,
                "x_ohm_per_km": 0.068,
                "i_max_a": 275.0,
                "conductor_material": "AL",
                "insulation_type": "PVC",
                "cross_section_mm2": 150.0,
                "number_of_cores": 4,
                "manufacturer": "Tele-Fonika Kable",
                "source_reference": "Tele-Fonika Kable / IEC 60502-1 / dane referencyjne",
            },
        },
        {
            "id": "kab_nn_yaky_4x185_al",
            "name": "YAKY 4x185 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.164,
                "x_ohm_per_km": 0.067,
                "i_max_a": 315.0,
                "conductor_material": "AL",
                "insulation_type": "PVC",
                "cross_section_mm2": 185.0,
                "number_of_cores": 4,
                "manufacturer": "Tele-Fonika Kable",
                "source_reference": "Tele-Fonika Kable / IEC 60502-1 / dane referencyjne",
            },
        },
        {
            "id": "kab_nn_yaky_4x240_al",
            "name": "YAKY 4x240 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.125,
                "x_ohm_per_km": 0.066,
                "i_max_a": 360.0,
                "conductor_material": "AL",
                "insulation_type": "PVC",
                "cross_section_mm2": 240.0,
                "number_of_cores": 4,
                "manufacturer": "Tele-Fonika Kable",
                "source_reference": "Tele-Fonika Kable / IEC 60502-1 / dane referencyjne",
            },
        },
        # -----------------------------------------------------------------------
        # YKY — miedź, 4/5-żyłowy, izolacja PVC, 0.6/1 kV
        # -----------------------------------------------------------------------
        {
            "id": "kab_nn_5x35_cu",
            "name": "YKY 5x35 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.524,
                "x_ohm_per_km": 0.082,
                "i_max_a": 125.0,
                "conductor_material": "CU",
                "insulation_type": "PVC",
                "cross_section_mm2": 35.0,
                "number_of_cores": 5,
                "manufacturer": "NKT",
                "source_reference": "NKT Cables / IEC 60502-1 / dane referencyjne",
            },
        },
        {
            "id": "kab_nn_yky_4x50_cu",
            "name": "YKY 4x50 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.387,
                "x_ohm_per_km": 0.079,
                "i_max_a": 160.0,
                "conductor_material": "CU",
                "insulation_type": "PVC",
                "cross_section_mm2": 50.0,
                "number_of_cores": 4,
                "manufacturer": "NKT",
                "source_reference": "NKT Cables / IEC 60502-1 / dane referencyjne",
            },
        },
        {
            "id": "kab_nn_yky_4x70_cu",
            "name": "YKY 4x70 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.268,
                "x_ohm_per_km": 0.076,
                "i_max_a": 200.0,
                "conductor_material": "CU",
                "insulation_type": "PVC",
                "cross_section_mm2": 70.0,
                "number_of_cores": 4,
                "manufacturer": "NKT",
                "source_reference": "NKT Cables / IEC 60502-1 / dane referencyjne",
            },
        },
        {
            "id": "kab_nn_yky_4x95_cu",
            "name": "YKY 4x95 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.193,
                "x_ohm_per_km": 0.074,
                "i_max_a": 240.0,
                "conductor_material": "CU",
                "insulation_type": "PVC",
                "cross_section_mm2": 95.0,
                "number_of_cores": 4,
                "manufacturer": "NKT",
                "source_reference": "NKT Cables / IEC 60502-1 / dane referencyjne",
            },
        },
        {
            "id": "kab_nn_yky_4x120_cu",
            "name": "YKY 4x120 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.153,
                "x_ohm_per_km": 0.073,
                "i_max_a": 275.0,
                "conductor_material": "CU",
                "insulation_type": "PVC",
                "cross_section_mm2": 120.0,
                "number_of_cores": 4,
                "manufacturer": "NKT",
                "source_reference": "NKT Cables / IEC 60502-1 / dane referencyjne",
            },
        },
        # -----------------------------------------------------------------------
        # YKXS — miedź, 4-żyłowy, izolacja XLPE, 0.6/1 kV (lepsza obciążalność)
        # -----------------------------------------------------------------------
        {
            "id": "kab_nn_ykxs_4x35_cu",
            "name": "YKXS 4x35 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.524,
                "x_ohm_per_km": 0.078,
                "i_max_a": 145.0,
                "conductor_material": "CU",
                "insulation_type": "XLPE",
                "cross_section_mm2": 35.0,
                "number_of_cores": 4,
                "manufacturer": "Tele-Fonika Kable",
                "source_reference": "Tele-Fonika Kable / IEC 60502-1 / dane referencyjne",
            },
        },
        {
            "id": "kab_nn_ykxs_4x70_cu",
            "name": "YKXS 4x70 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.268,
                "x_ohm_per_km": 0.072,
                "i_max_a": 225.0,
                "conductor_material": "CU",
                "insulation_type": "XLPE",
                "cross_section_mm2": 70.0,
                "number_of_cores": 4,
                "manufacturer": "Tele-Fonika Kable",
                "source_reference": "Tele-Fonika Kable / IEC 60502-1 / dane referencyjne",
            },
        },
    ]


def get_all_load_types() -> list[dict]:
    return [
        {
            "id": "load_mieszk_15kw",
            "name": "Obciazenie mieszkaniowe 15 kW",
            "params": {
                "model": "PQ",
                "p_kw": 15.0,
                "cos_phi": 0.95,
                "cos_phi_mode": "IND",
                "manufacturer": "Profil standardowy",
            },
        },
        {
            "id": "load_uslugi_30kw",
            "name": "Obciazenie uslugowe 30 kW",
            "params": {
                "model": "PQ",
                "p_kw": 30.0,
                "cos_phi": 0.92,
                "cos_phi_mode": "IND",
                "manufacturer": "Profil standardowy",
            },
        },
        {
            "id": "load_przem_75kw",
            "name": "Obciazenie przemyslowe 75 kW",
            "params": {
                "model": "PQ",
                "p_kw": 75.0,
                "q_kvar": 28.0,
                "cos_phi": 0.94,
                "cos_phi_mode": "IND",
                "manufacturer": "Profil standardowy",
            },
        },
    ]


def get_all_lv_apparatus_types() -> list[dict]:
    """Zwraca aparature laczeniowa nN — 14 rekordow.

    Zrodla:
    - WYLACZNIK_GLOWNY (ABB SACE Emax2): ABB SACE Emax2 katalog 1SDA073513R1
    - WYLACZNIK_ODPLYWOWY (ABB SACE Tmax XT): ABB Tmax XT katalog 1SDA066835R1
    - ROZLACZNIK_BEZPIECZNIKOWY (Jean Muller): Jean Muller NHR katalog
    """
    return [
        # --- WYLACZNIK_GLOWNY: ABB SACE Emax2 ---
        {
            "id": "cb_nn_400a",
            "name": "Wylacznik glowny nN 400 A",
            "params": {
                "device_kind": "WYLACZNIK_GLOWNY",
                "u_n_kv": 0.4,
                "i_n_a": 400.0,
                "breaking_capacity_ka": 50.0,
                "manufacturer": "ABB",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "ABB SACE Emax2 katalog 1SDA073513R1",
                "contract_version": "2.0",
            },
        },
        {
            "id": "cb_nn_630a",
            "name": "Wylacznik glowny nN 630 A",
            "params": {
                "device_kind": "WYLACZNIK_GLOWNY",
                "u_n_kv": 0.4,
                "i_n_a": 630.0,
                "breaking_capacity_ka": 50.0,
                "manufacturer": "ABB",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "ABB SACE Emax2 katalog 1SDA073513R1",
                "contract_version": "2.0",
            },
        },
        {
            "id": "cb_nn_800a",
            "name": "Wylacznik glowny nN 800 A",
            "params": {
                "device_kind": "WYLACZNIK_GLOWNY",
                "u_n_kv": 0.4,
                "i_n_a": 800.0,
                "breaking_capacity_ka": 50.0,
                "manufacturer": "ABB",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "ABB SACE Emax2 katalog 1SDA073513R1",
                "contract_version": "2.0",
            },
        },
        {
            "id": "cb_nn_1000a",
            "name": "Wylacznik glowny nN 1000 A",
            "params": {
                "device_kind": "WYLACZNIK_GLOWNY",
                "u_n_kv": 0.4,
                "i_n_a": 1000.0,
                "breaking_capacity_ka": 50.0,
                "manufacturer": "ABB",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "ABB SACE Emax2 katalog 1SDA073513R1",
                "contract_version": "2.0",
            },
        },
        {
            "id": "cb_nn_1250a",
            "name": "Wylacznik glowny nN 1250 A",
            "params": {
                "device_kind": "WYLACZNIK_GLOWNY",
                "u_n_kv": 0.4,
                "i_n_a": 1250.0,
                "breaking_capacity_ka": 50.0,
                "manufacturer": "ABB",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "ABB SACE Emax2 katalog 1SDA073513R1",
                "contract_version": "2.0",
            },
        },
        {
            "id": "cb_nn_1600a",
            "name": "Wylacznik glowny nN 1600 A",
            "params": {
                "device_kind": "WYLACZNIK_GLOWNY",
                "u_n_kv": 0.4,
                "i_n_a": 1600.0,
                "breaking_capacity_ka": 50.0,
                "manufacturer": "ABB",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "ABB SACE Emax2 katalog 1SDA073513R1",
                "contract_version": "2.0",
            },
        },
        # --- WYLACZNIK_ODPLYWOWY: ABB SACE Tmax XT ---
        {
            "id": "cb_nn_100a",
            "name": "Wylacznik odplywowy nN 100 A",
            "params": {
                "device_kind": "WYLACZNIK_ODPLYWOWY",
                "u_n_kv": 0.4,
                "i_n_a": 100.0,
                "breaking_capacity_ka": 25.0,
                "manufacturer": "ABB",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "ABB Tmax XT katalog 1SDA066835R1",
                "contract_version": "2.0",
            },
        },
        {
            "id": "cb_nn_160a",
            "name": "Wylacznik odplywowy nN 160 A",
            "params": {
                "device_kind": "WYLACZNIK_ODPLYWOWY",
                "u_n_kv": 0.4,
                "i_n_a": 160.0,
                "breaking_capacity_ka": 25.0,
                "manufacturer": "ABB",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "ABB Tmax XT katalog 1SDA066835R1",
                "contract_version": "2.0",
            },
        },
        {
            "id": "cb_nn_250a",
            "name": "Wylacznik odplywowy nN 250 A",
            "params": {
                "device_kind": "WYLACZNIK_ODPLYWOWY",
                "u_n_kv": 0.4,
                "i_n_a": 250.0,
                "breaking_capacity_ka": 25.0,
                "manufacturer": "ABB",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "ABB Tmax XT katalog 1SDA066835R1",
                "contract_version": "2.0",
            },
        },
        {
            "id": "cb_nn_400a_odp",
            "name": "Wylacznik odplywowy nN 400 A",
            "params": {
                "device_kind": "WYLACZNIK_ODPLYWOWY",
                "u_n_kv": 0.4,
                "i_n_a": 400.0,
                "breaking_capacity_ka": 36.0,
                "manufacturer": "ABB",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "ABB Tmax XT katalog 1SDA066835R1",
                "contract_version": "2.0",
            },
        },
        {
            "id": "cb_nn_630a_odp",
            "name": "Wylacznik odplywowy nN 630 A",
            "params": {
                "device_kind": "WYLACZNIK_ODPLYWOWY",
                "u_n_kv": 0.4,
                "i_n_a": 630.0,
                "breaking_capacity_ka": 50.0,
                "manufacturer": "ABB",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "ABB Tmax XT katalog 1SDA066835R1",
                "contract_version": "2.0",
            },
        },
        # --- ROZLACZNIK_BEZPIECZNIKOWY: Jean Muller NHR ---
        {
            "id": "rb_nn_100a",
            "name": "Rozlacznik bezpiecznikowy nN 100 A",
            "params": {
                "device_kind": "ROZLACZNIK_BEZPIECZNIKOWY",
                "u_n_kv": 0.4,
                "i_n_a": 100.0,
                "breaking_capacity_ka": 16.0,
                "manufacturer": "Jean Muller",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "Jean Muller NHR katalog",
                "contract_version": "2.0",
            },
        },
        {
            "id": "rb_nn_160a",
            "name": "Rozlacznik bezpiecznikowy nN 160 A",
            "params": {
                "device_kind": "ROZLACZNIK_BEZPIECZNIKOWY",
                "u_n_kv": 0.4,
                "i_n_a": 160.0,
                "breaking_capacity_ka": 16.0,
                "manufacturer": "Jean Muller",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "Jean Muller NHR katalog",
                "contract_version": "2.0",
            },
        },
        {
            "id": "rb_nn_250a",
            "name": "Rozlacznik bezpiecznikowy nN 250 A",
            "params": {
                "device_kind": "ROZLACZNIK_BEZPIECZNIKOWY",
                "u_n_kv": 0.4,
                "i_n_a": 250.0,
                "breaking_capacity_ka": 16.0,
                "manufacturer": "Jean Muller",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "Jean Muller NHR katalog",
                "contract_version": "2.0",
            },
        },
    ]


def get_all_ct_types() -> list[dict]:
    def _quality_meta(
        *,
        verification_status: str,
        source_reference: str,
        catalog_status: str,
        verification_note: str,
    ) -> dict:
        return {
            "verification_status": verification_status,
            "source_reference": source_reference,
            "catalog_status": catalog_status,
            "contract_version": "2.0",
            "verification_note": verification_note,
        }

    source_reference = (
        "Katalog CT MV-DESIGN-PRO / IEC 61869-2 (rdzen, ALF, Idyn=2,5·Ith, Fs) "
        "/ IEC 62271-200 (szereg wytrzymalosci rozdzielnicy SN)"
    )
    verification_note = (
        "Rekord referencyjny do doboru CT. Ith podano jako WYMAGANA wytrzymalosc "
        "cieplna przekladnika w rozdzielnicy SN wg znormalizowanego szeregu "
        "IEC 62271-200 (16 kA/1 s dla torow <= 150 A, 20 kA/1 s dla 200-1000 A, "
        "25 kA/1 s dla >= 1200 A); Idyn wyprowadzany normowo (2,5·Ith), Fs wg "
        "znormalizowanej wartosci 10 dla rdzeni pomiarowych. Wartosci wlasciwe dla "
        "konkretnego wyrobu potwierdza karta producenta."
    )
    return [
        {
            "id": "ct_50_1_0_5_5va_arteche",
            "name": "CT 50/1 A kl. 0.5 5 VA",
            "params": {
                "ratio_primary_a": 50.0,
                "ratio_secondary_a": 1.0,
                "accuracy_class": "0.5",
                "burden_va": 5.0,
                "ith_ka_1s": 16.0,
                "fs_safety_factor": 10.0,
                "manufacturer": "Arteche",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "ct_100_1_0_5_5va_abb",
            "name": "CT 100/1 A kl. 0.5 5 VA",
            "params": {
                "ratio_primary_a": 100.0,
                "ratio_secondary_a": 1.0,
                "accuracy_class": "0.5",
                "burden_va": 5.0,
                "ith_ka_1s": 16.0,
                "fs_safety_factor": 10.0,
                "manufacturer": "ABB",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "ct_150_1_0_5_10va_abb",
            "name": "CT 150/1 A kl. 0.5 10 VA",
            "params": {
                "ratio_primary_a": 150.0,
                "ratio_secondary_a": 1.0,
                "accuracy_class": "0.5",
                "burden_va": 10.0,
                "ith_ka_1s": 16.0,
                "fs_safety_factor": 10.0,
                "manufacturer": "ABB",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "ct_200_5_5p10_10va_abb",
            "name": "CT 200/5 A kl. 5P10 10 VA",
            "params": {
                "ratio_primary_a": 200.0,
                "ratio_secondary_a": 5.0,
                "accuracy_class": "5P10",
                "burden_va": 10.0,
                "ith_ka_1s": 20.0,
                "manufacturer": "ABB",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "ct_300_5_5p10_10va_siemens",
            "name": "CT 300/5 A kl. 5P10 10 VA",
            "params": {
                "ratio_primary_a": 300.0,
                "ratio_secondary_a": 5.0,
                "accuracy_class": "5P10",
                "burden_va": 10.0,
                "ith_ka_1s": 20.0,
                "manufacturer": "Siemens",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "ct_400_5_5p20_15va_abb",
            "name": "CT 400/5 A kl. 5P20 15 VA",
            "params": {
                "ratio_primary_a": 400.0,
                "ratio_secondary_a": 5.0,
                "accuracy_class": "5P20",
                "burden_va": 15.0,
                "ith_ka_1s": 20.0,
                "manufacturer": "ABB",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "ct_600_5_5p20_15va_schneider",
            "name": "CT 600/5 A kl. 5P20 15 VA",
            "params": {
                "ratio_primary_a": 600.0,
                "ratio_secondary_a": 5.0,
                "accuracy_class": "5P20",
                "burden_va": 15.0,
                "ith_ka_1s": 20.0,
                "manufacturer": "Schneider Electric",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "ct_800_5_5p20_20va_arteche",
            "name": "CT 800/5 A kl. 5P20 20 VA",
            "params": {
                "ratio_primary_a": 800.0,
                "ratio_secondary_a": 5.0,
                "accuracy_class": "5P20",
                "burden_va": 20.0,
                "ith_ka_1s": 20.0,
                "manufacturer": "Arteche",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "ct_1000_5_5p20_20va_abb",
            "name": "CT 1000/5 A kl. 5P20 20 VA",
            "params": {
                "ratio_primary_a": 1000.0,
                "ratio_secondary_a": 5.0,
                "accuracy_class": "5P20",
                "burden_va": 20.0,
                "ith_ka_1s": 20.0,
                "manufacturer": "ABB",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "ct_1200_5_5p20_20va_siemens",
            "name": "CT 1200/5 A kl. 5P20 20 VA",
            "params": {
                "ratio_primary_a": 1200.0,
                "ratio_secondary_a": 5.0,
                "accuracy_class": "5P20",
                "burden_va": 20.0,
                "ith_ka_1s": 25.0,
                "manufacturer": "Siemens",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "ct_1500_5_5p20_30va_abb",
            "name": "CT 1500/5 A kl. 5P20 30 VA",
            "params": {
                "ratio_primary_a": 1500.0,
                "ratio_secondary_a": 5.0,
                "accuracy_class": "5P20",
                "burden_va": 30.0,
                "ith_ka_1s": 25.0,
                "manufacturer": "ABB",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "ct_2000_5_10p10_30va_arteche",
            "name": "CT 2000/5 A kl. 10P10 30 VA",
            "params": {
                "ratio_primary_a": 2000.0,
                "ratio_secondary_a": 5.0,
                "accuracy_class": "10P10",
                "burden_va": 30.0,
                "ith_ka_1s": 25.0,
                "manufacturer": "Arteche",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
    ]


def get_all_vt_types() -> list[dict]:
    def _quality_meta(
        *,
        verification_status: str,
        source_reference: str,
        catalog_status: str,
        verification_note: str,
    ) -> dict:
        return {
            "verification_status": verification_status,
            "source_reference": source_reference,
            "catalog_status": catalog_status,
            "contract_version": "2.0",
            "verification_note": verification_note,
        }

    source_reference = "Katalog VT MV-DESIGN-PRO / IEC 61869-3 / dane referencyjne"
    verification_note = (
        "Rekord referencyjny do doboru VT. Wspolczynnik napieciowy 1,9 przez 8 h jest "
        "WARTOSCIA DEKLAROWANA wg IEC 61869-3 tab. 2 dla sieci maloprądowej (izolowanej "
        "albo kompensowanej) bez automatycznego wylaczania zwarcia doziemnego — takie sa "
        "polskie sieci SN. Moc znamionowa 30 VA pochodzi z szeregu znormalizowanego "
        "IEC 61869-3. Oba parametry oraz obecnosc uzwojenia resztkowego nalezy potwierdzic "
        "karta producenta przed uzyciem produkcyjnym (verification_status)."
    )
    verification_note_fz = (
        "Rekord referencyjny rodziny FAZA-ZIEMIA z uzwojeniem RESZTKOWYM (trzecim), "
        "ktora w sieci SN realizuje pomiar napiecia zerowego 3U0 dla kryteriow "
        "ziemnozwarciowych kierunkowych (67N) i nadnapieciowych zerowych (59N). "
        "Uzwojenie pierwotne pracuje miedzy faza a ziemia, dlatego przekladnia jest "
        "U_n/√3, a wspolczynnik napieciowy musi wynosic 1,9 (IEC 61869-3 tab. 2): "
        "przy zwarciu doziemnym napiecie faz zdrowych rosnie do napiecia miedzyfazowego. "
        "Klasy, moc i obecnosc uzwojenia resztkowego potwierdzic karta producenta."
    )

    return [
        {
            "id": "vt_10kv_100v_05_abb",
            "name": "VT 10 kV / 100 V kl. 0.5",
            "params": {
                "ratio_primary_v": 10000.0,
                "ratio_secondary_v": 100.0,
                "accuracy_class": "0.5",
                "rated_voltage_factor": 1.9,
                "voltage_factor_duration_s": 28800.0,
                "burden_va": 30.0,
                "has_residual_winding": False,
                "manufacturer": "ABB",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "vt_15kv_100v_05_abb",
            "name": "VT 15 kV / 100 V kl. 0.5",
            "params": {
                "ratio_primary_v": 15000.0,
                "ratio_secondary_v": 100.0,
                "accuracy_class": "0.5",
                "rated_voltage_factor": 1.9,
                "voltage_factor_duration_s": 28800.0,
                "burden_va": 30.0,
                "has_residual_winding": False,
                "manufacturer": "ABB",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "vt_15kv_100v_3p_abb",
            "name": "VT 15 kV / 100 V kl. 3P",
            "params": {
                "ratio_primary_v": 15000.0,
                "ratio_secondary_v": 100.0,
                "accuracy_class": "3P",
                "rated_voltage_factor": 1.9,
                "voltage_factor_duration_s": 28800.0,
                "burden_va": 30.0,
                "has_residual_winding": False,
                "manufacturer": "ABB",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "vt_20kv_100v_05_arteche",
            "name": "VT 20 kV / 100 V kl. 0.5",
            "params": {
                "ratio_primary_v": 20000.0,
                "ratio_secondary_v": 100.0,
                "accuracy_class": "0.5",
                "rated_voltage_factor": 1.9,
                "voltage_factor_duration_s": 28800.0,
                "burden_va": 30.0,
                "has_residual_winding": False,
                "manufacturer": "Arteche",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "vt_20kv_100v_3p_abb",
            "name": "VT 20 kV / 100 V kl. 3P",
            "params": {
                "ratio_primary_v": 20000.0,
                "ratio_secondary_v": 100.0,
                "accuracy_class": "3P",
                "rated_voltage_factor": 1.9,
                "voltage_factor_duration_s": 28800.0,
                "burden_va": 30.0,
                "has_residual_winding": False,
                "manufacturer": "ABB",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "vt_24kv_100v_05_siemens",
            "name": "VT 24 kV / 100 V kl. 0.5",
            "params": {
                "ratio_primary_v": 24000.0,
                "ratio_secondary_v": 100.0,
                "accuracy_class": "0.5",
                "rated_voltage_factor": 1.9,
                "voltage_factor_duration_s": 28800.0,
                "burden_va": 30.0,
                "has_residual_winding": False,
                "manufacturer": "Siemens",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "vt_24kv_100v_3p_schneider",
            "name": "VT 24 kV / 100 V kl. 3P",
            "params": {
                "ratio_primary_v": 24000.0,
                "ratio_secondary_v": 100.0,
                "accuracy_class": "3P",
                "rated_voltage_factor": 1.9,
                "voltage_factor_duration_s": 28800.0,
                "burden_va": 30.0,
                "has_residual_winding": False,
                "manufacturer": "Schneider Electric",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "vt_15kv_110v_05_ormazabal",
            "name": "VT 15 kV / 110 V kl. 0.5",
            "params": {
                "ratio_primary_v": 15000.0,
                "ratio_secondary_v": 110.0,
                "accuracy_class": "0.5",
                "rated_voltage_factor": 1.9,
                "voltage_factor_duration_s": 28800.0,
                "burden_va": 30.0,
                "has_residual_winding": False,
                "manufacturer": "Ormazabal",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "vt_20kv_110v_05_abb",
            "name": "VT 20 kV / 110 V kl. 0.5",
            "params": {
                "ratio_primary_v": 20000.0,
                "ratio_secondary_v": 110.0,
                "accuracy_class": "0.5",
                "rated_voltage_factor": 1.9,
                "voltage_factor_duration_s": 28800.0,
                "burden_va": 30.0,
                "has_residual_winding": False,
                "manufacturer": "ABB",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "vt_10kv_fz_100_3_05_3p_abb",
            "name": "VT 10 kV/√3 / 100/√3 + 100/3 V kl. 0,5/3P",
            "params": {
                "ratio_primary_v": 5773.5,
                "ratio_secondary_v": 57.7,
                "accuracy_class": "3P",
                "accuracy_class_metering": "0.5",
                "rated_voltage_factor": 1.9,
                "voltage_factor_duration_s": 28800.0,
                "burden_va": 30.0,
                "has_residual_winding": True,
                "manufacturer": "ABB",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note_fz,
                ),
            },
        },
        {
            "id": "vt_15kv_fz_100_3_05_3p_arteche",
            "name": "VT 15 kV/√3 / 100/√3 + 100/3 V kl. 0,5/3P",
            "params": {
                "ratio_primary_v": 8660.3,
                "ratio_secondary_v": 57.7,
                "accuracy_class": "3P",
                "accuracy_class_metering": "0.5",
                "rated_voltage_factor": 1.9,
                "voltage_factor_duration_s": 28800.0,
                "burden_va": 30.0,
                "has_residual_winding": True,
                "manufacturer": "Arteche",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note_fz,
                ),
            },
        },
        {
            "id": "vt_20kv_fz_100_3_05_3p_siemens",
            "name": "VT 20 kV/√3 / 100/√3 + 100/3 V kl. 0,5/3P",
            "params": {
                "ratio_primary_v": 11547.0,
                "ratio_secondary_v": 57.7,
                "accuracy_class": "3P",
                "accuracy_class_metering": "0.5",
                "rated_voltage_factor": 1.9,
                "voltage_factor_duration_s": 28800.0,
                "burden_va": 30.0,
                "has_residual_winding": True,
                "manufacturer": "Siemens",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note_fz,
                ),
            },
        },
        {
            "id": "vt_24kv_fz_100_3_05_3p_schneider",
            "name": "VT 24 kV/√3 / 100/√3 + 100/3 V kl. 0,5/3P",
            "params": {
                "ratio_primary_v": 13856.4,
                "ratio_secondary_v": 57.7,
                "accuracy_class": "3P",
                "accuracy_class_metering": "0.5",
                "rated_voltage_factor": 1.9,
                "voltage_factor_duration_s": 28800.0,
                "burden_va": 30.0,
                "has_residual_winding": True,
                "manufacturer": "Schneider Electric",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note_fz,
                ),
            },
        },
    ]


def get_all_protection_device_types() -> list[dict]:
    def _device_meta(
        *,
        verification_status: str,
        source_reference: str,
        catalog_status: str,
        verification_note: str,
    ) -> dict:
        return {
            "verification_status": verification_status,
            "source_reference": source_reference,
            "catalog_status": catalog_status,
            "contract_version": "2.0",
            "verification_note": verification_note,
        }

    abb_source_reference = "ABB REX / dane referencyjne MV-DESIGN-PRO"
    etango_source_reference = "Elektrometal e2TANGO / dane referencyjne MV-DESIGN-PRO"
    abb_note = "Rekord czesciowo zweryfikowany; zakres funkcji i parametrow wymaga potwierdzenia w karcie producenta."
    etango_note = "Rekord analityczny; zakresy i warianty wymagaja weryfikacji producenta przed uzyciem produkcyjnym."
    return [
        {
            "id": "ACME_REX500_v1",
            "name_pl": "Przekaznik ABB REX-500",
            "params": {
                "vendor": "ABB",
                "series": "REX",
                "revision": "v1",
                "analytical_library_ref": "ACME_REX500_v1",
                "notes_pl": "Rekord zgodny z katalogiem analitycznym ochrony.",
                **_device_meta(
                    verification_status="CZESCIOWO_ZWERYFIKOWANY",
                    source_reference=abb_source_reference,
                    catalog_status="ANALITYCZNY_V1",
                    verification_note=abb_note,
                ),
            },
        },
        {
            "id": "ACME_REX200_v1",
            "name_pl": "Przekaznik ABB REX-200",
            "params": {
                "vendor": "ABB",
                "series": "REX",
                "revision": "v1",
                "analytical_library_ref": "ACME_REX200_v1",
                "notes_pl": "Rekord zgodny z katalogiem analitycznym ochrony.",
                **_device_meta(
                    verification_status="CZESCIOWO_ZWERYFIKOWANY",
                    source_reference=abb_source_reference,
                    catalog_status="ANALITYCZNY_V1",
                    verification_note=abb_note,
                ),
            },
        },
        {
            "id": "ACME_REX100_v1",
            "name_pl": "Przekaznik ABB REX-100",
            "params": {
                "vendor": "ABB",
                "series": "REX",
                "revision": "v1",
                "analytical_library_ref": "ACME_REX100_v1",
                "notes_pl": "Rekord referencyjny rodziny REX dla nizszych zakresow linii i transformatorow.",
                **_device_meta(
                    verification_status="CZESCIOWO_ZWERYFIKOWANY",
                    source_reference=abb_source_reference,
                    catalog_status="ANALITYCZNY_V1",
                    verification_note=abb_note,
                ),
            },
        },
        {
            "id": "ACME_REX300_v1",
            "name_pl": "Przekaznik ABB REX-300",
            "params": {
                "vendor": "ABB",
                "series": "REX",
                "revision": "v1",
                "analytical_library_ref": "ACME_REX300_v1",
                "notes_pl": "Rekord referencyjny rodziny REX dla typowych pol SN.",
                **_device_meta(
                    verification_status="CZESCIOWO_ZWERYFIKOWANY",
                    source_reference=abb_source_reference,
                    catalog_status="ANALITYCZNY_V1",
                    verification_note=abb_note,
                ),
            },
        },
        {
            "id": "ACME_REX700_v1",
            "name_pl": "Przekaznik ABB REX-700",
            "params": {
                "vendor": "ABB",
                "series": "REX",
                "revision": "v1",
                "analytical_library_ref": "ACME_REX700_v1",
                "notes_pl": "Rekord referencyjny rodziny REX dla rozbudowanych zastosowan SN.",
                **_device_meta(
                    verification_status="CZESCIOWO_ZWERYFIKOWANY",
                    source_reference=abb_source_reference,
                    catalog_status="ANALITYCZNY_V1",
                    verification_note=abb_note,
                ),
            },
        },
        {
            "id": "EM_ETANGO_400_V0",
            "name_pl": "Przekaznik Elektrometal e2TANGO-400",
            "params": {
                "vendor": "ELEKTROMETAL",
                "series": "e2TANGO",
                "revision": "v0",
                "analytical_library_ref": "EM_ETANGO_400_V0",
                "rated_current_a": 400.0,
                "notes_pl": "Rekord analityczny - dane wymagaja weryfikacji produkcyjnej.",
                **_device_meta(
                    verification_status="NIEWERYFIKOWANY",
                    source_reference=etango_source_reference,
                    catalog_status="ANALITYCZNY_V1",
                    verification_note=etango_note,
                ),
            },
        },
        {
            "id": "EM_ETANGO_600_V0",
            "name_pl": "Przekaznik Elektrometal e2TANGO-600",
            "params": {
                "vendor": "ELEKTROMETAL",
                "series": "e2TANGO",
                "revision": "v0",
                "analytical_library_ref": "EM_ETANGO_600_V0",
                "rated_current_a": 600.0,
                "notes_pl": "Rekord analityczny - dane wymagaja weryfikacji produkcyjnej.",
                **_device_meta(
                    verification_status="NIEWERYFIKOWANY",
                    source_reference=etango_source_reference,
                    catalog_status="ANALITYCZNY_V1",
                    verification_note=etango_note,
                ),
            },
        },
        {
            "id": "EM_ETANGO_800_V0",
            "name_pl": "Przekaznik Elektrometal e2TANGO-800",
            "params": {
                "vendor": "ELEKTROMETAL",
                "series": "e2TANGO",
                "revision": "v0",
                "analytical_library_ref": "EM_ETANGO_800_V0",
                "rated_current_a": 800.0,
                "notes_pl": "Rekord analityczny - dane wymagaja weryfikacji produkcyjnej.",
                **_device_meta(
                    verification_status="NIEWERYFIKOWANY",
                    source_reference=etango_source_reference,
                    catalog_status="ANALITYCZNY_V1",
                    verification_note=etango_note,
                ),
            },
        },
        {
            "id": "EM_ETANGO_1000_V0",
            "name_pl": "Przekaznik Elektrometal e2TANGO-1000",
            "params": {
                "vendor": "ELEKTROMETAL",
                "series": "e2TANGO",
                "revision": "v0",
                "analytical_library_ref": "EM_ETANGO_1000_V0",
                "rated_current_a": 1000.0,
                "notes_pl": "Rekord analityczny - dane wymagaja weryfikacji produkcyjnej.",
                **_device_meta(
                    verification_status="NIEWERYFIKOWANY",
                    source_reference=etango_source_reference,
                    catalog_status="ANALITYCZNY_V1",
                    verification_note=etango_note,
                ),
            },
        },
        {
            "id": "EM_ETANGO_1250_V0",
            "name_pl": "Przekaznik Elektrometal e2TANGO-1250",
            "params": {
                "vendor": "ELEKTROMETAL",
                "series": "e2TANGO",
                "revision": "v0",
                "analytical_library_ref": "EM_ETANGO_1250_V0",
                "rated_current_a": 1250.0,
                "notes_pl": "Rekord analityczny - dane wymagaja weryfikacji produkcyjnej.",
                **_device_meta(
                    verification_status="NIEWERYFIKOWANY",
                    source_reference=etango_source_reference,
                    catalog_status="ANALITYCZNY_V1",
                    verification_note=etango_note,
                ),
            },
        },
        {
            "id": "EM_ETANGO_1600_V0",
            "name_pl": "Przekaznik Elektrometal e2TANGO-1600",
            "params": {
                "vendor": "ELEKTROMETAL",
                "series": "e2TANGO",
                "revision": "v0",
                "analytical_library_ref": "EM_ETANGO_1600_V0",
                "rated_current_a": 1600.0,
                "notes_pl": "Rekord analityczny - dane wymagaja weryfikacji produkcyjnej.",
                **_device_meta(
                    verification_status="NIEWERYFIKOWANY",
                    source_reference=etango_source_reference,
                    catalog_status="ANALITYCZNY_V1",
                    verification_note=etango_note,
                ),
            },
        },
        {
            "id": "EM_ETANGO_2000_V0",
            "name_pl": "Przekaznik Elektrometal e2TANGO-2000",
            "params": {
                "vendor": "ELEKTROMETAL",
                "series": "e2TANGO",
                "revision": "v0",
                "analytical_library_ref": "EM_ETANGO_2000_V0",
                "rated_current_a": 2000.0,
                "notes_pl": "Rekord analityczny - dane wymagaja weryfikacji produkcyjnej.",
                **_device_meta(
                    verification_status="NIEWERYFIKOWANY",
                    source_reference=etango_source_reference,
                    catalog_status="ANALITYCZNY_V1",
                    verification_note=etango_note,
                ),
            },
        },
    ]


def get_all_protection_curves() -> list[dict]:
    def _curve_meta(*, name: str) -> dict:
        return {
            "verification_status": "REFERENCYJNY",
            "source_reference": "Katalog krzywych MV-DESIGN-PRO / IEC 60255 / IEEE C37.112 / dane referencyjne",
            "catalog_status": "REFERENCYJNY_V1",
            "contract_version": "2.0",
            "verification_note": (
                f"Rekord referencyjny krzywej {name}; parametry wymagaja potwierdzenia w karcie producenta lub normie."
            ),
        }

    return [
        {
            "id": "curve_iec_normal_inverse",
            "name_pl": "IEC normalna inwersyjna",
            "params": {
                "standard": "IEC",
                "curve_kind": "inverse",
                "parameters": {"A": 0.14, "B": 0.02},
                **_curve_meta(name="IEC normalna inwersyjna"),
            },
        },
        {
            "id": "curve_iec_very_inverse",
            "name_pl": "IEC bardzo inwersyjna",
            "params": {
                "standard": "IEC",
                "curve_kind": "very_inverse",
                "parameters": {"A": 13.5, "B": 1.0},
                **_curve_meta(name="IEC bardzo inwersyjna"),
            },
        },
        {
            "id": "curve_iec_extremely_inverse",
            "name_pl": "IEC skrajnie inwersyjna",
            "params": {
                "standard": "IEC",
                "curve_kind": "extremely_inverse",
                "parameters": {"A": 80.0, "B": 2.0},
                **_curve_meta(name="IEC skrajnie inwersyjna"),
            },
        },
        {
            "id": "curve_iec_long_time_inverse",
            "name_pl": "IEC dlugoczasowo inwersyjna",
            "params": {
                "standard": "IEC",
                "curve_kind": "long_time_inverse",
                "parameters": {"A": 120.0, "B": 1.0},
                **_curve_meta(name="IEC dlugoczasowo inwersyjna"),
            },
        },
        {
            "id": "curve_ieee_moderately_inverse",
            "name_pl": "IEEE umiarkowanie inwersyjna",
            "params": {
                "standard": "IEEE",
                "curve_kind": "moderately_inverse",
                "parameters": {"A": 0.0515, "B": 0.02, "C": 0.114},
                **_curve_meta(name="IEEE umiarkowanie inwersyjna"),
            },
        },
        {
            "id": "curve_ieee_very_inverse",
            "name_pl": "IEEE bardzo inwersyjna",
            "params": {
                "standard": "IEEE",
                "curve_kind": "very_inverse",
                "parameters": {"A": 19.61, "B": 0.491, "C": 0.114},
                **_curve_meta(name="IEEE bardzo inwersyjna"),
            },
        },
        {
            "id": "curve_ieee_extremely_inverse",
            "name_pl": "IEEE skrajnie inwersyjna",
            "params": {
                "standard": "IEEE",
                "curve_kind": "extremely_inverse",
                "parameters": {"A": 28.2, "B": 0.1217, "C": 0.02},
                **_curve_meta(name="IEEE skrajnie inwersyjna"),
            },
        },
        {
            "id": "curve_ansi_inverse",
            "name_pl": "ANSI inwersyjna",
            "params": {
                "standard": "ANSI",
                "curve_kind": "inverse",
                "parameters": {"K": 0.0515, "alpha": 0.02, "beta": 0.114},
                **_curve_meta(name="ANSI inwersyjna"),
            },
        },
    ]


def get_all_protection_setting_templates() -> list[dict]:
    def _template_meta(*, name: str) -> dict:
        return {
            "verification_status": "REFERENCYJNY",
            "source_reference": "Szablony nastaw MV-DESIGN-PRO / IEC 60255 / dane referencyjne",
            "catalog_status": "REFERENCYJNY_V1",
            "contract_version": "2.0",
            "verification_note": (
                f"Szablon referencyjny {name}; przed uzyciem nalezy potwierdzic dobor na podstawie modelu sieci i karty producenta."
            ),
        }

    return [
        {
            "id": "template_rex500_oc",
            "name_pl": "Szablon ABB REX-500 - nadpradowy",
            "params": {
                "device_type_ref": "ACME_REX500_v1",
                "curve_ref": "curve_iec_normal_inverse",
                "setting_fields": [
                    {"name": "I>", "unit": "A", "min": 0.1, "max": 10.0},
                    {"name": "t>", "unit": "s", "min": 0.0, "max": 5.0},
                ],
                **_template_meta(name="ABB REX-500 - nadpradowy"),
            },
        },
        {
            "id": "template_rex300_oc",
            "name_pl": "Szablon ABB REX-300 - nadpradowy",
            "params": {
                "device_type_ref": "ACME_REX300_v1",
                "curve_ref": "curve_iec_very_inverse",
                "setting_fields": [
                    {"name": "I>", "unit": "A", "min": 0.1, "max": 12.0},
                    {"name": "t>", "unit": "s", "min": 0.0, "max": 6.0},
                    {"name": "I>>", "unit": "A", "min": 1.0, "max": 80.0},
                ],
                **_template_meta(name="ABB REX-300 - nadpradowy"),
            },
        },
        {
            "id": "template_rex100_oc",
            "name_pl": "Szablon ABB REX-100 - nadpradowy",
            "params": {
                "device_type_ref": "ACME_REX100_v1",
                "curve_ref": "curve_iec_normal_inverse",
                "setting_fields": [
                    {"name": "I>", "unit": "A", "min": 0.1, "max": 8.0},
                    {"name": "t>", "unit": "s", "min": 0.0, "max": 5.0},
                ],
                **_template_meta(name="ABB REX-100 - nadpradowy"),
            },
        },
        {
            "id": "template_etango_400_ef",
            "name_pl": "Szablon e2TANGO-400 - ziemnozwarciowy",
            "params": {
                "device_type_ref": "EM_ETANGO_400_V0",
                "curve_ref": "curve_iec_very_inverse",
                "setting_fields": [
                    {"name": "I0>", "unit": "A", "min": 0.1, "max": 10.0},
                    {"name": "t0>", "unit": "s", "min": 0.0, "max": 5.0},
                ],
                **_template_meta(name="e2TANGO-400 - ziemnozwarciowy"),
            },
        },
        {
            "id": "template_etango_800_ef",
            "name_pl": "Szablon e2TANGO-800 - ziemnozwarciowy",
            "params": {
                "device_type_ref": "EM_ETANGO_800_V0",
                "curve_ref": "curve_ieee_very_inverse",
                "setting_fields": [
                    {"name": "I0>", "unit": "A", "min": 0.1, "max": 12.0},
                    {"name": "t0>", "unit": "s", "min": 0.0, "max": 6.0},
                    {"name": "I0>>", "unit": "A", "min": 1.0, "max": 50.0},
                ],
                **_template_meta(name="e2TANGO-800 - ziemnozwarciowy"),
            },
        },
        {
            "id": "template_etango_1250_oc",
            "name_pl": "Szablon e2TANGO-1250 - nadpradowy",
            "params": {
                "device_type_ref": "EM_ETANGO_1250_V0",
                "curve_ref": "curve_iec_extremely_inverse",
                "setting_fields": [
                    {"name": "I>", "unit": "A", "min": 0.1, "max": 20.0},
                    {"name": "t>", "unit": "s", "min": 0.0, "max": 6.0},
                    {"name": "I>>", "unit": "A", "min": 1.0, "max": 120.0},
                ],
                **_template_meta(name="e2TANGO-1250 - nadpradowy"),
            },
        },
        {
            "id": "template_etango_1600_ef",
            "name_pl": "Szablon e2TANGO-1600 - ziemnozwarciowy",
            "params": {
                "device_type_ref": "EM_ETANGO_1600_V0",
                "curve_ref": "curve_iec_long_time_inverse",
                "setting_fields": [
                    {"name": "I0>", "unit": "A", "min": 0.1, "max": 20.0},
                    {"name": "t0>", "unit": "s", "min": 0.0, "max": 8.0},
                    {"name": "I0>>", "unit": "A", "min": 1.0, "max": 150.0},
                ],
                **_template_meta(name="e2TANGO-1600 - ziemnozwarciowy"),
            },
        },
        {
            "id": "template_etango_2000_oc",
            "name_pl": "Szablon e2TANGO-2000 - nadpradowy",
            "params": {
                "device_type_ref": "EM_ETANGO_2000_V0",
                "curve_ref": "curve_ansi_inverse",
                "setting_fields": [
                    {"name": "I>", "unit": "A", "min": 0.1, "max": 30.0},
                    {"name": "t>", "unit": "s", "min": 0.0, "max": 8.0},
                    {"name": "I>>", "unit": "A", "min": 1.0, "max": 200.0},
                ],
                **_template_meta(name="e2TANGO-2000 - nadpradowy"),
            },
        },
    ]
