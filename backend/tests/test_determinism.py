"""Determinism and idempotency of the UI -> file mechanism.

- idempotent: writing what was just read changes nothing (bytes, hash, mtime)
- deterministic: same data always yields the same bytes, regardless of history
- lossless: what the user typed comes back exactly (including YAML-hostile strings)
"""

import random
from pathlib import Path

import pytest

from afsp import contract
from afsp.models import Capability, Feature, Persona
from afsp.store import ProductStore

NASTY = [
    "yes", "no", "null", "~", "true", "False", "on", "off", "1e3", "0123", "1.0", "0x1F", "-", "?", ":",
    "2020-01-01", "12:30", "# not a comment", "a: b", "- not a list", "[x]", "{y}", "*star", "&anchor", "!tag",
    "'single'", '"double"', "back\\slash", "  leading", "trailing  ", "tab\there", "ünïcödé ✓ 日本語", "emoji 🚀",
    "line1\nline2", "line1\n  indented\nline3", "ends with newline\n", "\nstarts with newline", "a\n\nb",
    "trailing space \nnext", "---", "...", "%directive", "@at", "`tick`", "a, b", "multi\nline: with colon",
    "", " ", "x" * 300,
]


def rnd_text(r: random.Random) -> str:
    return r.choice(NASTY)


def rnd_persona(r: random.Random, i: int) -> Persona:
    return Persona(
        id=f"P-{i:02d}", title=rnd_text(r), role=rnd_text(r),
        goals=[rnd_text(r) for _ in range(r.randint(0, 3))],
        frustrations=[rnd_text(r) for _ in range(r.randint(0, 3))],
        context_of_use=rnd_text(r),
        body=r.choice(["", "plain", "# Heading\n\ntext\n\n---\n\nmore after a rule", "code:\n\n```yaml\nkey: value\n---\n```"]),
    )


def rnd_capability(r: random.Random, i: int) -> Capability:
    n = r.randint(0, 3)
    return Capability(
        id=f"C-01.{i}", title=rnd_text(r), priority=r.choice(["must", "should", "could"]),
        budget_usd=r.choice([None, 0, 1.5, 12]),
        acceptance_criteria=[
            dict(id=f"AC-01.{i}.{k + 1}", format=r.choice(["gwt", "ears"]), surface=r.choice(["ui", "api", "both"]),
                 given=rnd_text(r), when=rnd_text(r), then=rnd_text(r), statement=rnd_text(r))
            for k in range(n)
        ],
        use_cases=[dict(id=f"UC-01.{i}.{k + 1}", trigger=rnd_text(r), steps=[rnd_text(r)], outcome=rnd_text(r)) for k in range(n)],
        edge_cases=[dict(id=f"EC-01.{i}.{k + 1}", category=r.choice(["failures", "other"]), expected=rnd_text(r)) for k in range(n)],
        body=rnd_text(r),
    )


def normalise(e):
    """What the file can faithfully hold: the body is stored trimmed of surrounding blank lines."""
    d = e.model_dump()
    d["body"] = d["body"].strip("\n")
    return d


@pytest.mark.parametrize("seed", range(300))
def test_random_entities_round_trip_losslessly_and_idempotently(seed: int):
    r = random.Random(seed)
    for entity in (rnd_persona(r, 1), rnd_capability(r, 1)):
        model = type(entity)
        raw = contract.render(entity)
        parsed, front = contract.parse(raw, model)
        assert normalise(parsed) == normalise(entity), "lossless: values differ after write+read"
        raw2 = contract.render(parsed, front)
        assert raw2 == raw, "idempotent: write(read(file)) is not byte-identical"
        parsed2, front2 = contract.parse(raw2, model)
        assert contract.render(parsed2, front2) == raw, "fixed point not reached"
        assert contract.render(entity) == raw, "deterministic: same input gave different bytes"


