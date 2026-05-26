# PLANTMON — MVP SCHEMA FREEZE DOCUMENT

# **SECTION 1 — ARCHITECTURAL PRINCIPLES**

---

## **1.1 Runtime Philosophy**

PLANTMON is architected as:

"a lightweight but behaviorally intelligent operational plant care system."

The application optimizes for:

* operational realism  
* onboarding simplicity  
* runtime trust  
* seasonal care intelligence  
* low cognitive load  
* scalable recognition systems  
* mobile-first usability

The application is NOT designed as:

* a botanical ontology engine  
* a scientific simulation platform  
* a taxonomy-heavy database  
* a greenhouse automation system

---

## **1.2 Core Runtime Separation Principle**

The runtime architecture intentionally separates:

1. User ownership identity  
2. Recognition/search identity  
3. Canonical operational identity  
4. Behavioral operational intelligence

This separation is a CORE runtime contract.

---

## **1.3 Identity Separation Contracts**

The application MUST NEVER treat:

* user-entered names  
* aliases  
* cultivar names  
* regional names

as:  
permanent operational runtime identities.

ALL runtime operational systems MUST resolve to:

`canonical_species_id`

before:

* scheduling  
* care generation  
* reminders  
* lifecycle maintenance  
* analytics  
* AI extensibility

---

## **1.4 Behavioral Intelligence Principle**

Behavioral realism matters more than:  
data quantity.

The runtime system should feel:

* observant  
* adaptive  
* seasonally aware  
* operationally trustworthy

The system should avoid:

* generic repetitive reminders  
* template-generated guidance  
* encyclopedia-style UX  
* taxonomy-driven onboarding

---

## **1.5 Operational Source-of-Truth Principle**

The application runtime MUST derive operational care logic from:

`plant_care_profiles`

NOT:  
from:

* archetypes  
* aliases  
* collapse mappings  
* frontend assumptions

Archetypes are:  
supporting metadata ONLY.

They are NOT:  
runtime inheritance systems.

---

## **1.6 Runtime Scheduling Principle**

The scheduler MUST operate dynamically using:

* current season  
* care completion history  
* seasonal frequencies  
* runtime recalculation

The application MUST NOT rely on:

* static recurring intervals  
* hardcoded reminder dates  
* permanently fixed schedules

---

## **1.7 Canonical Identity Stability Principle**

`canonical_species_id` is the permanent operational identity backbone.

Canonical IDs MUST:

* never change  
* never recycle  
* never encode taxonomy  
* remain migration-safe  
* remain runtime-stable

Examples:

* PLANT\_0001  
* PLANT\_0002

Species names MAY evolve.

Canonical IDs MUST NOT.

---

## **1.8 Recognition Layer Principle**

The onboarding/search layer exists to maximize:

* recognition speed  
* beginner usability  
* regional familiarity  
* operational discoverability

This layer intentionally supports:

* aliases  
* common names  
* nursery names  
* cultivar names  
* regional names

Recognition systems MUST remain:  
decoupled from runtime operational logic.

---

## **1.9 Semantic Intelligence Principle**

Behavioral guidance MUST remain semantically separated into:

1. plant\_profile  
2. seasonal\_adjustments  
3. care\_alerts

This separation is REQUIRED for:

* onboarding clarity  
* runtime trust  
* notification quality  
* future AI diagnostics  
* adaptive scheduling  
* symptom intelligence

The application MUST NOT merge these systems into:  
generic content blobs.

---

## **1.10 Runtime Compatibility Principle**

The migration architecture MUST preserve:

* backward compatibility  
* rollback safety  
* progressive frontend migration  
* staged scheduler migration

Legacy structures MAY temporarily coexist during migration phases.

Destructive removals should occur ONLY after:  
runtime validation completion.

---

# **SECTION 2 — RUNTIME IDENTITY CONTRACTS**

---

## **2.1 Runtime Identity Layers**

The application runtime consists of FOUR distinct identity layers:

| Layer | Purpose |
| ----- | ----- |
| User Ownership Identity | emotional/user-facing identity |
| Recognition Identity | onboarding \+ search |
| Canonical Operational Identity | runtime scheduling \+ operational logic |
| Behavioral Intelligence Identity | runtime care intelligence |

These layers MUST remain operationally separated.

---

## **2.2 User Ownership Identity Contract**

