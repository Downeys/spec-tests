import type { HealthSnapshot } from '../hooks/useHealth';
import { ErrorTagMessage } from './ErrorTagMessage';

export interface HealthBannerProps {
  snapshot: HealthSnapshot;
}

export function HealthBanner({ snapshot }: HealthBannerProps): JSX.Element {
  if (snapshot.status === 'unreachable') {
    return (
      <header
        role="banner"
        aria-label="API health"
        className="border-b border-red-200 bg-red-50 px-4 py-2"
      >
        <p className="text-sm font-medium text-red-800">bp-agent API: unreachable</p>
        {snapshot.error ? <ErrorTagMessage error={snapshot.error} /> : null}
      </header>
    );
  }

  return (
    <header
      role="banner"
      aria-label="API health"
      className="border-b border-emerald-200 bg-emerald-50 px-4 py-2"
    >
      <p className="text-sm font-medium text-emerald-800">bp-agent API: ok</p>
      {snapshot.activeStrategy !== null ? (
        <p className="text-sm text-emerald-900">
          active Strategy: <span className="font-semibold">{snapshot.activeStrategy}</span>
        </p>
      ) : (
        <p className="text-sm text-emerald-900">no active Strategy</p>
      )}
    </header>
  );
}
