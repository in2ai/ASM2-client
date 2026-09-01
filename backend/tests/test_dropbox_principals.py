import unittest
from datetime import datetime

import dropbox

from src.connectors import dropbox as dropbox_connector
from src.connectors.dropbox import (
    DropboxSource,
    MemberContext,
    get_accessible_folder_ids,
)


TEAM_ID = "dbtid:team-1"


class FakeAccessType:
    def __init__(self, kind="viewer"):
        self.kind = kind

    def is_traverse(self):
        return self.kind == "traverse"

    def is_no_access(self):
        return self.kind == "no_access"


class FakeSharedFolder:
    def __init__(self, shared_folder_id, kind="viewer"):
        self.shared_folder_id = shared_folder_id
        self.access_type = FakeAccessType(kind)


class FakeFoldersPage:
    def __init__(self, entries, cursor=None):
        self.entries = entries
        self.cursor = cursor


class FakeFoldersClient:
    """Stands in for a Dropbox client, one page of shared folders per call."""

    def __init__(self, pages):
        self.pages = list(pages)
        self.cursors = []

    def sharing_list_folders(self, limit=100):
        return self.pages.pop(0)

    def sharing_list_folders_continue(self, cursor):
        self.cursors.append(cursor)

        return self.pages.pop(0)


class FakeVisibility:
    def __init__(self, kind):
        self.kind = kind

    def is_public(self):
        return self.kind == "public"

    def is_team_only(self):
        return self.kind == "team_only"


class FakeLink:
    def __init__(self, kind):
        self.link_permissions = type(
            "FakePermissions", (), {"resolved_visibility": FakeVisibility(kind)}
        )()
        self.content_owner_team_info = None


class FakeEntry:
    def __init__(self, file_id, parent_shared_folder_id=None):
        self.id = file_id
        self.sharing_info = (
            type(
                "FakeSharingInfo",
                (),
                {"parent_shared_folder_id": parent_shared_folder_id, "modified_by": None},
            )()
            if parent_shared_folder_id
            else None
        )


def build_source(team_id=TEAM_ID):
    source = DropboxSource("{}")
    source.context = MemberContext(
        account_id="dbid:jane",
        email="Jane@Example.com",
        display_name="Jane",
        team_id=team_id,
        root_namespace_id="1234",
    )
    source.exclude = set()

    return source


class AccessibleFolderTests(unittest.TestCase):
    def setUp(self):
        dropbox_connector._FOLDERS_CACHE.clear()

    def test_lists_every_readable_folder_across_pages(self):
        client = FakeFoldersClient(
            [
                FakeFoldersPage([FakeSharedFolder("f1")], cursor="next"),
                FakeFoldersPage([FakeSharedFolder("f2")]),
            ]
        )

        principals = get_accessible_folder_ids(client, "dbid:jane")

        self.assertEqual(principals, ("dropbox:folder:f1", "dropbox:folder:f2"))
        self.assertEqual(client.cursors, ["next"])

    def test_skips_folders_that_only_expose_structure(self):
        client = FakeFoldersClient(
            [
                FakeFoldersPage(
                    [
                        FakeSharedFolder("f1", kind="traverse"),
                        FakeSharedFolder("f2", kind="no_access"),
                        FakeSharedFolder("f3", kind="editor"),
                    ]
                )
            ]
        )

        self.assertEqual(
            get_accessible_folder_ids(client, "dbid:jane"), ("dropbox:folder:f3",)
        )

    def test_caches_per_account(self):
        client = FakeFoldersClient([FakeFoldersPage([FakeSharedFolder("f1")])])

        first = get_accessible_folder_ids(client, "dbid:jane")
        # The fake would raise IndexError on a second call
        second = get_accessible_folder_ids(client, "dbid:jane")

        self.assertEqual(first, second)


