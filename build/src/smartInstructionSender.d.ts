import { Commitment, Connection, Transaction, PublicKey } from '@solana/web3.js';
import { InstructionSet } from './types';
export declare type WalletSigner = {
    publicKey: PublicKey | null;
    signAllTransactions: (transaction: Transaction[]) => Promise<Transaction[]>;
};
/**
 * Callback for when a transaction is sent to the network correctly.
 */
export declare type ProgressCb = (
/**
 * Index of the current InstructionSet.
 */
currentIndex: number, 
/**
 * Transaction Id (If successful).
 */
txId: string) => void;
/**
 * Callback for when a transaction needs to be re-signed.
 */
export declare type ReSignCb = (
/**
 * Attempt number
 * for the current transaction.
 */
attempt: number, 
/**
 * Index of the current InstructionSet.
 */
currentIndex: number) => void;
/**
 * Callback for when a transaction fails to be sent
 * after a number of attempts.
 */
export declare type FailureCb = (
/**
 * The error that happened on the current transaction.
 */
error: Error | any, 
/**
 * Amount of successful instruction sets sent as transactions
 * before the failure.
 */
successfulItems: number, 
/**
 * The index of the failed instruction set.
 */
currentIndex: number, 
/**
 * The current instruction set that failed.
 */
instructionSet: InstructionSet) => void;
/**
 * This type defines the configuration for the smart instruction sender.
 */
export interface SmartInstructionSenderConfiguration {
    /**
     * The number of times to retry a transaction if it fails.
     * Defaults to 3.
     * @default 3
     */
    maxSigningAttempts: number;
    /**
     * Defines if the one-by-one transaction sending should be
     * aborted in case of a failure.
     * Defaults to true.
     * @default true
     */
    abortOnFailure: boolean;
    /**
     * Transaction confirmation commitment.
     * @default 'singleGossip'
     */
    commitment: Commitment;
}
/**
 * The smart instruction sender is a tool that sends a list of instruction sets
 * to the network, asking for a re-signature every time a transaction fails due
 * to slot exhaustion (Aka current slot + 150), tries to send all the transactions
 * in the current block but If needed It will retry with a new signature. Also it
 * detects if the next transactions are going to fail by checking the slot number
 * after every successful transaction.
 */
export declare class SmartInstructionSender {
    private connection;
    private wallet;
    private instructionSets?;
    private configuration;
    private onProgressCallback?;
    private onReSignCallback?;
    private onFailureCallback?;
    private constructor();
    /**
     * Creates a new {SmartInstructionSender} instance
     * @param wallet The wallet to use for signing.
     * @param connection The connection to use for sending transactions.
     */
    static build(wallet: WalletSigner, connection: Connection): SmartInstructionSender;
    /**
     * Sets the configuration the current SmartInstructionSender instance.
     */
    config: (config: SmartInstructionSenderConfiguration) => this;
    /**
     * Sets up instruction sets to be turned into transactions and signed.
     * Raw material to build transactions.
     */
    withInstructionSets: (instructionSets: InstructionSet[]) => this;
    /**
     * Sets a callback to handle progress.
     */
    onProgress: (progressCallback: ProgressCb) => this;
    /**
     * Sets a callback to handle additional signature requests.
     */
    onReSign: (reSignCallback: ReSignCb) => this;
    /**
     * Sets a callback to handle failures.
     */
    onFailure: (onFailureCallback: FailureCb) => this;
    /**
     * This function will rebuild and sign transactions starting from the one
     * at the given index, and will continue until the last transaction in the
     * instruction set.
     *
     * @param signedTXs - Transactions array to be modified in place. Mutates.
     * @param index - Index from which transaction to start.
     * @param blockhash - The blockhash to use for the new transactions.
     * @param attempt - Current signing attempt/
     * @returns First created transaction, for convenience.
     */
    private signAndRebuildTransactionsFromInstructionSets;
    /**
     * Sends the given instruction sets as Transactions, signed once by the wallet.
     * If the slots for the next transaction exceeds the previous transaction slot + 150,
     * the next transactions are rebuilt using a new blockhash, hence requiring a new signature
     * from the user. This is very helpful to solve scenarios when TPS are low and some transactions
     * take a long time to process due to network congestion.
     *
     * @returns a Promise that resolves to the first Transaction that was sent. You can get more
     * information using the onProgress, onFailure and onReSign callbacks.
     * @public @async
     * @throws Not really, errors are handled internally and passed to the onFailure callback.
     */
    send: () => Promise<void>;
}
