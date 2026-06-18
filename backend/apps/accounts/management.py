"""Central management-authorization rules.

One place decides who may manage whom, so the tier rules that protect user
accounts are defined and tested once rather than copied into every view.
"""
from .models import Clinician
from .scoping import accessible_practice_ids


def manageable_roles(user):
    """The set of roles `user` may assign / manage. Empty for non-admins."""
    if user.is_superuser:
        return {'chain_admin', 'admin', 'clinician', 'technician'}
    clinician = getattr(user, 'clinician', None)
    if clinician is None:
        return set()
    if clinician.role == 'chain_admin':
        return {'admin', 'clinician', 'technician'}
    if clinician.role == 'admin':
        return {'clinician', 'technician'}
    return set()


def can_manage(user, target):
    """True if `user` may manage Clinician `target` (role below them, in scope,
    and not themselves)."""
    if user.is_superuser:
        return True
    actor = getattr(user, 'clinician', None)
    if actor is None or actor.pk == target.pk:
        return False
    if target.role not in manageable_roles(user):
        return False
    scope = accessible_practice_ids(user)  # None == unrestricted
    return scope is None or target.practice_id in scope


def is_last_active_admin(target):
    """True if `target` is the only remaining active practice admin of its practice."""
    if target.role != 'admin':
        return False
    return Clinician.objects.filter(
        practice_id=target.practice_id, role='admin', user__is_active=True,
    ).exclude(pk=target.pk).count() == 0
