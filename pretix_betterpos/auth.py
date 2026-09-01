from pretix.base.models import Event


FALLBACK_TEAM_PERMISSIONS = {
    'can_view_pos': ('can_view_orders', 'can_change_orders', 'can_change_event_settings'),
    'can_sell_pos': ('can_view_orders', 'can_change_orders', 'can_change_event_settings'),
    'can_discount_pos': ('can_change_orders', 'can_change_event_settings'),
    'can_cancel_unpaid_pos': ('can_change_orders', 'can_change_event_settings'),
    'can_refund_pos': ('can_change_orders', 'can_change_event_settings'),
    'can_cash_move_pos': ('can_change_orders', 'can_change_event_settings'),
    'can_session_control_pos': ('can_change_orders', 'can_change_event_settings'),
    'can_reconcile_pos': ('can_change_orders', 'can_change_event_settings'),
    'can_manage_registers_pos': ('can_change_event_settings',),
    'can_view_audit_pos': ('can_view_orders', 'can_change_orders', 'can_change_event_settings'),
}


def get_event_from_request(request, kwargs):
    if hasattr(request, 'event') and request.event:
        return request.event
    organizer = kwargs.get('organizer')
    event_slug = kwargs.get('event')
    return Event.objects.select_related('organizer').get(organizer__slug=organizer, slug=event_slug)


def has_pos_permission(user, event, code):
    if not user.is_authenticated:
        return False

    if hasattr(user, 'has_event_permission'):
        try:
            return user.has_event_permission(event.organizer, event, code)
        except ValueError:
            # Custom plugin codes are not native Team fields in pretix.
            for fallback in FALLBACK_TEAM_PERMISSIONS.get(code, ()):  # pragma: no branch
                if user.has_event_permission(event.organizer, event, fallback):
                    return True
            return False

    # Keep a conservative fallback for non-pretix auth backends.
    return user.has_perm(code) or user.has_perm(f'pretix_betterpos.{code}')
