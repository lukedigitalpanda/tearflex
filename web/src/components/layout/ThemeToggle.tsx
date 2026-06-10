'use client'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'

const OPTIONS = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
] as const

export function ThemeToggle() {
  const { theme = 'system', setTheme } = useTheme()
  const current = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[2]
  const CurrentIcon = current.Icon

  return (
    <Select value={theme} onValueChange={setTheme}>
      <SelectTrigger className="h-8 w-28 gap-1.5 text-xs">
        <CurrentIcon className="h-3.5 w-3.5 shrink-0" />
        <span>{current.label}</span>
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map(({ value, label, Icon }) => (
          <SelectItem key={value} value={value}>
            <span className="flex items-center gap-2">
              <Icon className="h-3.5 w-3.5" />
              {label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
