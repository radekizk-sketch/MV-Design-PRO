> **Historical note (V12.5)**
> This file is preserved as historical reference only.
> docs/spec/ is not an active source of truth.
> Any binding, canonical, AS-IS, TO-BE, or roadmap language below reflects the original document state and is kept for audit context.
> Use ../INDEX_KANONICZNY.md to locate current canonical documentation.

# Jak modelowa� magistral� i odga��zienia SN

**MV-DESIGN-PRO � PR-9 przewodnik modelowania**
**Status:** INFORMATIONAL
**Warstwa:** Application / UI

---

> **ZASADA KANONICZNA (BINDING)**
>
> MV-DESIGN-PRO dzia�a wy��cznie w modelu:
> **TYPE (CATALOG) � INSTANCE � SOLVER INPUT**
>
> - UI **NIGDY** nie udost�pnia p�l do edycji parametr�w elektrycznych.
> - Wszystkie parametry techniczne pochodz� wy��cznie z `catalog_ref`.
> - Je�eli parametr nie istnieje w katalogu � **nie mo�e istnie� w instancji ani w UI**.
> - TRYB EKSPERT pozwala nadpisa� istniej�cy parametr katalogowy, nie dodaje nowych.

---

## 1. Wst�p

Niniejszy dokument opisuje spos�b modelowania typowej sieci SN w MV-DESIGN-PRO:
magistrala (trunk/spine), odga��zienia (laterals), stacje transformatorowe SN/nn,
aparatura ��czeniowa, przek�adniki pomiarowe, zabezpieczenia, odbiory i �r�d�a OZE/BESS.

### 1.1 Konwencja opisu operacji

Operacje opisane w tym dokumencie (�dodaj szyn�", �dodaj ga���") s� **poj�ciowe** �
odpowiadaj� transakcyjnym akcjom w interfejsie u�ytkownika (UI).
Nie stanowi� one kontraktu API, nie definiuj� nazw endpoint�w i nie gwarantuj�
sygnatury �adnej funkcji backendowej. Faktyczny interfejs programistyczny
mo�e si� r�ni� od opis�w w guide.

### 1.2 Zakres PR-9 (Czego PR-9 nie robi)

PR-9 umo�liwia zapisanie **topologii sieci** i **konfiguracji katalogowej**.
PR-9 **nie wykonuje �adnych oblicze�**:

- nie liczy rozp�ywu mocy (PF),
- nie liczy zwar� (SC / IEC 60909),
- nie wykonuje koordynacji zabezpiecze�,
- nie wyprowadza parametr�w zabezpiecze�,
- nie weryfikuje parametr�w pr�dowo-czasowo,
- nie �zgaduje" ani nie interpoluje parametr�w technicznych.

Elementy wprowadzone w PR-9 to **konfiguracja wej�ciowa do przysz�ych analiz**,
nie wynik obliczeniowy.

---

## 2. TYPE vs INSTANCE

### 2.1 TYPE (Katalog typ�w)

Katalog typ�w zawiera **100% parametr�w technicznych** ka�dego elementu.
Typy s� wersjonowane i fingerprintowane (hash integralno�ci).

Kategorie katalogowe:

| Kategoria katalogu | Przyk�adowe identyfikatory |
|---|---|
| LineType | `AFL_120`, `AFL_70` |
| CableType | `XRUHAKXS_120`, `XRUHAKXS_70` |
| TransformerType | `TRANS_SN_630kVA_15_0p4_Dyn11` |
| BreakerType | `WYL_SN_630A` |
| DisconnectorType | `ROZL_SN_400A` |
| FuseType | `BEZ_SN_63A` |
| CTType | `CT_200_5_5P20_15VA` |
| VTType | `VT_15000_100_05` |
| ProtectionType | `PROT_SEL_751A` |
| GeneratorType (OZE) | `PV_INV_100kW`, `BESS_250kWh` |
| LoadType | `LOAD_KOMUNALNY_300kW` |

U�ytkownik **nie edytuje** parametr�w w katalogu typ�w w ramach PR-9.
Parametry techniczne w katalogu s� dost�pne wy��cznie do podgl�du.

