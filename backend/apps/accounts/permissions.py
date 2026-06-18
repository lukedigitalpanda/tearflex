from rest_framework import permissions


class IsPracticeAdmin(permissions.BasePermission):
    """Allow authenticated clinicians with practice-admin or chain-admin role."""
    message = 'Practice admin role required.'

    def has_permission(self, request, view):
        clinician = getattr(request.user, 'clinician', None)
        return bool(clinician and clinician.role in ('admin', 'chain_admin'))


class IsChainAdminOrSuperuser(permissions.BasePermission):
    """Allow superusers and chain-admin clinicians (used to gate practice creation)."""
    message = 'Chain admin or superuser required.'

    def has_permission(self, request, view):
        if request.user and request.user.is_superuser:
            return True
        clinician = getattr(request.user, 'clinician', None)
        return bool(clinician and clinician.role == 'chain_admin')
