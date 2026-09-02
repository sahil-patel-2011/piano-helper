export function AppMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="app-mark">
      <rect width="32" height="32" rx="8" fill="#1a1710" />
      <rect x="5" y="10" width="6.2" height="16" rx="1.2" fill="#f3ead6" />
      <rect x="12.9" y="10" width="6.2" height="16" rx="1.2" fill="#f0c75a" />
      <rect x="20.8" y="10" width="6.2" height="16" rx="1.2" fill="#f3ead6" />
      <rect x="10.1" y="10" width="3.6" height="10" rx="0.8" fill="#1c1914" />
      <rect x="18" y="10" width="3.6" height="10" rx="0.8" fill="#1c1914" />
    </svg>
  );
}