class AuthenticatedPrincipalsTests(unittest.TestCase):
    def setUp(self):
        dropbox_connector._FOLDERS_CACHE.clear()

    def test_combines_identity_team_and_folder_access(self):
        source = build_source()
        source.service = FakeFoldersClient(
            [FakeFoldersPage([FakeSharedFolder("f1")])]
        )

        self.assertEqual(
            source.get_authenticated_principals(),
            [
                "dropbox:folder:f1",
                f"dropbox:team:{TEAM_ID}",
                "dropbox:user:jane@example.com",
                "dropbox:user_id:dbid:jane",
            ],
        )

    def test_a_personal_account_gets_no_team_principal(self):
        source = build_source(team_id=None)
        source.service = FakeFoldersClient([FakeFoldersPage([])])

        self.assertEqual(
            source.get_authenticated_principals(),
            ["dropbox:user:jane@example.com", "dropbox:user_id:dbid:jane"],
        )


class FilePrincipalsTests(unittest.TestCase):
    def test_names_the_shared_folder_the_file_lives_in(self):
        source = build_source()

        permissions = source.get_file_principals(FakeEntry("id:a", "f1"), {})

        self.assertFalse(permissions["anyone"])
        self.assertEqual(permissions["allowed"], ["dropbox:folder:f1"])

    def test_a_file_outside_any_shared_folder_stays_with_the_indexer(self):
        source = build_source()

        permissions = source.get_file_principals(FakeEntry("id:a"), {})

        # Critically not the team principal: every member carries that one, so
        # including it would publish an unshared file to the whole team
        self.assertEqual(
            permissions["allowed"],
            ["dropbox:user:jane@example.com", "dropbox:user_id:dbid:jane"],
        )

    def test_a_public_link_opens_the_file_to_anyone(self):
        source = build_source()
        links = {"id:a": [FakeLink("public")]}

        permissions = source.get_file_principals(FakeEntry("id:a", "f1"), links)

        self.assertTrue(permissions["anyone"])
        self.assertEqual(
            permissions["allowed"], ["dropbox:anyone", "dropbox:folder:f1"]
        )

    def test_a_team_only_link_grants_the_team(self):
        source = build_source()
        links = {"id:a": [FakeLink("team_only")]}

        permissions = source.get_file_principals(FakeEntry("id:a", "f1"), links)

        self.assertFalse(permissions["anyone"])
        self.assertEqual(
            permissions["allowed"], ["dropbox:folder:f1", f"dropbox:team:{TEAM_ID}"]
        )

    def test_a_team_only_link_on_a_personal_account_grants_nothing_extra(self):
        source = build_source(team_id=None)
        links = {"id:a": [FakeLink("team_only")]}

        permissions = source.get_file_principals(FakeEntry("id:a", "f1"), links)

        self.assertEqual(permissions["allowed"], ["dropbox:folder:f1"])


class IndexableEntryTests(unittest.TestCase):
    def build_file(self, path):
        return dropbox.files.FileMetadata(
            name=path.rsplit("/", 1)[-1],
            id="id:a",
            client_modified=datetime(2026, 1, 1),
            server_modified=datetime(2026, 1, 1),
            rev="0123456789",
            size=1,
            path_lower=path.lower(),
            path_display=path,
        )

    def test_accepts_a_supported_extension(self):
        self.assertTrue(
            build_source().is_indexable(self.build_file("/Seguridad/report.pdf"))
        )

    def test_rejects_an_unsupported_extension(self):
        self.assertFalse(
            build_source().is_indexable(self.build_file("/Seguridad/photo.png"))
        )

    def test_rejects_folders(self):
        folder = dropbox.files.FolderMetadata(
            name="Seguridad", path_lower="/seguridad", path_display="/Seguridad"
        )

        self.assertFalse(build_source().is_indexable(folder))

    def test_rejects_excluded_subtrees(self):
        source = build_source()
        source.exclude = {"/seguridad/drafts"}

        self.assertFalse(
            source.is_indexable(self.build_file("/Seguridad/Drafts/report.pdf"))
        )
        self.assertTrue(
            source.is_indexable(self.build_file("/Seguridad/Final/report.pdf"))
        )


if __name__ == "__main__":
    unittest.main()
