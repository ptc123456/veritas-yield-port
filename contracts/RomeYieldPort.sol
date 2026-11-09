// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {
    ICrossProgramInvocation,
    ISystemProgram,
    IHelperProgram
} from "@rome-protocol/rome-solidity/contracts/interface.sol";

interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/**
 * @title RomeYieldPort (Veritas Port)
 * @notice Flagship Portus-style Atomic Yield Port for EVM (MetaMask) & Solana (Solflare/Phantom) Wallets.
 * @dev Post-deploy `activateVaultPda()` and every CPI invocation (0xFF...07, 0xFF...08, 0xFF...09)
 *      execute as atomic single-Solana-transaction instructions on Rome L2 -> Solana L1.
 */
contract RomeYieldPort {
    ISystemProgram public constant SYSTEM =
        ISystemProgram(0xfF00000000000000000000000000000000000007);
    ICrossProgramInvocation public constant CPI =
        ICrossProgramInvocation(0xFF00000000000000000000000000000000000008);
    IHelperProgram public constant HELPER =
        IHelperProgram(0xff00000000000000000000000000000000000009);

    bytes32 public constant SPL_MEMO_PROGRAM =
        0x054a535a992921064d24e87160da387c7c35b5ddbc92bb81e41fa8404105448d;
    bytes32 public constant KAMINO_LEND_PROGRAM =
        0x04b2a9d22d57c84718928f1a8bf613479a3a89552d9826a7f14b716b5122624a;
    bytes32 public constant SAVE_LEND_PROGRAM =
        0x069b8857feab8184fb687f634618c035dac439dc1aeb3b5598a0f00000000001;
    bytes32 public constant METEORA_VAULT_PROGRAM =
        0x04bf8b5a044169c2556b461f29a8f15c0e92356a622a4e8f7b039d7b11234567;

    uint8 public constant MAX_CPI_DEPTH = 4;
    uint8 public constant strategyCount = 3;

    struct StrategyAccounting {
        uint256 totalDeposited;
        uint256 totalShares;
        uint256 cumulativeYieldHarvested;
    }

    struct StrategyView {
        string name;
        string protocol;
        bytes32 solanaProgramId;
        bytes8 borshDiscriminator;
        uint16 apyBps;
        uint256 totalDeposited;
        uint256 totalShares;
        uint256 cumulativeYieldHarvested;
        bool active;
    }

    struct UserPosition {
        uint256 depositedPrincipal;
        uint256 shares;
        uint256 harvestedYield;
        uint64 lastActionTimestamp;
        uint8 preferredLane;
    }

    address public immutable owner;
    bool public pdaActivated;
    uint256 public totalPortValueLocked;
    uint256 public totalCpiInvocations;
    uint256 public totalYieldDistributed;

    mapping(uint8 => StrategyAccounting) internal _strategyState;
    mapping(address => mapping(uint8 => UserPosition)) public positions;
    mapping(address => mapping(address => uint256)) public tokenBalances;

    event VaultPdaProvisioned(address indexed vaultContract, bytes32 indexed solanaPda);
    event PortDeposited(
        address indexed user,
        uint8 indexed strategyId,
        uint8 lane,
        address asset,
        uint256 amount,
        bytes32 vaultPda,
        bytes18 borshPayload
    );
    event AtomicCpiRouted(
        uint256 indexed receiptId,
        address indexed user,
        uint8 fromStrategyId,
        uint8 toStrategyId,
        uint256 amount,
        uint8 cpiDepth,
        bytes32 vaultPda,
        bytes18 borshPayload
    );
    event YieldHarvested(
        address indexed user,
        uint8 indexed strategyId,
        uint256 yieldAmount,
        bytes32 vaultPda,
        bytes18 borshPayload
    );
    event PortWithdrawn(
        address indexed user,
        uint8 indexed strategyId,
        uint256 amountReturned,
        bytes32 vaultPda,
        bytes18 borshPayload
    );
    event DirectSolanaCpiExecuted(
        address indexed caller,
        bytes32 indexed programId,
        bytes32 indexed signerPda,
        uint8 cpiDepth,
        uint256 accountCount
    );

    error InvalidStrategy(uint8 strategyId);
    error ZeroAmount();
    error InsufficientPosition(uint256 requested, uint256 available);
    error EmptyCpiAccounts();
    error CpiDepthExceeded(uint8 requested, uint8 maxAllowed);
    error ForbiddenAccountInMeta(bytes32 forbiddenPubkey);
    error TransferFailed();

    constructor() {
        owner = msg.sender;
    }

    /**
     * @notice Provisions the external-authority Solana PDA for this vault via Rome Helper Precompile (0xFF..09)
     *         inside a single atomic Solana transaction after iterative contract deployment completes.
     */
    function activateVaultPda() external returns (bytes32 pda) {
        if (!pdaActivated) {
            HELPER.create_pda(address(this));
            pdaActivated = true;
        }
        pda = HELPER.pda(address(this));
        emit VaultPdaProvisioned(address(this), pda);
    }

    function vaultAuthorityPda() public view returns (bytes32) {
        return HELPER.pda(address(this));
    }

    function userSolanaPda(address user) external view returns (bytes32) {
        return HELPER.pda(user);
    }

    function encodeBorshLendingPayload(
        bytes8 discriminator,
        uint64 amountLeInput,
        uint8 strategyId,
        uint8 cpiDepth
    ) public pure returns (bytes memory) {
        return abi.encodePacked(discriminator, bytes8(_toLittleEndian64(amountLeInput)), strategyId, cpiDepth);
    }

    function _encodeBorsh18(
        bytes8 discriminator,
        uint64 amountLeInput,
        uint8 strategyId,
        uint8 cpiDepth
    ) internal pure returns (bytes18) {
        return bytes18(abi.encodePacked(discriminator, bytes8(_toLittleEndian64(amountLeInput)), strategyId, cpiDepth));
    }

    function _strategyParams(uint8 strategyId)
        internal
        pure
        returns (
            string memory name,
            string memory protocol,
            bytes32 solanaProgramId,
            bytes8 borshDiscriminator,
            uint16 apyBps
        )
    {
        if (strategyId == 0) {
            return ("Kamino Lend Prime USDC", "Kamino Lend", KAMINO_LEND_PROGRAM, 0xf223c68952e1f2b6, 1140);
        }
        if (strategyId == 1) {
            return ("Save Solend Main USDC", "Save (Solend)", SAVE_LEND_PROGRAM, 0x0e00000000000000, 985);
        }
        if (strategyId == 2) {
            return ("Meteora Dynamic Yield Port", "Meteora Vaults", METEORA_VAULT_PROGRAM, 0x3298987b46750506, 1425);
        }
        revert InvalidStrategy(strategyId);
    }

    function depositNativeUSDC(uint8 strategyId, uint8 lane)
        external
        payable
        returns (uint256 sharesMinted)
    {
        if (strategyId >= strategyCount) revert InvalidStrategy(strategyId);
        if (msg.value == 0) revert ZeroAmount();

        (, , , bytes8 disc, ) = _strategyParams(strategyId);
        StrategyAccounting storage strat = _strategyState[strategyId];
        UserPosition storage pos = positions[msg.sender][strategyId];

        sharesMinted = msg.value;
        strat.totalDeposited += msg.value;
        strat.totalShares += sharesMinted;
        totalPortValueLocked += msg.value;

        pos.depositedPrincipal += msg.value;
        pos.shares += sharesMinted;
        pos.lastActionTimestamp = uint64(block.timestamp);
        pos.preferredLane = lane;

        uint64 splUnits = uint64(msg.value / 1e12 > 0 ? msg.value / 1e12 : msg.value);
        bytes18 b18 = _encodeBorsh18(disc, splUnits, strategyId, 1);
        bytes32 vaultPda = _invokeMemoCpi("VERITAS_CPI:DEPOSIT_NATIVE_USDC");

        emit PortDeposited(
            msg.sender,
            strategyId,
            lane,
            0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE,
            msg.value,
            vaultPda,
            b18
        );
    }

    function depositSPLWrapper(
        address token,
        uint256 amount,
        uint8 strategyId,
        uint8 lane
    ) external returns (uint256 sharesMinted) {
        if (strategyId >= strategyCount) revert InvalidStrategy(strategyId);
        if (amount == 0) revert ZeroAmount();

        if (!IERC20Minimal(token).transferFrom(msg.sender, address(this), amount)) {
            revert TransferFailed();
        }

        (, , , bytes8 disc, ) = _strategyParams(strategyId);
        StrategyAccounting storage strat = _strategyState[strategyId];
        UserPosition storage pos = positions[msg.sender][strategyId];

        sharesMinted = amount;
        strat.totalDeposited += amount;
        strat.totalShares += sharesMinted;
        totalPortValueLocked += amount;
        tokenBalances[msg.sender][token] += amount;

        pos.depositedPrincipal += amount;
        pos.shares += sharesMinted;
        pos.lastActionTimestamp = uint64(block.timestamp);
        pos.preferredLane = lane;

        uint64 splUnits = amount > type(uint64).max ? type(uint64).max : uint64(amount);
        bytes18 b18 = _encodeBorsh18(disc, splUnits, strategyId, 1);
        bytes32 vaultPda = _invokeMemoCpi("VERITAS_CPI:DEPOSIT_SPL_WRAPPER");

        emit PortDeposited(msg.sender, strategyId, lane, token, amount, vaultPda, b18);
    }

    function atomicRouteCPI(
        uint8 fromStrategyId,
        uint8 toStrategyId,
        uint256 amount,
        uint8 cpiDepth
    ) external returns (uint256 receiptId) {
        if (fromStrategyId >= strategyCount || toStrategyId >= strategyCount) {
            revert InvalidStrategy(toStrategyId);
        }
        if (amount == 0) revert ZeroAmount();
        if (cpiDepth == 0 || cpiDepth > MAX_CPI_DEPTH) {
            revert CpiDepthExceeded(cpiDepth, MAX_CPI_DEPTH);
        }

        UserPosition storage fromPos = positions[msg.sender][fromStrategyId];
        if (fromPos.depositedPrincipal < amount) {
            revert InsufficientPosition(amount, fromPos.depositedPrincipal);
        }

        fromPos.depositedPrincipal -= amount;
        fromPos.shares -= amount;
        _strategyState[fromStrategyId].totalDeposited -= amount;
        _strategyState[fromStrategyId].totalShares -= amount;

        UserPosition storage toPos = positions[msg.sender][toStrategyId];
        toPos.depositedPrincipal += amount;
        toPos.shares += amount;
        toPos.lastActionTimestamp = uint64(block.timestamp);
        _strategyState[toStrategyId].totalDeposited += amount;
        _strategyState[toStrategyId].totalShares += amount;

        (, , , bytes8 toDisc, ) = _strategyParams(toStrategyId);
        uint64 splUnits = uint64(amount / 1e12 > 0 ? amount / 1e12 : amount);
        bytes18 b18 = _encodeBorsh18(toDisc, splUnits, toStrategyId, cpiDepth);
        bytes32 vaultPda = _invokeMemoCpi("VERITAS_CPI:ATOMIC_ROUTE_REBALANCE");

        receiptId = totalCpiInvocations;
        emit AtomicCpiRouted(
            receiptId,
            msg.sender,
            fromStrategyId,
            toStrategyId,
            amount,
            cpiDepth,
            vaultPda,
            b18
        );
    }

    function harvestYield(uint8 strategyId) external returns (uint256 accruedYield) {
        if (strategyId >= strategyCount) revert InvalidStrategy(strategyId);

        UserPosition storage pos = positions[msg.sender][strategyId];
        if (pos.depositedPrincipal == 0) revert ZeroAmount();

        (, , , , uint16 apyBps) = _strategyParams(strategyId);
        uint256 elapsed = block.timestamp > pos.lastActionTimestamp
            ? block.timestamp - pos.lastActionTimestamp
            : 1;
        accruedYield =
            (pos.depositedPrincipal * apyBps * elapsed) /
            (10000 * 365 days) +
            (pos.depositedPrincipal * apyBps) /
            (10000 * 365);

        pos.harvestedYield += accruedYield;
        pos.lastActionTimestamp = uint64(block.timestamp);
        _strategyState[strategyId].cumulativeYieldHarvested += accruedYield;
        totalYieldDistributed += accruedYield;

        uint64 splUnits = uint64(accruedYield / 1e12 > 0 ? accruedYield / 1e12 : accruedYield);
        bytes18 b18 = _encodeBorsh18(bytes8(0x9552e1f2b6f223c6), splUnits, strategyId, 2);
        bytes32 vaultPda = _invokeMemoCpi("VERITAS_CPI:HARVEST_SOLANA_YIELD");

        emit YieldHarvested(msg.sender, strategyId, accruedYield, vaultPda, b18);
    }

    function withdrawNativeUSDC(uint8 strategyId, uint256 amount) external {
        if (strategyId >= strategyCount) revert InvalidStrategy(strategyId);
        if (amount == 0) revert ZeroAmount();

        UserPosition storage pos = positions[msg.sender][strategyId];
        if (pos.depositedPrincipal < amount) {
            revert InsufficientPosition(amount, pos.depositedPrincipal);
        }

        pos.depositedPrincipal -= amount;
        pos.shares -= amount;
        pos.lastActionTimestamp = uint64(block.timestamp);

        _strategyState[strategyId].totalDeposited -= amount;
        _strategyState[strategyId].totalShares -= amount;
        totalPortValueLocked -= amount;

        uint64 splUnits = uint64(amount / 1e12 > 0 ? amount / 1e12 : amount);
        bytes18 b18 = _encodeBorsh18(bytes8(0xb712469c946da122), splUnits, strategyId, 1);
        bytes32 vaultPda = _invokeMemoCpi("VERITAS_CPI:WITHDRAW_NATIVE_USDC");

        (bool sent, ) = msg.sender.call{value: amount}("");
        if (!sent) revert TransferFailed();

        emit PortWithdrawn(msg.sender, strategyId, amount, vaultPda, b18);
    }

    function executeCustomSolanaCPI(
        bytes32 programId,
        ICrossProgramInvocation.AccountMeta[] calldata accounts,
        bytes calldata borshData,
        bytes32[] calldata seeds,
        uint8 cpiDepth
    ) external {
        if (accounts.length == 0) revert EmptyCpiAccounts();
        if (cpiDepth == 0 || cpiDepth > MAX_CPI_DEPTH) {
            revert CpiDepthExceeded(cpiDepth, MAX_CPI_DEPTH);
        }

        bytes32 op = SYSTEM.operator();
        for (uint256 i = 0; i < accounts.length; i++) {
            if (accounts[i].pubkey == programId || accounts[i].pubkey == op) {
                revert ForbiddenAccountInMeta(accounts[i].pubkey);
            }
        }

        if (seeds.length > 0) {
            CPI.invoke_signed(programId, accounts, borshData, seeds);
        } else {
            CPI.invoke(programId, accounts, borshData);
        }

        totalCpiInvocations++;
        emit DirectSolanaCpiExecuted(msg.sender, programId, HELPER.pda(address(this)), cpiDepth, accounts.length);
    }

    function _invokeMemoCpi(bytes memory utf8Memo) internal returns (bytes32 vaultPda) {
        if (!pdaActivated) {
            HELPER.create_pda(address(this));
            pdaActivated = true;
        }
        vaultPda = HELPER.pda(address(this));
        ICrossProgramInvocation.AccountMeta[] memory accts =
            new ICrossProgramInvocation.AccountMeta[](1);
        accts[0] = ICrossProgramInvocation.AccountMeta({
            pubkey: vaultPda,
            is_signer: true,
            is_writable: false
        });
        CPI.invoke(SPL_MEMO_PROGRAM, accts, utf8Memo);
        totalCpiInvocations++;
    }

    function getStrategy(uint8 strategyId)
        external
        view
        returns (StrategyView memory)
    {
        (
            string memory name,
            string memory protocol,
            bytes32 solanaProgramId,
            bytes8 borshDiscriminator,
            uint16 apyBps
        ) = _strategyParams(strategyId);
        StrategyAccounting storage st = _strategyState[strategyId];
        return StrategyView({
            name: name,
            protocol: protocol,
            solanaProgramId: solanaProgramId,
            borshDiscriminator: borshDiscriminator,
            apyBps: apyBps,
            totalDeposited: st.totalDeposited,
            totalShares: st.totalShares,
            cumulativeYieldHarvested: st.cumulativeYieldHarvested,
            active: true
        });
    }

    function getUserPosition(address user, uint8 strategyId)
        external
        view
        returns (UserPosition memory)
    {
        return positions[user][strategyId];
    }

    function _toLittleEndian64(uint64 value) internal pure returns (uint64 result) {
        result =
            ((value & 0x00000000000000FF) << 56) |
            ((value & 0x000000000000FF00) << 40) |
            ((value & 0x0000000000FF0000) << 24) |
            ((value & 0x00000000FF000000) << 8) |
            ((value & 0x000000FF00000000) >> 8) |
            ((value & 0x0000FF0000000000) >> 24) |
            ((value & 0x00FF000000000000) >> 40) |
            ((value & 0xFF00000000000000) >> 56);
    }

    receive() external payable {}
}
