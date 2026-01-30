from typing import List

from qdrant_client.http.models import Filter, FieldCondition, MatchValue, MatchAny

from src.connectors.vdb_file import VDBFile


class DataSource:
    def __init__(self, name: str, root: str):
        self.name = name
        self.root = root


    def login(self):
        ...


    def update_authenticated_principals(self):
        self.authenticated_principals = self.get_authenticated_principals()


    def get_authenticated_principals(self) -> List[str]:
        ...


    def has_access(self, file_id: str) -> bool:
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