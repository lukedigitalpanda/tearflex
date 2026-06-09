import { FlatList } from 'react-native';
import { PatientCard } from './PatientCard';
import { EmptyState } from '@/components/common/EmptyState';
import type { PatientListItem } from '@shared/types/patient';

export function PatientList({ patients }: { patients: PatientListItem[] }) {
  if (patients.length === 0) {
    return <EmptyState title="No patients found" hint="Patients are added via the web app." />;
  }
  return (
    <FlatList
      data={patients}
      keyExtractor={(p) => String(p.id)}
      renderItem={({ item }) => <PatientCard patient={item} />}
      showsVerticalScrollIndicator={false}
    />
  );
}
