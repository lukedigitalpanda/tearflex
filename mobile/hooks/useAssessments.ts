import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Paginated } from '@shared/types/api';
import type { Assessment, AssessmentListItem } from '@shared/types/assessment';
import type { Eye } from '@shared/types/assessment';

export function useAssessments(params: { patient?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.patient) qs.set('patient', String(params.patient));
  return useQuery({
    queryKey: ['assessments', params],
    queryFn: () => api.get<Paginated<AssessmentListItem>>(`assessments/?${qs.toString()}`),
  });
}

export function useCreateAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { patient: number; eye: Eye }) =>
      api.post<Assessment>('assessments/', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessments'] }),
  });
}
