# RECENZJA EKSPERCKA — MACIERZ WYPOSAŻENIA PÓL L2 (2026-07-23) — WIĄŻĄCA

Status: **WIĄŻĄCA** (uwagi właściciela do dostawy W1, ocena **7,5/10** —
„kierunek dobry, ale macierz zbyt uproszczona jako referencja globalna").
Uzupełnia `RECENZJA_L2_POLA_WYPOSAZENIE_2026-07.md` (V12K-145); przy
sprzeczności wygrywa TEN dokument w zakresie macierzy wyposażenia.

## Uwagi (1–18, skondensowane bez utraty treści)

1. Macierz GENEROWANA BEZPOŚREDNIO z konfiguracji kreatora, nie z ręcznych
   przykładów — każda kombinacja aparatów dostępna w kreatorze ma wzorzec SLD.
2. Sześć przykładów to podzbiór — w praktyce dziesiątki wariantów pól
   (liniowe, transformatorowe, sprzęgłowe, pomiarowe, odpływowe, sekcyjne,
   OZE, BESS, generatorowe) — jeden GLOBALNY silnik dla wszystkich.
3. Kolejność aparatów zawsze wg realnego toru pierwotnego: PN-EN 61936,
   IEC 60617, praktyka producentów (Elektrometal, ZPUE, Schneider RM6/SM6,
   Siemens 8DJH, ABB SafeRing/SafePlus, Eaton Xiria…).
4. GŁOWICA nie jest aparatem pola — jest zakończeniem KABLA: rysowana
   dokładnie w miejscu przejścia kabla do wnętrza pola, nigdy oderwana.
5. UZIEMNIK jednoznacznie powiązany z odcinkiem toru (funkcjonalnie na
   przewodzie, z węzłem przyłączenia), nie „osobny symbol obok kolumny".
6. OGRANICZNIK PRZEPIĘĆ = odgałęzienie od toru DO ZIEMI — nigdy jako kolejny
   aparat w torze głównym.
7. CT ≠ VT jednoznacznymi symbolami biblioteki; przyszłość (rejestr braków,
   wymaga danych ENM): CT pomiarowy vs zabezpieczeniowy, zestawy
   wielordzeniowe, VT szynowy vs kablowy.
8. Pole TR konfigurowalne: LBS+bezpieczniki / CB / CB+zabezpieczenie cyfrowe
   / przekładniki / ograniczniki / pomiar energii / automatyka SZR.
9. Brakujące typy pól: sprzęgło sekcyjne, pomiarowe, bateria kondensatorów,
   potrzeby własne, OZE, BESS, generator, rezerwowe.
10. Każdy wariant ma IDENTYFIKATOR KONFIGURACJI używany przez silnik —
    render nie zgaduje wyposażenia z typu pola.
11. Jednolity raster/odstępy/pozycjonowanie symboli między konfiguracjami
    (dziś różnice wysokości utrudniają porównanie).
12. OBOWIĄZKOWE odległości pionowe między aparatami + minimalne odległości
    od szyn i kabla — stałe kontraktowe, nie „na oko".
13. Macierz pokazuje też warianty aparat OTWARTY/ZAMKNIĘTY (weryfikacja
    stanów pracy).
14. Warianty z 2× uziemnikiem, 2× przekładnikiem, dodatkowymi aparatami
    pomiarowymi.
15. Grupowanie funkcjonalne: liniowe / transformatorowe / OZE / sprzęgłowe /
    pomiarowe / specjalne.
16. Macierz = TEST REFERENCYJNY SILNIKA (nie dokumentacja poglądowa) —
    zmiana w kreatorze automatycznie generuje przypadki testowe.
17. GLOBALNIE: algorytm nie może być dopasowany do sześciu przykładów ani
    sieci demonstracyjnej — dowolna konfiguracja realnych sieci SN różnych
    operatorów i producentów.
18. Auto-weryfikacja per konfiguracja: kolejność aparatów · ciągłość toru ·
    zgodność z kreatorem · zgodność z biblioteką symboli · brak kolizji ·
    poprawne odgałęzienia doziemne · poprawny render na wszystkich LOD.

## Mapowanie na program (rozszerzenie V12K-145)

- **W1b (P0, po scaleniu W2 — te same pliki kompozycji):** semantyka toru:
  głowica dokładnie na przejściu kabla (uwaga 4), uziemnik funkcjonalnie na
  odcinku toru z węzłem (5), SA jako odgałęzienie tor→ziemia (6), jednolity
  raster + kontraktowe odstępy pionowe aparatów i od szyny/kabla (11, 12),
  warianty stanów otwarty/zamknięty i krotności (2×ES/2×CT) w macierzy
  (13, 14).
- **W1c (P0/P1):** macierz GENERATYWNA: enumeracja realnych kombinacji z
  katalogu szablonów (kanonicznych + most producencki `cell_configurations`
  → `primary_devices` — jawny dług W1), identyfikator konfiguracji w meta
  sceny (10), grupowanie funkcjonalne (15), typy pól z uwagi 9 w zakresie,
  w jakim ENM/kreator je niesie (bez fabrykacji — brakujące typy pól w
  kreatorze = jawny rejestr braków), wyrocznie auto-weryfikacji 18 jako
  sondy accept, generacja przypadków testowych z katalogu (16, 17).
- **W5:** warianty CT/VT z uwagi 7 (wymagają rozszerzenia danych ENM —
  rejestr braków, decyzja danych, zero zgadywania).

Zasada nadrzędna (17): reguły wyłącznie z danych konfiguracji i stałych
kontraktowych — żadnych wyjątków pod przykłady; wykrycie dopasowania pod
fixture = odrzucenie (spójne z WYTYCZNE_GENERALIZACJA).

## Macierz generatywna — status wdrożenia (W1c, 2026-07-24)

**Status: WDROŻONA** (uwagi 1, 2, 3, 9, 10, 15, 16, 17, 18). Macierz jest
TESTEM REFERENCYJNYM SILNIKA generowanym Z KATALOGU konfiguracji — nie z ręcznej
listy przykładów. Ręczna macierz W1b (9 wariantów) zostaje jako regresja; ta
macierz jest NADRZĘDNA (uwaga 17).

### Łańcuch end-to-end

1. **Enumeracja katalogu (backend):**
   - kanoniczne: `network_model/catalog/bay_templates.py`
     `enumerate_canonical_configurations()` — 10 szablonów `BAY_TEMPLATE_REGISTRY`
     + 2 warianty pola źródłowego SN (W2b) = **12 konfiguracji kanonicznych**;
   - producenckie: `reference_engine/field_configuration_catalog.py`
     `enumerate_field_configurations()` — most `cell_configurations` →
     `primary_devices` dla packów producenckich = **40 konfiguracji
     producenckich** (ABB SafeRing 10, ABB UniGear 7, Schneider SM6 12,
     Siemens 8DJH 11). Most porządkuje nieuporządkowany zbiór aparatów celki wg
     kanonicznego toru głównego (superset kolejności profili pól) i klasyfikuje
     aparaty boczne (ES/VT/SA) na odgałęzienia (§18.1).
2. **Artefakt (anty-dryf):** `scripts/gen_field_configurations_catalog.py`
   materializuje enumerację do `frontend/.../fixtures/fieldConfigurationsCatalog.json`;
   `tests/network_model/test_field_configurations_catalog.py` asercją pilnuje, że
   plik == żywy wynik enumeracji (jedno źródło logiki — backend; frontend tylko
   konsumuje, zero duplikacji).
3. **Generator (frontend):** `fixtures/w1cMatrixCatalog.ts` iteruje enumerację;
   dla każdej renderowalnej konfiguracji × wariant stanu aparatu głównego
   (zamknięty/otwarty) buduje przypadek, wstrzykuje do osobnego pola-hosta sieci
   `sldSubstrate52s` → **79 przypadków macierzy** (grupy funkcjonalne, uwaga 15).
4. **Identyfikator konfiguracji (uwaga 10):** `config_id` = `<config_ref>::<stan>`
   — dana pola (`field_spec.config_id`, backend `_build_field_spec`) niesiona
   `adapter → snBays → ComposedSymbolInstance → scena (meta.configId,
   data-config-id)`. Render NIE zgaduje wyposażenia z typu/roli pola —
   tożsamość konfiguracji jest DANĄ; dowód „prymat danych nad rolą":
   konfiguracja transformatorowa w polu-hoście dowolnej roli rysuje transformer.
5. **Wyrocznie auto-weryfikacji (uwaga 18)** — `buildScene.w1cMatrixGen.test.ts`,
   per przypadek + scenowo na L2: kolejność aparatów == kolejność danych ·
   ciągłość toru + brak kolizji · zgodność liczby/typów glifów z biblioteką
   (`SYMBOL_DEFS`) · odgałęzienia doziemne ES/SA przyłączone węzłem do osi toru ·
   render na L0/L1/L2 bez wyjątków + kotwica stała (mainTrunk niezmienny) ·
   `configId` obecny.
6. **Render dowodowy:** `scripts/render_schemat10_w1c.tsx` →
   `docs/audit/visual/schemat-10/w1c-l2-macierz-gen.png` (macierz z enumeracji,
   grupy funkcjonalne, podpisy z config_id, plakietki źródła kanon/producent).

### Grupy funkcjonalne (uwaga 15) — 79 przypadków

liniowe 54 · transformatorowe 2 · OZE 10 · sprzęgłowe 2 · pomiarowe 9 ·
specjalne 2. Grupa kanoniczna z roli pola (dana katalogowa); grupa producencka
wywiedziona z sygnatury aparatury (celki producentów nie deklarują `bay_kind` —
transparentnie, zero fabrykacji roli).

### Rejestr braków katalogu (zero fabrykacji, uwagi 9/16)

- **Typy pól bez szablonu (uwaga 9):** `bateria_kondensatorow`,
  `generator_synchroniczny` (odróżniony od źródła OZE inwerterowego) — brak
  szablonu w katalogu; czekają na decyzję danych/domeny. Pozostałe typy z uwagi 9
  są pokryte (liniowe, transformatorowe, sprzęgło COUPLER, pomiarowe MEASUREMENT,
  OZE, rezerwowe, potrzeb własnych AUX).
- **Packi producenckie bez `cell_configurations`:** `elektrometal_e2alpha` (1) —
  brak konfiguracji celek w pakiecie, most nie ma czego zmaterializować.
- **Celki producenckie bez toru głównego (nie-renderowalne):** `abb_safering:Be`,
  `schneider_sm6:EMB`, `siemens_8djh:E` (3) — złożone wyłącznie z aparatów
  bocznych (np. moduł uziemnika/przekładnika szyn), nie tworzą stosu pola;
  rejestrowane, poza macierzą renderu.
- **Warianty CT/VT (uwaga 7)** — poza zakresem W1c (wymaga rozszerzenia danych
  ENM; W5, decyzja danych).

### Długi jawne

- **Oznaczenia (`designation`) w macierzy generatywnej** — W1c używa
  identyfikatorów z KONWENCJI (Q/QE/T, §19.1), nie wstrzykuje oznaczeń danych,
  bo katalogowe etykiety producenckie (np. „F1"/„TR") nie realizują konwencji
  §19.1 aparatu identyfikowalnego (fuseSwitch→Q, transformer2W→T). Oznaczenia
  DANYCH per aparat są odrębnie ćwiczone przez W1b/F10.2 (V12K-035). Ujednolicenie
  konwencji oznaczeń fuse/transformer w katalogu kanonicznym — do decyzji domeny.
