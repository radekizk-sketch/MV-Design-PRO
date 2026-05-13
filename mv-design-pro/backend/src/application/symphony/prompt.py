from __future__ import annotations

from application.symphony.image_payload import assert_no_empty_image_data_urls
from application.symphony.models import Issue


def render_prompt(template: str, issue: Issue, attempt: int | None) -> str:
    issue_description = assert_no_empty_image_data_urls(
        issue.description or "",
        location="issue.description",
    )
    prompt = template.format(
        issue_id=issue.id,
        issue_identifier=issue.identifier,
        issue_title=issue.title,
        issue_description=issue_description,
        issue_state=issue.state,
        issue_url=issue.url or "",
        attempt="initial" if attempt is None else str(attempt),
    ).strip()
    return assert_no_empty_image_data_urls(prompt, location="agent_prompt")