Stored in:  
`plants.plant_name`

Purpose:  
user-facing ownership identity.

Characteristics:

* editable  
* emotional  
* non-canonical  
* personalization-oriented

Examples:

* Bedroom Snake Plant  
* Kitchen Tulsi  
* Balcony Rose

IMPORTANT:

This field MUST NEVER drive:

* scheduling  
* operational logic  
* canonical matching  
* runtime intelligence

---

## **2.3 Recognition Identity Contract**

Stored in:

* user\_entered\_name  
* plant\_aliases.alias\_name

Purpose:  
search \+ onboarding resolution.

Characteristics:

* flexible  
* human-oriented  
* multilingual  
* region-aware  
* recognition-focused

Examples:

* Snake Plant  
* Money Plant  
* Tulsi  
* Mini Monstera

Recognition identity MUST resolve INTO:  
canonical runtime identity.

---

## **2.4 Canonical Operational Identity Contract**

Stored in:

`canonical_species_id`

Purpose:  
permanent runtime operational identity.

This field powers:

* care scheduling  
* reminders  
* care profile lookup  
* lifecycle maintenance  
* AI extensibility  
* analytics  
* task generation

IMPORTANT:

ALL operational systems MUST use:  
`canonical_species_id`

NOT:  
species\_name.

---

## **2.5 Canonical Species Name Contract**

Stored in:

* canonical\_species.species\_name  
* plants.canonical\_species\_name (optional helper)

Purpose:  
human-readable canonical reference.

IMPORTANT:

Species names are:  
display-oriented.

They are NOT:  
runtime-stable identifiers.

---

## **2.6 Species Resolution Contract**

The onboarding flow MUST resolve species using:

user input  
→ alias lookup  
→ collapse mapping  
→ canonical species  
→ canonical\_species\_id

Resolution fallback order:

1. Exact alias match  
2. Canonical species match  
3. Collapse mapping match  
4. Fuzzy onboarding fallback  
5. Missing species request flow

---

## **2.7 Species Resolution Method Contract**

The runtime MUST track:  
how identity resolution occurred.

Stored in:

`species_resolution_method`

Allowed values:

* direct\_species\_match  
* alias\_match  
* collapse\_mapping\_match  
* fuzzy\_match  
* manual\_override  
* unresolved

This supports:

* onboarding analytics  
* future AI training  
* debugging  
* recognition quality analysis

---

# **SECTION 3 — CANONICAL TABLE CONTRACTS**

---

## **3.1 canonical\_species**

Purpose:  
Permanent operational identity registry.

This is the PRIMARY identity backbone.

### **Required Columns**

| Column | Type | Notes |
| ----- | ----- | ----- |
| canonical\_species\_id | TEXT PK | permanent immutable ID |
| species\_name | TEXT | canonical operational species |
| primary\_archetype | TEXT | optional metadata |
| mainstream\_priority | INTEGER | onboarding weighting |
| india\_relevance | INTEGER | localization weighting |
| inventory\_version | TEXT | dataset tracking |
| identity\_status | TEXT | active/deprecated/review |
| review\_notes | TEXT NULLABLE | moderation/admin |
| created\_at | TIMESTAMP | creation timestamp |

---

### **Runtime Rules**

* canonical\_species\_id MUST remain immutable  
* species\_name MAY evolve  
* archetypes MUST NOT drive inheritance  
* this table is the operational identity source-of-truth

---

## **3.2 plant\_aliases**

Purpose:  
Recognition and onboarding normalization layer.

### **Required Columns**

| Column | Type | Notes |
| ----- | ----- | ----- |
| id | UUID PK | internal ID |
| alias\_name | TEXT INDEXED | searchable alias |
| canonical\_species\_name | TEXT | resolved species |
| canonical\_species\_id | TEXT FK | operational identity |
| alias\_type | ENUM | alias category |
| language\_region | TEXT NULLABLE | localization |
| search\_priority | INTEGER | onboarding ranking |
| alias\_confidence | FLOAT | confidence scoring |
| review\_notes | TEXT NULLABLE | moderation/admin |
| created\_at | TIMESTAMP | creation timestamp |

---

### **Allowed alias\_type ENUMs**

* common\_name  
* cultivar\_name  
* regional\_name  
* nursery\_name  
* beginner\_name

---

### **Runtime Rules**

