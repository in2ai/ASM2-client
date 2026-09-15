from datetime import datetime
from typing import Any, List, Tuple

from qdrant_client.http.models import Filter, FieldCondition, MatchValue, MatchAny

from src.connectors.vdb_file import VDBFile


class DataSource:
    display_name = ""

    def __init__(self, name: str, raw_creds: str, roots: list[str]):
        self.name = name
        self.raw_creds = raw_creds
        self.roots = roots
        self.authenticated_principals = []


    def login(self) -> bool:
        ...


    def refresh(self) -> bool:
        ...


    def expiry(self) -> Tuple[datetime, datetime]:
        ...


    def login_info() -> dict[str, Any] | None:
        return None
        

    def update_authenticated_principals(self):
        self.authenticated_principals = self.get_authenticated_principals()


    def get_authenticated_principals(self) -> List[str]:
        ...


    # metadata is the indexed chunk payload, so a source can re-check an
    # entitlement that its live id lookup cannot see
    def has_access(self, file_id: str, metadata: dict[str, Any] | None = None) -> bool:
        ...


    def list_files(self) -> List[VDBFile]:
        ...


    def get_permissions_filter(self) -> Filter:
        # source == self.name
        source_condition = FieldCondition(
            key="metadata.source",
            match=MatchValue(value=self.name)
        )

        # permissions.anyone == True
        anyone_condition = FieldCondition(
            key="metadata.permissions.anyone",
            match=MatchValue(value=True)
        )

        allowed_condition = FieldCondition(
            key="metadata.permissions.allowed",
            match=MatchAny(any=self.authenticated_principals)
        )

        # anyone_condition OR allowed_condition
        or_block = Filter(
            should=[anyone_condition, allowed_condition],
        )

        # source_condition AND or_block
        final_filter = Filter(
            must=[source_condition, or_block]
        )

        return final_filter