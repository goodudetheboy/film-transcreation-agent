export interface ErrorBannerProps {
  message: string;
  onRetry: () => void;
}

export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div role="alert" className="error-banner">
      <span className="error-banner__message">{message}</span>
      <button type="button" className="btn btn--ghost" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
