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
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSignedTransaction = exports.sendAndConfirmRawTransactionEx = void 0;
function sendAndConfirmRawTransactionEx(connection, rawTransaction, options) {
    return __awaiter(this, void 0, void 0, function* () {
        let txid;
        try {
            const sendOptions = options && {
                skipPreflight: options.skipPreflight,
                preflightCommitment: options.preflightCommitment || options.commitment,
            };
            txid = yield connection.sendRawTransaction(rawTransaction, sendOptions);
            const status = (yield connection.confirmTransaction(txid, options && options.commitment)).value;
            if (status.err) {
                return { err: { type: 'tx-error', inner: status.err, txid } };
            }
            return { ok: txid };
        }
        catch (e) {
            let type = 'misc-error';
            if (e.message.includes('Transaction was not confirmed in')) {
                type = 'timeout';
            }
            return { err: { type, inner: e, txid } };
        }
    });
}
exports.sendAndConfirmRawTransactionEx = sendAndConfirmRawTransactionEx;
function sendSignedTransaction({ signedTransaction, connection, }) {
    return __awaiter(this, void 0, void 0, function* () {
        const rawTransaction = signedTransaction.serialize();
        let slot = 0;
        const result = yield sendAndConfirmRawTransactionEx(connection, rawTransaction, {
            skipPreflight: true,
            commitment: 'confirmed',
        });
        if (result.err)
            return { err: result.err };
        const { ok: txid } = result;
        const confirmation = yield connection.getConfirmedTransaction(txid, 'confirmed');
        if (confirmation) {
            slot = confirmation.slot;
        }
        return { txid, slot };
    });
}
exports.sendSignedTransaction = sendSignedTransaction;
