import pytest

from afsp import contract
from afsp.models import Capability, Persona


def test_render_is_deterministic_and_round_trips():
    p = Persona(id="P-01", title="Accountant", role="Finance", goals=["Get paid", "Stay compliant"], body="Some notes.\n\nTwo paragraphs.")
    raw = contract.render(p)
    parsed, front = contract.parse(raw, Persona)
    assert parsed == p
    assert contract.render(parsed, front) == raw  # unchanged in -> identical bytes out


def test_key_order_follows_model_and_body_after_frontmatter():
    raw = contract.render(Persona(id="P-01", title="A", role="R", body="hello")).decode()
    keys = [line.split(":")[0] for line in raw.split("---")[1].strip().splitlines() if not line.startswith(" ")]
    assert keys[:4] == ["id", "title", "status", "version"]
    assert raw.endswith("---\n\nhello\n")


def test_unknown_keys_preserved_top_level_and_nested():
    raw = (
        "---\nid: C-01.2\ntitle: T\nstatus: draft\nversion: 1\ncustom_top: keep me\n"
        "acceptance_criteria:\n  - id: AC-01.2.1\n    surface: ui\n    format: gwt\n    given: g\n    when: w\n    then: t\n    x_note: nested\n"
        "---\n"
    ).encode()
    cap, front = contract.parse(raw, Capability)
    cap.title = "Changed"
    out = contract.render(cap, front).decode()
    assert "custom_top: keep me" in out
    assert "x_note: nested" in out
    assert "title: Changed" in out


def test_switching_format_never_discards_the_other_format_s_text():
    """A criterion always writes all four fields: switching format must not lose data."""
    cap = Capability(id="C-01.1", acceptance_criteria=[{"id": "AC-01.1.1", "format": "gwt", "given": "g", "when": "w", "then": "t", "statement": ""}])
    out = contract.render(cap).decode()
    assert "given: g" in out and "when: w" in out and "then: t" in out and "statement: ''" in out

    cap.acceptance_criteria[0].format = "ears"
    cap.acceptance_criteria[0].statement = "When x, the system shall y"
    raw2 = contract.render(cap)
    parsed, _ = contract.parse(raw2, Capability)
    ac = parsed.acceptance_criteria[0]
    assert ac.format == "ears" and ac.statement == "When x, the system shall y"
    assert (ac.given, ac.when, ac.then) == ("g", "w", "t")  # not lost by the switch

    # and switching back to gwt brings the original text straight back
    parsed.acceptance_criteria[0].format = "gwt"
    back, _ = contract.parse(contract.render(parsed), Capability)
    ac = back.acceptance_criteria[0]
    assert (ac.given, ac.when, ac.then) == ("g", "w", "t") and ac.statement == "When x, the system shall y"


def test_multiline_strings_use_block_scalars_and_survive():
    p = Persona(id="P-01", context_of_use="line one\nline two")
    raw = contract.render(p)
    assert b"|" in raw
    assert contract.parse(raw, Persona)[0].context_of_use == "line one\nline two"


@pytest.mark.parametrize("bad", [b"no frontmatter", b"---\n: [unclosed\n---\n", b"---\n- a list\n---\n", b"\xff\xfe"])
def test_bad_files_raise_contract_error(bad):
    with pytest.raises(contract.ContractError):
        contract.identify(bad)


def test_invalid_field_is_a_contract_error():
    with pytest.raises(contract.ContractError):
        contract.parse(b"---\nid: P-01\nstatus: nonsense\n---\n", Persona)
