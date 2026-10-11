import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock "server-only" so the module can be imported
vi.mock('server-only', () => ({}));

// Controllable chain links for the insert and select paths.
const returningMock = vi.fn();
const onConflictDoNothingMock = vi.fn();
const valuesMock = vi.fn();
const limitMock = vi.fn();
const whereMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/lib/db/client', () => ({
  db: {
    select: vi.fn(() => ({ from: fromMock })),
    insert: vi.fn(() => ({ values: valuesMock })),
  },
}));

vi.mock('@/lib/db/schema/subscriptions', () => ({
  billingEvents: {
    id: 'id',
    providerEventId: 'providerEventId',
    provider: 'provider',
    eventType: 'eventType',
    userId: 'userId',
    businessId: 'businessId',
    payload: 'payload',
    status: 'status',
    errorMessage: 'errorMessage',
    processedAt: 'processedAt',
    createdAt: 'createdAt',
  },
  paymentAttempts: {
    userId: 'userId',
    providerPaymentId: 'providerPaymentId',
    status: 'status',
  },
}));

import { recordWebhookEvent } from '@/lib/billing/webhook-processor';

const params = {
  providerEventId: 'evt_test_123',
  provider: 'polar',
  eventType: 'subscription.created',
  businessId: 'biz_1',
  payload: { id: 'evt_test_123' },
} as const;

describe('recordWebhookEvent idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockReturnValue({ where: whereMock });
    whereMock.mockReturnValue({ limit: limitMock });
    valuesMock.mockReturnValue({
      onConflictDoNothing: onConflictDoNothingMock,
    });
    onConflictDoNothingMock.mockReturnValue({ returning: returningMock });
  });

  it('inserts a new event and reports it as new', async () => {
    returningMock.mockResolvedValueOnce([{ id: 'evt-row-1' }]);

    const result = await recordWebhookEvent({ ...params });

    expect(result).toEqual({ isNew: true, eventId: 'evt-row-1' });
    expect(onConflictDoNothingMock).toHaveBeenCalledWith({
      target: 'providerEventId',
    });
    // No follow-up select on the insert path.
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('reports a sequential duplicate without a second insert', async () => {
    returningMock.mockResolvedValueOnce([]);
    limitMock.mockResolvedValueOnce([{ id: 'evt-row-1' }]);

    const result = await recordWebhookEvent({ ...params });

    expect(result).toEqual({ isNew: false, eventId: 'evt-row-1' });
    expect(valuesMock).toHaveBeenCalledTimes(1);
  });

  it('resolves a conflicting concurrent insert to the winner without throwing', async () => {
    // Models the loser of the race: the atomic insert affects zero rows
    // because the winner committed first, so no uniqueness violation
    // surfaces and the follow-up select finds the winner.
    returningMock.mockResolvedValueOnce([]);
    limitMock.mockResolvedValueOnce([{ id: 'evt-row-winner' }]);

    const result = await recordWebhookEvent({ ...params });

    expect(result).toEqual({ isNew: false, eventId: 'evt-row-winner' });
  });

  it('throws when neither insert nor follow-up select finds the event', async () => {
    returningMock.mockResolvedValueOnce([]);
    limitMock.mockResolvedValueOnce([]);

    await expect(recordWebhookEvent({ ...params })).rejects.toThrow(
      'Billing event record could not be created.',
    );
  });

  it('propagates unrelated database failures instead of reporting a duplicate', async () => {
    returningMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

    await expect(recordWebhookEvent({ ...params })).rejects.toThrow(
      'connect ECONNREFUSED',
    );
  });
});
