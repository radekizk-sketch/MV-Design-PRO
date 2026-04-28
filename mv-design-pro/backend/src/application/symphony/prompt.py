from __future__ import annotations

from application.symphony.models import Issue


def render_prompt(template: str, issue: Issue, attempt: int | None) -> str:
    return template.format(
        issue_id=issue.id,
        issue_identifier=issue.identifier,
        issue_title=issue.title,
        issue_description=issue.description or "",
        issue_state=issue.state,
        issue_url=issue.url or "",
        attempt="initial" if attempt is None else str(attempt),
    ).strip()