### 2.2 INSTANCE (Element w modelu ENM)

Instancja to konkretne wyst�pienie typu katalogowego w topologii sieci.
Instancja zawiera **wy��cznie**:

- `catalog_ref` � referencja do typu katalogowego (obowi�zkowa),
- `quantity` / `n_parallel` � liczba identycznych egzemplarzy (mno�nik),
- topologi� � szyny od/do, powi�zania z innymi instancjami,
- status � `OPEN` / `CLOSED` / `IN_SERVICE`,
- `overrides[]` � **wy��cznie w trybie EKSPERT** (patrz �3.2).

Instancja **nie zawiera** parametr�w technicznych � dziedziczy je z katalogu.
Je�eli parametr nie istnieje w katalogu, nie mo�e pojawi� si� w instancji.

---

## 3. Tryby pracy

### 3.1 Tryb STANDARDOWY (domy�lny)

W trybie standardowym u�ytkownik:
- wybiera typ z katalogu (`catalog_ref`),
- podaje topologi� (szyny od/do, powi�zania),
- podaje d�ugo�� odcinka (linie/kable) i status ��cznika,
- podaje ilo�� identycznych instancji (`quantity` / `n_parallel`),
- **nie wpisuje r�cznie �adnych warto�ci technicznych**.

Pola techniczne w UI s� **READ-ONLY** � wy�wietlaj� warto�ci pobrane z katalogu.
UI nie zawiera p�l edytowalnych opisuj�cych fizyk� elementu.

### 3.2 Tryb EKSPERT (opt-in, audytowany)

Tryb EKSPERT pozwala na nadpisanie parametru **istniej�cego w katalogu**
na poziomie instancji (nie modyfikuje katalogu).

**Twarde ograniczenia TRYBU EKSPERT:**
- **Nie dodaje nowych parametr�w** � je�li parametr nie istnieje w typie katalogowym,
  nie mo�e zosta� dodany przez override.
- **Nie zmienia struktury modelu** � override nie dodaje p�l, relacji ani topologii.
- **Pozwala jedynie nadpisa� istniej�cy parametr katalogowy** � warto�� override
  zast�puje warto�� z katalogu dla tej jednej instancji.
- **Ka�de nadpisanie jest audytowalne** � zapisywane z `ParameterSource=OVERRIDE`,
  widoczne w SLD, Inspector i raportach.

Wymagania operacyjne:
- Tryb EKSPERT nie jest domy�lny; wymaga **�wiadomej aktywacji** przez u�ytkownika
  i jest wizualnie oznaczony w UI (ikona, kolor pola).
- Override jest jawnie zapisany jako lista `overrides` (parametr � warto��).
- Parametry bez override zachowuj� warto�� z `catalog_ref` (`ParameterSource=CATALOG`).
- Brak override � pe�ne dziedziczenie z katalogu.

### 3.3 Semantyka `quantity` / `n_parallel`

`quantity` lub `n_parallel` opisuje **liczb� identycznych instancji typu katalogowego**.

- Nie oznacza mocy, pr�du, napi�cia ani �adnego wsp�czynnika elektrycznego.
- Agregacja mocy, zwar� i regulacji jest **wynikiem solvera**, nie wej�ciem u�ytkownika.
- Dotyczy w r�wnym stopniu: PV, BESS, transformator�w, linii r�wnoleg�ych, odbior�w.
- U�ytkownik nie podaje warto�ci �sumarycznych" � system wyprowadza agregaty
  dopiero w analizach (PF/SC), poza zakresem PR-9.

**ZABRONIONE:** interpretowanie `quantity` jako MW, MVA, kA lub jakiejkolwiek
wielko�ci elektrycznej.

### 3.4 PV / OZE / BESS � brak wyj�tk�w

PV, �r�d�a wiatrowe, BESS i inne �r�d�a rozproszone (DER) podlegaj�
**identycznym zasadom** jak wszystkie inne elementy:

