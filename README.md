# Veritas Port — Atomic Solana Yield Port for EVM & Solana Wallets

> **Rome Builder Arena Flagship Submission (`01-solana-yield-port`)**  
> *One yield vault, two kinds of wallet. Deposit from MetaMask (`submitRomeTx`) or Solflare/Phantom (`submitRomeTxV1`) and earn in Solana lending markets (`Kamino Lend`, `Save/Solend`, `Meteora Vaults`) via atomic Rome CPI precompiles (`0xFF...07`, `0xFF...08`, `0xFF...09`) in a single Solana transaction.*

---

## 🔗 Live Links & On-Chain Verification (Hadrian Testnet `200010`)

- **Live Website (Vercel Production):** [https://01-solana-yield-port.vercel.app](https://01-solana-yield-port.vercel.app)
- **Public GitHub Repository:** [https://github.com/ptc123456/veritas-yield-port](https://github.com/ptc123456/veritas-yield-port)
- **Smart Contract (`RomeYieldPort.sol`):** [`0x62faee1298acf267b060026c08c819ea72a254f3`](https://via-hadrian.testnet.romeprotocol.xyz/address/0x62faee1298acf267b060026c08c819ea72a254f3)
- **Deployment Transaction:** [`0x1cb719e85de42cbac97ea4b0b73fa90b0156e3b640b907b82c9ca7db92e835be`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0x1cb719e85de42cbac97ea4b0b73fa90b0156e3b640b907b82c9ca7db92e835be)
- **Vault External-Authority PDA (`HELPER.pda`):** `0xf7f0e706c52587e9cdf12d4c6dba2be2c6b2fa3fe8a42e8588e3e9d5f5e58a8a`
- **PDA Provisioning Tx (`HELPER.create_pda`):** [`0x430becf2206398ebb18a6eb497921d03c15b746e8d1aeef9fd6fd7a1b3cc340b`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0x430becf2206398ebb18a6eb497921d03c15b746e8d1aeef9fd6fd7a1b3cc340b)

### Verified Multi-Wallet On-Chain Transactions
1. **User 1 Deposit & Atomic CPI Route (Kamino Lend 11.40% APY):**  
   [`0xdc8ad38dc83e396e8184b9cd7bcbb81eeaebe51a55aa306be46eacde967dedbc`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0xdc8ad38dc83e396e8184b9cd7bcbb81eeaebe51a55aa306be46eacde967dedbc)  
   *Solana Settlement Sig:* `aRdWxaEkCYicrobaGDpS7KatgHyXpgowjK43YNWcM5LoRaUQeMmUdYfaFKHLjmYdK6QU1BYF4rPeR7fewi847jk`
2. **User 2 Deposit & Atomic CPI Route (Meteora Dynamic Port 14.25% APY):**  
   [`0x041eced8b16f52450e731a2bd651cca8e02a97671613ef45a8055f80b45ae7b0`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0x041eced8b16f52450e731a2bd651cca8e02a97671613ef45a8055f80b45ae7b0)  
   *Solana Settlement Sig:* `o2BQjDhFAFXzzzmEaztGmqQA9RoHw8ggn2rTuGaRyyipWy1X4N6FyGYRz8ZYKeoUJrfCNcSgpc1uZr3AXp6tTWf`
3. **Deployer Deposit & Atomic CPI Route (Save Solend 9.85% APY):**  
   [`0x79d032747a2a06d889d6b06ed187dda6dd5d833ad10347b5b7ffaeaa4fb4eb92`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0x79d032747a2a06d889d6b06ed187dda6dd5d833ad10347b5b7ffaeaa4fb4eb92)  
   *Solana Settlement Sig:* `WuttSY9um4uAHG4YwRWktZ5hZr6zJzrABrxMG8jBthbsx9szP75bQtRGkGNhPsU4TyheUZJfYuL51VALxSGLFQH`
4. **User 1 Atomic Cross-Strategy CPI Rebalance (Kamino -> Meteora, Depth 2):**  
   [`0x9ba46793d78fb9e52e8604e5a5ea46695eefcc51ae20841b35e7e4ed6851c096`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0x9ba46793d78fb9e52e8604e5a5ea46695eefcc51ae20841b35e7e4ed6851c096)  
   *Solana Settlement Sig:* `2pR7Z5KZspndkHBQQgHGrgPxjUEQxdsPn6852UhCWF6LxtoJxgdTNAompHuVQe15c5FNtsuwtPtPGnViHh4U7Cgf`
5. **User 2 Harvest Solana Lending Yield (CPI):**  
   [`0x905d0dc52e48544d49c47f3f0bfaa9983a04ff50430ec8690d0d00cef1a1c830`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0x905d0dc52e48544d49c47f3f0bfaa9983a04ff50430ec8690d0d00cef1a1c830)  
   *Solana Settlement Sig:* `4pcBdQuy6cr9S2PWe6FPiuu7Qk4BFWgyXXz6U7qhHaJuArAPZbRKHBRyisGsfLPm3TFogFTjAUr2H2MA9wmTTBNt`
6. **User 1 Withdraw Principal & Settle CPI:**  
   [`0xe0b0deeaaceb1d8b930206241a3bc1575375db5e2b8ecbcbd86fcc7f59342c4b`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0xe0b0deeaaceb1d8b930206241a3bc1575375db5e2b8ecbcbd86fcc7f59342c4b)  
   *Solana Settlement Sig:* `4ncZ9B9vf7gjDEbNL4rvPD466dmdPTY4i1QdevgCkWR1GD5F7sZa97XaC5E4pEoy5ju53yg7ni2SqTFZv7FB2Ned`
7. **User 2 Direct Custom Solana Program CPI (`0xFF..08` to SPL Memo v2):**  
   [`0x54006b421f926a95a9896b7f0e2f9c361413ab618665a2da8baab209d6e26e96`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0x54006b421f926a95a9896b7f0e2f9c361413ab618665a2da8baab209d6e26e96)  
   *Solana Settlement Sig:* `35cMbvQVDHdaveBMkSm2MjLrDApMD2qP8jGxmXbsvDhcfxXSy6WZcNQvm6YDVzLQjg3P3kQVXqPXdY6JiwrCmTn4`

---

## 🏗️ Architecture & Rome Precompiles

- **`ISystemProgram` (`0xfF00000000000000000000000000000000000007`):** Resolves `SYSTEM.operator()`, PDA derivation, and Base58 helpers.
- **`ICrossProgramInvocation` (`0xFF00000000000000000000000000000000000008`):** Executes atomic cross-program invocations (`CPI.invoke` / `CPI.invoke_signed`) into Solana programs (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`, `KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD`, `So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo`, `Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB`).
- **`IHelperProgram` (`0xff00000000000000000000000000000000000009`):** Provisions and derives external-authority PDAs (`HELPER.create_pda(address(this))`, `HELPER.pda(address(this))`).

## 🚀 Quickstart

```bash
npm install
npm run test:contracts   # Run 7 end-to-end Solidity & Atomic CPI unit tests
npm run typecheck        # TypeScript check
npm run build            # Next.js production build
npm run dev              # Launch local web app
```
