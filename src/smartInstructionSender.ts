import {
  Commitment,
  Connection,
  Transaction,
  FeeCalculator,
  PublicKey,
} from '@solana/web3.js';
import retry from 'async-retry';
import {
  sendSignedTransaction,
  SendSignedTransactionResult,
} from './tools/connectionTools';
import { getSlotAndCurrentBlockHash } from './tools';
import { InstructionSet } from './types';

export type WalletSigner = {
  publicKey: PublicKey | null;
  signAllTransactions: (transaction: Transaction[]) => Promise<Transaction[]>;
};

/**
 * Callback for when a transaction is sent to the network correctly.
 */
export type ProgressCb = (
  /**
   * Index of the current InstructionSet.
   */
  currentIndex: number,
  /**
   * Transaction Id (If successful).
   */
  txId: string,
) => void;

/**
 * Callback for when a transaction needs to be re-signed.
 */
export type ReSignCb = (
  /**
   * Attempt number
   * for the current transaction.
   */
  attempt: number,
  /**
   * Index of the current InstructionSet.
   */
  currentIndex: number,
) => void;

/**
 * Callback for when a transaction fails to be sent
 * after a number of attempts.
 */
export type FailureCb = (
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
  instructionSet: InstructionSet,
) => void;

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
export class SmartInstructionSender {
  private connection: Connection;
  private wallet: WalletSigner;
  private instructionSets?: InstructionSet[];
  private configuration: SmartInstructionSenderConfiguration = {
    maxSigningAttempts: 3,
    abortOnFailure: true,
    commitment: 'singleGossip',
  };

  private onProgressCallback?: ProgressCb;
  private onReSignCallback?: ReSignCb;
  private onFailureCallback?: FailureCb;

  private constructor(wallet: WalletSigner, connection: Connection) {
    this.wallet = wallet;
    this.connection = connection;
  }

  /**
   * Creates a new {SmartInstructionSender} instance
   * @param wallet The wallet to use for signing.
   * @param connection The connection to use for sending transactions.
   */
  public static build(wallet: WalletSigner, connection: Connection) {
    return new SmartInstructionSender(wallet, connection);
  }

  /**
   * Sets the configuration the current SmartInstructionSender instance.
   */
  public config = (config: SmartInstructionSenderConfiguration) => {
    this.configuration = config;
    return this;
  };

  /**
   * Sets up instruction sets to be turned into transactions and signed.
   * Raw material to build transactions.
   */
  public withInstructionSets = (instructionSets: InstructionSet[]) => {
    this.instructionSets = instructionSets;
    return this;
  };

  /**
   * Sets a callback to handle progress.
   */
  public onProgress = (progressCallback: ProgressCb) => {
    this.onProgressCallback = progressCallback;
    return this;
  };

  /**
   * Sets a callback to handle additional signature requests.
   */
  public onReSign = (reSignCallback: ReSignCb) => {
    this.onReSignCallback = reSignCallback;
    return this;
  };

  /**
   * Sets a callback to handle failures.
   */
  public onFailure = (onFailureCallback: FailureCb) => {
    this.onFailureCallback = onFailureCallback;
    return this;
  };

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
  private signAndRebuildTransactionsFromInstructionSets = async (
    signedTXs: Transaction[],
    index: number,
    blockhash: {
      blockhash: string;
    },
    attempt: number = 0,
  ) => {
    this.onReSignCallback?.(attempt, index);
    for (let j = index; j < this.instructionSets!.length; j++) {
      const instructionSet = this.instructionSets![j];
      signedTXs[j] = new Transaction({
        feePayer: this.wallet!.publicKey,
        recentBlockhash: blockhash.blockhash,
      }).add(...instructionSet.instructions);
      if (instructionSet.signers.length)
        signedTXs[j].partialSign(...instructionSet.signers);
    }
    await this.wallet!.signAllTransactions(
      signedTXs.slice(index, signedTXs.length),
    );
    return signedTXs.slice(index, signedTXs.length)[0]; // Return current tx for convenience
  };

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
  public send = async () => {
    if (!this.wallet?.publicKey) throw new Error('WALLET_NOT_CONNECTED');
    if (!this.instructionSets?.length) throw new Error('NO_INSTRUCTION_SETS');

    let [slot, currentBlock] = await getSlotAndCurrentBlockHash(
      this.connection,
      this.configuration.commitment,
    );

    const unsignedTXs = this.instructionSets
      .filter((i) => i.instructions.length)
      .map(({ instructions, signers }) => {
        const tx = new Transaction({
          feePayer: this.wallet!.publicKey,
          recentBlockhash: currentBlock.blockhash,
        }).add(...instructions);
        if (signers.length) tx.partialSign(...signers);
        return tx;
      });

    const signedTXs = await this.wallet.signAllTransactions(unsignedTXs);

    let successfulItems = 0;
    for (let i = 0; i < signedTXs.length; i++) {
      let tx = signedTXs[i];
      let retryNumber = 0;
      try {
        await retry(
          async (bail: (reason: Error | any) => void) => {
            retryNumber++;

            let result: Awaited<SendSignedTransactionResult> | null = null;
            try {
              result = await sendSignedTransaction({
                connection: this.connection!,
                signedTransaction: tx,
              });
            } catch (error: any) {
              result = {
                err: error,
              };
            }

            if (result.err) {
              if (
                result.err.type === 'timeout' &&
                retryNumber >= this.configuration!.maxSigningAttempts
              ) {
                bail(new Error('MAX_RESIGN_ATTEMPTS_REACHED'));
                return;
              } else if (result.err.type === 'timeout') {
                // ⭐️ Throwing is good because it will be catched by the onRetry block
                // and will be retried.
                throw result.err;
              } else if (result.err.type === 'misc-error') {
                bail(result.err);
                return;
              } else {
                bail(result.err);
                return;
              }
            }

            this.onProgressCallback?.(i, result.txid);
            successfulItems++;

            if (result.slot >= slot + 150) {
              const nextTXs = signedTXs.slice(i + 1);
              if (nextTXs.length) {
                const [newSlot, newCurrentBlock] =
                  await getSlotAndCurrentBlockHash(
                    this.connection,
                    this.configuration.commitment,
                  );
                slot = newSlot;
                currentBlock = newCurrentBlock;
                await this.signAndRebuildTransactionsFromInstructionSets(
                  signedTXs,
                  i + 1,
                  newCurrentBlock,
                );
              }
            }
          },
          {
            retries: this.configuration.maxSigningAttempts,
            onRetry: async (error: any, attempt: number) => {
              if (error?.type === 'timeout') {
                const slotResult = await this.connection!.getSlot(
                  this.configuration.commitment,
                );
                if (slotResult >= slot + 150) {
                  const [newSlot, newCurrentBlock] =
                    await getSlotAndCurrentBlockHash(
                      this.connection,
                      this.configuration.commitment,
                    );
                  slot = newSlot;
                  currentBlock = newCurrentBlock;
                  tx = await this.signAndRebuildTransactionsFromInstructionSets(
                    signedTXs,
                    i,
                    newCurrentBlock,
                    attempt,
                  );
                }
              }
            },
          },
        );
      } catch (error) {
        this.onFailureCallback?.(
          error,
          i,
          successfulItems,
          this.instructionSets[successfulItems - 1],
        );
        if (this.configuration.abortOnFailure) {
          break;
        }
      }
    }
  };
}
