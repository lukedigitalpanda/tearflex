from rest_framework import permissions


class IsPracticeAdmin(permissions.BasePermission):
    """Allow authenticated clinicians with practice-admin or chain-admin role."""
    message = 'Practice admin role required.'

    def has_permission(self, request, view):
        clinician = getattr(request.user, 'clinician', None)
        return bool(clinician and clinician.role in ('admin', 'chain_admin'))