* aliases are onboarding tools ONLY  
* aliases MUST NOT drive scheduling directly  
* aliases MUST resolve INTO canonical IDs

---

## **3.3 collapse\_mappings**

Purpose:  
Operational normalization layer.

### **Required Columns**

| Column | Type | Notes |
| ----- | ----- | ----- |
| id | UUID PK | internal ID |
| collapsed\_species\_name | TEXT INDEXED | normalized input |
| canonical\_species\_name | TEXT | canonical target |
| canonical\_species\_id | TEXT FK | operational identity |
| collapse\_reason | TEXT | normalization rationale |
| operational\_similarity | FLOAT | operational similarity |
| consumer\_recognition\_overlap | FLOAT | onboarding overlap |
| collapse\_confidence | FLOAT | normalization confidence |
| review\_notes | TEXT NULLABLE | moderation/admin |
| created\_at | TIMESTAMP | creation timestamp |

---

### **Runtime Rules**

* collapse mappings are NOT taxonomy systems  
* collapse mappings exist ONLY for operational normalization  
* runtime logic MUST always terminate in canonical IDs

---

## **3.4 plants**

Purpose:  
User-owned plant instances.

### **Required Columns**

| Column | Type | Notes |
| ----- | ----- | ----- |
| id | UUID PK | plant instance |
| user\_id | UUID FK | owner |
| plant\_name | TEXT | editable emotional identity |
| canonical\_species\_id | TEXT FK | runtime identity |
| user\_entered\_name | TEXT | onboarding input |
| canonical\_species\_name | TEXT NULLABLE | display helper |
| species\_resolution\_method | ENUM | onboarding resolution |
| room\_location | TEXT NULLABLE | environment |
| notes | TEXT NULLABLE | user notes |
| image | TEXT NULLABLE | image URL |
| created\_at | TIMESTAMP | creation timestamp |
| updated\_at | TIMESTAMP | update timestamp |

---

### **Runtime Rules**

* operational systems MUST use canonical\_species\_id  
* plant\_name remains editable  
* user\_entered\_name preserves onboarding continuity  
* frontend MUST NOT rely on free-text species persistence

# **SECTION 4 — RELATIONSHIP CONTRACTS**

---

## **4.1 Canonical Runtime Relationship Principle**

ALL runtime operational systems MUST terminate in:

`canonical_species_id`

This is the universal operational linkage backbone.

The application MUST NOT rely on:

* species\_name  
* aliases  
* free-text onboarding terms  
* frontend labels

for:

* scheduling  
* reminders  
* task generation  
* analytics  
* lifecycle maintenance

---

## **4.2 Core Runtime Relationships**

| Source Table | Relationship | Target Table |
| ----- | ----- | ----- |
| plants | canonical\_species\_id | canonical\_species |
| plant\_aliases | canonical\_species\_id | canonical\_species |
| collapse\_mappings | canonical\_species\_id | canonical\_species |
| plant\_care\_profiles | canonical\_species\_id | canonical\_species |
| care\_tasks | canonical\_species\_id | canonical\_species |
| care\_logs | canonical\_species\_id | canonical\_species |
| repotting\_tasks | canonical\_species\_id | canonical\_species |
| health\_logs | canonical\_species\_id | canonical\_species |
| journal\_entries | canonical\_species\_id | canonical\_species |

---

## **4.3 User Ownership Relationship Rules**

User-owned plants are:

instance objects.

Canonical species are:

operational intelligence references.

Therefore:

ONE canonical species  
MAY map to:  
MANY user-owned plants.

Examples:

Epipremnum aureum  
→ Bedroom Pothos  
→ Kitchen Pothos  
→ Balcony Pothos

These remain:  
separate ownership entities.

---

## **4.4 Care Intelligence Relationship Rules**

Operational intelligence MUST remain:

species-scoped.

NOT:  
plant-instance-scoped.

Meaning:

`plant_care_profiles`  
stores:  
canonical operational defaults.

User-owned plants inherit:  
operational defaults  
AT RUNTIME.

This prevents:

* duplicated care data  
* onboarding inconsistency  
* operational drift

---

## **4.5 Alias Resolution Relationship Rules**

Aliases MUST resolve INTO:

canonical operational identity.

Aliases MUST NEVER:  
directly reference:

* care profiles  
* tasks  
* scheduler systems

Alias flow:

