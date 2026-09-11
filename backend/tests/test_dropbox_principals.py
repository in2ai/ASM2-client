import unittest
from datetime import datetime
from unittest.mock import patch

import dropbox
from dropbox.exceptions import ApiError, RateLimitError

from src.connectors import dropbox as dropbox_connector
from src.connectors.dropbox import (
    DropboxSource,
    MemberContext,
    SharedLinkIndex,
    get_accessible_folder_ids,
)


TEAM_ID = "dbtid:team-1"
OTHER_TEAM_ID = "dbtid:team-2"

VISIBILITY = {
    "public": dropbox.sharing.ResolvedVisibility.public,
    "team_only": dropbox.sharing.ResolvedVisibility.team_only,
}


def api_error():
    return ApiError("req-1", "access_denied", None, None)


def rate_limit_error():
    """What safe_call re-raises once its retries are spent."""
    return RateLimitError("req-1", backoff=1)


def _raise(error):
    def fail(*args, **kwargs):
        raise error

    return fail


def no_retry_delay():
    """safe_call sleeps between attempts; a test has nothing to wait for."""
    return patch("src.utils.helpers.time.sleep")


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


def link_fields(kind, url, owner_team_id, content_owner_team_id):
    """The SharedLinkMetadata fields every link kind shares.

    Real SDK objects rather than fakes: the team a link admits is read off
    nested optional structs, and the folder/file split is an isinstance check,
    so a stand-in would not exercise either.
    """
    return {
        "url": url,
        "link_permissions": dropbox.sharing.LinkPermissions(
            can_revoke=False,
            resolved_visibility=VISIBILITY[kind],
        ),
        # The link owner's team, which is the audience of a team_only link
        "team_member_info": (
            dropbox.sharing.TeamMemberInfo(
                team_info=dropbox.users.Team(id=owner_team_id, name="Acme"),
                display_name="Jane",
            )
            if owner_team_id
            else None
        ),
        # Dropbox only sets this when the content owner's team is a different one
        "content_owner_team_info": (
            dropbox.users.Team(id=content_owner_team_id, name="Other")
            if content_owner_team_id
            else None
        ),
    }


def file_link(kind, url=None, owner_team_id=TEAM_ID, content_owner_team_id=None):
    return dropbox.sharing.FileLinkMetadata(
        name="report.pdf",
        id="id:a",
        client_modified=datetime(2026, 1, 1),
        server_modified=datetime(2026, 1, 1),
        rev="0123456789ab",
        size=1,
        **link_fields(
            kind,
            url or f"https://www.dropbox.com/s/{kind}/report.pdf",
            owner_team_id,
            content_owner_team_id,
        ),
    )


def folder_link(path_lower, kind="public", url=None, owner_team_id=TEAM_ID):
    return dropbox.sharing.FolderLinkMetadata(
        name=path_lower.rstrip("/").rsplit("/", 1)[-1],
        id="id:folder",
        path_lower=path_lower,
        **link_fields(
            kind,
            url or f"https://www.dropbox.com/scl/fo/{kind}",
            owner_team_id,
            None,
        ),
    )


def link_index(by_file_id=None, folder_links=()):
    return SharedLinkIndex(by_file_id or {}, tuple(folder_links))


