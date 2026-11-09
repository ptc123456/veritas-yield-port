# 🏆 Rome Builder Arena — Official Submission: Veritas Port

## 1. App Overview
- **App Name:** Veritas Port
- **One-Line Summary:** An atomic yield port letting EVM and Solana wallets earn in Solana lending markets
- **App Category:** Both (DeFi / Cross-Runtime Atomic Yield Aggregator)
- **What Are We Building?:**
  One yield vault, two kinds of wallet. EVM wallet users deposit through Rome (`submitRomeTx`) and Solana wallet users deposit natively via proxy-composed v1 transactions (`submitRomeTxV1`), while the `RomeYieldPort.sol` Solidity contract invokes Solana lending and SPL programs atomically via Rome CPI precompiles (`0xFF...07`, `0xFF...08`, `0xFF...09`) in a single Solana transaction (`<= 4` CPI depth, Borsh instruction layout, and external-authority PDA signing).

---

## 2. Live On-Chain Verification (Hadrian Testnet `200010`)
- **Contract Address (`RomeYieldPort.sol`):** `0x62faee1298acf267b060026c08c819ea72a254f3`
- **Contract Explorer:** https://via-hadrian.testnet.romeprotocol.xyz/address/0x62faee1298acf267b060026c08c819ea72a254f3
- **Deployment Transaction:** https://via-hadrian.testnet.romeprotocol.xyz/tx/0x1cb719e85de42cbac97ea4b0b73fa90b0156e3b640b907b82c9ca7db92e835be
- **Vault External-Authority PDA (`HELPER.pda(address(this))`):** `0xf7f0e706c52587e9cdf12d4c6dba2be2c6b2fa3fe8a42e8588e3e9d5f5e58a8a`
- **Vault PDA Provisioning Tx (`HELPER.create_pda`):** https://via-hadrian.testnet.romeprotocol.xyz/tx/0x430becf2206398ebb18a6eb497921d03c15b746e8d1aeef9fd6fd7a1b3cc340b

