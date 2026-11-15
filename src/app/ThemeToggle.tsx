import type { ThemePreference } from './theme';

export function ThemeToggle({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (p: ThemePreference) => void;
}) {
  return (
    <select
      aria-label="Theme"
      value={value}
      onChange={(e) => onChange(e.target.value as ThemePreference)}
    >
      <option value="system">System theme</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  );
}
