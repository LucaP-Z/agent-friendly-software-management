"""Entity models: the single source of truth for the UI <-> file contract.

Field order here is the order keys are written to frontmatter. The UI renders its
forms from the JSON Schema these models produce (see `schema.py`), driven by the
`x-*` hints set through `Field(json_schema_extra=...)`:

- `x-readonly`: shown but not editable (server-managed)
- `x-ui`: "textarea" | "markdown" (rendering hint)
- `x-link`: entity type keys this field may reference (rendered as a picker)
"""

from dataclasses import dataclass
from typing import Any
from typing import Literal

from pydantic import BaseModel, Field, SerializationInfo, model_serializer

Status = Literal["draft", "approved", "superseded", "retired"]
Priority = Literal["must", "should", "could"]
Surface = Literal["ui", "api", "both"]
CriterionFormat = Literal["gwt", "ears"]
EdgeCategory = Literal[
    "empty-state",
    "invalid-input",
    "permissions",
    "concurrency",
    "limits",
    "failures",
    "offline",
    "other",
]

# Standard edge-case categories the capability form prompts for (spec section 4).
STANDARD_EDGE_CATEGORIES = [c for c in EdgeCategory.__args__ if c != "other"]  # type: ignore[attr-defined]


def _extra(**kw) -> dict:
    return {f"x-{k.replace('_', '-')}": v for k, v in kw.items()}


def readonly_id(pattern: str) -> Any:
    return Field("", pattern=pattern, json_schema_extra=_extra(readonly=True))


def links(*types: str, description: str | None = None) -> Any:
    return Field(default_factory=list, description=description, json_schema_extra=_extra(link=list(types)))


def link(*types: str, description: str | None = None) -> Any:
    return Field("", description=description, json_schema_extra=_extra(link=list(types)))


def wide(description: str | None = None) -> Any:
    """Single-line input that spans the full form width (long-ish statements)."""
    return Field("", description=description, json_schema_extra=_extra(wide=True))


def text(description: str | None = None, ui: str = "textarea") -> Any:
    return Field("", description=description, json_schema_extra=_extra(ui=ui))


# ---------------------------------------------------------------- nested items


class SuccessCriterion(BaseModel):
    """Business outcome measured in production (SC-01.1)."""

    id: str = readonly_id(r"^(SC-\d{2,}\.\d+)?$")
    metric: str = ""
    target: str = ""
    measurement: str = wide("How the metric is measured in production")


class ScopeOut(BaseModel):
    item: str = ""
    reason: str = wide("Why it was cut")


class AcceptanceCriterion(BaseModel):
    """Testable behavior, Given/When/Then or EARS (AC-01.2.3)."""

    id: str = readonly_id(r"^(AC-\d{2,}\.\d+(\.\d+)?)?$")
    surface: Surface = "both"
    format: CriterionFormat = Field("gwt", description="gwt = Given/When/Then; ears = a single EARS statement")
    given: str = wide()
    when: str = wide()
    then: str = wide()
    statement: str = wide("EARS form, e.g. 'When X, the system shall Y'")
    spans: list[str] = links(
        "capability",
        description="Feature-wide criteria only: capabilities this criterion spans",
    )

    @model_serializer(mode="wrap")
    def _prune(self, handler, info: SerializationInfo):
        data = handler(self)
        if isinstance(info.context, dict) and info.context.get("prune"):
            for k in ("given", "when", "then") if self.format == "ears" else ("statement",):
                data.pop(k, None)
            if not self.spans:
                data.pop("spans", None)
        return data


class UseCase(BaseModel):
    """Structured scenario a persona goes through (UC-01.2.1)."""

    id: str = readonly_id(r"^(UC-\d{2,}\.\d+\.\d+)?$")
    actor: str = link("persona")
    trigger: str = wide()
    steps: list[str] = Field(default_factory=list)
    outcome: str = wide()
    verified_by: list[str] = links("ac", description="Acceptance criteria of this capability that verify it")


class EdgeCase(BaseModel):
    """Boundary or failure situation (EC-01.2.4)."""

    id: str = readonly_id(r"^(EC-\d{2,}\.\d+\.\d+)?$")
    category: EdgeCategory = "other"
    expected: str = wide("Expected behavior, stated so it can be tested")


class NotApplicable(BaseModel):
    category: EdgeCategory = "other"
    reason: str = wide()


class Design(BaseModel):
    mockups: list[str] = Field(default_factory=list, description="Mockup references (route or path)")
    flows: list[str] = Field(default_factory=list, description="Flow/state diagram references")


