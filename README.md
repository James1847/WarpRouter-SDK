# Warp Router - A Simplified DeFi Aggregator

[English](./README.md) | [中文](./README.zh.md)

This project is a simplified SDK and API for fetching the best cryptocurrency swap quotes from multiple Decentralized Exchanges (DEXs). It is designed to be modular, extensible, and easy to use.

---

## 1. How to Run

### Prerequisites

- Node.js (v18+)
- npm
- Docker & Docker Compose (for containerized deployment)
- An Ethereum Mainnet RPC URL (e.g., from [QuikNode](https://quiknode.io/), Infura, or Alchemy). 

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd warp-router
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up environment variables:**
    Create a `.env` file in the project root and add your Ethereum Mainnet RPC URL:
    ```
    RPC_URL=https://your-mainnet-rpc-url.com/your-api-key
    
    # Optional: For testing the webhook feature
    # WEBHOOK_URL=https://your-webhook-receiver.com/path
    ```

### Running the API

The API server provides a `/quote` endpoint to fetch the best route.

**Option A: Running with Node.js**

1.  **Build the project:**
    ```bash
    npm run build
    ```

2.  **Start the server:**
    ```bash
    npm start
    ```
    The server will be running at `http://localhost:3000`.

**Option B: Running with Docker**

1.  **Build and start the container:**
    ```bash
    docker-compose up --build
    ```
    The server will be running at `http://localhost:3000`.

### Running Tests

The tests run on a Hardhat-managed fork of the Ethereum mainnet, which requires the `RPC_URL` to be set in your `.env` file.

```bash
npm run test
```

### Running the CLI

The CLI is a simple tool for fetching quotes directly from the command line.

```bash
# Show help and options
npm run cli -- --help

# Example: Get a quote to swap 1 ETH for DAI
npm run cli -- --amountIn 1 --tokenIn ETH --tokenOut DAI
```

---

## 2. Architecture & Design

### Architecture Overview

The project is structured into three main components:

1.  **SDK (`/sdk`)**: The core logic for interacting with individual DEX protocols. It is designed to be protocol-agnostic.
2.  **Aggregator (`/router`)**: The logic for querying all SDK modules to find the best overall quote.
3.  **Interfaces (`/api`, `/cli`)**: User-facing interfaces that expose the aggregator's functionality via an HTTP API and a command-line tool.

#### SDK Layout

-   **`sdk/types.ts`**: Defines the core, shared interfaces that every protocol-specific router must implement. The key interfaces are:
    -   `DexRouter`: Requires `quoteExactIn` and `buildTx` methods, ensuring a consistent API for the aggregator.
    -   `DexQuote`: A standardized format for returning quote data, including the final `amountOut`, `gasEstimate`, and the transaction `calldata`.
-   **`sdk/UniswapV3Router.ts` & `sdk/SushiswapV2Router.ts`**: These are the concrete implementations for Uniswap V3 and Sushiswap V2. Each class encapsulates the logic for fetching a quote and constructing a valid transaction for that specific DEX. This modular design makes it easy to add, remove, or update DEX integrations without affecting the rest of the application.
-   **`sdk/ChainlinkPriceOracle.ts`**: A utility for fetching reference prices from Chainlink. This is used for slippage protection and to validate the reasonableness of a quote.

#### Aggregation Logic

-   **`router/BestRouteRouter.ts`**: This is the heart of the aggregation engine.
    1.  It receives a list of `DexRouter` modules to query.
    2.  It calls the `quoteExactIn` method on all routers in parallel using `Promise.all` for maximum efficiency.
    3.  It compares the returned `amountOut` from all valid quotes. Since `amountOut` is a `uint256` from the blockchain, it is handled as a `BigInt` to prevent precision loss during comparison.
    4.  The quote with the highest `amountOut` is selected as the best route.

#### Simulation & Test Framework

-   **Mainnet Forking**: The test suite uses **Hardhat's mainnet forking** feature. This is configured in `hardhat.config.ts`. Forking allows our tests to execute against a snapshot of the live Ethereum mainnet state. This is a powerful approach because it provides realistic, complex data (like real-time liquidity pool levels) for testing, which is impossible to replicate in a mock environment.
-   **`test/router.test.ts`**: This file contains the test suite for the `BestRouteRouter`.
    -   It initializes both the Uniswap and Sushiswap routers.
    -   It includes a simple test for a 1 ETH to DAI swap.
    -   It features a **Fuzz Test** that queries the router with multiple, randomized input amounts to ensure the logic is robust across a range of values.

#### CI Pipeline

A CI pipeline is not yet configured for this project. A standard setup using GitHub Actions would include the following steps on every push or pull request:

1.  **Install Dependencies**: `npm install`
2.  **Linting**: `npm run lint` to check for code style issues.
3.  **Testing**: `npm run test` to run the Hardhat test suite against the forked mainnet.

### Design Rationale & Tradeoffs

-   **Modularity**: The clear separation between the SDK, the aggregator, and the user interfaces was a primary design goal. This makes the codebase easier to maintain, test, and extend. Adding a new DEX, for example, only requires creating a new class that implements the `DexRouter` interface, with no changes needed in the aggregation logic.

-   **Simplicity vs. Gas Optimization (Tradeoff)**: The current aggregation logic selects the best route based solely on the highest `amountOut`. A more advanced production system would also factor in the `gasEstimate` for each transaction, as a route with a slightly lower `amountOut` but significantly cheaper gas could be the better overall choice for the user. This was a deliberate tradeoff to keep the initial implementation simple.

-   **Fixed vs. Dynamic Fees (Tradeoff)**: The Uniswap V3 integration uses a fixed `3000` (0.3%) fee tier for simplicity. However, the optimal fee tier on Uniswap V3 can vary between token pairs (e.g., 0.05% for stablecoin pairs). A production-ready implementation would need to dynamically query which fee tier pool has the most liquidity for the given pair to find the true best price.

-   **Off-Chain Quoting**: All price discovery is done using off-chain `staticCall` requests to the blockchain node. This is a standard, highly efficient pattern that allows us to get quotes for free without sending any on-chain transactions. The final output is the transaction `calldata`, ready to be signed and sent by the user.
