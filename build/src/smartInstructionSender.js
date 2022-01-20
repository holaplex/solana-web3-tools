"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmartInstructionSender = void 0;
const web3_js_1 = require("@solana/web3.js");
const async_retry_1 = __importDefault(require("async-retry"));
const connectionTools_1 = require("./tools/connectionTools");
const tools_1 = require("./tools");
/**
 * The smart instruction sender is a tool that sends a list of instruction sets
 * to the network, asking for a re-signature every time a transaction fails due
 * to slot exhaustion (Aka current slot + 150), tries to send all the transactions
 * in the current block but If needed It will retry with a new signature. Also it
 * detects if the next transactions are going to fail by checking the slot number
 * after every successful transaction.
 */
class SmartInstructionSender {
    constructor(wallet, connection) {
        this.configuration = {
            maxSigningAttempts: 3,
            abortOnFailure: true,
            commitment: 'singleGossip',
        };
        /**
         * Sets the configuration the current SmartInstructionSender instance.
         */
        this.config = (config) => {
            this.configuration = config;
            return this;
        };
        /**
         * Sets up instruction sets to be turned into transactions and signed.
         * Raw material to build transactions.
         */
        this.withInstructionSets = (instructionSets) => {
            this.instructionSets = instructionSets;
            return this;
        };
        /**
         * Sets a callback to handle progress.
         */
        this.onProgress = (progressCallback) => {
            this.onProgressCallback = progressCallback;
            return this;
        };
        /**
         * Sets a callback to handle additional signature requests.
         */
        this.onReSign = (reSignCallback) => {
            this.onReSignCallback = reSignCallback;
            return this;
        };
        /**
         * Sets a callback to handle failures.
         */
        this.onFailure = (onFailureCallback) => {
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
        this.signAndRebuildTransactionsFromInstructionSets = (signedTXs, index, blockhash, attempt = 0) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            (_a = this.onReSignCallback) === null || _a === void 0 ? void 0 : _a.call(this, attempt, index);
            for (let j = index; j < this.instructionSets.length; j++) {
                const instructionSet = this.instructionSets[j];
                signedTXs[j] = new web3_js_1.Transaction({
                    feePayer: this.wallet.publicKey,
                    recentBlockhash: blockhash.blockhash,
                }).add(...instructionSet.instructions);
                if (instructionSet.signers.length)
                    signedTXs[j].partialSign(...instructionSet.signers);
            }
            yield this.wallet.signAllTransactions(signedTXs.slice(index, signedTXs.length));
            return signedTXs.slice(index, signedTXs.length)[0]; // Return current tx for convenience
        });
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
        this.send = () => __awaiter(this, void 0, void 0, function* () {
            var _b, _c, _d;
            if (!((_b = this.wallet) === null || _b === void 0 ? void 0 : _b.publicKey))
                throw new Error('WALLET_NOT_CONNECTED');
            if (!((_c = this.instructionSets) === null || _c === void 0 ? void 0 : _c.length))
                throw new Error('No instruction sets provided');
            let [slot, currentBlock] = yield (0, tools_1.getSlotAndCurrentBlockHash)(this.connection, this.configuration.commitment);
            const unsignedTXs = this.instructionSets
                .filter((i) => i.instructions.length)
                .map(({ instructions, signers }) => {
                const tx = new web3_js_1.Transaction({
                    feePayer: this.wallet.publicKey,
                    recentBlockhash: currentBlock.blockhash,
                }).add(...instructions);
                if (signers.length)
                    tx.partialSign(...signers);
                return tx;
            });
            const signedTXs = yield this.wallet.signAllTransactions(unsignedTXs);
            let successfulItems = 0;
            for (let i = 0; i < signedTXs.length; i++) {
                let tx = signedTXs[i];
                let retryNumber = 0;
                try {
                    yield (0, async_retry_1.default)((bail) => __awaiter(this, void 0, void 0, function* () {
                        var _e;
                        retryNumber++;
                        let result = null;
                        try {
                            result = yield (0, connectionTools_1.sendSignedTransaction)({
                                connection: this.connection,
                                signedTransaction: tx,
                            });
                        }
                        catch (error) {
                            result = {
                                err: error,
                            };
                        }
                        if (result.err) {
                            if (result.err.type === 'timeout' &&
                                retryNumber >= this.configuration.maxSigningAttempts) {
                                bail(new Error('MAX_RESIGN_ATTEMPTS_REACHED'));
                                return;
                            }
                            else if (result.err.type === 'timeout') {
                                // ⭐️ Throwing is good because it will be catched by the onRetry block
                                // and will be retried.
                                throw result.err;
                            }
                            else if (result.err.type === 'misc-error') {
                                bail(result.err);
                                return;
                            }
                            else {
                                bail(result.err);
                                return;
                            }
                        }
                        (_e = this.onProgressCallback) === null || _e === void 0 ? void 0 : _e.call(this, i, result.txid);
                        successfulItems++;
                        if (result.slot >= slot + 150) {
                            const nextTXs = signedTXs.slice(i + 1);
                            if (nextTXs.length) {
                                const [newSlot, newCurrentBlock] = yield (0, tools_1.getSlotAndCurrentBlockHash)(this.connection, this.configuration.commitment);
                                slot = newSlot;
                                currentBlock = newCurrentBlock;
                                yield this.signAndRebuildTransactionsFromInstructionSets(signedTXs, i + 1, newCurrentBlock);
                            }
                        }
                    }), {
                        retries: this.configuration.maxSigningAttempts,
                        onRetry: (error, attempt) => __awaiter(this, void 0, void 0, function* () {
                            if ((error === null || error === void 0 ? void 0 : error.type) === 'timeout') {
                                const slotResult = yield this.connection.getSlot(this.configuration.commitment);
                                if (slotResult >= slot + 150) {
                                    const [newSlot, newCurrentBlock] = yield (0, tools_1.getSlotAndCurrentBlockHash)(this.connection, this.configuration.commitment);
                                    slot = newSlot;
                                    currentBlock = newCurrentBlock;
                                    tx = yield this.signAndRebuildTransactionsFromInstructionSets(signedTXs, i, newCurrentBlock, attempt);
                                }
                            }
                        }),
                    });
                }
                catch (error) {
                    (_d = this.onFailureCallback) === null || _d === void 0 ? void 0 : _d.call(this, error, i, successfulItems, this.instructionSets[successfulItems - 1]);
                    if (this.configuration.abortOnFailure) {
                        break;
                    }
                }
            }
        });
        this.wallet = wallet;
        this.connection = connection;
    }
    /**
     * Creates a new {SmartInstructionSender} instance
     * @param wallet The wallet to use for signing.
     * @param connection The connection to use for sending transactions.
     */
    static build(wallet, connection) {
        return new SmartInstructionSender(wallet, connection);
    }
}
exports.SmartInstructionSender = SmartInstructionSender;
