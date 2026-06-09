import { Text } from 'react-native';

export function TimerDisplay({ elapsed, visible }: { elapsed: number; visible: boolean }) {
  if (!visible) return null;
  const s = elapsed % 60;
  const m = Math.floor(elapsed / 60);
  const formatted = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return (
    <Text style={{ color: 'white', fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
      {formatted}
    </Text>
  );
}