alias  
→ canonical species  
→ canonical\_species\_id  
→ operational runtime systems

---

## **4.6 Collapse Mapping Relationship Rules**

Collapse mappings exist ONLY for:

operational normalization.

They MUST NOT:

* behave like taxonomy systems  
* create inheritance chains  
* create recursive mappings

Collapse mappings MUST terminate in:  
ONE canonical runtime identity.

---

## **4.7 Scheduler Relationship Rules**

Schedulers MUST derive frequencies from:

`plant_care_profiles`

using:

* canonical\_species\_id  
* current season  
* task history

The scheduler MUST NOT:  
store:  
hardcoded recurring frequencies.

---

## **4.8 Behavioral Intelligence Relationship Rules**

Behavioral semantic intelligence MUST remain:  
care-profile-scoped.

Stored in:

* plant\_profile  
* seasonal\_adjustments  
* care\_alerts

These fields MUST NOT:  
exist redundantly across:

* tasks  
* aliases  
* onboarding systems

Behavioral intelligence should be:  
queried dynamically.

---

## **4.9 Runtime Task Relationship Rules**

care\_tasks represent:  
generated operational actions.

care\_logs represent:  
completed immutable historical actions.

The system MUST maintain:  
append-only care history.

Tasks MAY regenerate.

Logs MUST remain immutable.

---

## **4.10 Lifecycle Maintenance Relationship Rules**

Repotting is treated as:  
lifecycle maintenance,  
NOT:  
high-frequency recurring care.

Therefore:

`repotting_tasks`  
must remain:  
operationally separate from:  
`care_tasks`

This separation is REQUIRED.

---

# **SECTION 5 — ENUM CONTRACTS**

---

## **5.1 Enum Governance Principle**

Enums exist to ensure:

* runtime consistency  
* frontend predictability  
* scheduler stability  
* deterministic AI enrichment  
* migration safety

Enums MUST remain:  
centrally governed.

The application MUST NOT:  
allow uncontrolled runtime enum expansion.

---

## **5.2 light\_requirement ENUM**

Allowed values ONLY:

* low\_light  
* medium\_indirect  
* bright\_indirect  
* direct\_sun

Disallowed:  
free-text lighting descriptions.

---

## **5.3 humidity\_preference ENUM**

Allowed values ONLY:

* low  
* medium  
* high

---

## **5.4 difficulty\_level ENUM**

Allowed values ONLY:

* beginner  
* intermediate  
* advanced

---

## **5.5 species\_resolution\_method ENUM**

Allowed values ONLY:

* direct\_species\_match  
* alias\_match  
* collapse\_mapping\_match  
* fuzzy\_match  
* manual\_override  
* unresolved

---

## **5.6 alias\_type ENUM**

Allowed values ONLY:

* common\_name  
* cultivar\_name  
* regional\_name  
* nursery\_name  
* beginner\_name

---

## **5.7 task\_type ENUM**

Allowed values ONLY:

* watering  
* fertilizing  
* misting  
* pruning  
* cleaning

IMPORTANT:

Repotting is intentionally excluded.

Repotting uses:  
`repotting_tasks`

---

## **5.8 care\_task\_status ENUM**

Allowed values ONLY:

* pending  
* completed  
* skipped  
* overdue

---

## **5.9 identity\_status ENUM**

Allowed values ONLY:

* active  
* deprecated  
* review\_required

---

## **5.10 watering\_method ENUM**

Allowed values ONLY:

* soak\_and\_drain  
* consistent\_moisture  
* infrequent\_deep\_watering  
* bottom\_water  
* mist\_and\_airflow  
* submersion\_soak

Enums may expand ONLY through:  
schema governance review.

---

## **5.11 fertilizing\_method ENUM**

Allowed values ONLY:

* diluted\_liquid\_feed  
* slow\_release\_granules  
* compost\_topdress  
* orchid\_fertilizer  
* low\_nutrient\_requirement  
* foliar\_feed

---

## **5.12 repotting\_method ENUM**

Allowed values ONLY:

* upgrade\_pot\_size  
* refresh\_substrate  
* bark\_refresh  
* root\_division  
* minimal\_disturbance

---

# **SECTION 6 — SCHEDULER CONTRACTS**

---

## **6.1 Dynamic Scheduler Principle**

The scheduler MUST remain:  
runtime-generated.

The system MUST NOT:  
use:  
fixed static schedules.

