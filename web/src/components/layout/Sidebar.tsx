'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/patients', label: 'Patients', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="w-60 shrink-0 border-r border-border bg-card p-4">
      <div className="mb-8 px-2 text-xl font-bold text-teal-600">TearFlex</div>
      <nav className="space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link key={href} href={href}
              className={cn('flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
                active ? 'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300' : 'text-muted-foreground hover:bg-muted')}>
              <Icon className="h-4 w-4" /> {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
