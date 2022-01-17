import {
  ConfirmOptions,
  Connection,
  Transaction,
  TransactionError,
  TransactionSignature,
} from '@solana/web3.js';

export type SendAndConfirmError =
  | { type: 'tx-error'; inner: TransactionError; txid: TransactionSignature }
  | { type: 'timeout'; inner: unknown; txid?: TransactionSignature }
  | { type: 'misc-error'; inner: unknown; txid?: TransactionSignature };

export type SendSignedTransactionResult =
  | { txid: string; slot: number; err?: undefined }
  | { txid?: undefined; err: SendAndConfirmError };

export async function sendAndConfirmRawTransactionEx(
  connection: Connection,
  rawTransaction: Buffer,
  options?: ConfirmOptions,
): Promise<
  | { ok: TransactionSignature; err?: undefined }
  | { ok?: undefined; err: SendAndConfirmError }
> {
  let txid: string | undefined;
  try {
    const sendOptions = options && {
      skipPreflight: options.skipPreflight,
      preflightCommitment: options.preflightCommitment || options.commitment,
    };
    txid = await connection.sendRawTransaction(rawTransaction, sendOptions);
    const status = (
      await connection.confirmTransaction(txid, options && options.commitment)
    ).value;
    if (status.err) {
      return { err: { type: 'tx-error', inner: status.err, txid } };
    }
    return { ok: txid };
  } catch (e: any) {
    let type: 'misc-error' | 'timeout' = 'misc-error';
    if (e.message.includes('Transaction was not confirmed in')) {
      type = 'timeout';
    }
    return { err: { type, inner: e, txid } };
  }
}

export async function sendSignedTransaction({
  signedTransaction,
  connection,
}: {
  signedTransaction: Transaction;
  connection: Connection;
}): Promise<SendSignedTransactionResult> {
  const rawTransaction = signedTransaction.serialize();
  let slot = 0;

  const result = await sendAndConfirmRawTransactionEx(
    connection,
    rawTransaction,
    {
      skipPreflight: true,
      commitment: 'confirmed',
    },
  );

  if (result.err) return { err: result.err };

  const { ok: txid } = result;
  const confirmation = await connection.getConfirmedTransaction(
    txid,
    'confirmed',
  );

  if (confirmation) {
    slot = confirmation.slot;
  }

  return { txid, slot };
}
