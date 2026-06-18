import pytest
from apps.accounts.email_classification import is_free_or_disposable


@pytest.mark.parametrize('email', [
    'someone@gmail.com', 'a@outlook.com', 'b@yahoo.co.uk', 'c@mailinator.com',
    'd@PROTON.ME', '  e@hotmail.com  ',
])
def test_free_or_disposable_true(email):
    assert is_free_or_disposable(email) is True


@pytest.mark.parametrize('email', [
    'doctor@specsavers.com', 'admin@my-clinic.co.uk', 'x@nhs.net',
])
def test_professional_false(email):
    assert is_free_or_disposable(email) is False


@pytest.mark.parametrize('email', ['', 'not-an-email', None])
def test_malformed_is_false(email):
    assert is_free_or_disposable(email) is False
