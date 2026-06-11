'use client'
import { useState } from 'react'
import { AsYouType, validatePhoneNumberLength } from 'libphonenumber-js'
import type { CountryCode as LibCountryCode } from 'libphonenumber-js'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { COUNTRY_CODES } from '@/lib/countryCodes'

interface PhoneInputProps {
  value: string
  onChange: (value: string) => void
  id?: string
}

function parsePhone(value: string): { dialCode: string; isoCode: string; display: string } {
  const defaultCountry = COUNTRY_CODES[0] // UK
  if (!value) return { dialCode: defaultCountry.dialCode, isoCode: defaultCountry.isoCode, display: '' }

  const digits = value.startsWith('+') ? value.slice(1) : value
  const sorted = [...COUNTRY_CODES].sort((a, b) => b.dialCode.length - a.dialCode.length)
  const match = sorted.find((c) => digits.startsWith(c.dialCode))
  if (!match) return { dialCode: defaultCountry.dialCode, isoCode: defaultCountry.isoCode, display: digits }

  const national = digits.slice(match.dialCode.length)
  const formatter = new AsYouType(match.isoCode as LibCountryCode)
  const display = formatter.input(national)
  return { dialCode: match.dialCode, isoCode: match.isoCode, display }
}

export function PhoneInput({ value, onChange, id }: PhoneInputProps) {
  const initial = parsePhone(value)
  const [dialCode, setDialCode] = useState(initial.dialCode)
  const [isoCode, setIsoCode] = useState(initial.isoCode)
  const [display, setDisplay] = useState(initial.display)

  const emit = (code: string, formatted: string) => {
    const digits = formatted.replace(/\D/g, '')
    onChange(digits ? `+${code}${digits}` : '')
  }

  const handleCodeChange = (iso: string) => {
    const country = COUNTRY_CODES.find((c) => c.isoCode === iso)
    if (!country) return
    setIsoCode(iso)
    setDialCode(country.dialCode)
    // Re-format existing digits under the new country
    const digits = display.replace(/\D/g, '')
    if (digits) {
      const formatter = new AsYouType(iso as LibCountryCode)
      const reformatted = formatter.input(digits)
      setDisplay(reformatted)
      emit(country.dialCode, reformatted)
    } else {
      emit(country.dialCode, '')
    }
  }

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const digits = raw.replace(/\D/g, '')

    // Block input that would make the number too long for this country
    const candidate = `+${dialCode}${digits}`
    if (digits.length > 0 && validatePhoneNumberLength(candidate) === 'TOO_LONG') return

    const formatter = new AsYouType(isoCode as LibCountryCode)
    const formatted = formatter.input(digits)
    setDisplay(formatted)
    emit(dialCode, formatted)
  }

  return (
    <div className="mt-1 flex gap-2">
      <Select value={isoCode} onValueChange={handleCodeChange}>
        <SelectTrigger className="w-28 shrink-0 text-sm" aria-label="Country code">
          +{dialCode}
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {COUNTRY_CODES.map((c) => (
            <SelectItem key={c.isoCode} value={c.isoCode}>
              {c.country} (+{c.dialCode})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        id={id}
        type="tel"
        inputMode="numeric"
        value={display}
        onChange={handleNumberChange}
        placeholder="Phone number"
      />
    </div>
  )
}
