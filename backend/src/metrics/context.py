from dataclasses import dataclass


@dataclass(frozen=True)
class MetricsActor:
    """Authenticated user identity stored with QuestDB metrics."""

    user_id: str
    user_role: str


def metrics_actor_from_auth(sub: str, role: str) -> MetricsActor:
    return MetricsActor(user_id=sub, user_role=role)
