import { DocumentStatus, RecipientRole, SigningStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  getPendingSigners,
  isAssistantLastSigner,
  normalizeRecipientSigningOrders,
  sortRecipientsForSigningOrder,
} from './recipients';

describe('recipient signing order helpers', () => {
  it('returns only recipients who still need to sign', () => {
    const recipients = [
      { id: 1, role: RecipientRole.SIGNER, signingStatus: SigningStatus.NOT_SIGNED },
      { id: 2, role: RecipientRole.APPROVER, signingStatus: SigningStatus.NOT_SIGNED },
      { id: 3, role: RecipientRole.SIGNER, signingStatus: SigningStatus.SIGNED },
      { id: 4, role: RecipientRole.SIGNER, signingStatus: SigningStatus.REJECTED },
      { id: 5, role: RecipientRole.CC, signingStatus: SigningStatus.NOT_SIGNED },
    ];

    expect(getPendingSigners({ status: DocumentStatus.PENDING, recipients }).map((recipient) => recipient.id)).toEqual([
      1, 2,
    ]);
  });

  it('excludes recipients soft-deleted from the document', () => {
    const recipients = [
      { id: 1, role: RecipientRole.SIGNER, signingStatus: SigningStatus.NOT_SIGNED, documentDeletedAt: null },
      {
        id: 2,
        role: RecipientRole.SIGNER,
        signingStatus: SigningStatus.NOT_SIGNED,
        documentDeletedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ];

    expect(getPendingSigners({ status: DocumentStatus.PENDING, recipients }).map((recipient) => recipient.id)).toEqual([1]);
  });

  it.each([
    DocumentStatus.DRAFT,
    DocumentStatus.COMPLETED,
    DocumentStatus.REJECTED,
    DocumentStatus.CANCELLED,
  ])('does not return pending signers for a %s document', (status) => {
    const recipients = [{ id: 1, role: RecipientRole.SIGNER, signingStatus: SigningStatus.NOT_SIGNED }];

    expect(getPendingSigners({ status, recipients })).toEqual([]);
  });

  it('sorts CC recipients after ordered active recipients', () => {
    const recipients = [
      { id: 1, role: RecipientRole.CC, signingOrder: 1 },
      { id: 2, role: RecipientRole.SIGNER, signingOrder: 2 },
      { id: 3, role: RecipientRole.APPROVER, signingOrder: 1 },
    ];

    expect(sortRecipientsForSigningOrder(recipients).map((recipient) => recipient.id)).toEqual([3, 2, 1]);
  });

  it('keeps original order when recipients have the same signing order', () => {
    const recipients = [
      { id: 2, role: RecipientRole.SIGNER, signingOrder: 1 },
      { id: 1, role: RecipientRole.APPROVER, signingOrder: 1 },
    ];

    expect(sortRecipientsForSigningOrder(recipients).map((recipient) => recipient.id)).toEqual([2, 1]);
  });

  it('sorts and normalizes active recipient signing order and removes it from CC recipients', () => {
    const recipients = [
      { id: 1, role: RecipientRole.CC, signingOrder: 1 },
      { id: 2, role: RecipientRole.SIGNER, signingOrder: 4 },
      { id: 3, role: RecipientRole.APPROVER, signingOrder: 2 },
    ];

    expect(normalizeRecipientSigningOrders(sortRecipientsForSigningOrder(recipients))).toEqual([
      { id: 3, role: RecipientRole.APPROVER, signingOrder: 1 },
      { id: 2, role: RecipientRole.SIGNER, signingOrder: 2 },
      { id: 1, role: RecipientRole.CC, signingOrder: undefined },
    ]);
  });

  it('preserves caller order while normalizing signing order', () => {
    const recipients = [
      { id: 2, role: RecipientRole.ASSISTANT, signingOrder: 2 },
      { id: 1, role: RecipientRole.SIGNER, signingOrder: 1 },
      { id: 3, role: RecipientRole.CC, signingOrder: 1 },
    ];

    expect(normalizeRecipientSigningOrders(recipients)).toEqual([
      { id: 2, role: RecipientRole.ASSISTANT, signingOrder: 1 },
      { id: 1, role: RecipientRole.SIGNER, signingOrder: 2 },
      { id: 3, role: RecipientRole.CC, signingOrder: undefined },
    ]);
  });

  it('checks whether the last non-CC recipient is an assistant', () => {
    expect(
      isAssistantLastSigner([
        { role: RecipientRole.SIGNER },
        { role: RecipientRole.ASSISTANT },
        { role: RecipientRole.CC },
      ]),
    ).toBe(true);

    expect(
      isAssistantLastSigner([
        { role: RecipientRole.ASSISTANT },
        { role: RecipientRole.SIGNER },
        { role: RecipientRole.CC },
      ]),
    ).toBe(false);
  });
});
