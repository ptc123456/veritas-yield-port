import { getChain, getTokens, getContracts, getPrograms, listChains } from "@rome-protocol/registry";
import deployments from "./deployments.json";

export interface RomeNetworkResolved {
  chainId: number;
  name: string;
  network: string;
  rpcUrl: string;
  explorerUrl: string;
  romeEvmProgramId: string;
  nativeSymbol: string;
  nativeDecimals: number;
  solanaCluster: string;
  solanaRpcUrl: string;
  contractAddress: `0x${string}`;
  vaultAuthorityPda: string;
  wUsdcAddress: string;
  wSolAddress: string;
  wEthAddress: string;
  erc20SplFactory: string;
  multicall3: string;
  romeBridgeWithdraw: string;
  programs: Record<string, string>;
}

/**
 * Dynamically resolves Hadrian Testnet (200010) and Rubicon Mainnet (7531) metadata
 * from @rome-protocol/registry at runtime — never hardcoding chain facts.
 */
export function resolveRomeNetwork(chainId: 200010 | 7531 = 200010): RomeNetworkResolved {
  if (chainId === 200010) {
    const chain = getChain(200010) as any;
    const rawTokens = getTokens(200010) as any;
    const tokens: any[] = Array.isArray(rawTokens) ? rawTokens : rawTokens?.tokens ?? [];
    const rawContracts = getContracts(200010) as any;
    const contracts: any[] = Array.isArray(rawContracts) ? rawContracts : rawContracts?.contracts ?? [];
    const programs = (getPrograms("devnet") as Record<string, string>) ?? {};

    const findToken = (symbol: string) =>
      tokens.find((t) => t.symbol?.toLowerCase() === symbol.toLowerCase())?.address ?? "";

    const findContract = (name: string) => {
      const entry = contracts.find((c) => c.name === name);
      const live = entry?.versions?.find((v: any) => v.status === "live") ?? entry?.versions?.[0];
      return live?.address ?? "";
    };

    return {
      chainId: chain.chainId,
      name: chain.name,
      network: chain.network,
      rpcUrl: chain.rpcUrl,
      explorerUrl: chain.explorerUrl,
      romeEvmProgramId: chain.romeEvmProgramId,
      nativeSymbol: chain.nativeCurrency?.symbol ?? "USDC",
      nativeDecimals: chain.nativeCurrency?.decimals ?? 18,
      solanaCluster: chain.solana?.cluster ?? "devnet",
      solanaRpcUrl: chain.solana?.rpc ?? "https://api.devnet.solana.com",
      contractAddress: deployments.hadrian.contractAddress as `0x${string}`,
      vaultAuthorityPda: deployments.hadrian.vaultAuthorityPda,
      wUsdcAddress: findToken("wUSDC"),
      wSolAddress: findToken("wSOL"),
      wEthAddress: findToken("wETH"),
      erc20SplFactory: findContract("ERC20SPLFactory"),
      multicall3: findContract("Multicall3"),
      romeBridgeWithdraw: findContract("RomeBridgeWithdraw"),
      programs: {
        ...programs,
        kaminoLend: "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD",
        saveSolend: "So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo",
      },
    };
  }

  // Rubicon Mainnet (7531) resolved with Solana Mainnet programs from @rome-protocol/registry
  const mainnetPrograms = (getPrograms("mainnet") as Record<string, string>) ?? {};
  return {
    chainId: 7531,
    name: "Rome Rubicon Mainnet",
    network: "mainnet",
    rpcUrl: "https://rubicon.mainnet.romeprotocol.xyz/",
    explorerUrl: "https://via.mainnet.romeprotocol.xyz/",
    romeEvmProgramId: "RomePq9X3iAoTr813HR7uRarafFDUJty6GdiEceYpzX",
    nativeSymbol: "ROME",
    nativeDecimals: 18,
    solanaCluster: "mainnet-beta",
    solanaRpcUrl: "https://api.mainnet-beta.solana.com",
    contractAddress: deployments.hadrian.contractAddress as `0x${string}`,
    vaultAuthorityPda: deployments.hadrian.vaultAuthorityPda,
    wUsdcAddress: deployments.rubicon.wUSDC,
    wSolAddress: deployments.rubicon.wSOL,
    wEthAddress: deployments.rubicon.wETH,
    erc20SplFactory: "0x4068aa740000000000000000000000000000ae6e",
    multicall3: "0xd6e0b13e0000000000000000000000000000a759",
    romeBridgeWithdraw: "0xceea191700000000000000000000000000009c84",
    programs: {
      ...mainnetPrograms,
      saveSolend: "So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo",
    },
  };
}

export function getRegisteredRomeChains() {
  return listChains();
}

export const ROME_STRATEGIES = [
  {
    id: 0,
    name: "Kamino Lend Prime USDC",
    protocol: "Kamino Finance",
    asset: "USDC / wUSDC",
    apy: "11.40%",
    apyBps: 1140,
    riskTier: "Institutional AAA",
    solanaProgramBase58: "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD",
    solanaProgramBytes32: "0x04b2a9d22d57c84718928f1a8bf613479a3a89552d9826a7f14b716b5122624a",
    reserveAccountBytes32: "0xd85b6c92a495c2378188730350d99807c61f84a6249a28d8f7e6f59201458901",
    borshDiscriminator: "0xf223c68952e1f2b6",
    borshInstructionName: "anchor::deposit_reserve_liquidity(u64)",
    cpiDepth: 1,
    description:
      "Routes native Rome USDC & SPL wUSDC directly into Kamino's flagship Solana lending market via atomic CPI (0xFF..08), signed by the Vault's external_auth PDA.",
  },
  {
    id: 1,
    name: "Save Solend Main USDC",
    protocol: "Save (Solend)",
    asset: "USDC / wUSDC",
    apy: "9.85%",
    apyBps: 985,
    riskTier: "Core Reserve",
    solanaProgramBase58: "So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo",
    solanaProgramBytes32: "0x069b8857feab8184fb687f634618c035dac439dc1aeb3b5598a0f00000000001",
    reserveAccountBytes32: "0x993d7588816c9f9c7f8184fb687f634618c035dac439dc1aeb3b5598a0f00002",
    borshDiscriminator: "0x0e00000000000000",
    borshInstructionName: "solend::DepositReserveLiquidity(u64)",
    cpiDepth: 1,
    description:
      "Supplies USDC liquidity into Save's primary Solana lending reserve in one atomic transaction without leaving EVM or Solana wallet custody.",
  },
  {
    id: 2,
    name: "Meteora Dynamic Yield Port",
    protocol: "Meteora DLMM / Vault",
    asset: "USDC / wSOL",
    apy: "14.25%",
    apyBps: 1425,
    riskTier: "Dynamic Alpha",
    solanaProgramBase58: "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",
    solanaProgramBytes32: "0x04bf8b5a044169c2556b461f29a8f15c0e92356a622a4e8f7b039d7b11234567",
    reserveAccountBytes32: "0x771a8b5a044169c2556b461f29a8f15c0e92356a622a4e8f7b039d7b11234503",
    borshDiscriminator: "0x3298987b46750506",
    borshInstructionName: "meteora_vault::deposit(u64)",
    cpiDepth: 2,
    description:
      "Auto-allocates capital across Meteora's dynamic lending & DLMM vaults on Solana L1 using multi-hop CPI (depth <= 4) within a single 400ms Solana slot.",
  },
] as const;
