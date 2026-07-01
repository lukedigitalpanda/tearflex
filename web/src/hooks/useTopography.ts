'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Paginated } from '@shared/types/api'
import type { TopographyScan } from '@shared/types/topography'

export function useTopographyScans(assessmentId: number | undefined) {
  return useQuery({
    queryKey: ['topography-scans', assessmentId],
    queryFn: () => api.get<Paginated<TopographyScan>>(`topography/scans/?assessment=${assessmentId}`),
    enabled: !!assessmentId,
  })
}
