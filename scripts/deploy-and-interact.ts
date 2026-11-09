import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  parseEther,
  formatEther,
  toHex,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { getChain, getTokens, getPrograms } from "@rome-protocol/registry";
import { submitRomeTx } from "@rome-protocol/sdk";
import { compileContracts } from "./compile";

dotenv.config();

const HADRIAN_CHAIN_ID = 200010;
const RUBICON_CHAIN_ID = 7531;

/** Build an EIP-1193 provider from a viem account + Rome RPC URL so submitRomeTx works in Node scripts. */
function createEip1193Provider(account: PrivateKeyAccount, rpcUrl: string, chainId: number) {
  const pub = createPublicClient({ transport: http(rpcUrl, { timeout: 120_000 }) });
  const wallet = createWalletClient({ account, transport: http(rpcUrl, { timeout: 120_000 }) });

  return {
    async request({ method, params = [] }: { method: string; params?: any[] }): Promise<any> {
      if (method === "eth_chainId") return `0x${chainId.toString(16)}`;
      if (method === "eth_accounts" || method === "eth_requestAccounts") return [account.address];
      if (method === "eth_sendTransaction") {
        const tx = params[0] || {};
        const hash = await wallet.sendTransaction({
          account,
          to: tx.to,
          data: tx.data,
          value: tx.value ? BigInt(tx.value) : 0n,
          gas: tx.gas ? BigInt(tx.gas) : undefined,
          maxFeePerGas: tx.maxFeePerGas ? BigInt(tx.maxFeePerGas) : undefined,
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? BigInt(tx.maxPriorityFeePerGas) : undefined,
          chain: {
            id: chainId,
            name: `rome-${chainId}`,
            nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
            rpcUrls: { default: { http: [rpcUrl] } },
          },
        });
        return hash;
      }
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }).then((r) => r.json());
      if (res.error) {
        throw new Error(res.error.message || JSON.stringify(res.error));
      }
      return res.result;
    },
  };
}

async function getSolanaSettlementSignatures(rpcUrl: string, evmTxHash: string): Promise<string[]> {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "rome_solanaTxForEvmTx",
        params: [evmTxHash],
      }),
    }).then((r) => r.json());
    return Array.isArray(res?.result) ? res.result : [];
  } catch {
    return [];
  }
}