class FakeEntry:
    def __init__(self, file_id, parent_shared_folder_id=None, path_lower=None):
        self.id = file_id
        self.path_lower = path_lower
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

    def test_an_exhausted_retry_grants_nothing(self):
        # safe_call re-raises the RateLimitError it gave up on. That is an
        # HttpError, not an ApiError, so only the common base keeps the
        # half-built list from escaping as a 500.
        client = FakeFoldersClient([])
        client.sharing_list_folders = _raise(rate_limit_error())

        with no_retry_delay():
            self.assertEqual(get_accessible_folder_ids(client, "dbid:jane"), ())


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

        permissions = source.get_file_principals(FakeEntry("id:a", "f1"), link_index())

        self.assertFalse(permissions["anyone"])
        self.assertEqual(permissions["allowed"], ["dropbox:folder:f1"])

    def test_a_file_outside_any_shared_folder_stays_with_the_indexer(self):
        source = build_source()

        permissions = source.get_file_principals(FakeEntry("id:a"), link_index())

        # Critically not the team principal: every member carries that one, so
        # including it would publish an unshared file to the whole team
        self.assertEqual(
            permissions["allowed"],
            ["dropbox:user:jane@example.com", "dropbox:user_id:dbid:jane"],
        )

    def test_a_public_link_opens_the_file_to_anyone(self):
        source = build_source()
        links = link_index({"id:a": [file_link("public")]})

        permissions = source.get_file_principals(FakeEntry("id:a", "f1"), links)

        self.assertTrue(permissions["anyone"])
        self.assertEqual(
            permissions["allowed"], ["dropbox:anyone", "dropbox:folder:f1"]
        )

    def test_a_team_only_link_grants_the_link_owners_team(self):
        source = build_source()
        links = link_index({"id:a": [file_link("team_only")]})

        permissions = source.get_file_principals(FakeEntry("id:a", "f1"), links)

        self.assertFalse(permissions["anyone"])
        self.assertEqual(
            permissions["allowed"], ["dropbox:folder:f1", f"dropbox:team:{TEAM_ID}"]
        )

    def test_cross_team_content_still_grants_the_link_owners_team(self):
        # content_owner_team_info is present only when the content belongs to
        # another team, so reading it would name a team the link does not admit
        source = build_source()
        links = link_index(
            {"id:a": [file_link("team_only", content_owner_team_id=OTHER_TEAM_ID)]}
        )

        permissions = source.get_file_principals(FakeEntry("id:a", "f1"), links)

        self.assertEqual(
            permissions["allowed"], ["dropbox:folder:f1", f"dropbox:team:{TEAM_ID}"]
        )

    def test_a_team_only_link_with_no_owner_team_grants_nothing_extra(self):
        # No team_member_info means the audience cannot be established. Falling
        # back to the indexing account's own team would hand the file to a team
        # the link was never scoped to.
        source = build_source()
        links = link_index({"id:a": [file_link("team_only", owner_team_id=None)]})

        permissions = source.get_file_principals(FakeEntry("id:a", "f1"), links)

        self.assertEqual(permissions["allowed"], ["dropbox:folder:f1"])

    def test_a_team_only_link_on_a_personal_account_grants_nothing_extra(self):
        source = build_source(team_id=None)
        links = link_index({"id:a": [file_link("team_only", owner_team_id=None)]})

        permissions = source.get_file_principals(FakeEntry("id:a", "f1"), links)

        self.assertEqual(permissions["allowed"], ["dropbox:folder:f1"])


class RecordedLinkTests(unittest.TestCase):
    """The link url has_access needs to re-check link-only entitlement."""

    def test_records_the_public_link_the_anyone_principal_rests_on(self):
        source = build_source()
        links = link_index({"id:a": [file_link("public", url="https://dropbox.com/s/pub")]})

        permissions = source.get_file_principals(FakeEntry("id:a", "f1"), links)

        self.assertEqual(permissions["link"], "https://dropbox.com/s/pub")
        # A link on the file itself resolves without walking a folder
        self.assertIsNone(permissions["link_path"])

    def test_records_the_team_link_the_team_principal_rests_on(self):
        source = build_source()
        links = link_index(
            {"id:a": [file_link("team_only", url="https://dropbox.com/s/team")]}
        )

        permissions = source.get_file_principals(FakeEntry("id:a", "f1"), links)

        self.assertEqual(permissions["link"], "https://dropbox.com/s/team")

    def test_a_public_link_supersedes_a_team_one(self):
        source = build_source()
        by_file_id = {
            "id:a": [
                file_link("public", url="https://dropbox.com/s/pub"),
                file_link("team_only", url="https://dropbox.com/s/team"),
            ]
        }

        self.assertEqual(
            source.get_file_principals(
                FakeEntry("id:a", "f1"), link_index(by_file_id)
            )["link"],
            "https://dropbox.com/s/pub",
        )

        by_file_id["id:a"].reverse()

        self.assertEqual(
            source.get_file_principals(
                FakeEntry("id:a", "f1"), link_index(by_file_id)
            )["link"],
            "https://dropbox.com/s/pub",
        )

    def test_the_keys_are_present_even_with_no_link(self):
        # Absent, they would leave a revoked link in place: the indexer refreshes
        # metadata.permissions rather than replacing it
        permissions = build_source().get_file_principals(
            FakeEntry("id:a", "f1"), link_index()
        )

        self.assertIsNone(permissions["link"])
        self.assertIsNone(permissions["link_path"])

    def test_a_team_link_records_nothing_when_the_audience_is_unknown(self):
        source = build_source(team_id=None)
        links = link_index({"id:a": [file_link("team_only", owner_team_id=None)]})

        self.assertIsNone(
            source.get_file_principals(FakeEntry("id:a", "f1"), links)["link"]
        )


