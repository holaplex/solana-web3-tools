/// <reference types="node" />
import { ConfirmOptions, Connection, Transaction, TransactionError, TransactionSignature } from '@solana/web3.js';
export declare type SendAndConfirmError = {
    type: 'tx-error';
    inner: TransactionError;
    txid: TransactionSignature;
} | {
    type: 'timeout';
    inner: unknown;
    txid?: TransactionSignature;
} | {
    type: 'misc-error';
    inner: unknown;
    txid?: TransactionSignature;
};
export declare type SendSignedTransactionResult = {
    txid: string;
    slot: number;
    err?: undefined;
} | {
    txid?: undefined;
    err: SendAndConfirmError;
};
export declare function sendAndConfirmRawTransactionEx(connection: Connection, rawTransaction: Buffer, options?: ConfirmOptions): Promise<{
    ok: TransactionSignature;
    err?: undefined;
} | {
    ok?: undefined;
    err: SendAndConfirmError;
}>;
export declare function sendSignedTransaction({ signedTransaction, connection, }: {
    signedTransaction: Transaction;
    connection: Connection;
}): Promise<SendSignedTransactionResult>;