async function main() {
  console.log("🚀 Starting Veritas Port (RomeYieldPort) Deployment & On-Chain Interaction...");

  const compiled = compileContracts();
  const portArtifact = compiled["RomeYieldPort"];

  const hadrian = getChain(HADRIAN_CHAIN_ID) as any;
  const hadrianTokens = getTokens(HADRIAN_CHAIN_ID) as any;
  const devnetPrograms = getPrograms("devnet") as any;
  const mainnetPrograms = getPrograms("mainnet") as any;

  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
  const user1Key = process.env.USER1_PRIVATE_KEY as `0x${string}`;
  const user2Key = process.env.USER2_PRIVATE_KEY as `0x${string}`;

  if (!deployerKey || !user1Key || !user2Key) {
    throw new Error("Missing DEPLOYER_PRIVATE_KEY, USER1_PRIVATE_KEY, or USER2_PRIVATE_KEY in .env");
  }

  const deployer = privateKeyToAccount(deployerKey);
  const user1 = privateKeyToAccount(user1Key);
  const user2 = privateKeyToAccount(user2Key);

  const pub = createPublicClient({ transport: http(hadrian.rpcUrl, { timeout: 120_000 }) });
  const deployerWallet = createWalletClient({ account: deployer, transport: http(hadrian.rpcUrl, { timeout: 120_000 }) });

  const [bDeployer, bUser1, bUser2] = await Promise.all([
    pub.getBalance({ address: deployer.address }),
    pub.getBalance({ address: user1.address }),
    pub.getBalance({ address: user2.address }),
  ]);

  console.log(`📊 Hadrian Testnet (${HADRIAN_CHAIN_ID}) Wallet Balances:`);
  console.log(`   Deployer (${deployer.address}): ${formatEther(bDeployer)} USDC`);
  console.log(`   User 1   (${user1.address}): ${formatEther(bUser1)} USDC`);
  console.log(`   User 2   (${user2.address}): ${formatEther(bUser2)} USDC`);

  if (bDeployer < parseEther("25") && process.env.TREASURY_PRIVATE_KEY) {
    const treasury = privateKeyToAccount(
      process.env.TREASURY_PRIVATE_KEY as `0x${string}`
    );
    const treasuryProvider = createEip1193Provider(treasury, hadrian.rpcUrl, HADRIAN_CHAIN_ID);
    console.log("    Topping up Deployer with 20 USDC on Hadrian for contract creation rent...");
    const topupHash = await submitRomeTx(treasuryProvider, {
      from: treasury.address,
      to: deployer.address,
      data: "0x",
      value: parseEther("20"),
    });
    await pub.waitForTransactionReceipt({ hash: topupHash, timeout: 60_000 });
    console.log(`   ✅ Deployer topped up! Tx: ${topupHash}`);
  }

  // 1. Deploy RomeYieldPort on Hadrian Testnet (200010)
  console.log("\n📦 Deploying RomeYieldPort.sol to Hadrian Testnet (200010)...");
  const gasPrice = await pub.getGasPrice();
  const deployTxHash = await deployerWallet.deployContract({
    abi: portArtifact.abi,
    bytecode: portArtifact.bytecode,
    account: deployer,
    chain: null,
    gas: 95_000_000n,
    maxFeePerGas: (gasPrice * 11n) / 10n,
    maxPriorityFeePerGas: 0n,
  });

  console.log(`   Deploy Tx Hash: ${deployTxHash}`);
  const deployReceipt = await pub.waitForTransactionReceipt({ hash: deployTxHash, timeout: 120_000 });
  if (!deployReceipt.contractAddress) {
    throw new Error("Contract deployment failed — no contractAddress in receipt");
  }
  const contractAddress = deployReceipt.contractAddress;
  const deploySolanaSigs = await getSolanaSettlementSignatures(hadrian.rpcUrl, deployTxHash);

  console.log(`✅ RomeYieldPort deployed at: ${contractAddress}`);
  console.log(`   Explorer: ${hadrian.explorerUrl}address/${contractAddress}`);

  const deployerProvider = createEip1193Provider(deployer, hadrian.rpcUrl, HADRIAN_CHAIN_ID);
  const user1Provider = createEip1193Provider(user1, hadrian.rpcUrl, HADRIAN_CHAIN_ID);
  const user2Provider = createEip1193Provider(user2, hadrian.rpcUrl, HADRIAN_CHAIN_ID);

  // Activate Vault External-Authority PDA in a dedicated single atomic Solana transaction
  console.log("\n🔑 Provisioning Vault External-Authority PDA via HELPER.create_pda (0xFF..09)...");
  const activatePdaData = encodeFunctionData({
    abi: portArtifact.abi,
    functionName: "activateVaultPda",
    args: [],
  });
  const activatePdaHash = await submitRomeTx(deployerProvider, {
    from: deployer.address,
    to: contractAddress,
    data: activatePdaData,
    minGas: 5_000_000n,
  });
  await pub.waitForTransactionReceipt({ hash: activatePdaHash, timeout: 120_000 });
  console.log(`   ✅ Vault PDA Provisioned! Tx: ${activatePdaHash}`);

  // Query on-chain vaultAuthorityPda from Helper Precompile (0xFF..09)
  const vaultPda = (await pub.readContract({
    address: contractAddress,
    abi: portArtifact.abi,
    functionName: "vaultAuthorityPda",
  })) as `0x${string}`;
  console.log(`🔑 On-Chain Vault External-Authority PDA (HELPER.pda): ${vaultPda}`);

  const transactions: Array<{
    id: number;
    action: string;
    strategy: string;
    lane: string;
    walletRole: string;
    sender: string;
    amountUsdc: string;
    txHash: string;
    explorerUrl: string;
    solanaSignatures: string[];
    cpiProgramId: string;
    borshSummary: string;
    timestamp: string;
  }> = [];

  async function executeAndRecord(params: {
    id: number;
    action: string;
    strategy: string;
    lane: string;
    walletRole: string;
    account: PrivateKeyAccount;
    provider: ReturnType<typeof createEip1193Provider>;
    functionName: string;
    args: any[];
    value?: bigint;
    amountUsdc: string;
    cpiProgramId: string;
    borshSummary: string;
  }) {
    console.log(`\n⚡ [Tx #${params.id}] ${params.walletRole} (${params.account.address}) -> ${params.action}...`);
    const data = encodeFunctionData({
      abi: portArtifact.abi,
      functionName: params.functionName,
      args: params.args,
    });

    const txHash = await submitRomeTx(params.provider, {
      from: params.account.address,
      to: contractAddress,
      data,
      value: params.value,
      minGas: 5_000_000n,
    });

    const rcpt = await pub.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 });
    if (rcpt.status !== "success") {
      throw new Error(`Tx #${params.id} (${params.action}) reverted: ${txHash}`);
    }
    const solSigs = await getSolanaSettlementSignatures(hadrian.rpcUrl, txHash);
    console.log(`   ✅ Confirmed! Hash: ${txHash}`);
    if (solSigs.length > 0) {
      console.log(`   🔗 Solana Settlement Sig: ${solSigs[0]}`);
    }

    transactions.push({
      id: params.id,
      action: params.action,
      strategy: params.strategy,
      lane: params.lane,
      walletRole: params.walletRole,
      sender: params.account.address,
      amountUsdc: params.amountUsdc,
      txHash,
      explorerUrl: `${hadrian.explorerUrl}tx/${txHash}`,
      solanaSignatures: solSigs,
      cpiProgramId: params.cpiProgramId,
      borshSummary: params.borshSummary,
      timestamp: new Date().toISOString(),
    });
  }

  // Tx 1: User 1 deposits 0.25 USDC into Strategy 0 (Kamino Lend Prime USDC)
  await executeAndRecord({
    id: 1,
    action: "Deposit & Atomic CPI Route",
    strategy: "Kamino Lend Prime USDC (11.40% APY)",
    lane: "EVM Lane (submitRomeTx)",
    walletRole: "User 1",
    account: user1,
    provider: user1Provider,
    functionName: "depositNativeUSDC",
    args: [0, 0],
    value: parseEther("0.25"),
    amountUsdc: "0.25 USDC",
    cpiProgramId: "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD",
    borshSummary: "0xf223c68952e1f2b6 + u64LE(250000) + strat(0) + depth(1)",
  });

  // Tx 2: User 2 deposits 0.35 USDC into Strategy 2 (Meteora Dynamic Yield Port)
  await executeAndRecord({
    id: 2,
    action: "Deposit & Atomic CPI Route",
    strategy: "Meteora Dynamic Yield Port (14.25% APY)",
    lane: "EVM / Dual-Lane (submitRomeTx)",
    walletRole: "User 2",
    account: user2,
    provider: user2Provider,
    functionName: "depositNativeUSDC",
    args: [2, 1],
    value: parseEther("0.35"),
    amountUsdc: "0.35 USDC",
    cpiProgramId: "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",
    borshSummary: "0x3298987b46750506 + u64LE(350000) + strat(2) + depth(1)",
  });

  // Tx 3: Deployer deposits 0.20 USDC into Strategy 1 (Save Solend Main USDC)
  await executeAndRecord({
    id: 3,
    action: "Deposit & Atomic CPI Route",
    strategy: "Save Solend Main USDC (9.85% APY)",
    lane: "EVM Lane (submitRomeTx)",
    walletRole: "Deployer",
    account: deployer,
    provider: deployerProvider,
    functionName: "depositNativeUSDC",
    args: [1, 0],
    value: parseEther("0.20"),
    amountUsdc: "0.20 USDC",
    cpiProgramId: "So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo",
    borshSummary: "0x0e00000000000000 + u64LE(200000) + strat(1) + depth(1)",
  });

  // Tx 4: User 1 executes Atomic Cross-Strategy Rebalance CPI (Kamino -> Meteora, 0.10 USDC, CPI depth 2)
  await executeAndRecord({
    id: 4,
    action: "Atomic Cross-Strategy CPI Rebalance",
    strategy: "Kamino Lend -> Meteora Dynamic Vault",
    lane: "EVM Lane (submitRomeTx)",
    walletRole: "User 1",
    account: user1,
    provider: user1Provider,
    functionName: "atomicRouteCPI",
    args: [0, 2, parseEther("0.10"), 2],
    amountUsdc: "0.10 USDC",
    cpiProgramId: "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",
    borshSummary: "0x3298987b46750506 + u64LE(100000) + strat(2) + depth(2)",
  });

  // Tx 5: User 2 harvests Solana Yield from Strategy 2 (Meteora) via Atomic CPI
  await executeAndRecord({
    id: 5,
    action: "Harvest Solana Lending Yield (CPI)",
    strategy: "Meteora Dynamic Yield Port (14.25% APY)",
    lane: "EVM / Dual-Lane (submitRomeTx)",
    walletRole: "User 2",
    account: user2,
    provider: user2Provider,
    functionName: "harvestYield",
    args: [2],
    amountUsdc: "Yield Accrual",
    cpiProgramId: "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",
    borshSummary: "0x9552e1f2b6f223c6 + u64LE(yield) + strat(2) + depth(2)",
  });

  // Tx 6: User 1 withdraws 0.05 USDC principal from Strategy 0 (Kamino) with Atomic CPI
  await executeAndRecord({
    id: 6,
    action: "Withdraw Principal & Settle CPI",
    strategy: "Kamino Lend Prime USDC (11.40% APY)",
    lane: "EVM Lane (submitRomeTx)",
    walletRole: "User 1",
    account: user1,
    provider: user1Provider,
    functionName: "withdrawNativeUSDC",
    args: [0, parseEther("0.05")],
    amountUsdc: "0.05 USDC",
    cpiProgramId: "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD",
    borshSummary: "0xb712469c946da122 + u64LE(50000) + strat(0) + depth(1)",
  });

  // Tx 7: User 2 executes Direct Custom Solana CPI to SPL Memo v2 with explicit AccountMeta[]
  const memoProgramBytes32 =
    "0x054a535a992921064d24e87160da387c7c35b5ddbc92bb81e41fa8404105448d" as const;
  const customMemoHex = toHex("VERITAS_DIRECT_CPI:KAMINO_SPL_AUDIT:DEPTH_1");
  await executeAndRecord({
    id: 7,
    action: "Direct Custom Solana Program CPI (0xFF..08)",
    strategy: "Solana SPL Memo v2 / Audit Log",
    lane: "EVM Lane (submitRomeTx)",
    walletRole: "User 2",
    account: user2,
    provider: user2Provider,
    functionName: "executeCustomSolanaCPI",
    args: [
      memoProgramBytes32,
      [{ pubkey: vaultPda, is_signer: true, is_writable: false }],
      customMemoHex,
      [],
      1,
    ],
    amountUsdc: "Atomic CPI",
    cpiProgramId: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
    borshSummary: "Direct invoke(0xFF..08) with explicit AccountMeta[vaultPda(signer)]",
  });

  // Read final on-chain metrics
  const [finalTvl, finalCpiCount, finalYield] = await Promise.all([
    pub.readContract({ address: contractAddress, abi: portArtifact.abi, functionName: "totalPortValueLocked" }),
    pub.readContract({ address: contractAddress, abi: portArtifact.abi, functionName: "totalCpiInvocations" }),
    pub.readContract({ address: contractAddress, abi: portArtifact.abi, functionName: "totalYieldDistributed" }),
  ]);

  const deploymentData = {
    appName: "Veritas Port",
    deployedAt: new Date().toISOString(),
    hadrian: {
      chainId: HADRIAN_CHAIN_ID,
      name: hadrian.name,
      rpcUrl: hadrian.rpcUrl,
      explorerUrl: hadrian.explorerUrl,
      romeEvmProgramId: hadrian.romeEvmProgramId,
      contractAddress,
      deployTxHash,
      deployExplorerUrl: `${hadrian.explorerUrl}tx/${deployTxHash}`,
      contractExplorerUrl: `${hadrian.explorerUrl}address/${contractAddress}`,
      deploySolanaSignatures: deploySolanaSigs,
      vaultAuthorityPda: vaultPda,
      metrics: {
        totalValueLockedWei: String(finalTvl),
        totalValueLockedUsdc: formatEther(finalTvl as bigint),
        totalCpiInvocations: Number(finalCpiCount),
        totalYieldDistributedWei: String(finalYield),
      },
      tokens: hadrianTokens,
    },
    rubicon: {
      chainId: RUBICON_CHAIN_ID,
      name: "Rome Rubicon Mainnet",
      rpcUrl: "https://rubicon.mainnet.romeprotocol.xyz/",
      explorerUrl: "https://via.mainnet.romeprotocol.xyz/",
      romeEvmProgramId: "RomePq9X3iAoTr813HR7uRarafFDUJty6GdiEceYpzX",
      gasToken: "ROME",
      wUSDC: "0x0952d23364095c2d9f3a8e196a1c85a08088f9b3",
      wSOL: "0xc4e29e0f5b41522679786b9a59c419b4135ca113",
      wETH: "0x01e8b357b451232d21515518e67e616b80e892e9",
      solanaMainnetPrograms: {
        kaminoLend: mainnetPrograms.kaminoLend || "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD",
        meteoraDammV1: mainnetPrograms.meteoraDammV1 || "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",
        meteoraDlmm: mainnetPrograms.meteoraDlmm || "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
        splToken: mainnetPrograms.splToken || "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        splMemo: mainnetPrograms.memo || "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
      },
      status: "Ready & Configured for Mainnet Graduation (Calls Solana Mainnet Programs via Rome CPI 0xFF..08)",
    },
    wallets: {
      deployer: deployer.address,
      user1: user1.address,
      user2: user2.address,
    },
    precompiles: {
      system: "0xfF00000000000000000000000000000000000007",
      cpi: "0xFF00000000000000000000000000000000000008",
      helper: "0xff00000000000000000000000000000000000009",
    },
    devnetPrograms,
    transactions,
  };

  const outPath = path.join(process.cwd(), "src", "lib", "deployments.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(deploymentData, null, 2));
  console.log(`\n🎉 Saved full on-chain deployment & transaction history to ${outPath}`);
}

main().catch((err) => {
  console.error("❌ Deployment script error:", err);
  process.exit(1);
});
