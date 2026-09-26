from afsp.gitops import Change, suggest_message


def test_suggested_message_names_every_entity_including_nested_ones():
    items = [
        Change("product/README.md", "added"),
        Change("product/.counters.json", "added"),
        Change("product/personas/P-01-ann.md", "added"),
        Change("product/features/F-01-invoicing/feature.md", "added"),
        Change("product/features/F-01-invoicing/C-01.2-send-invoice.md", "added"),
        Change("product/needs/N-03-x.md", "modified"),
    ]
    assert suggest_message(items) == "spec: initialise product structure; add C-01.2, F-01, P-01; update N-03"


def test_suggested_message_fallbacks():
    assert suggest_message([]) == "spec: update"
    assert suggest_message([Change("product/.counters.json", "modified")]) == "spec: update product files"
