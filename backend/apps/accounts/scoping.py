"""Central practice-scoping rule.

One place decides which practices a user may access, so the rule that protects
patient data across practices is defined and tested once rather than copied into
every view.
"""
from .models import Practice


def accessible_practice_ids(user):
    """Return the set of practice ids `user` may access, or ``None`` for
    unrestricted access (superusers)."""
    if user.is_superuser:
        return None
    clinician = getattr(user, 'clinician', None)
    if clinician is None:
        return set()
    if clinician.role == 'chain_admin' and clinician.practice.chain_id:
        return set(
            Practice.objects.filter(chain_id=clinician.practice.chain_id)
            .values_list('id', flat=True)
        )
    return {clinician.practice_id}


def resolve_practice_scope(user, requested_practice_id=None):
    """Return the practice id(s) to filter querysets on.

    ``None`` means "no restriction" (superuser, all practices). A set means
    "restrict to these practice ids". A ``requested_practice_id`` (e.g. the
    header practice selector's ``?practice_id=``) is honoured only when it falls
    within the user's accessible practices; otherwise it is denied (empty set).
    """
    allowed = accessible_practice_ids(user)
    if requested_practice_id not in (None, ''):
        try:
            requested = int(requested_practice_id)
        except (TypeError, ValueError):
            return set()
        if allowed is None or requested in allowed:
            return {requested}
        return set()
    return allowed


def scope_queryset(qs, user, practice_path, requested_practice_id=None):
    """Filter `qs` to the practices `user` may access.

    `practice_path` is the lookup from the model to its Practice
    (e.g. ``"practice"`` or ``"assessment__patient__practice"``).
    """
    scope = resolve_practice_scope(user, requested_practice_id)
    if scope is None:
        return qs
    return qs.filter(**{f'{practice_path}_id__in': scope})
