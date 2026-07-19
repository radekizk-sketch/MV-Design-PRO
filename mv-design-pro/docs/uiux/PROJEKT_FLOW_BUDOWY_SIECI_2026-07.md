# PROJEKT: Prowadzący flow budowy sieci SN (E2) — opcja MAX, każdy krok = realna operacja domenowa

**Status:** BINDING (projekt architektoniczny; dyrektywa właściciela 2026-07-19:
„jako architekt przemyśl i przeprojektuj w opcji na max, każdy krok ma realną
operację domenową").
**Zakres:** guided flow „Budowa modelu sieci" (FLOW E2) od GPZ w dół, jako
kreatory ui2 na frameworku `kreatory/rama` (wzorzec: `KreatorZrodloZasilania`).
**Rejestr:** V12K-047.
**Zasada nadrzędna:** ZERO fabrykacji — każdy krok/kontrolka mapuje na realną
operację domenową (`enm/domain_operations*.py`); wartości liczbowe z backendu
(katalog + podglądy solvera R1/R2), zero fizyki w UI. Reużycie frameworka i
pickerów katalogu; kontrakt ekranu prowadzącego (cel jednym zdaniem · tor pracy ·
uczciwy stan zerowy · jawny następny krok · język inżynierski: po co / z czego /
co daje).

---

## 0. Mapa myślenia inżyniera (do ostatniego klika)

Po GPZ (źródło 110 kV + transformator 110/SN z OLTC + szyny SN + pola odpływowe)
inżynier prowadzi sieć w dół. Każde ogniwo to realna operacja domenowa:

```
GPZ ─▶ magistrala SN ─▶ [ZKSN / słup rozgałęźny] ─▶ stacja SN/nN ─▶ transformator SN/nN
                     └▶ odgałęzienie ─▶ …                        └▶ rozdz. nN ─▶ odpływy nN ─▶ odbiory / OZE (PV/BESS/FW) / genset / UPS
     └▶ sekcjonowanie: łącznik sekcyjny · pierścień · punkt normalnie otwarty (NOP)
     └▶ pomiary i zabezpieczenia pól: CT · VT · przekaźnik · nastawy
```

---

## 1. Kroki flow → realne operacje domenowe (kompletna mapa)

| Krok (ekran prowadzący) | Realna operacja domenowa | Wejście (katalog/pola) | Podgląd z backendu | Stan |
|-------------------------|--------------------------|------------------------|--------------------|------|
| Źródło GPZ (110/SN + OLTC) | `add_grid_source_sn` | ZRODLO_SN, TRAFO, TapChanger, rozdzielnica/szablony | Ik″/κ/ip/Ith (IEC 60909) | ✅ `KreatorZrodloZasilania` |
| **Wyprowadź magistralę SN** | `continue_trunk_segment_sn` | KABEL_SN/LINIA_SN, długość, rodzaj | ΔU, prąd (R1) | **G-MAG (ten projekt)** |
| Rozpocznij odgałęzienie | `start_branch_segment_sn` | j.w. + punkt startu | ΔU, prąd | G-ODG |
| Słup rozgałęźny na odcinku | `insert_branch_pole_on_segment_sn` | punkt na odcinku | — | G-ODG |
| ZKSN na odcinku | `insert_zksn_on_segment_sn` | ZKSN katalog, punkt | — | G-ZKSN |
| Postaw stację na odcinku | `insert_station_on_segment_sn` | typ stacji, punkt | — | G-STA |
| Dołącz stację na końcu ciągu | `append_station_on_endpoint` | typ stacji, terminal | — | G-STA |
| Transformator SN/nN | `add_transformer_sn_nn` | TRAFO_SN_NN (Sn/uk/grupa, DETC/OLTC) | prądy I1/I2 (R2) | G-TRF |
| Pole SN (odpływ/sprzęgło/pomiar) | `add_sn_bay` | rola pola, aparat, szablon | — | G-POLE |
| Łącznik sekcyjny | `insert_section_switch_sn` | aparat, sekcje | — | G-SEK |
| Domknij pierścień | `connect_secondary_ring_sn` | terminale | — | G-RING |
| Punkt normalnie otwarty (NOP) | `set_normal_open_point` | łącznik | — | G-RING |
| Odpływ nN | `add_nn_outgoing_field` | KABEL_NN, aparat nN | ΔU, prąd | G-NN |
| Odbiór nN | `add_nn_load` | typ odbioru, P/Q/cosφ | prąd znam. | G-NN |
| Źródło OZE (PV/BESS/FW) | `add_converter_source` | falownik, block-trafo, tryby Q(U)/P(f) | — | G-OZE |
| Agregat nN | `add_genset_nn` | genset katalog | — | G-NN |
| UPS nN | `add_ups_nn` | UPS katalog | — | G-NN |
| Przekładnik prądowy CT | `add_ct` | CT katalog | — | G-POM |
| Przekładnik napięciowy VT | `add_vt` | VT katalog | — | G-POM |
| Przekaźnik + powiązanie | `add_relay` / `link_relay_to_field` | przekaźnik, pole | — | G-ZAB |
| Nastawy przekaźnika | `update_relay_settings` | funkcje 50/51/… | TCC (`calculate_tcc_curve`) | ✅ E-27 |

Operacje wspólne (edycja): `assign_catalog_to_element`, `update_element_parameters`,
`rename_element`, `set_label`, `delete_element` — używane w inspektorze/property-grid,
nie jako osobne kreatory.

---

## 2. Kontrakt kreatora budowy (opcja MAX, wspólny)

Każdy kreator budowy na frameworku `kreatory/rama` spełnia:

1. **Cel jednym zdaniem** (po co ten element w sieci).
2. **Tor pracy** = kroki (jak w kreatorze GPZ), z akcjami naprawczymi przy błędach.
3. **Katalog-first**: typ elementu z katalogu (picker), zero ręcznych impedancji;
   parametry (R/X/Iznam) czytane z pozycji katalogowej.
4. **Podgląd konsekwencji z backendu** (gdzie dostępny): ΔU i prąd (R1
   `cable-voltage-drop-preview`/`cable-rated-current-preview`), prądy trafo (R2
   `transformer-rated-currents-preview`). ZERO fizyki w UI.
5. **Uczciwe stany zerowe**: gdy brak wymaganego kontekstu (np. brak ciągu do
   wyprowadzenia) — komunikat + akcja, nie pusty ekran.
6. **Jawny następny krok**: po zapisie ekran wskazuje kolejne ogniwo łańcucha
   (magistrala → stacja → transformator → odpływy → OZE → …).
7. **Zapis = realna operacja domenowa** przez `snapshotStore.executeDomainOperation`
   (kanoniczny op), payload zgodny z kontraktem `domain_operations*.py`.
8. **Rejestracja dostawcy (Opcja 1)**: `operationFormRegistry` (op → komponent) +
   `operationSurfaceRegistry` (metadane: sizeClass, openMode `expand_workspace`).
   Podmiana istniejących form (`ContinueTrunkForm` → `KreatorMagistralaSn` itd.)
   bez zmiany kontraktu operacji.

Determinizm i granice: kontrakty operacji i seedy bez zmian; nowe pola addytywne;
brak edycji `ui/sld/**` (wątek SLD — nawigacja model↔schemat pozostaje wspólna,
ale kanwa należy do V12K-060).

---

## 3. Kolejność wdrożenia (fazy G, priorytet wg bólu inżyniera)

1. **G-MAG** — Wyprowadź magistralę SN (`continue_trunk_segment_sn`) — wybór właściciela; bez niej nie ma na czym zawiesić sieci.
2. **G-STA** — Stacja SN/nN (`insert_station_on_segment_sn` / `append_station_on_endpoint`) + **G-TRF** transformator (`add_transformer_sn_nn`).
3. **G-NN** — odpływy nN + odbiory (`add_nn_outgoing_field`, `add_nn_load`) + **G-OZE** (`add_converter_source`).
4. **G-SEK/G-RING** — sekcjonowanie, pierścienie, NOP.
5. **G-ODG/G-ZKSN/G-POLE/G-POM/G-ZAB** — odgałęzienia, ZKSN, pola, CT/VT, przekaźniki.

Każda faza: kreator na frameworku, payload = realny op, podgląd z backendu,
testy realnej ścieżki (natywny klik → op domenowa), type-check/lint/guardy,
regresje obu stosów, zrzut żywej aplikacji do oceny.

---

## 4. Definicja ukończenia (DoD)

- Każde ogniwo łańcucha §1 ma kreator ui2 na frameworku, mapujący na realną
  operację domenową (zero phantomów).
- Katalog-first wymuszony; podglądy liczbowe z backendu; zero fizyki w UI.
- Każdy kreator ma jawny następny krok → pełny łańcuch „GPZ → … → odbiory/OZE →
  Gotowość → Obliczenia".
- Retirowane stare formularze (`ContinueTrunkForm` itd.) usunięte po podmianie.
- Pełne regresje, guardy, determinizm; zrzuty żywej aplikacji zatwierdzone.
