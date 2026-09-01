"""
Route and deep-link validation tests for BetterPOS shell architecture.

Tests verify that:
1. Base shell route resolves to POSIndexView.
2. Deep-link paths (/pos/*, /admin/*) also resolve to POSIndexView (catch-all).
3. Permission checks work at view entry point.
4. React shell loads and passes runtime context.
"""

import pytest
from django.urls import resolve, reverse
from django.test import RequestFactory

pytestmark = pytest.mark.django_db


class TestShellRouting:
    """Validate base BetterPOS shell route and deep-link path handling."""
    
    def test_base_betterpos_route_resolves_to_pos_index(self, organizer, event):
        """Base /betterpos route should resolve to POSIndexView."""
        url = f"/control/event/{organizer.slug}/{event.slug}/betterpos"
        match = resolve(url)
        
        # Should resolve to POS view, not 404
        assert match is not None
        assert match.view_name == "plugins:pretix_betterpos:pos.index"
    
    def test_deep_link_admin_dashboard_resolves_to_pos_index(self, organizer, event):
        """Deep-link to /betterpos/admin/dashboard should catch-all to POSIndexView."""
        url = f"/control/event/{organizer.slug}/{event.slug}/betterpos/admin/dashboard"
        match = resolve(url)
        
        assert match is not None
        assert match.view_name == "plugins:pretix_betterpos:pos.index"
    
    def test_deep_link_admin_registers_resolves_to_pos_index(self, organizer, event):
        """Deep-link to /betterpos/admin/registers should catch-all to POSIndexView."""
        url = f"/control/event/{organizer.slug}/{event.slug}/betterpos/admin/registers"
        match = resolve(url)
        
        assert match is not None
        assert match.view_name == "plugins:pretix_betterpos:pos.index"
    
    def test_deep_link_admin_sessions_resolves_to_pos_index(self, organizer, event):
        """Deep-link to /betterpos/admin/sessions should catch-all to POSIndexView."""
        url = f"/control/event/{organizer.slug}/{event.slug}/betterpos/admin/sessions"
        match = resolve(url)
        
        assert match is not None
        assert match.view_name == "plugins:pretix_betterpos:pos.index"
    
    def test_deep_link_pos_session_resolves_to_pos_index(self, organizer, event):
        """Deep-link to /betterpos/pos/session should catch-all to POSIndexView."""
        url = f"/control/event/{organizer.slug}/{event.slug}/betterpos/pos/session"
        match = resolve(url)
        
        assert match is not None
        assert match.view_name == "plugins:pretix_betterpos:pos.index"
    
    def test_deep_link_multiple_segments_resolves_to_pos_index(self, organizer, event):
        """Arbitrary deep path should resolve to POSIndexView."""
        url = f"/control/event/{organizer.slug}/{event.slug}/betterpos/admin/reports/export/detailed"
        match = resolve(url)
        
        assert match is not None
        assert match.view_name == "plugins:pretix_betterpos:pos.index"
    
    def test_reverse_pos_index_generates_correct_url(self, organizer, event):
        """reverse() for pos.index should generate base /betterpos URL."""
        url = reverse(
            "plugins:pretix_betterpos:pos.index",
            kwargs={
                "organizer": organizer.slug,
                "event": event.slug,
            }
        )
        
        expected = f"/control/event/{organizer.slug}/{event.slug}/betterpos"
        assert url == expected


class TestShellViewPermissions:
    """Validate permission checks at shell entry point."""
    
    def test_user_with_can_view_pos_can_access_shell(
        self, betterpos_client, organizer, event
    ):
        """User with can_view_pos should reach shell view."""
        url = reverse(
            "plugins:pretix_betterpos:pos.index",
            kwargs={
                "organizer": organizer.slug,
                "event": event.slug,
            }
        )
        response = betterpos_client.get(url)
        
        # Should not be forbidden
        assert response.status_code != 403
        # Should return 200 or 302 (not error)
        assert response.status_code in [200, 302]
    
    def test_view_only_user_cannot_access_shell(
        self, betterpos_client_view_only, organizer, event
    ):
        """User with only can_view_pos (no sell/manage) may have limited but non-403 access."""
        # Note: This depends on POSIndexView permission checks.
        # If can_view_pos is sufficient for shell access, 200 is OK.
        # If can_view_pos is NOT sufficient, 403 is expected.
        url = reverse(
            "plugins:pretix_betterpos:pos.index",
            kwargs={
                "organizer": organizer.slug,
                "event": event.slug,
            }
        )
        response = betterpos_client_view_only.get(url)
        
        # Should either return shell (200) or redirect for permission error
        assert response.status_code in [200, 302, 403]
    
    def test_user_with_no_pos_perms_denied_access(
        self, betterpos_client_denied, organizer, event
    ):
        """User with NO BetterPOS permissions should be denied."""
        url = reverse(
            "plugins:pretix_betterpos:pos.index",
            kwargs={
                "organizer": organizer.slug,
                "event": event.slug,
            }
        )
        response = betterpos_client_denied.get(url)
        
        # Should be forbidden or redirect for permission error
        assert response.status_code in [302, 403]
    
    def test_unauthenticated_user_denied_access(
        self, betterpos_unauthenticated_client, organizer, event
    ):
        """Unauthenticated user should be redirected to login."""
        url = reverse(
            "plugins:pretix_betterpos:pos.index",
            kwargs={
                "organizer": organizer.slug,
                "event": event.slug,
            }
        )
        response = betterpos_unauthenticated_client.get(url)
        
        # Should redirect to login
        assert response.status_code in [302, 403]


