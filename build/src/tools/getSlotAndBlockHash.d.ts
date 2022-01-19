import { Commitment, Connection } from '@solana/web3.js';
export declare const getSlotAndCurrentBlockHash: (connection: Connection, commitment: Commitment) => Promise<[number, {
    blockhash: string;
    feeCalculator: import("@solana/web3.js").FeeCalculator;
}]>;