Schedules MUST derive dynamically from:

* current season  
* task completion history  
* operational care profiles  
* runtime recalculation

---

## **6.2 Seasonal Runtime Logic**

The scheduler MUST determine:  
current runtime season.

The scheduler MUST then fetch:

* watering\_frequency\_\[season\]  
* fertilizing\_frequency\_\[season\]

from:  
`plant_care_profiles`

Examples:

watering\_frequency\_summer  
watering\_frequency\_winter

---

## **6.3 Care Completion Recalculation Rule**

When a care task is completed:

1. Append immutable care\_log  
2. Recalculate next\_due\_at  
3. Generate next operational task

This MUST happen dynamically.

---

## **6.4 Append-Only Care History Rule**

care\_logs MUST remain:  
append-only.

The system MUST NEVER:  
rewrite operational history.

This preserves:

* analytics integrity  
* behavioral learning  
* future AI extensibility

---

## **6.5 Seasonal Override Principle**

Seasonal operational frequencies represent:  
defaults.

Users MAY later override:  
runtime schedules manually.

Overrides MUST remain:  
plant-instance-scoped.

NOT:  
species-scoped.

---

## **6.6 Repotting Scheduler Principle**

Repotting MUST remain:  
lifecycle maintenance.

Repotting MUST NOT:  
behave like:  
high-frequency recurring tasks.

Repotting reminders SHOULD prioritize:

* observational guidance  
* lifecycle timing  
* substrate degradation  
* root behavior

NOT:  
strict recurring cadence alone.

---

## **6.7 Scheduler Storage Rules**

The scheduler SHOULD store:

* next\_due\_at  
* task\_type  
* canonical\_species\_id  
* plant\_id

The scheduler SHOULD NOT store:

* hardcoded care intelligence  
* duplicated species guidance  
* duplicated operational profiles

Operational intelligence should remain centralized.

# **SECTION 7 — SEMANTIC INTELLIGENCE CONTRACTS**

---

## **7.1 Semantic Intelligence Principle**

Behavioral guidance is treated as:  
runtime operational intelligence.

The application MUST separate behavioral guidance into:

1. plant\_profile  
2. seasonal\_adjustments  
3. care\_alerts

This separation is REQUIRED.

The application MUST NOT:  
merge these systems into:  
generic care-note blobs.

---

## **7.2 plant\_profile Contract**

Purpose:  
persistent species identity behavior.

This field describes:

* growth tendencies  
* structural behavior  
* environmental personality  
* flowering tendencies  
* ownership expectations  
* long-term characteristics

This field answers:

"What is this plant generally like?"

Examples:

* Produces aerial roots as it matures  
* Prefers stable environments  
* Blooms more readily when slightly root-bound

IMPORTANT:

This field MUST NOT contain:

* seasonal reminders  
* warning alerts  
* operational schedules

---

## **7.3 seasonal\_adjustments Contract**

Purpose:  
time-based operational behavior changes.

This field describes:

* seasonal watering changes  
* monsoon adjustments  
* winter dormancy behavior  
* humidity adjustments  
* summer stress prevention  
* seasonal fertilization shifts

This field answers:

"What changes this season?"

Examples:

* Reduce watering during winter slowdown  
* Protect from prolonged monsoon saturation  
* Increase humidity support during dry summers

IMPORTANT:

This field MUST NOT contain:

* generic species identity  
* warning systems  
* onboarding descriptions

---

## **7.4 care\_alerts Contract**

Purpose:  
behavioral risk prevention.

This field describes:

* overwatering symptoms  
* root rot risk  
* airflow sensitivity  
* sunburn risk  
* pest vulnerability  
* environmental failure states  
* common beginner mistakes

This field answers:

"What should I watch out for?"

Examples:

* Yellowing lower leaves often indicate excess moisture  
* Avoid strong AC airflow  
* Do not allow water to collect in the crown

IMPORTANT:

This field powers:

* notifications  
* warnings  
* future AI diagnostics  
* symptom intelligence  
* onboarding alerts

---

## **7.5 Semantic Ownership Rules**

Each semantic intelligence layer MUST maintain:  
clear behavioral ownership.

The application MUST avoid:  
cross-layer duplication.

Examples:

plant\_profile  
→ identity

seasonal\_adjustments  
→ seasonal adaptation

