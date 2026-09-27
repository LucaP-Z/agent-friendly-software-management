from afsp import contract
from afsp.models import Capability


def test_token_costs_round_trip_and_default_to_unset():
    c = Capability(id="C-01.1", title="T", budget_usd=120, budget_tokens_usd=45.5)
    raw = contract.render(c)
    parsed, front = contract.parse(raw, Capability)
    assert (parsed.budget_usd, parsed.budget_tokens_usd) == (120, 45.5)
    assert contract.render(parsed, front) == raw
    old_file = b"---\nid: C-01.1\ntitle: T\nstatus: draft\nversion: 1\nbudget_usd: 10\n---\n"  # written before the field existed
    assert contract.parse(old_file, Capability)[0].budget_tokens_usd is None


def test_negative_amounts_are_rejected():
    import pytest
    with pytest.raises(Exception):
        Capability(id="C-01.1", budget_tokens_usd=-1)
