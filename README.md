<img width="1470" height="834" alt="Screenshot 2026-04-10 at 11 36 19 PM" src="https://github.com/user-attachments/assets/952fc88b-5f22-4808-8c72-61eedd1768e8" />

# MidSwap — Privacy-Preserving DEX on Midnight Blockchain

> **The first real AMM DEX on Midnight** — swap tokens with complete ZK privacy, zero MEV exposure, and on-chain liquidity pools.

[![Midnight Network](https://img.shields.io/badge/Network-Midnight%20Preprod-6366f1)](https://midnight.network)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## What is MidSwap?

MidSwap is a privacy-first decentralized exchange (DEX) built on the [Midnight blockchain](https://midnight.network). It uses **zero-knowledge proofs** to keep all trade details private — making front-running (MEV) impossible by design.

Unlike traditional DEXs where bots can see pending transactions in the mempool, on MidSwap **no one can see what you're trading before it's confirmed**.

---

## Live Deployment (Midnight Preprod)

### Deployed Contracts

| Contract | Address | Deployed At |
|----------|---------|-------------|
| **OptimalAMM Pool** (tNight/mUSDC) | `57c54a7c61f60a1f769313d89a4191782fa92c7d91bb51e79bfc9256eca1229b` | 2026-04-09 |
| **MidnightUSDC (mUSDC)** | `c85172925beae8334c01135cfbd364cf2f6858e173be8c13bb82197890f645f4` | 2026-04-10 |
| **Contract Calls ()** | [All OptimalAMM Pool Calls](https://preprod.midnightexplorer.com/contracts?search=57c54a7c61f60a1f769313d89a4191782fa92c7d91bb51e79bfc9256eca1229b) | 2026-04-10 |
### Deployment Transactions

| Action | Tx Hash | Block |
|--------|---------|-------|
| OptimalAMM Deploy | `87b8688b10aa30a348c7082734e0701f51a63848dbf5a5f6cea567882514c1d9` | 277969 |

### Pool Configuration

| Parameter | Value |
|-----------|-------|
| Token 0 | tNight (native DUST) |
| Token 1 | mUSDC (synthetic stablecoin) |
| Fee | 0.3% (30 bps) |
| Deployer | `cded1720b57cb367575dfd3c48de314d2db12065805b134f3637df6d0118c0a4` |
| mUSDC Minted | 100,000,000 units |

---

## Features

- **Private Swaps** — ZK proofs hide token amounts and trader identity
- **AMM Pools** — Constant product `x × y = k` formula
- **MEV Protection** — Bots can't front-run what they can't see
- **Add/Remove Liquidity** — Earn 0.3% fees on every swap
- **MEV Dashboard** — Compare your savings vs Ethereum DEXs
- **Lace Wallet Integration** — Native Midnight DApp Connector API v4

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Compact language (Midnight ZK DSL) |
| ZK Proofs | Midnight proof server (local Docker) |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS |
| State | Zustand |
| Blockchain | Midnight Preprod network |
| Wallet | Lace browser extension |
| Monorepo | pnpm workspaces + Turborepo |

---

## Project Structure

```
MidSwap/
├── apps/
│   └── web/                    # React frontend (Vite)
│       ├── src/
│       │   ├── components/     # UI components (Swap, Pools, MEV, Wallet)
│       │   ├── pages/          # SwapPage, PoolsPage, MEVDashboardPage
│       │   ├── store/          # Zustand stores (wallet, swap, MEV)
│       │   ├── hooks/          # useSwap, custom hooks
│       │   ├── services/       # PriceOracle
│       │   └── types/          # TypeScript interfaces
│       └── public/
│           └── zk/OptimalAMM/  # ZK circuit files (zkir, keys)
│
└── packages/
    ├── contracts/              # Midnight smart contracts
    │   ├── src/
    │   │   ├── OptimalAMM.compact      # Main AMM contract
    │   │   ├── MidnightUSDC.compact    # Stablecoin contract
    │   │   ├── LiquidityPool.compact   # Base LP contract
    │   │   └── witnesses.ts            # Off-chain witness providers
    │   ├── managed/            # Compiled contract artifacts
    │   │   └── OptimalAMM/
    │   │       ├── contract/   # Compiled JS
    │   │       └── zkir/       # ZK intermediate representations
    │   ├── scripts/            # Deploy/test scripts
    │   └── deployments/        # Deployment records
    │
    └── sdk/                    # MidSwap TypeScript SDK
        └── src/
            ├── MidSwapSDK.ts       # Main SDK entry
            ├── WalletConnector.ts  # Lace wallet integration
            ├── PoolManager.ts      # Pool state queries
            ├── SwapExecutor.ts     # Transaction execution
            ├── MEVAnalytics.ts     # MEV protection metrics
            └── types.ts            # Shared types
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+ (`npm install -g pnpm`)
- Docker (for proof server)
- [Lace wallet](https://www.lace.io/) browser extension (configured for Midnight Preprod)

### 1. Install Dependencies

```bash
git clone https://github.com/SamyaDeb/MidSwap.git
cd MidSwap
pnpm install
```

### 2. Configure Environment

```bash
cp apps/web/.env.example apps/web/.env.local
# The default values point to the deployed Preprod contracts — no changes needed
```

### 3. Start Proof Server

```bash
# Pull and start the Midnight proof server
docker pull ghcr.io/midnight-ntwrk/proof-server:latest
docker run -d -p 6300:6300 ghcr.io/midnight-ntwrk/proof-server:latest
```

### 4. Start the App

```bash
pnpm --filter @midswap/web dev
# Opens at http://localhost:3006
```

---

## Testing the Full Flow

### E2E Flow

**Step 1 — Add Liquidity (Pools page)**
1. Open `http://localhost:3006/pools`
2. Connect Lace wallet (must have tNight/DUST on Preprod)
3. Click **Add Liquidity** → enter amounts → approve in Lace
4. Wait for ZK proof generation + TX confirmation

**Step 2 — Swap (Swap page)**
1. Go to `http://localhost:3006/swap`
2. Select tNight → mUSDC and enter amount
3. Click **Swap** → approve in Lace wallet
4. Privacy-protected ZK swap is submitted

**Step 3 — View MEV Savings (MEV Dashboard)**
1. Go to `http://localhost:3006/mev`
2. See real-time comparison vs Ethereum DEXs and your protection stats

---

## Smart Contracts

### OptimalAMM.compact

The core AMM contract implementing:
- `addLiquidity(amount0, amount1)` — deposit tokens, receive LP tokens
- `removeLiquidity(lpAmount)` — burn LP tokens, receive proportional tokens
- `swap(tokenIn, amountIn)` — private token swap with 0.3% fee
- On-chain constraints: `verifyFloorDivision`, `verifyFloorSqrt`

### MidnightUSDC.compact

ERC-20 equivalent synthetic stablecoin:
- `mint(to, amount)` — mint new tokens (admin only)
- `transfer(to, amount)` — transfer tokens privately

### Witness Providers (`witnesses.ts`)

Off-chain computation for ZK circuit witnesses:
- `divFloor(num, den)` — floor division for LP calculations
- `sqrtFloor(n)` — integer square root for initial LP issuance

---

## Architecture: How Private Swaps Work

```
User ──► Lace Wallet ──► MidSwap Frontend
                              │
                              ▼
                    SwapExecutor.executeSwap()
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
      findDeployedContract  ZK Prover    Indexer (read)
      (midnight-js-sdk)    (localhost:6300)
              │
              ▼
      callTx.swap() ──► ZK Proof Generated
                              │
                              ▼
              balanceUnsealedTransaction()
                              │
                              ▼
              submitTransaction() ──► Midnight Preprod
```

The ZK proof ensures the transaction is valid without revealing:
- Which tokens were swapped
- The exact amounts
- The trader's identity

---

## Deployment (Contracts)

### Deploy New OptimalAMM Pool

```bash
DEPLOYER_SEED_PHRASE="your 24 words" \
npx tsx packages/contracts/scripts/deploy.ts
```

### Deploy MidnightUSDC Token

```bash
DEPLOYER_SEED_PHRASE="your 24 words" \
npx tsx packages/contracts/scripts/deploy-musdc.ts

# Then initialize and mint
DEPLOYER_SEED_PHRASE="your 24 words" \
CONTRACT_ADDRESS=<deployed_address> \
npx tsx packages/contracts/scripts/init-musdc.ts
```

### Initialize Pool

```bash
DEPLOYER_SEED_PHRASE="your 24 words" \
POOL_ADDRESS=<pool_address> \
MUSDC_ADDRESS=<musdc_address> \
npx tsx packages/contracts/scripts/init-pool.ts
```

---

## Network Info

| Property | Value |
|----------|-------|
| Network | Midnight Preprod |
| Indexer | `https://indexer.preprod.midnight.network/api/v4/graphql` |
| Proof Server | `http://localhost:6300` (local Docker) |
| Native Token | tNight (DUST) |
| Faucet | [Midnight Discord faucet](https://discord.gg/midnight) |

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit with conventional commits: `feat:`, `fix:`, `chore:`
4. Push and open a PR

---

## License

MIT — see [LICENSE](LICENSE)

---

*Built on [Midnight Network](https://midnight.network) — the first privacy-preserving blockchain.*


The **FIRST real AMM DEX** on Midnight blockchain with full ZK privacy.

## Features

- **Private Swaps**: Trade tokens with complete privacy using zero-knowledge proofs
- **MEV Protection**: Bots can't front-run what they can't see
- **AMM Pools**: Constant product (x * y = k) liquidity pools
- **MEV Dashboard**: See how much you're saving vs Ethereum DEXs

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- Docker (for proof server)
- Lace Wallet browser extension

### Setup

```bash
# Install dependencies
pnpm install

# Start proof server
pnpm proof-server:start

# Verify proof server is running
curl http://localhost:6300/health

# Start development
pnpm dev
```

### Environment Setup

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

## Project Structure

```
MidSwap/
├── apps/
│   └── web/                # React frontend
├── packages/
│   ├── contracts/          # Compact smart contracts
│   └── sdk/                # TypeScript SDK
├── docker-compose.yml      # Proof server
└── implementation.md       # Detailed implementation guide
```

## Network Configuration

- **Network**: Midnight Preprod
- **RPC**: wss://rpc.preprod.midnight.network
- **Indexer**: https://indexer.preprod.midnight.network/api/v4/graphql
- **Faucet**: https://faucet.preprod.midnight.network/

## Development Commands

```bash
# Full development mode
pnpm dev

# Build all packages
pnpm build

# Run tests
pnpm test

# Contract commands
pnpm contracts:build    # Compile Compact contracts
pnpm contracts:deploy   # Deploy to Preprod

# Frontend commands
pnpm web:dev           # Start frontend dev server
pnpm web:build         # Production build

# Proof server
pnpm proof-server:start  # Start Docker proof server
pnpm proof-server:stop   # Stop proof server
pnpm proof-server:logs   # View logs
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User's Browser                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │   MidSwap   │  │    Lace     │  │  Proof Server   │ │
│  │   Frontend  │◄─┤   Wallet    │◄─┤  (Local Docker) │ │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────┘ │
└─────────┼────────────────┼──────────────────────────────┘
          │                │
          ▼                ▼
┌─────────────────────────────────────────────────────────┐
│                  Midnight Preprod                        │
│  ┌─────────────────────────────────────────────────┐   │
│  │              LiquidityPool Contract              │   │
│  │   • Private reserves (ZK protected)              │   │
│  │   • Swap with hidden amounts                     │   │
│  │   • MEV impossible                               │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## License

MIT