class FolderLinkTests(unittest.TestCase):
    """A link on a folder grants every file below it, by path rather than id."""

    def setUp(self):
        self.source = build_source()

    def principals_for(self, path, folder_links):
        return self.source.get_file_principals(
            FakeEntry("id:a", "f1", path_lower=path),
            link_index(folder_links=folder_links),
        )

    def test_a_public_folder_link_opens_every_file_below_it(self):
        permissions = self.principals_for(
            "/team/reports/q1/summary.pdf",
            [("/team/reports", folder_link("/team/reports"))],
        )

        self.assertTrue(permissions["anyone"])
        self.assertIn("dropbox:anyone", permissions["allowed"])

    def test_records_the_path_that_addresses_the_file_through_the_link(self):
        # get_shared_link_metadata needs it to walk a folder link down to the
        # file; without it the link resolves to the folder and access is refused
        permissions = self.principals_for(
            "/team/reports/q1/summary.pdf",
            [("/team/reports", folder_link("/team/reports"))],
        )

        self.assertEqual(permissions["link_path"], "/q1/summary.pdf")

    def test_a_team_only_folder_link_grants_the_link_owners_team(self):
        permissions = self.principals_for(
            "/team/reports/q1/summary.pdf",
            [("/team/reports", folder_link("/team/reports", kind="team_only"))],
        )

        self.assertFalse(permissions["anyone"])
        self.assertIn(f"dropbox:team:{TEAM_ID}", permissions["allowed"])

    def test_a_folder_link_elsewhere_grants_nothing(self):
        permissions = self.principals_for(
            "/team/reports/q1/summary.pdf",
            [("/team/reports-archive", folder_link("/team/reports-archive"))],
        )

        self.assertFalse(permissions["anyone"])
        self.assertEqual(permissions["allowed"], ["dropbox:folder:f1"])
        self.assertIsNone(permissions["link"])

    def test_a_file_with_no_path_matches_no_folder_link(self):
        permissions = self.principals_for(
            None, [("/team/reports", folder_link("/team/reports"))]
        )

        self.assertFalse(permissions["anyone"])

    def test_the_file_own_link_is_preferred_over_the_folder_one(self):
        # It resolves in one call, with no path to go stale
        permissions = self.source.get_file_principals(
            FakeEntry("id:a", "f1", path_lower="/team/reports/q1/summary.pdf"),
            link_index(
                {"id:a": [file_link("public", url="https://dropbox.com/s/file")]},
                [("/team/reports", folder_link("/team/reports"))],
            ),
        )

        self.assertEqual(permissions["link"], "https://dropbox.com/s/file")
        self.assertIsNone(permissions["link_path"])


class FakeLinksPage:
    def __init__(self, links, cursor=None):
        self.links = links
        self.has_more = cursor is not None
        self.cursor = cursor


class FakeLinksClient:
    def __init__(self, pages):
        self.pages = list(pages)
        self.cursors = []

    def sharing_list_shared_links(self, cursor=None):
        self.cursors.append(cursor)

        return self.pages.pop(0)


