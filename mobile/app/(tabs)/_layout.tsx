import { Tabs } from 'expo-router';
import { Users, Settings } from 'lucide-react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0E7C7B',
        tabBarInactiveTintColor: '#475569',
        tabBarStyle: { borderTopColor: '#CBD5E1' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Patients',
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
