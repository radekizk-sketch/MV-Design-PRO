# Type Catalog UI (P8.2 + P13a)

**CANONICAL ALIGNMENT:**
- `CATALOG_BROWSER_CONTRACT.md`: Type Library Browser specification
- `SYSTEM_SPEC.md § 4`: Type Catalog (Library)
- `CANONICAL_COMPLIANCE.md § 14`: Type Catalog UI compliance

## Components

### TypeLibraryBrowser (P13a)
Przeglądarka biblioteki typów w stylu Canonical.

**Features:**
- 4 zakładki: Typy linii, Typy kabli, Typy transformatorów, Typy aparatury łączeniowej
- Lista typów z filtrowaniem (nazwa, producent, ID)
- Deterministyczne sortowanie: manufacturer → name → id
- Panel szczegółów typu (read-only)
- Wszystkie etykiety w języku polskim

**Usage:**
```tsx
import { TypeLibraryBrowser } from '@/ui/catalog';

<TypeLibraryBrowser
  initialTab="LINE"
  onSelectType={(typeId, category) => {
    console.log('Selected type:', typeId, 'from', category);
  }}
/>
```

### TypePicker (P8.2)
Modal selector dla przypisywania typu do instancji.

**Features:**
- Deterministyczne sortowanie (manufacturer → name → id)
- Wyszukiwanie po nazwie i ID
- Przypisanie typu przez kliknięcie
- Modal zamyka się po wyborze

**Usage:**
```tsx
import { TypePicker } from '@/ui/catalog';

<TypePicker
  category="LINE"
  currentTypeId={currentTypeRef}
  onSelectType={(typeId, typeName) => {
    // Handle type assignment
  }}
  onClose={() => setIsPickerOpen(false)}
  isOpen={isPickerOpen}
/>
```

### PropertyGridContainer (P13a Integration)
Wrapper dla PropertyGrid który integruje TypePicker i catalog API.

**Features:**
- Automatyczne wywołanie TypePicker dla type_ref fields
- Obsługa assign/clear type przez API
- Odświeżanie danych elementu po zmianie typu
- Obsługa błędów API

**Usage:**
```tsx
import { PropertyGridContainer } from '@/ui/property-grid';

<PropertyGridContainer
  projectId="project-123"
  elementId="line-456"
  elementType="LineBranch"
  elementName="Linia główna"
  elementData={elementData}
  validationMessages={validationMessages}
  onFieldChange={handleFieldChange}
  onDataRefresh={refreshElementData}
/>
```

## Compliance

**P13a DoD:**
- ✅ Ekran "Biblioteka typów" (4 zakładki) w 100% PL
- ✅ Listy typów filtrowalne i deterministycznie sortowane
- ✅ Property Grid ma type_ref picker dla Line/Cable/Trafo/Switch
- ✅ PropertyGridContainer integruje TypePicker + catalog API
- ✅ Parametry typu (type_params) wyświetlane RO z jednostkami dla Line/Cable/Trafo/Switch
- ✅ Parametry lokalne instancji rozdzielone i edytowalne tylko w MODEL_EDIT
- ✅ Testy PASS (determinism + API integration + field definitions)