- Brak p�l edytowalnych opisuj�cych fizyk� elementu w UI.
- Regulacje, charakterystyki, parametry zwarciowe � wy��cznie z katalogu.
- Instancja DER = `catalog_ref` + `quantity` + `bus_ref` + `status`.

> PV nie jest �r�d�em �specjalnym" ani �uproszczonym".
> Ka�dy DER jest instancj� typu katalogowego � bez wyj�tk�w.

### 3.5 Zakaz self-loop (p�tla w�asna)

�adna ga��� ani element ��czeniowy nie mo�e ��czy� szyny z t� sam� szyn�
(`from_bus == to_bus`). Aparatura ��czeniowa jest modelowana mi�dzy dwoma
**r�nymi** szynami: `bus_in � device � bus_out`.

---

## 4. Poj�cia

| Poj�cie | Opis | ENM |
|---------|------|-----|
| Magistrala (spine) | Ci�g odcink�w linii/kabli od GPZ do ko�ca linii | Sekwencja Branch (line/cable) + Bus |
| Odga��zienie (lateral) | Linia odchodz�ca od magistrali | Branch + Bus do��czony do w�z�a T |
| W�ze� T (T-node) | Punkt rozga��zienia magistrali | Bus z ?3 ga��ziami |
| Stacja SN/nn | Transformator + szyny HV/LV | Transformer + 2�Bus |
| Punkt roz��cznikowy | Roz��cznik/wy��cznik na magistrali | Branch type=disconnector/breaker |
| Przek�adnik CT | Przek�adnik pr�dowy przy wy��czniku | Measurement type=CT |
| Przek�adnik VT | Przek�adnik napi�ciowy | Measurement type=VT |
| Zabezpieczenie | Konfiguracja zabezpieczenia przypisana do wy��cznika | ProtectionAssignment |

---

## 5. Krok po kroku: magistrala 3-odcinkowa

Poni�sze operacje opisuj� logiczne kroki modelowania w UI.
Ka�dy element wskazuje `catalog_ref` � parametry techniczne nie s� wprowadzane r�cznie.

### 5.1 Szyny (buses)

Dodaj 5 szyn � topologia wymaga osobnej szyny wewn�trznej GPZ dla wy��cznika:

```
Dodaj szyny � 5
����������������
bus_gpz_in  (15 kV)  � szyna wewn�trzna GPZ (przed wy��cznikiem)
bus_gpz     (15 kV)  � szyna GPZ (za wy��cznikiem, pocz�tek magistrali)
bus_t1      (15 kV)  � punkt na magistrali
bus_t2      (15 kV)  � punkt rozga��zienia (T-node)
bus_end     (15 kV)  � koniec magistrali
```

### 5.2 Wy��cznik na GPZ

Wy��cznik ��czy dwie **r�ne** szyny. Self-loop jest zabroniony.

```
Dodaj ga��� (breaker) � 1
��������������������������
brk_1:  bus_gpz_in � bus_gpz  (breaker, catalog_ref="WYL_SN_630A", state=CLOSED)
```

### 5.3 Odcinki magistrali

```
Dodaj ga��� (linia/kabel) � 3
������������������������������
line_1:  bus_gpz � bus_t1   (line_overhead, length_km=3.5, catalog_ref="AFL_120")
line_2:  bus_t1  � bus_t2   (cable,         length_km=1.2, catalog_ref="XRUHAKXS_120")
line_3:  bus_t2  � bus_end  (line_overhead, length_km=4.0, catalog_ref="AFL_120")
```

Wybrano typ katalogowy odcinka; wszystkie parametry techniczne s� podgl�dem READ-ONLY.
U�ytkownik podaje wy��cznie: typ ga��zi, szyny od/do, `catalog_ref`, d�ugo�� odcinka.

### 5.4 Odga��zienie

```
Dodaj szyn� + ga���
��������������������
bus_lat_1   (15 kV)  � koniec odga��zienia
line_lat:   bus_t2 � bus_lat_1  (cable, length_km=0.8, catalog_ref="XRUHAKXS_70")
```

