# Solana Web3 Tools

- Insert nice art here.

## Installation

```bash
$ yarn add @holaplex/solana-web3-tools
```

## Usage

```ts
import { SmartInstructionSender } from '@holaplex/solana-web3-tools';

const someMethod = async (
    instructions: TransactionInstruction[][],
    signers: Signer[][]
) => {
    const sender = SmartInstructionSender
        .build(wallet, connection)
        .config({
            maxSigningAttempts: 3,
            abortOnFailure: true,
            commitment: 'confirmed',
        })
        .withInstructionSets(instructions.map((ixs, i) => ({
            instructions: ixs,
            signers: signers[i]
        })))
        .onProgress((i) => {
            console.log(`Just sent: ${i}`);
        })
        .onFailure((err) => {
            console.error(`Error: ${err}`);
        })
        .onReSign((attempt, i) => {
            console.warn(`ReSigning: ${i} attempt: ${attempt}`);
        });
    await sender.send();
}
```