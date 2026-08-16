export function TestModeBanner() {
  return (
    <div role="status" className="test-mode-banner">
      <span className="test-mode-banner__message">
        Using mock data, no live API calls. Turn off in Settings.
      </span>
    </div>
  );
}
