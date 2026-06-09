import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Paginated } from '@shared/types/api';
import type { Patient, PatientListItem } from '@shared/types/patient';

export function usePatients(search = '', page = 1) {
  const qs = new URLSearchParams({ page: String(page) });
  if (search) qs.set('search', search);
  return useQuery({
    queryKey: ['patients', search, page],
    queryFn: () => api.get<Paginated<PatientListItem>>(`patients/?${qs.toString()}`),
  });
}

export function usePatient(id: number) {
  return useQuery({
    queryKey: ['patient', id],
    queryFn: () => api.get<Patient>(`patients/${id}/`),
    enabled: !!id,
  });
}

export function usePatientTrend(id: number) {
  return useQuery({
    queryKey: ['patient-trend', id],
    queryFn: () => api.get<{ date: string; nibut: number }[]>(`patients/${id}/trend/`),
    enabled: !!id,
  });
}