class SharedLinkIndexTests(unittest.TestCase):
    def build_index(self, pages):
        source = build_source()
        source.service = FakeLinksClient(pages)

        return source.list_shared_links()

    def test_files_are_indexed_by_id_and_folders_by_path(self):
        index = self.build_index(
            [
                FakeLinksPage(
                    [file_link("public"), folder_link("/team/reports")], cursor="next"
                ),
                FakeLinksPage([folder_link("/team")]),
            ]
        )

        self.assertEqual(list(index.by_file_id), ["id:a"])
        self.assertEqual(
            [path for path, _ in index.folder_links], ["/team/reports", "/team"]
        )

    def test_a_folder_outside_this_dropbox_has_no_path_to_match(self):
        index = self.build_index([FakeLinksPage([folder_link("/")])])

        self.assertEqual(index.folder_links, ())

    def test_an_exhausted_retry_yields_no_links(self):
        source = build_source()
        source.service = FakeLinksClient([])
        source.service.sharing_list_shared_links = _raise(rate_limit_error())

        with no_retry_delay():
            index = source.list_shared_links()

        self.assertEqual(index.by_file_id, {})
        self.assertEqual(index.folder_links, ())


class FakeAccessClient:
    """A client for a caller who can reach the file only through its link."""

    def __init__(self, link_id="id:a", id_lookup_works=False):
        self.link_id = link_id
        self.id_lookup_works = id_lookup_works
        self.link_calls = []

    def files_get_metadata(self, file_id):
        if not self.id_lookup_works:
            raise api_error()

        return FakeEntry(file_id)

    def sharing_get_shared_link_metadata(self, url, path=None):
        self.link_calls.append((url, path))

        if self.link_id is None:
            raise api_error()

        return FakeEntry(self.link_id)


def chunk_metadata(link=None, link_path=None):
    return {
        "id": "id:a",
        "permissions": {"anyone": True, "link": link, "link_path": link_path},
    }


class HasAccessTests(unittest.TestCase):
    def test_the_id_lookup_alone_answers_for_a_folder_member(self):
        source = build_source()
        source.service = FakeAccessClient(id_lookup_works=True)

        self.assertTrue(source.has_access("id:a", chunk_metadata("https://d.box/s/p")))
        # No point paying for the sharing call once the file already resolved
        self.assertEqual(source.service.link_calls, [])

    def test_a_recorded_link_admits_a_reader_with_no_folder_access(self):
        source = build_source()
        source.service = FakeAccessClient()

        self.assertTrue(source.has_access("id:a", chunk_metadata("https://d.box/s/p")))
        self.assertEqual(source.service.link_calls, [("https://d.box/s/p", None)])

    def test_a_folder_link_is_walked_down_to_the_recorded_file(self):
        source = build_source()
        source.service = FakeAccessClient()

        self.assertTrue(
            source.has_access(
                "id:a", chunk_metadata("https://d.box/scl/fo/f", "/q1/summary.pdf")
            )
        )
        self.assertEqual(
            source.service.link_calls, [("https://d.box/scl/fo/f", "/q1/summary.pdf")]
        )

    def test_a_revoked_link_is_refused(self):
        source = build_source()
        source.service = FakeAccessClient(link_id=None)

        self.assertFalse(source.has_access("id:a", chunk_metadata("https://d.box/s/p")))

    def test_a_link_now_pointing_at_another_file_is_refused(self):
        source = build_source()
        source.service = FakeAccessClient(link_id="id:b")

        self.assertFalse(source.has_access("id:a", chunk_metadata("https://d.box/s/p")))

    def test_no_recorded_link_means_no_second_chance(self):
        source = build_source()
        source.service = FakeAccessClient()

        self.assertFalse(source.has_access("id:a", chunk_metadata()))
        self.assertFalse(source.has_access("id:a", None))
        self.assertEqual(source.service.link_calls, [])

    def test_an_exhausted_retry_denies_rather_than_raising(self):
        # safe_call re-raises the RateLimitError it gave up on, which is an
        # HttpError rather than an ApiError
        source = build_source()
        source.service = FakeAccessClient()
        source.service.files_get_metadata = _raise(rate_limit_error())

        with no_retry_delay():
            self.assertFalse(source.has_access("id:a", chunk_metadata()))

    def test_an_exhausted_retry_on_the_link_check_denies_too(self):
        source = build_source()
        source.service = FakeAccessClient()
        source.service.sharing_get_shared_link_metadata = _raise(rate_limit_error())

        with no_retry_delay():
            self.assertFalse(
                source.has_access("id:a", chunk_metadata("https://d.box/s/p"))
            )


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
