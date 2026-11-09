import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { EVM } from "@ethereumjs/evm";
import { Address, hexToBytes, bytesToHex, Account } from "@ethereumjs/util";
import { encodeFunctionData, decodeFunctionResult, parseEther, parseUnits } from "viem";
import { compileContracts } from "../scripts/compile";

const createAddressFromString = (s: string) => Address.fromString(s);

const SYSTEM_PRECOMPILE = "0xFF00000000000000000000000000000000000007";
const CPI_PRECOMPILE = "0xFF00000000000000000000000000000000000008";
const HELPER_PRECOMPILE = "0xFF00000000000000000000000000000000000009";

const DEPLOYER = "0xA6c02a3d7D429629FaCd23A07b8A3d731628Ee99";
const EVM_USER = "0xD56647bBa764c1b673299baaEB356569a37961b8";
const SOLANA_SYNTHETIC_USER = "0xd96CbB20f449eab7FAA2E9ca3B25c55d5BEcAfF6";

describe("RomeYieldPort — End-to-End Smart Contract & Atomic CPI Unit Tests", () => {
  let evm: EVM;
  let compiled: ReturnType<typeof compileContracts>;
  let portAddress: `0x${string}`;
  let wUsdcAddress: `0x${string}`;
  let portAbi: any[];
  let mockTokenAbi: any[];

  async function fundAccount(addr: string, ethAmount = "1000") {
    const address = createAddressFromString(addr);
    const existing = (await evm.stateManager.getAccount(address)) ?? new Account();
    existing.balance = parseEther(ethAmount);
    await evm.stateManager.putAccount(address, existing);
  }

  async function etchCode(addr: string, deployedBytecodeHex: `0x${string}`) {
    const address = createAddressFromString(addr);
    const existing = (await evm.stateManager.getAccount(address)) ?? new Account();
    await evm.stateManager.putAccount(address, existing);
    await evm.stateManager.putContractCode(address, hexToBytes(deployedBytecodeHex));
  }

  async function deployContract(from: string, bytecodeHex: `0x${string}`): Promise<`0x${string}`> {
    const res = await evm.runCall({
      caller: createAddressFromString(from),
      data: hexToBytes(bytecodeHex),
      gasLimit: 30_000_000n,
    });
    if (res.execResult.exceptionError) {
      throw new Error(`Deploy failed: ${res.execResult.exceptionError.error}`);
    }
    return res.createdAddress!.toString() as `0x${string}`;
  }

  async function callContract(
    from: string,
    to: `0x${string}`,
    abi: any[],
    functionName: string,
    args: any[] = [],
    value: bigint = 0n
  ) {
    const data = encodeFunctionData({ abi, functionName, args });
    const res = await evm.runCall({
      caller: createAddressFromString(from),
      to: createAddressFromString(to),
      data: hexToBytes(data),
      value,
      gasLimit: 30_000_000n,
    });
    if (res.execResult.exceptionError) {
      throw new Error(`Revert in ${functionName}: ${res.execResult.exceptionError.error}`);
    }
    const returnHex = bytesToHex(res.execResult.returnValue) as `0x${string}`;
    const fnAbi = abi.find((x) => x.type === "function" && x.name === functionName);
    if (fnAbi && fnAbi.outputs && fnAbi.outputs.length > 0 && returnHex !== "0x") {
      return decodeFunctionResult({ abi, functionName, data: returnHex });
    }
    return undefined;
  }

  beforeAll(() => {
    compiled = compileContracts();
    portAbi = compiled["RomeYieldPort"].abi;
    mockTokenAbi = compiled["MockSPLWrapper"].abi;
  });

  beforeEach(async () => {
    evm = await EVM.create();

    await fundAccount(DEPLOYER, "500");
    await fundAccount(EVM_USER, "500");
    await fundAccount(SOLANA_SYNTHETIC_USER, "500");

    // Etch Rome Precompiles at 0xFF...07, 0xFF...08, 0xFF...09
    await etchCode(SYSTEM_PRECOMPILE, compiled["MockRomeSystemPrecompile"].deployedBytecode);
    await etchCode(CPI_PRECOMPILE, compiled["MockRomeCpiPrecompile"].deployedBytecode);
    await etchCode(HELPER_PRECOMPILE, compiled["MockRomeHelperPrecompile"].deployedBytecode);

    // Deploy RomeYieldPort and MockSPLWrapper (wUSDC)
    portAddress = await deployContract(DEPLOYER, compiled["RomeYieldPort"].bytecode);
    wUsdcAddress = await deployContract(DEPLOYER, compiled["MockSPLWrapper"].bytecode);

    // Activate Vault PDA via single atomic post-deploy transaction
    await callContract(DEPLOYER, portAddress, portAbi, "activateVaultPda");
  });

  it("1. Provisions external-authority PDA via Helper Precompile (0xFF..09) and initializes 3 Solana strategies", async () => {
    const vaultPda = (await callContract(DEPLOYER, portAddress, portAbi, "vaultAuthorityPda")) as `0x${string}`;
    expect(vaultPda).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(vaultPda).not.toBe("0x0000000000000000000000000000000000000000000000000000000000000000");

    const count = await callContract(DEPLOYER, portAddress, portAbi, "strategyCount");
    expect(Number(count)).toBe(3);

    const kamino = (await callContract(DEPLOYER, portAddress, portAbi, "getStrategy", [0])) as any;
    expect(kamino.name).toBe("Kamino Lend Prime USDC");
    expect(Number(kamino.apyBps)).toBe(1140);
    expect(kamino.active).toBe(true);

    const save = (await callContract(DEPLOYER, portAddress, portAbi, "getStrategy", [1])) as any;
    expect(save.name).toBe("Save Solend Main USDC");
    expect(Number(save.apyBps)).toBe(985);

    const meteora = (await callContract(DEPLOYER, portAddress, portAbi, "getStrategy", [2])) as any;
    expect(meteora.name).toBe("Meteora Dynamic Yield Port");
    expect(Number(meteora.apyBps)).toBe(1425);
  });

  it("2. Encodes Borsh lending instruction payload with accurate little-endian u64 layout", async () => {
    // 1,000,000 micro-USDC = 0x00000000000F4240 -> little endian: 40 42 0f 00 00 00 00 00
    const borshHex = (await callContract(DEPLOYER, portAddress, portAbi, "encodeBorshLendingPayload", [
      "0xf223c68952e1f2b6",
      1_000_000n,
      0,
      1,
    ])) as `0x${string}`;

    expect(borshHex.toLowerCase()).toBe("0xf223c68952e1f2b640420f00000000000001");
  });

  it("3. Supports Dual-Lane deposits (EVM submitRomeTx & Solana submitRomeTxV1) with atomic Solana CPI", async () => {
    const evmDepositAmount = parseEther("2.5"); // 2.5 USDC gas units
    const solDepositAmount = parseEther("1.5"); // 1.5 USDC gas units

    // EVM Lane (lane = 0) deposits into Strategy 0 (Kamino)
    await callContract(EVM_USER, portAddress, portAbi, "depositNativeUSDC", [0, 0], evmDepositAmount);

    // Solana V1 Lane (lane = 1) deposits into Strategy 2 (Meteora)
    await callContract(SOLANA_SYNTHETIC_USER, portAddress, portAbi, "depositNativeUSDC", [2, 1], solDepositAmount);

    const evmPos = (await callContract(EVM_USER, portAddress, portAbi, "getUserPosition", [EVM_USER, 0])) as any;
    expect(evmPos.depositedPrincipal).toBe(evmDepositAmount);
    expect(Number(evmPos.preferredLane)).toBe(0);

    const solPos = (await callContract(SOLANA_SYNTHETIC_USER, portAddress, portAbi, "getUserPosition", [
      SOLANA_SYNTHETIC_USER,
      2,
    ])) as any;
    expect(solPos.depositedPrincipal).toBe(solDepositAmount);
    expect(Number(solPos.preferredLane)).toBe(1);

    const totalTvl = await callContract(DEPLOYER, portAddress, portAbi, "totalPortValueLocked");
    expect(totalTvl).toBe(evmDepositAmount + solDepositAmount);

    const cpiCount = await callContract(DEPLOYER, portAddress, portAbi, "totalCpiInvocations");
    expect(Number(cpiCount)).toBe(2);
  });

  it("4. Supports SPL Wrapper ERC-20 deposits (wUSDC) with Atomic CPI", async () => {
    const wUsdcAmount = parseUnits("500", 6);
    await callContract(DEPLOYER, wUsdcAddress, mockTokenAbi, "mint", [EVM_USER, wUsdcAmount]);
    await callContract(EVM_USER, wUsdcAddress, mockTokenAbi, "approve", [portAddress, wUsdcAmount]);

    await callContract(EVM_USER, portAddress, portAbi, "depositSPLWrapper", [wUsdcAddress, wUsdcAmount, 1, 0]);

    const pos = (await callContract(EVM_USER, portAddress, portAbi, "getUserPosition", [EVM_USER, 1])) as any;
    expect(pos.depositedPrincipal).toBe(wUsdcAmount);
  });

  it("5. Routes liquidity atomically across Solana strategies via atomicRouteCPI & enforces CPI depth <= 4", async () => {
    const depositAmt = parseEther("4.0");
    await callContract(EVM_USER, portAddress, portAbi, "depositNativeUSDC", [0, 0], depositAmt);

    // Rebalance half (2.0 USDC) from Kamino (0) to Meteora (2) at CPI depth = 3
    const routeAmt = parseEther("2.0");
    await callContract(EVM_USER, portAddress, portAbi, "atomicRouteCPI", [0, 2, routeAmt, 3]);

    const posKamino = (await callContract(EVM_USER, portAddress, portAbi, "getUserPosition", [EVM_USER, 0])) as any;
    const posMeteora = (await callContract(EVM_USER, portAddress, portAbi, "getUserPosition", [EVM_USER, 2])) as any;

    expect(posKamino.depositedPrincipal).toBe(parseEther("2.0"));
    expect(posMeteora.depositedPrincipal).toBe(parseEther("2.0"));

    // Verify CPI depth > 4 reverts
    await expect(
      callContract(EVM_USER, portAddress, portAbi, "atomicRouteCPI", [0, 2, parseEther("0.5"), 5])
    ).rejects.toThrow();
  });

  it("6. Harvests Solana lending yield and withdraws native USDC principal atomically", async () => {
    const depositAmt = parseEther("3.0");
    await callContract(EVM_USER, portAddress, portAbi, "depositNativeUSDC", [2, 0], depositAmt);

    const yieldEarned = (await callContract(EVM_USER, portAddress, portAbi, "harvestYield", [2])) as bigint;
    expect(yieldEarned > 0n).toBe(true);

    const posAfterHarvest = (await callContract(EVM_USER, portAddress, portAbi, "getUserPosition", [
      EVM_USER,
      2,
    ])) as any;
    expect(posAfterHarvest.harvestedYield).toBe(yieldEarned);

    // Withdraw 1.0 USDC
    await callContract(EVM_USER, portAddress, portAbi, "withdrawNativeUSDC", [2, parseEther("1.0")]);

    const posAfterWithdraw = (await callContract(EVM_USER, portAddress, portAbi, "getUserPosition", [
      EVM_USER,
      2,
    ])) as any;
    expect(posAfterWithdraw.depositedPrincipal).toBe(parseEther("2.0"));

    const cpiCount = await callContract(EVM_USER, portAddress, portAbi, "totalCpiInvocations");
    expect(Number(cpiCount)).toBe(3);
  });

  it("7. Enforces Rome CPI Precompile AccountMeta rules in executeCustomSolanaCPI", async () => {
    const vaultPda = (await callContract(DEPLOYER, portAddress, portAbi, "vaultAuthorityPda")) as `0x${string}`;
    const targetProg = "0x04b2a9d22d57c84718928f1a8bf613479a3a89552d9826a7f14b716b5122624a";
    const operatorPubkey = "0x1111111111111111111111111111111111111111111111111111111111111111";

    // 1) Empty accounts array must revert
    await expect(
      callContract(EVM_USER, portAddress, portAbi, "executeCustomSolanaCPI", [targetProg, [], "0x0102", [], 1])
    ).rejects.toThrow();

    // 2) Including target programId in AccountMeta[] must revert
    await expect(
      callContract(EVM_USER, portAddress, portAbi, "executeCustomSolanaCPI", [
        targetProg,
        [{ pubkey: targetProg, is_signer: false, is_writable: false }],
        "0x0102",
        [],
        1,
      ])
    ).rejects.toThrow();

    // 3) Including SYSTEM.operator() in AccountMeta[] must revert
    await expect(
      callContract(EVM_USER, portAddress, portAbi, "executeCustomSolanaCPI", [
        targetProg,
        [{ pubkey: operatorPubkey, is_signer: false, is_writable: false }],
        "0x0102",
        [],
        1,
      ])
    ).rejects.toThrow();

    // 4) Valid AccountMeta[] with vaultPda signer & seeds succeeds via invoke_signed
    const saltSeed = "0x9999999999999999999999999999999999999999999999999999999999999999";
    await callContract(EVM_USER, portAddress, portAbi, "executeCustomSolanaCPI", [
      targetProg,
      [{ pubkey: vaultPda, is_signer: true, is_writable: true }],
      "0xf223c68952e1f2b640420f0000000000",
      [saltSeed],
      2,
    ]);

    const totalCpi = await callContract(DEPLOYER, portAddress, portAbi, "totalCpiInvocations");
    expect(Number(totalCpi)).toBe(1);
  });
});
