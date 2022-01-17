import { Signer, TransactionInstruction } from '@solana/web3.js';

export interface InstructionSet {
  signers: Signer[];
  instructions: TransactionInstruction[];
}