care\_alerts  
→ risk prevention

---

## **7.6 Notification Intelligence Rules**

Notifications SHOULD derive from:  
care\_alerts  
and:  
seasonal\_adjustments

Notifications MUST NOT:  
use:  
generic static reminder copy.

---

## **7.7 Future AI Compatibility Principle**

Semantic intelligence fields are intentionally structured to support future:

* AI diagnostics  
* adaptive scheduling  
* symptom recognition  
* contextual recommendations  
* onboarding personalization  
* intelligent notification systems

This structure MUST remain preserved.

---

# **SECTION 8 — ONBOARDING RESOLUTION CONTRACTS**

---

## **8.1 Onboarding Philosophy**

The onboarding system optimizes for:  
recognition speed,  
NOT:  
taxonomic precision.

Users should successfully identify plants using:

* common names  
* nursery names  
* regional names  
* beginner terminology

WITHOUT:  
needing botanical expertise.

---

## **8.2 Runtime Resolution Flow**

The onboarding pipeline MUST follow:

user input  
→ alias lookup  
→ collapse mapping  
→ canonical species  
→ canonical\_species\_id

This pipeline is REQUIRED.

---

## **8.3 Fuzzy Matching Rules**

The system MAY support:  
fuzzy onboarding matching.

Fuzzy matches MUST:  
require confidence thresholds.

Low-confidence matches SHOULD:  
prompt user confirmation.

---

## **8.4 Missing Species Rules**

If no canonical resolution exists:

the system SHOULD:

* suggest closest matches  
* allow temporary unresolved onboarding  
* support future inventory expansion

The system MUST NOT:  
silently misclassify plants.

---

## **8.5 Search Prioritization Rules**

Search results SHOULD prioritize:

* mainstream plants  
* regionally common plants  
* beginner-recognizable plants

NOT:  
botanical rarity.

---

## **8.6 Localization Rules**

Recognition systems SHOULD support:

* Indian household terminology  
* regional nursery terminology  
* beginner household naming patterns

Examples:

* Money Plant  
* Tulsi  
* Snake Plant  
* Areca Palm

---

# **SECTION 9 — FRONTEND RUNTIME CONTRACTS**

---

## **9.1 Frontend Runtime Principle**

Frontend systems MUST consume:  
canonical runtime data contracts.

Frontend systems MUST NOT:  
derive operational logic independently.

---

## **9.2 Plant Detail Screen Contract**

The plant detail experience SHOULD separate:

1. Plant identity behavior  
2. Seasonal operational changes  
3. Risk prevention alerts

The UI should feel:

* operational  
* adaptive  
* behaviorally intelligent

NOT:  
encyclopedic.

---

## **9.3 Frontend Search Contract**

Frontend search MUST support:

* aliases  
* common names  
* beginner names  
* regional names

Search MUST resolve INTO:  
canonical operational identity.

---

## **9.4 User Ownership UX Contract**

The frontend MUST preserve:  
editable emotional plant identity.

Examples:

* My Balcony Tulsi  
* Kitchen Mint  
* Bedroom Pothos

This remains separate from:  
canonical operational identity.

---

## **9.5 Scheduler Display Rules**

Frontend task displays SHOULD show:  
human-friendly operational guidance.

Frontend SHOULD NOT expose:  
raw canonical identity systems.

---

## **9.6 Semantic Rendering Rules**

Frontend rendering MUST preserve:  
semantic separation between:

* plant\_profile  
* seasonal\_adjustments  
* care\_alerts

These SHOULD appear as:  
distinct behavioral cards or sections.

---

## **9.7 Runtime Intelligence UX Principle**

The application should feel:

* observant  
* contextual  
* seasonally adaptive  
* behaviorally trustworthy

The UI should avoid:

* repetitive reminders  
* generic AI-feeling copy  
* overloaded information density

---

# **SECTION 10 — DEPRECATED RUNTIME STRUCTURES**

---

## **10.1 Legacy Runtime Structures**

The following structures are considered:  
legacy runtime architecture.

They MUST be progressively deprecated.

---

## **10.2 Deprecated Identity Structures**

Legacy:

* free-text species persistence  
* species\_name-only runtime logic  
* ilike-only lookup systems

These MUST transition toward:  
canonical identity architecture.

---

## **10.3 Deprecated Guidance Structures**

Legacy fields:

