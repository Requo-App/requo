import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock "server-only" so the module can be imported in test env
vi.mock('server-only', () => ({}));

const { whereMock, expireSubscriptionMock } = vi.hoisted(() => ({
  whereMock: vi.fn(),
  expireSubscriptionMock: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: whereMock })),
    })),
  },
}));

vi.mock('@/lib/db/schema/subscriptions', () => ({
  businessSubscriptions: {
    id: 'id',
    businessId: 'businessId',
    status: 'status',
    currentPeriodEnd: 'currentPeriodEnd',
  },
}));

vi.mock('@/lib/billing/subscription-service', async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@/lib/billing/subscription-service")>();
  return { ...mod, expireSubscription: expireSubscriptionMock };
});

import { processExpiredSubscriptions } from '@/lib/billing/jobs/expire-subscriptions';

describe('processExpiredSubscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('expires each eligible subscription by business id', async () => {
    whereMock.mockResolvedValueOnce([
      { id: 'sub_1', businessId: 'biz_1', currentPeriodEnd: new Date() },
      { id: 'sub_2', businessId: 'biz_2', currentPeriodEnd: new Date() },
    ]);
    expireSubscriptionMock.mockResolvedValue({ id: 'sub_1' });

    const result = await processExpiredSubscriptions();

    expect(result).toEqual({ processed: 2, succeeded: 2, failed: 0 });
    expect(expireSubscriptionMock).toHaveBeenCalledTimes(2);
    expect(expireSubscriptionMock).toHaveBeenCalledWith('biz_1');
    expect(expireSubscriptionMock).toHaveBeenCalledWith('biz_2');
  });

  it('reports an empty run without touching the service', async () => {
    whereMock.mockResolvedValueOnce([]);

    const result = await processExpiredSubscriptions();

    expect(result).toEqual({ processed: 0, succeeded: 0, failed: 0 });
    expect(expireSubscriptionMock).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('errors');
  });

  it('counts failures per business without aborting the batch', async () => {
    whereMock.mockResolvedValueOnce([
      { id: 'sub_1', businessId: 'biz_1', currentPeriodEnd: new Date() },
      { id: 'sub_2', businessId: 'biz_2', currentPeriodEnd: new Date() },
    ]);
    expireSubscriptionMock.mockRejectedValueOnce(new Error('db down'));
    expireSubscriptionMock.mockResolvedValueOnce({ id: 'sub_2' });

    const result = await processExpiredSubscriptions();

    expect(result).toEqual({
      processed: 2,
      succeeded: 1,
      failed: 1,
      errors: ['biz_1: db down'],
    });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('biz_1'),
      expect.any(Error),
    );
  });
});