### 5.5 Stacja transformatorowa SN/nn

```
Dodaj szyn� + transformator
���������������������������
bus_lv  (0.4 kV)  � szyna strony nn
tr_1:   hv_bus=bus_end, lv_bus=bus_lv, catalog_ref="TRANS_SN_630kVA_15_0p4_Dyn11"
```

Wybrano typ katalogowy transformatora; wszystkie parametry techniczne s� podgl�dem READ-ONLY.
U�ytkownik podaje wy��cznie: szyny HV/LV, `catalog_ref`, `quantity`.

Zapis JSON:
```json
{
  "type": "transformer",
  "catalog_ref": "TRANS_SN_630kVA_15_0p4_Dyn11",
  "hv_bus_ref": "bus_end",
  "lv_bus_ref": "bus_lv",
  "quantity": 1
}
```

### 5.6 Odbiory i OZE

```
Dodaj odbi�r + generator
������������������������
load_1:   bus_ref=bus_lv, catalog_ref="LOAD_KOMUNALNY_300kW"
pv_1:     bus_ref=bus_lv, catalog_ref="PV_INV_100kW", quantity=3
```

Wybrano typ katalogowy; wszystkie parametry techniczne s� podgl�dem READ-ONLY.
U�ytkownik podaje wy��cznie: szyn�, `catalog_ref`, `quantity`.

Zapis JSON (OZE z ilo�ci�):
```json
{
  "type": "generator",
  "catalog_ref": "PV_INV_100kW",
  "bus_ref": "bus_lv",
  "quantity": 3
}
```

Ilo�� (`quantity=3`) oznacza 3 identyczne instancje o parametrach z katalogu.

### 5.7 Przek�adniki CT i VT

```
Dodaj przek�adnik � 2
���������������������
ct_1:   bus_ref=bus_gpz, type=CT, catalog_ref="CT_200_5_5P20_15VA"
vt_1:   bus_ref=bus_gpz, type=VT, catalog_ref="VT_15000_100_05"
```

Wybrano typ katalogowy przek�adnika; wszystkie parametry techniczne s� podgl�dem READ-ONLY.
U�ytkownik podaje wy��cznie: typ (CT/VT), szyn�, `catalog_ref`.

Zapis JSON:
```json
{
  "type": "measurement",
  "measurement_type": "CT",
  "catalog_ref": "CT_200_5_5P20_15VA",
  "bus_ref": "bus_gpz"
}
```

### 5.8 Zabezpieczenie

```
Dodaj zabezpieczenie
��������������������
pa_1:   breaker_ref=brk_1, ct_ref=ct_1, catalog_ref="PROT_SEL_751A"
```

Wybrano typ katalogowy zabezpieczenia; wszystkie parametry techniczne s� podgl�dem READ-ONLY.
U�ytkownik podaje wy��cznie: `catalog_ref`, przypisanie do wy��cznika, powi�zanie z CT/VT.

PR-9 zapisuje konfiguracj� zabezpiecze� jako dane wej�ciowe.
Weryfikacja i koordynacja nast�puje w przysz�ych analizach.

---

## 6. Topology Summary

Po zbudowaniu modelu system oblicza deterministyczne podsumowanie topologii:

```json
{
  "spine": [
    {"ref_id": "bus_gpz", "depth": 0, "is_source": true},
    {"ref_id": "bus_t1",  "depth": 1, "is_source": false},
    {"ref_id": "bus_t2",  "depth": 2, "is_source": false},
    {"ref_id": "bus_end", "depth": 3, "is_source": false}
  ],
  "laterals": ["bus_lat_1", "bus_lv"],
  "is_radial": true
}
```

Spine jest wyznaczany algorytmem BFS od szyn �r�d�owych (source).
Laterals to szyny poza magistral�, po��czone z ni� ga��ziami.

---

## 7. Walidacje i ograniczenia