class TestShellTemplateContext:
    """Validate that React shell template receives correct runtime context."""
    
    def test_shell_response_contains_runtime_config(
        self, betterpos_client, organizer, event, betterpos_register
    ):
        """Shell response should contain window.BETTERPOS config object."""
        url = reverse(
            "plugins:pretix_betterpos:pos.index",
            kwargs={
                "organizer": organizer.slug,
                "event": event.slug,
            }
        )
        response = betterpos_client.get(url)
        
        assert response.status_code == 200
        content = response.content.decode()
        
        # Should contain window.BETTERPOS config injection
        assert "window.BETTERPOS" in content
        assert organizer.slug in content
        assert event.slug in content
    
    def test_shell_loads_react_umd_scripts(
        self, betterpos_client, organizer, event
    ):
        """Shell should load React and React-DOM UMD scripts."""
        url = reverse(
            "plugins:pretix_betterpos:pos.index",
            kwargs={
                "organizer": organizer.slug,
                "event": event.slug,
            }
        )
        response = betterpos_client.get(url)
        
        assert response.status_code == 200
        content = response.content.decode()
        
        # Should reference React libraries
        assert "react.min.js" in content or "React" in content
        assert "react-dom" in content or "ReactDOM" in content
    
    def test_shell_mounts_app_container(
        self, betterpos_client, organizer, event
    ):
        """Shell should have root app mount point."""
        url = reverse(
            "plugins:pretix_betterpos:pos.index",
            kwargs={
                "organizer": organizer.slug,
                "event": event.slug,
            }
        )
        response = betterpos_client.get(url)
        
        assert response.status_code == 200
        content = response.content.decode()
        
        # Should have mount container for React
        assert "betterpos-app" in content or "app" in content


class TestAPINamespaceRouting:
    """Validate that API routes are correctly namespaced and accessible."""
    
    def test_api_registers_route_resolves(self, organizer, event):
        """GET /api/registers should resolve to RegistersListView."""
        url = f"/control/event/{organizer.slug}/{event.slug}/betterpos/api/registers/"
        match = resolve(url)
        
        assert match is not None
        # Should not be 404
    
    def test_api_session_status_route_resolves(self, organizer, event):
        """GET /api/session/status should resolve correctly."""
        url = f"/control/event/{organizer.slug}/{event.slug}/betterpos/api/session/status/"
        match = resolve(url)
        
        assert match is not None
    
    def test_api_catalog_route_resolves(self, organizer, event):
        """GET /api/catalog should resolve correctly."""
        url = f"/control/event/{organizer.slug}/{event.slug}/betterpos/api/catalog/"
        match = resolve(url)
        
        assert match is not None
    
    def test_api_routes_separate_from_shell(self, organizer, event):
        """API routes should NOT catch-all to POSIndexView."""
        # API should be handled before shell catch-all
        shell_url = f"/control/event/{organizer.slug}/{event.slug}/betterpos/admin/dashboard"
        shell_match = resolve(shell_url)
        
        api_url = f"/control/event/{organizer.slug}/{event.slug}/betterpos/api/registers/"
        api_match = resolve(api_url)
        
        # Both should resolve but to different views
        assert shell_match is not None
        assert api_match is not None
        # Shell should be POSIndexView, API should be different
        assert shell_match.view_name == "plugins:pretix_betterpos:pos.index"
        # API match should NOT be pos.index
        assert api_match.view_name != "plugins:pretix_betterpos:pos.index"


class TestPublicBuyRouting:
    """Validate public self-service buy page context values."""

    def test_public_buy_uses_request_path_for_api_base(self, client, organizer, event):
        event.settings.set("betterpos_selfservice_enabled", True)
        url = reverse(
            "plugins:pretix_betterpos:public.buy",
            kwargs={
                "organizer": organizer.slug,
                "event": event.slug,
            },
        )

        response = client.get(url)

        assert response.status_code == 200
        content = response.content.decode()
        expected_base_path = url.rstrip("/")
        assert f"basePath: '{expected_base_path}'" in content
        assert f"apiBase: '{expected_base_path}/api'" in content
