// Plain-English reasons a run ended early. The run's status word stays canonical; this only explains it.
const REASONS: Record<string, string> = {
  user_stop: 'stopped by the owner',
  budget_time_reserved_for_verification: 'paused exploring to leave time to verify what it found',
  budget_exploration_incomplete: 'time ran out before every page was explored',
  budget_exploration_cap: 'reached its exploration budget',
  exploration_stalled: 'stopped making progress, so it stopped exploring',
  limit_turns: 'reached its step limit',
  provider_error: 'the AI model could not be reached',
  egress_cap: 'reached its network traffic limit',
  worker_lost_or_expired: 'the machine running it was lost, so it was ended safely',
  queue_entry_expired: 'waited too long in the queue',
  kill_switch: 'stopped by the service kill switch',
};

export const stopReasonText = (code: string | null | undefined) => (code ? REASONS[code] ?? code.replace(/_/g, ' ') : '');