| Regu�a | Opis |
|--------|------|
| Zakaz p�tli w�asnej | Ga��� nie mo�e ��czy� szyny z t� sam� szyn� |
| CT wymagany | Zabezpieczenia nadpr�dowe / ziemnozwarciowe / kierunkowe wymagaj� CT |
| Wy��cznik wymagany | Zabezpieczenie wymaga wy��cznika (nie roz��cznika ani bezpiecznika) |
| Brak duplikat�w | Jeden wy��cznik = maksymalnie jedno zabezpieczenie |
| Kaskada usuwania | Nie mo�na usun�� wy��cznika z aktywnym zabezpieczeniem |
| CT w u�yciu | Nie mo�na usun�� CT przypisanego do zabezpieczenia |
| Sie� promieniowa | Ostrze�enie przy wykryciu cyklu w topologii |

---

## 8. Deterministyczno��

Wszystkie operacje topologiczne gwarantuj�:
- Identyczne wej�cie � identyczny wynik (JSON-serializable)
- Sortowanie wynik�w: adjacency po ref_id, spine po depth
- Copy-on-write: oryginalne ENM nie jest mutowane
- Atomowo��: batch z rollback w przypadku b��du

---

## 9. Interfejs u�ytkownika

### 9.1 Panel topologii
- Toolbar z przyciskami: Szyna, Ga���, Transformator, Odbi�r/OZE, Przek�adnik, Zabezpieczenie
- Drzewo topologii: podzia� na spine (magistrala) i laterals (odga��zienia)
- Klikni�cie w�z�a � selekcja w SLD (dwukierunkowa synchronizacja)

### 9.2 Modale edycji

Ka�dy modal obs�uguje tryb STANDARDOWY (katalog-only, pola techniczne READ-ONLY)
i tryb EKSPERT (jawna aktywacja, override z audytem).

**�aden modal nie zawiera p�l liczbowych opisuj�cych fizyk� elementu.**

- **NodeModal** � identyfikator, nazwa, poziom napi�ciowy sieci, strefa
- **BranchModal** � typ ga��zi, szyny od/do, `catalog_ref`, d�ugo�� odcinka (linie/kable), stan ��cznika; podgl�d parametr�w z katalogu (READ-ONLY)
- **TransformerStationModal** � szyny HV/LV, `catalog_ref`, `quantity`; podgl�d parametr�w z katalogu (READ-ONLY)
- **LoadDERModal** � szyna, `catalog_ref`, `quantity`; podgl�d parametr�w z katalogu (READ-ONLY)
- **MeasurementModal** � typ CT/VT, szyna, `catalog_ref`; podgl�d parametr�w z katalogu (READ-ONLY)
- **ProtectionModal** � `catalog_ref`, przypisanie do wy��cznika, powi�zanie CT/VT; podgl�d parametr�w z katalogu (READ-ONLY)

---

## 10. Zakaz interpretacji

Dokument **nie mo�e** by� interpretowany jako sugeruj�cy:
- r�czne �dobieranie parametr�w" technicznych,
- zgadywanie lub interpolowanie warto�ci,
- wpisywanie danych liczbowych w polach technicznych,
- dodawanie p�l edytowalnych opisuj�cych fizyk� elementu w przysz�ych PR.

Je�li parametr ma warto�� w instancji, **musi** pochodzi� z katalogu (`ParameterSource=CATALOG`)
albo z jawnego override w trybie EKSPERT (`ParameterSource=OVERRIDE`).

Ka�dy przysz�y PR modyfikuj�cy UI **musi** zachowa� zasad�:
UI nie udost�pnia p�l do edycji parametr�w elektrycznych.

---

## 11. Przekazanie do solver�w (handoff)

Model topologiczny i konfiguracja katalogowa (z ewentualnymi override'ami) stanowi�
**wej�cie do analiz PF / SC / Protection** bez semantycznej transformacji.
Parametry techniczne element�w s� pobierane z katalogu (`ParameterSource=CATALOG`)
lub z override'u instancji (`ParameterSource=OVERRIDE`).
Ilo�ci (`quantity` / `n_parallel`) i override'y wp�ywaj� na wej�cie do analiz
dopiero na etapie ich uruchomienia, poza zakresem PR-9.