# -------------------------------------------------------------------- entities


class Entity(BaseModel):
    id: str = ""
    title: str = ""
    status: Status = "draft"
    version: int = Field(1, ge=1, json_schema_extra=_extra(readonly=True))
    # Not part of frontmatter: the Markdown body of the file. Kept last in the UI.
    body: str = Field("", title="Notes", json_schema_extra=_extra(ui="markdown"))


class Persona(Entity):
    id: str = Field("", pattern=r"^P-\d{2,}$", json_schema_extra=_extra(readonly=True))
    role: str = ""
    goals: list[str] = Field(default_factory=list)
    frustrations: list[str] = Field(default_factory=list)
    context_of_use: str = text()


class Need(Entity):
    id: str = Field("", pattern=r"^N-\d{2,}$", json_schema_extra=_extra(readonly=True))
    statement: str = text("The business or user problem worth solving")
    personas: list[str] = links("persona")
    business_value: str = text()
    priority: Priority = "should"


class Feature(Entity):
    id: str = Field("", pattern=r"^F-\d{2,}$", json_schema_extra=_extra(readonly=True))
    description: str = text()
    needs: list[str] = links("need")
    personas: list[str] = links("persona")
    related_features: list[str] = links("feature")
    conflicting_features: list[str] = links("feature")
    success_criteria: list[SuccessCriterion] = Field(default_factory=list)
    scope_in: list[str] = Field(default_factory=list)
    scope_out: list[ScopeOut] = Field(default_factory=list)
    acceptance_criteria: list[AcceptanceCriterion] = Field(
        default_factory=list,
        description="Feature-wide criteria spanning several capabilities (end-to-end flows, consistency rules)",
    )
    glossary: list[str] = links("glossary", description="Glossary terms this feature relies on")


class Capability(Entity):
    id: str = Field("", pattern=r"^C-\d{2,}\.\d+$", json_schema_extra=_extra(readonly=True))
    priority: Priority = "should"
    depends_on: list[str] = links("capability")
    budget_usd: float | None = Field(None, ge=0, title="Budget (USD)", description="Early budgets are guesses; estimate vs. actual is tracked")
    acceptance_criteria: list[AcceptanceCriterion] = Field(default_factory=list)
    use_cases: list[UseCase] = Field(default_factory=list)
    edge_cases: list[EdgeCase] = Field(default_factory=list)
    not_applicable: list[NotApplicable] = Field(
        default_factory=list,
        description="Standard edge-case categories that do not apply, with the reason",
    )
    design: Design = Field(default_factory=Design)


class Constraint(Entity):
    id: str = Field("", pattern=r"^CON-\d{2,}$", json_schema_extra=_extra(readonly=True))
    rule: str = text("Cross-cutting rule every capability must respect")
    automated_check: str = text("How the rule is checked automatically")


class Enabler(Entity):
    id: str = Field("", pattern=r"^EN-\d{2,}$", json_schema_extra=_extra(readonly=True))
    purpose: str = text()
    unblocks: list[str] = links("capability")


class GlossaryTerm(Entity):
    id: str = Field("", pattern=r"^G-\d{2,}$", json_schema_extra=_extra(readonly=True))
    definition: str = text()
    forbidden_synonyms: list[str] = Field(default_factory=list)


# ------------------------------------------------------------------- registry


@dataclass(frozen=True)
class EntityType:
    key: str
    label: str
    plural: str
    prefix: str  # ID prefix; also the counter key for top-level types
    dirname: str  # folder under product/
    model: type[Entity]
    parent: str | None = None  # capabilities live inside their feature's folder


TYPES: dict[str, EntityType] = {
    t.key: t
    for t in [
        EntityType("persona", "Persona", "Personas", "P", "personas", Persona),
        EntityType("need", "Need", "Needs", "N", "needs", Need),
        EntityType("feature", "Feature", "Features", "F", "features", Feature),
        EntityType("capability", "Capability", "Capabilities", "C", "features", Capability, parent="feature"),
        EntityType("constraint", "Constraint", "Constraints", "CON", "constraints", Constraint),
        EntityType("enabler", "Enabler", "Enablers", "EN", "enablers", Enabler),
        EntityType("glossary", "Glossary term", "Glossary", "G", "glossary", GlossaryTerm),
    ]
}

# Counter keys that join prefix and number with "-" (top-level ids); nested ids use ".".
TOP_LEVEL_PREFIXES = {t.prefix for t in TYPES.values() if t.parent is None}