@pytest.mark.parametrize("seed", range(50))
def test_flipping_criterion_format_never_touches_the_other_fields(seed: int):
    """Randomised: switching format back and forth must leave given/when/then/statement untouched."""
    r = random.Random(seed)
    cap = rnd_capability(r, 1)
    for ac in cap.acceptance_criteria:
        before = (ac.given, ac.when, ac.then, ac.statement)
        ac.format = "ears" if ac.format == "gwt" else "gwt"
        parsed, _ = contract.parse(contract.render(cap), Capability)
        after = next(a for a in parsed.acceptance_criteria if a.id == ac.id)
        assert (after.given, after.when, after.then, after.statement) == before


def test_history_does_not_matter(repo: Path):
    """Reaching the same data through different edit sequences yields identical bytes."""
    a = ProductStore(repo)
    a.init()
    p = a.create("persona", "Ann")

    def save(rec, **changes):
        data = {**rec.entity.model_dump(mode="json"), **changes}
        return a.update(rec.id, data, rec.hash)[0]

    rec = save(p, role="X")
    rec = save(rec, goals=["a", "b"], role="Boss")
    rec = save(rec, goals=["a"], role="Boss")
    rec = save(rec, goals=["a", "b"])
    path_bytes = rec.path.read_bytes()

    fresh = repo.parent / "fresh"
    fresh.mkdir()
    import subprocess
    subprocess.run(["git", "init", "-q"], cwd=fresh, check=True)
    b = ProductStore(fresh)
    b.init()
    q = b.create("persona", "Ann")
    q2, _ = b.update(q.id, {**q.entity.model_dump(mode="json"), "role": "Boss", "goals": ["a", "b"]}, q.hash)
    assert q2.path.read_bytes() == path_bytes


def test_edit_then_revert_restores_original_bytes(repo: Path):
    s = ProductStore(repo)
    s.init()
    rec = s.create("persona", "Ann")
    original = rec.path.read_bytes()
    changed, _ = s.update(rec.id, {**rec.entity.model_dump(mode="json"), "role": "temp", "goals": ["x"]}, rec.hash)
    assert changed.path.read_bytes() != original
    back, _ = s.update(rec.id, {**rec.entity.model_dump(mode="json")}, changed.hash)
    assert back.path.read_bytes() == original


def test_unchanged_save_does_not_rewrite_file_even_when_hand_formatted(repo: Path):
    """A file authored by hand (different key order, comments, quoting) is left untouched until a real change."""
    s = ProductStore(repo)
    s.init()
    rec = s.create("persona", "Ann")
    hand = (
        "---\n# hand written\ntitle: \"Ann\"\nid: P-01\nrole:    Boss   # inline comment\nstatus: draft\nversion: 1\n"
        "goals: [a,   b]\nmy_extra: 42\n---\n\nNotes here\n\n\n"
    )
    rec.path.write_text(hand)
    rec = s.get("P-01")
    before = rec.path.stat().st_mtime_ns
    rec2, changed = s.update(rec.id, rec.entity.model_dump(mode="json"), rec.hash)
    assert not changed and rec2.path.read_text() == hand and rec2.path.stat().st_mtime_ns == before
    # the first real change normalises the file but keeps the unknown key
    rec3, changed = s.update(rec.id, {**rec.entity.model_dump(mode="json"), "role": "CFO"}, rec.hash)
    text = rec3.path.read_text()
    assert changed and "my_extra: 42" in text and text.index("id: P-01") < text.index("title:")
    # and from then on it is stable
    rec4, changed = s.update(rec.id, rec3.entity.model_dump(mode="json"), rec3.hash)
    assert not changed and rec4.path.read_bytes() == rec3.path.read_bytes()


def test_feature_with_everything_is_a_fixed_point():
    f = Feature(
        id="F-01", title="Invoicing", description="multi\nline", needs=[], personas=[],
        success_criteria=[dict(id="SC-01.1", metric="DSO", target="< 30 d", measurement="ledger export")],
        scope_in=["a", "b"], scope_out=[dict(item="tax", reason="later")],
        acceptance_criteria=[dict(id="AC-01.1", format="ears", statement="When x, the system shall y", spans=[])],
    )
    raw = contract.render(f)
    parsed, front = contract.parse(raw, Feature)
    assert contract.render(parsed, front) == raw
