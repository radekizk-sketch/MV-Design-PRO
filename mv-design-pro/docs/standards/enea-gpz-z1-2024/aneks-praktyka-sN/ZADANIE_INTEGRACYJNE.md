# Integracja atlasu do istniejących katalogów MV-DESIGN-PRO — kontrakt bez duplikacji

**Decyzja właściciela:** rekordy rozwiązania z P1/P2 są **zweryfikowane i dopuszczone jako rozwiązania projektowe**. Tę informację należy pokazywać w bazie rozwiązań, a nie jako „niezweryfikowane dane projektowe”. Każda pozycja ma ustalony zasięg zastosowania.

## Stan faktyczny repo (13.11.2026, gałąź main jako punkt odniesienia)

1. `backend/src/reference_engine/packs/elektrometal_e2alpha/pack.json`: pakiet zawiera rodzinę rozdzielnicy i odwołanie do sterowników e²TANGO, **bez `cell_configurations`**. W aktualnym uzasadnieniu wskazano brak opublikowanych przez producenta kompletnych składów typowych pól.
2. `backend/src/reference_engine/models.py`: `ReferenceCellConfiguration` wymaga `source_pl` i działa według kontraktu **konfiguracje wyłącznie z publicznych katalogów producenta**. Nie wpisywać tutaj prywatnego projektu pod pozorem publicznej karty katalogowej.
3. `backend/src/network_model/catalog/switchgear/manufacturer.py`: producent to osobna encja, status źródeł jest jawny.
4. `docs/catalog/CATALOG_PROTECTION_V1_SPEC.md`: szablony nastaw są odrębne od urządzeń i krzywych; istniejący wpis „e²TANGO nieweryfikowany” powinien podlegać rozstrzygnięciu przy łączeniu dowodów z P2 i z oficjalnej karty producenta, a nie automatycznej zmianie statusu wszystkich odmian e²TANGO.
5. `docs/catalog/CATALOG_CT_VT_V1_SPEC.md`, `docs/catalog/CATALOG_SWITCHGEAR_V1_SPEC.md`, `docs/ui/CATALOG_BROWSER_CONTRACT.md`: istniejące kontrakty trzeba wykorzystać, nie zastępować.
6. `docs/standards/enea-gpz-z1-2024/`: pakiet PR #532 definiuje normatywny punkt odniesienia dla **nowych pól GPZ**. Dokumentacja P1/P2 to **zatwierdzona praktyka w zakresie modernizacji**, bez ogólnego uchylania wymagań nowego projektu.
7. `docs/sld/SLD_ELEKTROMETAL_TEMPLATES.md` oraz `docs/sld/REFERENCE_ENGINE_SPEC_V1.md`: nie tworzyć drugich identyfikatorów typu pola, drugiego silnika geometrycznego ani katalogu „obok”.

## Jak zasilić istniejący system

**Wzorce zastosowania (projektowy poziom źródła)** muszą być rozdzielone od:
- publicznego katalogu producenta (urządzenie/rodzina/wariant/SKU);
- standardu ENEA (wymaganie dla rodzaju obiektu);
- obliczonego doboru dla konkretnego przypadku sieciowego;
- nastaw przyjętych na podstawie pomiarów i zatwierdzonych do uruchomienia.

Zalecane pola pochodzenia rekordów są semantyczne, nie narzucają nowego API:
- `evidence_kind`: `manufacturer_public` / `osd_standard` / `approved_design_reference`;
- `approval_status`: `owner_approved_design`;
- `applicability`: `modernization`, `new_build` lub określone warunki zastosowania;
- `family_ref`, `device_type_ref`, `variant_ref`, `bay_role`, `source_version`;
- `data_visibility`: `public_sanitized` / `private_original`;
- `safety_class`: wartości znamionowe produktów odrębne od nastaw i mapy telemechaniki.

**Fable/Opus mają prawo samodzielnie wybrać implementację zgodną z istniejącym modelem**. Nie należy dodawać `cell_configurations` prywatnego projektu do pakietu `ReferenceCellConfiguration` bez jawnej zmiany kontraktu źródeł, potwierdzonej semantyki i testów. Uzupełnienie brakującego składu e²ALPHA z prywatnych schematów jest wartościowe i zatwierdzone jako **referencja projektowa** — nie jest automatycznie nowym oficjalnym katalogiem producenta.

## Zastosowanie per funkcja

| Obszar | Rejestr docelowy | Kryterium użyteczności |
|---|---|---|
| Rodziny producentów | istniejąca encja `Manufacturer` | osobny producent i wersja katalogu; bez mieszania Elektrometal Energetyka z Elektrometal SA |
| Rozdzielnica/CB/ES | `switchgear` + `reference_engine` | zatwierdzone przykłady e²ALPHA / e²BRAVO / e²DELTA, interlocki wózka |
| CT/VT/Ferranti | katalog CT/VT | uzwojenia i rdzenie, klasa, VA, zaczepy, tor pomiaru składowej zerowej |
| IED i EAZ | katalog ochrony + silnik analiz EAZ | osobne tryby z i bez generacji, konfiguracja IED, logika sterowania |
| Pola GPZ i stacji | istniejące typy `Bay`/szablony | pole pomiaru napięcia, liniowe, generacyjne, TR, ZU; bez zmyślania 110 kV |
| Aparatura pomocnicza | istniejący `mv_auxiliary_catalog` lub kompatybilny rejestr | Apator/Relpol/Eaton/Promet/ELBAR/MERAZET jako niezależne marki |
| Łączność | baza urządzeń/protokołów w zakresie projektu | katalog urządzeń Cisco/Moxa **bez** mapy rzeczywistych adresów i punktów |
| UI/SLD | jedna projekcja SN i jedna logika `computeLayout` | numeracja i topologia stałe przy LOD 0/1/2 i zoom |
| Walidacja | istniejący `reference_engine` i testy EAZ | REF-T01…REF-T20, testy poprawności danych, nie nowy audytor |

## Weryfikacja aktualności i odbiór

- Nie podmieniać istniejącej gałęzi wykonawcy, która przebudowuje GPZ/EAZ. Ten PR jest **przyrostem wiedzy**, do przejęcia przez aktualne wykonanie.
- Przed materializacją sprawdzić wszystkie źródła producenta i porównać wymaganie normatywne (ENEA §13 / Z.7/Z.17) z obszarem zastosowania (modernizacja albo nowy GPZ).
- **Przyjęte rozwiązania z P1/P2 pozostają dopuszczone**; wykryte niespójności zapisu należy naprawiać w rekordach lub w walidatorze, nie odrzucać całego rozwiązania.
- Do PR trafiają jedynie anonimizowane syntezy i struktury danych. Nie commitować plików źródłowych ani odtworzalnych nastaw/połączeń konkretnego GPZ.
- Testy aplikacyjne i bramka B-02 zachowują dotychczasowy status. Autor tego aneksu **nie przeprowadził testów runtime** i nie deklaruje wdrożenia katalogu produkcyjnego.

**Rezultat docelowy:** z zatwierdzonego rozwiązania SN można wybrać realną rodzinę/wykonanie, skompletować aparat, przypisać CT/VT/EAZ, wyliczyć i skontrolować parametry, wyświetlić na SLD i odtworzyć zapis z zachowaniem pochodzenia danych.
