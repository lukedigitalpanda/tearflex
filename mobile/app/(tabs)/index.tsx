import { useState, useRef } from 'react';
import { View, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePatients } from '@/hooks/usePatients';
import { PatientList } from '@/components/patients/PatientList';
import { LoadingState } from '@/components/common/LoadingState';

export default function PatientsScreen() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const { data, isLoading, isError } = usePatients(debouncedSearch);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearch(text: string) {
    setSearch(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(text), 300);
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <View className="px-4 pt-4 pb-2">
        <Text className="text-xl font-bold text-slate-900 mb-3">Patients</Text>
        <TextInput
          className="bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-slate-900"
          value={search}
          onChangeText={handleSearch}
          placeholder="Search patients…"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>
      <View className="flex-1 px-4">
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <View className="items-center pt-8">
            <Text className="text-slate-600 text-center">Could not load patients. Check your connection.</Text>
          </View>
        ) : (
          <PatientList patients={data?.results ?? []} />
        )}
      </View>
    </SafeAreaView>
  );
}
