from rest_framework import permissions


class IsPracticeAdmin(permissions.BasePermission):
    """Allow only authenticated clinicians with the practice-admin role."""
    message = 'Practice admin role required.'

    def has_permission(self, request, view):
        clinician = getattr(request.user, 'clinician', None)
        return bool(clinician and clinician.role == 'admin')
