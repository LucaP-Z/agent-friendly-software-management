import json
from pathlib import Path

import pytest

from afsp.store import Conflict, ProductStore, StoreError


@pytest.fixture
def store(repo: Path) -> ProductStore:
    s = ProductStore(repo)
    s.init()
    return s


def test_init_is_idempotent_and_never_overwrites(store: ProductStore):
    (store.product / "README.md").write_text("mine")
    assert store.init() == []
    assert (store.product / "README.md").read_text() == "mine"


def test_layout_and_ids(store: ProductStore):
    p = store.create("persona", "Accountant Ann")
    f = store.create("feature", "Invoicing")
    c = store.create("capability", "Create invoice", parent=f.id)
    assert p.rel == "product/personas/P-01-accountant-ann.md"
    assert f.rel == "product/features/F-01-invoicing/feature.md"
    assert c.id == "C-01.1" and c.rel == "product/features/F-01-invoicing/C-01.1-create-invoice.md"
    assert store.create("capability", "Second", parent=f.id).id == "C-01.2"


def test_ids_never_reused_even_after_file_deleted(store: ProductStore):
    p = store.create("persona", "A")
    p.path.unlink()
    assert store.create("persona", "B").id == "P-02"


def test_allocate_takes_hand_written_ids_into_account(store: ProductStore):
    f = store.create("feature", "F")
    c = store.create("capability", "C", parent=f.id)
    assert store.allocate("AC-01.1") == "AC-01.1.1"
    assert store.allocate("AC-01.1") == "AC-01.1.2"  # reserved ids are not reissued even if unused


def test_save_unchanged_form_does_not_touch_file(store: ProductStore):
    rec = store.create("persona", "A")
    rec2, changed = store.update(rec.id, rec.entity.model_dump(mode="json"), rec.hash)
    assert not changed and rec2.hash == rec.hash


def test_save_writes_and_returns_new_hash(store: ProductStore):
    rec = store.create("persona", "A")
    data = {**rec.entity.model_dump(mode="json"), "role": "Boss", "goals": ["x"]}
    rec2, changed = store.update(rec.id, data, rec.hash)
    assert changed and rec2.hash != rec.hash and rec2.entity.role == "Boss"
    assert "role: Boss" in rec2.path.read_text()


def test_conflict_when_file_changed_on_disk(store: ProductStore):
    rec = store.create("persona", "A")
    rec.path.write_text(rec.path.read_text().replace("title: A", "title: Edited by hand"))
    with pytest.raises(Conflict):
        store.update(rec.id, rec.entity.model_dump(mode="json"), rec.hash)


def test_id_cannot_be_changed_via_payload(store: ProductStore):
    rec = store.create("persona", "A")
    store.update(rec.id, {**rec.entity.model_dump(mode="json"), "id": "P-99", "role": "r"}, rec.hash)
    assert store.get("P-01").entity.role == "r"


def test_new_dangling_link_rejected_existing_one_tolerated(store: ProductStore):
    need = store.create("need", "N")
    data = {**need.entity.model_dump(mode="json"), "personas": ["P-42"]}
    with pytest.raises(StoreError, match="does not exist"):
        store.update(need.id, data, need.hash)
    # hand-written dangling link: saving other fields must not be blocked
    need.path.write_text(need.path.read_text().replace("personas: []", "personas:\n  - P-42"))
    need = store.get("N-01")
    store.update(need.id, {**need.entity.model_dump(mode="json"), "statement": "s"}, need.hash)
    assert any("unknown P-42" in p.message for p in store.scan().problems)


def test_link_type_is_checked(store: ProductStore):
    n = store.create("need", "N")
    other = store.create("need", "M")
    with pytest.raises(StoreError, match="expected persona"):
        store.update(n.id, {**n.entity.model_dump(mode="json"), "personas": [other.id]}, n.hash)


def test_nested_ids_auto_assigned_and_validated(store: ProductStore):
    f = store.create("feature", "F")
    c = store.create("capability", "C", parent=f.id)
    data = {**c.entity.model_dump(mode="json"), "acceptance_criteria": [{"id": "", "given": "g", "when": "w", "then": "t"}]}
    rec, _ = store.update(c.id, data, c.hash)
    assert rec.entity.acceptance_criteria[0].id == "AC-01.1.1"
    bad = {**rec.entity.model_dump(mode="json"), "edge_cases": [{"id": "EC-07.1.1", "expected": "x"}]}
    with pytest.raises(StoreError, match="does not belong"):
        store.update(c.id, bad, rec.hash)


def test_verified_by_must_reference_own_criteria(store: ProductStore):
    f = store.create("feature", "F")
    c = store.create("capability", "C", parent=f.id)
    data = {**c.entity.model_dump(mode="json"), "use_cases": [{"id": "", "verified_by": ["AC-01.1.9"]}]}
    with pytest.raises(StoreError, match="not an acceptance criterion"):
        store.update(c.id, data, c.hash)


def test_broken_file_reported_as_problem_not_crash(store: ProductStore):
    store.create("persona", "A")
    (store.product / "personas" / "junk.md").write_text("no frontmatter")
    scan = store.scan()
    assert len(scan.records) == 1
    assert scan.problems[0].path.endswith("junk.md")


def test_counters_file_is_valid_json(store: ProductStore):
    store.create("persona", "A")
    assert json.loads((store.product / ".counters.json").read_text()) == {"P": 1}


def test_capability_requires_feature_parent(store: ProductStore):
    p = store.create("persona", "A")
    with pytest.raises(StoreError):
        store.create("capability", "C")
    with pytest.raises(StoreError):
        store.create("capability", "C", parent=p.id)