* notes  
* seasonal\_care\_notes  
* care\_tips

These are replaced conceptually by:

* plant\_profile  
* seasonal\_adjustments  
* care\_alerts

Legacy fields MAY temporarily coexist during migration.

---

## **10.4 Deprecated Scheduler Structures**

Legacy:

* static watering\_frequency\_days  
* static fertilizing\_frequency\_days

These are replaced by:  
seasonal operational frequencies.

---

## **10.5 Migration Compatibility Principle**

Deprecated structures SHOULD remain temporarily available during:  
migration stabilization.

Destructive removals MUST occur ONLY after:  
runtime validation completion.

---

# **SECTION 11 — MIGRATION COMPATIBILITY RULES**

---

## **11.1 Migration Safety Principle**

All migrations MUST prioritize:

* rollback safety  
* backward compatibility  
* runtime stability  
* progressive integration

---

## **11.2 Progressive Migration Rule**

Migration MUST occur progressively:

1. local runtime integration  
2. local validation  
3. Supabase migration  
4. production validation  
5. frontend refinement  
6. destructive cleanup

---

## **11.3 Dual-System Compatibility Rule**

Legacy and canonical systems MAY temporarily coexist.

Examples:

* species\_name \+ canonical\_species\_id  
* legacy notes \+ semantic intelligence layers

Temporary coexistence is ALLOWED during migration.

---

## **11.4 Production Migration Principle**

Supabase migration MUST occur ONLY after:  
local runtime validation succeeds.

Replit remains:  
the integration sandbox.

---

## **11.5 Data Integrity Principle**

Operational care intelligence MUST remain:  
canonical-species-scoped.

The system MUST avoid:  
duplicated runtime care logic.

---

# **SECTION 12 — SUPABASE MIGRATION ASSUMPTIONS**

---

## **12.1 Production Source-of-Truth Principle**

Supabase becomes:  
the production operational source-of-truth.

Replit remains:  
the integration/development environment.

---

## **12.2 Production Runtime Assumptions**

Production migration assumes:

* canonical identity architecture exists  
* alias systems exist  
* seasonal scheduler exists  
* semantic intelligence exists  
* onboarding normalization exists

---

## **12.3 Production Data Imports**

Production population will require importing:

* canonical\_species  
* plant\_aliases  
* collapse\_mappings  
* plant\_care\_profiles

These datasets MUST maintain:  
referential integrity.

---

## **12.4 Runtime Validation Before Production**

Before production deployment:  
validate:

* onboarding resolution  
* alias resolution  
* seasonal scheduling  
* task regeneration  
* semantic intelligence rendering  
* canonical identity persistence

---

# **SECTION 13 — RUNTIME VALIDATION REQUIREMENTS**

---

## **13.1 Required Runtime Validation Areas**

Before production migration:  
validate:

1. onboarding resolution accuracy  
2. alias matching quality  
3. seasonal scheduler behavior  
4. care task regeneration  
5. canonical identity persistence  
6. semantic intelligence rendering  
7. frontend compatibility  
8. rollback safety

---

## **13.2 Behavioral Trust Validation**

The app should feel:

* operationally trustworthy  
* seasonally aware  
* beginner-friendly  
* context-aware

The system should NOT feel:

* repetitive  
* generic  
* template-generated

---

## **13.3 Search Validation Rules**

Search testing MUST validate:

* common names  
* regional names  
* beginner terms  
* fuzzy resolution  
* collapse mappings

---

# **SECTION 14 — POST-MIGRATION EXPECTATIONS**

---

## **14.1 Expected Runtime Improvements**

After migration:  
the application should support:

* normalized onboarding  
* canonical operational identity  
* seasonal scheduling  
* behavioral intelligence  
* semantic runtime guidance  
* scalable inventory expansion  
* future AI extensibility

---

## **14.2 Runtime Maturity Goal**

The final MVP runtime should feel:

* lightweight  
* operationally intelligent  
* adaptive  
* trustworthy  
* beginner-friendly  
* seasonally aware

NOT:  
like a static reminder application.

---

## **14.3 Long-Term Architectural Stability**

The frozen schema architecture is intended to support future:

* AI diagnostics  
* image identification  
* adaptive notifications  
* advanced analytics  
* care personalization  
* symptom intelligence  
* behavioral learning systems

WITHOUT:  
requiring major identity-system rewrites.