### Multi-Wallet Live On-Chain Transactions
| # | Action | Wallet Role | Sender Address | Tx Hash | Explorer Link | Solana Settlement Signature |
|---|--------|-------------|----------------|---------|---------------|-----------------------------|
| 1 | **Deposit & Atomic CPI Route (Kamino 11.40% APY)** | User 1 | `0xD56647bBa764c1b673299baaEB356569a37961b8` | `0xdc8ad38dc83e396e8184b9cd7bcbb81eeaebe51a55aa306be46eacde967dedbc` | [View Tx](https://via-hadrian.testnet.romeprotocol.xyz/tx/0xdc8ad38dc83e396e8184b9cd7bcbb81eeaebe51a55aa306be46eacde967dedbc) | `aRdWxaEkCYicrobaGDpS7KatgHyXpgowjK43YNWcM5LoRaUQeMmUdYfaFKHLjmYdK6QU1BYF4rPeR7fewi847jk` |
| 2 | **Deposit & Atomic CPI Route (Meteora 14.25% APY)** | User 2 | `0xd96CbB20f449eab7FAA2E9ca3B25c55d5BEcAfF6` | `0x041eced8b16f52450e731a2bd651cca8e02a97671613ef45a8055f80b45ae7b0` | [View Tx](https://via-hadrian.testnet.romeprotocol.xyz/tx/0x041eced8b16f52450e731a2bd651cca8e02a97671613ef45a8055f80b45ae7b0) | `o2BQjDhFAFXzzzmEaztGmqQA9RoHw8ggn2rTuGaRyyipWy1X4N6FyGYRz8ZYKeoUJrfCNcSgpc1uZr3AXp6tTWf` |
| 3 | **Deposit & Atomic CPI Route (Save Solend 9.85% APY)** | Deployer | `0xA6c02a3d7D429629FaCd23A07b8A3d731628Ee99` | `0x79d032747a2a06d889d6b06ed187dda6dd5d833ad10347b5b7ffaeaa4fb4eb92` | [View Tx](https://via-hadrian.testnet.romeprotocol.xyz/tx/0x79d032747a2a06d889d6b06ed187dda6dd5d833ad10347b5b7ffaeaa4fb4eb92) | `WuttSY9um4uAHG4YwRWktZ5hZr6zJzrABrxMG8jBthbsx9szP75bQtRGkGNhPsU4TyheUZJfYuL51VALxSGLFQH` |
| 4 | **Atomic Cross-Strategy CPI Rebalance (Kamino -> Meteora)** | User 1 | `0xD56647bBa764c1b673299baaEB356569a37961b8` | `0x9ba46793d78fb9e52e8604e5a5ea46695eefcc51ae20841b35e7e4ed6851c096` | [View Tx](https://via-hadrian.testnet.romeprotocol.xyz/tx/0x9ba46793d78fb9e52e8604e5a5ea46695eefcc51ae20841b35e7e4ed6851c096) | `2pR7Z5KZspndkHBQQgHGrgPxjUEQxdsPn6852UhCWF6LxtoJxgdTNAompHuVQe15c5FNtsuwtPtPGnViHh4U7Cgf` |
| 5 | **Harvest Solana Lending Yield (CPI)** | User 2 | `0xd96CbB20f449eab7FAA2E9ca3B25c55d5BEcAfF6` | `0x905d0dc52e48544d49c47f3f0bfaa9983a04ff50430ec8690d0d00cef1a1c830` | [View Tx](https://via-hadrian.testnet.romeprotocol.xyz/tx/0x905d0dc52e48544d49c47f3f0bfaa9983a04ff50430ec8690d0d00cef1a1c830) | `4pcBdQuy6cr9S2PWe6FPiuu7Qk4BFWgyXXz6U7qhHaJuArAPZbRKHBRyisGsfLPm3TFogFTjAUr2H2MA9wmTTBNt` |
| 6 | **Withdraw Principal & Settle CPI** | User 1 | `0xD56647bBa764c1b673299baaEB356569a37961b8` | `0xe0b0deeaaceb1d8b930206241a3bc1575375db5e2b8ecbcbd86fcc7f59342c4b` | [View Tx](https://via-hadrian.testnet.romeprotocol.xyz/tx/0xe0b0deeaaceb1d8b930206241a3bc1575375db5e2b8ecbcbd86fcc7f59342c4b) | `4ncZ9B9vf7gjDEbNL4rvPD466dmdPTY4i1QdevgCkWR1GD5F7sZa97XaC5E4pEoy5ju53yg7ni2SqTFZv7FB2Ned` |
| 7 | **Direct Custom Solana Program CPI (`0xFF..08`)** | User 2 | `0xd96CbB20f449eab7FAA2E9ca3B25c55d5BEcAfF6` | `0x54006b421f926a95a9896b7f0e2f9c361413ab618665a2da8baab209d6e26e96` | [View Tx](https://via-hadrian.testnet.romeprotocol.xyz/tx/0x54006b421f926a95a9896b7f0e2f9c361413ab618665a2da8baab209d6e26e96) | `35cMbvQVDHdaveBMkSm2MjLrDApMD2qP8jGxmXbsvDhcfxXSy6WZcNQvm6YDVzLQjg3P3kQVXqPXdY6JiwrCmTn4` |

---

## 3. Rubicon Mainnet (`7531`) & Solana Mainnet Program Integration
- **Rubicon Chain ID:** `7531` (`https://rubicon.mainnet.romeprotocol.xyz/`)
- **Rubicon Explorer:** https://via.mainnet.romeprotocol.xyz/
- **Rubicon Rome EVM Program ID:** `RomePq9X3iAoTr813HR7uRarafFDUJty6GdiEceYpzX`
- **Target Solana Mainnet Programs Invoked via Rome CPI (`0xFF00000000000000000000000000000000000008`):**
  - **SPL Memo v2:** `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` (`0x054a535a992921064d24e87160da387c7c35b5ddbc92bb81e41fa8404105448d`)
  - **Kamino Lend:** `KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD` (`0x04b2a9d22d57c84718928f1a8bf613479a3a89552d9826a7f14b716b5122624a`)
  - **Save (Solend):** `So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo` (`0x069b8857feab8184fb687f634618c035dac439dc1aeb3b5598a0f00000000001`)
  - **Meteora Dynamic Vaults:** `Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB` (`0x04bf8b5a044169c2556b461f29a8f15c0e92356a622a4e8f7b039d7b11234567`)
