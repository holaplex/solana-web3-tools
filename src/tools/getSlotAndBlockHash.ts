import { Commitment, Connection } from '@solana/web3.js';

export const getSlotAndCurrentBlockHash = (
  connection: Connection,
  commitment: Commitment,
) =>
  Promise.all([
    connection.getSlot(commitment),
    connection.getLatestBlockhash(commitment),
  ]);
