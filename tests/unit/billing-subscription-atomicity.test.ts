import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock "server-only" so the module can be imported in test env
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

// Sentinel table objects so the fake transaction can tell the two
// update targets apart (hoisted: vi.mock factories run before init).
const { businessSubscriptionsTable, businessesTable } = vi.hoisted(() => ({
  businessSubscriptionsTable: { __table: 'businessSubscriptions' },
  businessesTable: { __table: 'businesses' },
}));

vi.mock('@/lib/db/schema/subscriptions', () => ({
  businessSubscriptions: businessSubscriptionsTable,
  accountSubscriptions: { userId: 'userId', id: 'id' },
}));

vi.mock('@/lib/db/schema/businesses', () => ({
  businesses: businessesTable,
}));

vi.mock('@/lib/ids', () => ({
  newEntityId: () => 'sub_new_1',
}));

type TxHarness = {
  transactionImpl: ReturnType<typeof vi.fn>;
  selectChain: Record<string, ReturnType<typeof vi.fn>>;
  insertChain: Record<string, ReturnType<typeof vi.fn>>;
  subUpdateChain: Record<string, ReturnType<typeof vi.fn>>;
  bizUpdateChain: Record<string, ReturnType<typeof vi.fn>>;
};

function makeTxHarness(): TxHarness {
  const selectChain = {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  const insertChain = {
    insert: vi.fn(),
    values: vi.fn(),
    onConflictDoUpdate: vi.fn(),
    returning: vi.fn(),
  };
  const subUpdateChain = {
    update: vi.fn(),
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn(),
  };
  const bizUpdateChain = {
    update: vi.fn(),
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn(),
  };

  selectChain.select.mockReturnValue({ from: selectChain.from });
  selectChain.from.mockReturnValue({ where: selectChain.where });
  selectChain.where.mockReturnValue({ limit: selectChain.limit });

  insertChain.insert.mockReturnValue({ values: insertChain.values });
  insertChain.values.mockReturnValue({
    onConflictDoUpdate: insertChain.onConflictDoUpdate,
  });
  insertChain.onConflictDoUpdate.mockReturnValue({
    returning: insertChain.returning,
  });

  const chainUpdate = (
    chain: Record<string, ReturnType<typeof vi.fn>>,
  ) => {
    chain.update.mockReturnValue({ set: chain.set });
    chain.set.mockReturnValue({ where: chain.where });
    chain.where.mockReturnValue({ returning: chain.returning });
    return chain;
  };
  chainUpdate(subUpdateChain);
  chainUpdate(bizUpdateChain);

  const tx = {
    select: selectChain.select,
    insert: insertChain.insert,
    update: vi.fn((table: unknown) =>
      table === businessSubscriptionsTable
        ? { set: subUpdateChain.set }
        : { set: bizUpdateChain.set },
    ),
  };

  const transactionImpl = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback(tx),
  );

  return {
    transactionImpl,
    selectChain,
    insertChain,
    subUpdateChain,
    bizUpdateChain,
  };
}

let harness: TxHarness;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return { transaction: harness.transactionImpl };
  },
}));

import { activateSubscription } from '@/lib/billing/subscription-service';

const BASE_PARAMS = {
  businessId: 'biz_1',
  plan: 'pro',
  provider: 'polar',
  currency: 'USD',
} as const;

describe('activateSubscription atomicity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness = makeTxHarness();
  });

  it('writes the subscription and plan cache through a single transaction', async () => {
    harness.selectChain.limit.mockResolvedValueOnce([]);
    harness.insertChain.returning.mockResolvedValueOnce([
      { id: 'sub_new_1', plan: 'pro', status: 'active' },
    ]);
    harness.bizUpdateChain.returning.mockResolvedValueOnce([{ id: 'biz_1' }]);

    const result = await activateSubscription({ ...BASE_PARAMS });

    expect(harness.transactionImpl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ id: 'sub_new_1', plan: 'pro' });
    // Business-plan cache carries the activated plan.
    expect(harness.bizUpdateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'pro' }),
    );
  });

  it('updates the existing subscription and plan cache in one transaction', async () => {
    harness.selectChain.limit.mockResolvedValueOnce([
      { id: 'sub_old_1', providerCustomerId: 'cus_1' },
    ]);
    harness.subUpdateChain.returning.mockResolvedValueOnce([
      { id: 'sub_old_1', plan: 'business', status: 'active' },
    ]);
    harness.bizUpdateChain.returning.mockResolvedValueOnce([{ id: 'biz_1' }]);
    harness.insertChain.returning.mockResolvedValue([]);

    const result = await activateSubscription({
      ...BASE_PARAMS,
      plan: 'business',
    });

    expect(harness.transactionImpl).toHaveBeenCalledTimes(1);
    expect(harness.insertChain.insert).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 'sub_old_1', plan: 'business' });
    expect(harness.bizUpdateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'business' }),
    );
  });

  it('propagates a plan-cache failure instead of reporting success', async () => {
    harness.selectChain.limit.mockResolvedValueOnce([]);
    harness.insertChain.returning.mockResolvedValueOnce([
      { id: 'sub_new_1', plan: 'pro', status: 'active' },
    ]);
    // The businesses update has no .returning() call, so a driver-level
    // failure surfaces at the terminal awaited link.
    harness.bizUpdateChain.where.mockRejectedValueOnce(
      new Error('connect ECONNREFUSED'),
    );

    // Rollback itself is the driver's guarantee inside db.transaction;
    // the contract under test is that the failure surfaces (no silent
    // partial success) so callers and retries observe a failed operation.
    await expect(
      activateSubscription({ ...BASE_PARAMS }),
    ).rejects.toThrow('connect ECONNREFUSED');
  });
});
