import { describe, it, expect } from 'vitest';
import {
  parseCurrencyInputToCents,
  calculateQuoteEditorTotals,
  calculateQuoteDiscountAndTax,
  isQuotePastValidityDate,
  getQuoteReminderKinds,
  centsToMoneyInput,
  isQuoteEditorLineItemBlank,
  applyTemplateToQuoteForm,
  getQuoteEditorInitialValuesFromDetail,
  getDefaultQuoteValidityDate,
  parseQuoteMoneyAmountToCents,
  parseQuoteMoneyPercentage,
} from '@/features/quotes/utils';
import type { QuoteTemplateData } from '@/features/quotes/utils';
import { QuoteEditorLineItemValue } from '@/features/quotes/types';

describe('features/quotes/utils', () => {
  describe('parseCurrencyInputToCents', () => {
    it('parses basic money values', () => {
      expect(parseCurrencyInputToCents('10')).toBe(1000);
      expect(parseCurrencyInputToCents('10.50')).toBe(1050);
      expect(parseCurrencyInputToCents('10.99')).toBe(1099);
    });

    it('handles commas gracefully', () => {
      expect(parseCurrencyInputToCents('1,000.50')).toBe(100050);
      expect(parseCurrencyInputToCents('1,000,000')).toBe(100000000);
    });

    it('returns 0 for invalid or empty values', () => {
      expect(parseCurrencyInputToCents('')).toBe(0);
      expect(parseCurrencyInputToCents('abc')).toBe(0);
      expect(parseCurrencyInputToCents('10.555')).toBe(0); // More than 2 decimal places is invalid by this regex
    });
  });

  describe('centsToMoneyInput', () => {
    it('converts cents to 2-decimal string', () => {
      expect(centsToMoneyInput(1000)).toBe('10.00');
      expect(centsToMoneyInput(1050)).toBe('10.50');
      expect(centsToMoneyInput(99)).toBe('0.99');
    });

    it('handles 0 or falsy values', () => {
      expect(centsToMoneyInput(0)).toBe('');
    });
  });

  describe('calculateQuoteEditorTotals', () => {
    it('calculates totals correctly with no discount', () => {
      const items: QuoteEditorLineItemValue[] = [
        { id: '1', description: 'Item 1', quantity: '2', unitPrice: '10.00' },
        { id: '2', description: 'Item 2', quantity: '1', unitPrice: '5.50' }
      ];

      const result = calculateQuoteEditorTotals(items, '');
      expect(result).toEqual({
        subtotalInCents: 2550, // 2*1000 + 1*550
        discountInCents: 0,
        taxInCents: 0,
        totalInCents: 2550
      });
    });

    it('calculates totals correctly with discount', () => {
      const items: QuoteEditorLineItemValue[] = [
        { id: '1', description: 'Item 1', quantity: '1', unitPrice: '100.00' }
      ];

      const result = calculateQuoteEditorTotals(items, '10.00');
      expect(result).toEqual({
        subtotalInCents: 10000,
        discountInCents: 1000,
        taxInCents: 0,
        totalInCents: 9000
      });
    });

    it('caps discount at subtotal', () => {
      const items: QuoteEditorLineItemValue[] = [
        { id: '1', description: 'Item 1', quantity: '1', unitPrice: '50.00' }
      ];

      // Try to give a $100 discount on a $50 item
      const result = calculateQuoteEditorTotals(items, '100.00');
      expect(result).toEqual({
        subtotalInCents: 5000,
        discountInCents: 5000,
        taxInCents: 0,
        totalInCents: 0
      });
    });

    it('reads a percentage tax against the taxable base', () => {
      const items: QuoteEditorLineItemValue[] = [
        { id: '1', description: 'Item 1', quantity: '1', unitPrice: '1000.00' }
      ];

      const result = calculateQuoteEditorTotals(items, '', 'amount', '10', 'percentage');
      expect(result).toEqual({
        subtotalInCents: 100000,
        discountInCents: 0,
        taxInCents: 10000,
        totalInCents: 110000
      });
    });

    it('reads a percentage tax against the subtotal minus the discount', () => {
      const items: QuoteEditorLineItemValue[] = [
        { id: '1', description: 'Item 1', quantity: '1', unitPrice: '1000.00' }
      ];

      const result = calculateQuoteEditorTotals(items, '200.00', 'amount', '10', 'percentage');
      expect(result.discountInCents).toBe(20000);
      expect(result.taxInCents).toBe(8000);
      expect(result.totalInCents).toBe(88000);
    });

    it('ignores a partially numeric quantity instead of reading it as a number', () => {
      const items: QuoteEditorLineItemValue[] = [
        { id: '1', description: 'Item 1', quantity: '2abc', unitPrice: '10.00' }
      ];

      // The server rejects a non-numeric quantity, so the live total must not
      // overstate what will actually be saved.
      expect(calculateQuoteEditorTotals(items, '').subtotalInCents).toBe(0);
    });
  });

  describe('calculateQuoteDiscountAndTax', () => {
    it('keeps total = subtotal - discount + tax', () => {
      const result = calculateQuoteDiscountAndTax({
        subtotalInCents: 100000,
        discountValue: '10',
        discountType: 'percentage',
        taxValue: '20',
        taxType: 'percentage',
      });

      expect(result.discountInCents).toBe(10000);
      expect(result.taxInCents).toBe(18000);
      expect(result.totalInCents).toBe(
        result.discountInCents === 0
          ? 100000
          : 100000 - result.discountInCents + result.taxInCents,
      );
    });

    it('treats an empty amount as zero', () => {
      const result = calculateQuoteDiscountAndTax({
        subtotalInCents: 5000,
        discountValue: '',
        discountType: 'amount',
        taxValue: '',
        taxType: 'amount',
      });

      expect(result.discountInCents).toBe(0);
      expect(result.taxInCents).toBe(0);
      expect(result.totalInCents).toBe(5000);
    });
  });

  describe('parseQuoteMoneyAmountToCents', () => {
    it('parses valid amounts', () => {
      expect(parseQuoteMoneyAmountToCents('10')).toBe(1000);
      expect(parseQuoteMoneyAmountToCents('10.50')).toBe(1050);
      expect(parseQuoteMoneyAmountToCents('')).toBe(0);
    });

    it('rejects malformed amounts', () => {
      expect(parseQuoteMoneyAmountToCents('abc')).toBeNull();
      expect(parseQuoteMoneyAmountToCents('10.555')).toBeNull();
      expect(parseQuoteMoneyAmountToCents('-5')).toBeNull();
    });
  });

  describe('parseQuoteMoneyPercentage', () => {
    it('parses percentages in range', () => {
      expect(parseQuoteMoneyPercentage('10')).toBe(10);
      expect(parseQuoteMoneyPercentage('0')).toBe(0);
      expect(parseQuoteMoneyPercentage('100')).toBe(100);
      expect(parseQuoteMoneyPercentage('')).toBe(0);
    });

    it('rejects percentages out of range', () => {
      expect(parseQuoteMoneyPercentage('101')).toBeNull();
      expect(parseQuoteMoneyPercentage('-1')).toBeNull();
      expect(parseQuoteMoneyPercentage('abc')).toBeNull();
    });
  });

  describe('getQuoteEditorInitialValuesFromDetail', () => {
    const detail = {
      title: 'Storefront sign package',
      customerName: 'Alicia Cruz',
      customerEmail: 'alicia@example.com',
      customerContactMethod: 'email',
      customerContactHandle: 'alicia@example.com',
      notes: null,
      terms: null,
      validUntil: '2026-05-31',
      discountInCents: 0,
      taxInCents: 8000,
      taxLabel: 'VAT',
      subtotalInCents: 100000,
      totalInCents: 108000,
      currency: 'USD',
      status: 'draft' as const,
      version: 1,
      sentAt: null,
      acceptedAt: null,
      publicViewedAt: null,
      customerRespondedAt: null,
      customerResponseMessage: null,
      aiReadiness: null,
      aiAcknowledgedAt: null,
      aiMissingInfo: null,
      items: [
        {
          id: 'line-1',
          description: 'Design',
          quantity: 1,
          unitPriceInCents: 100000,
          lineTotalInCents: 100000,
          position: 0,
        },
      ],
    } as unknown as Parameters<typeof getQuoteEditorInitialValuesFromDetail>[0];

    it('seeds the persisted tax as an amount, not a percentage', () => {
      const values = getQuoteEditorInitialValuesFromDetail(detail);

      expect(values.taxType).toBe('amount');
      expect(values.tax).toBe('80.00');
    });

    it('round-trips the persisted totals without re-pricing the tax', () => {
      const values = getQuoteEditorInitialValuesFromDetail(detail);
      const totals = calculateQuoteEditorTotals(
        values.items,
        values.discount,
        values.discountType,
        values.tax,
        values.taxType,
      );

      expect(totals.subtotalInCents).toBe(100000);
      expect(totals.taxInCents).toBe(8000);
      expect(totals.totalInCents).toBe(108000);
    });
  });

  describe('getDefaultQuoteValidityDate', () => {
    it('returns a UTC calendar date the given number of days ahead', () => {
      const expected = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      expect(getDefaultQuoteValidityDate(14)).toBe(expected);
    });
  });

  describe('isQuoteEditorLineItemBlank', () => {
    it('returns true for a blank item', () => {
      expect(isQuoteEditorLineItemBlank({
        id: '1',
        description: '',
        quantity: '1',
        unitPrice: ''
      })).toBe(true);

      expect(isQuoteEditorLineItemBlank({
        id: '2',
        description: '   ',
        quantity: '',
        unitPrice: '  '
      })).toBe(true);
    });

    it('returns false if fields are populated', () => {
      expect(isQuoteEditorLineItemBlank({
        id: '1',
        description: 'Design',
        quantity: '1',
        unitPrice: ''
      })).toBe(false);

      expect(isQuoteEditorLineItemBlank({
        id: '2',
        description: '',
        quantity: '1',
        unitPrice: '10'
      })).toBe(false);

      expect(isQuoteEditorLineItemBlank({
        id: '3',
        description: '',
        quantity: '2',
        unitPrice: ''
      })).toBe(false);
    });
  });

  describe('isQuotePastValidityDate', () => {
    it('returns true if the date is in the past compared to today', () => {
      // Mocking today is hard without a specific library, but the function uses new Date()
      // Let's assume today is some date.
      const today = new Date().toISOString().slice(0, 10);

      // Make a date strictly less than today string-wise
      const pastDate = '2000-01-01';
      expect(isQuotePastValidityDate(pastDate)).toBe(true);

      // Make a date strictly greater than today string-wise
      const futureDate = '3000-01-01';
      expect(isQuotePastValidityDate(futureDate)).toBe(false);

      // Today
      expect(isQuotePastValidityDate(today)).toBe(false);
    });
  });

  describe('getQuoteReminderKinds', () => {
    it('returns empty array if not sent or if customer has responded', () => {
      const now = new Date('2024-01-10T12:00:00Z');
      expect(getQuoteReminderKinds({
        status: 'draft',
        sentAt: null,
        customerRespondedAt: null,
        validUntil: '2024-01-20',
        now
      })).toEqual([]);

      expect(getQuoteReminderKinds({
        status: 'sent',
        sentAt: new Date('2024-01-01T12:00:00Z'),
        customerRespondedAt: new Date('2024-01-05T12:00:00Z'),
        validUntil: '2024-01-20',
        now
      })).toEqual([]);
    });

    it('returns follow_up_due if sent > 3 days ago', () => {
      const now = new Date('2024-01-10T12:00:00Z');
      const sentAt = new Date('2024-01-05T12:00:00Z'); // 5 days ago
      const kinds = getQuoteReminderKinds({
        status: 'sent',
        sentAt,
        customerRespondedAt: null,
        validUntil: '2024-02-01',
        now
      });
      expect(kinds).toContain('follow_up_due');
    });

    it('returns expiring_soon if validUntil is within next 7 days', () => {
      const now = new Date('2024-01-10T12:00:00Z');
      const sentAt = new Date('2024-01-09T12:00:00Z'); // sent yesterday, no follow-up needed yet

      // Expires in 5 days
      const kinds = getQuoteReminderKinds({
        status: 'sent',
        sentAt,
        customerRespondedAt: null,
        validUntil: '2024-01-15',
        now
      });
      expect(kinds).toContain('expiring_soon');
      expect(kinds).not.toContain('follow_up_due');
    });
  });

  describe('applyTemplateToQuoteForm', () => {
    it('transforms template data into quote form state', () => {
      const template: QuoteTemplateData = {
        title: 'Web Design Package',
        notes: 'Thank you for choosing us.',
        terms: 'Net 30',
        validityDays: 14,
        items: [
          { id: 'item-1', description: 'Homepage design', quantity: 1, unitPriceInCents: 50000 },
          { id: 'item-2', description: 'Inner page design', quantity: 3, unitPriceInCents: 25000 },
        ],
      };

      const result = applyTemplateToQuoteForm(template);

      expect(result.title).toBe('Web Design Package');
      expect(result.notes).toBe('Thank you for choosing us.');
      expect(result.terms).toBe('Net 30');
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual({
        id: 'item-1',
        description: 'Homepage design',
        quantity: 1,
        unitPriceInCents: 50000,
        lineTotalInCents: 50000,
      });
      expect(result.items[1]).toEqual({
        id: 'item-2',
        description: 'Inner page design',
        quantity: 3,
        unitPriceInCents: 25000,
        lineTotalInCents: 75000,
      });
    });

    it('defaults null notes and terms to empty strings', () => {
      const template: QuoteTemplateData = {
        title: 'Basic Quote',
        notes: null,
        terms: null,
        validityDays: 7,
        items: [
          { id: 'item-1', description: 'Service', quantity: 1, unitPriceInCents: 10000 },
        ],
      };

      const result = applyTemplateToQuoteForm(template);

      expect(result.notes).toBe('');
      expect(result.terms).toBe('');
    });

    it('calculates validUntil as ISO date string offset by validityDays', () => {
      const template: QuoteTemplateData = {
        title: 'Test',
        notes: null,
        terms: null,
        validityDays: 30,
        items: [
          { id: 'item-1', description: 'Item', quantity: 1, unitPriceInCents: 1000 },
        ],
      };

      const result = applyTemplateToQuoteForm(template);

      // validUntil should be a YYYY-MM-DD string
      expect(result.validUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Verify it's approximately 30 days from now
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + 30);
      expect(result.validUntil).toBe(expectedDate.toISOString().split('T')[0]);
    });

    it('computes lineTotalInCents as quantity * unitPriceInCents', () => {
      const template: QuoteTemplateData = {
        title: 'Multi-quantity',
        notes: null,
        terms: null,
        validityDays: 14,
        items: [
          { id: 'item-1', description: 'Widget', quantity: 5, unitPriceInCents: 1299 },
        ],
      };

      const result = applyTemplateToQuoteForm(template);

      expect(result.items[0].lineTotalInCents).toBe(5 * 1299);
    });
  });
});
