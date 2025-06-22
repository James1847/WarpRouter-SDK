# Warp Router - 一个简化的DeFi聚合器

[English](./README.md) | 中文

本项目是一个简化的SDK和API，用于从多个去中心化交易所（DEX）获取最佳的加密货币兑换报价。其设计旨在实现模块化、可扩展和易于使用。

---

## 1. 如何运行

### 先决条件

- Node.js (v18+)
- npm
- Docker & Docker Compose (用于容器化部署)
- 一个以太坊主网RPC URL (例如，来自 [QuikNode](https://quiknode.io/), Infura, 或 Alchemy)。

### 安装

1.  **克隆代码仓库:**
    ```bash
    git clone <repository-url>
    cd warp-router
    ```

2.  **安装依赖:**
    ```bash
    npm install
    ```

3.  **设置环境变量:**
    在项目根目录创建一个 `.env` 文件，并添加您的以太坊主网RPC URL:
    ```
    RPC_URL=https://your-mainnet-rpc-url.com/your-api-key
    
    # 可选: 用于测试webhook功能
    # WEBHOOK_URL=https://your-webhook-receiver.com/path
    ```

### 运行API

API服务器提供一个 `/quote` 端点来获取最佳路由。

**选项A: 使用Node.js运行**

1.  **构建项目:**
    ```bash
    npm run build
    ```

2.  **启动服务器:**
    ```bash
    npm start
    ```
    服务器将在 `http://localhost:3000` 上运行。

**选项B: 使用Docker运行**

1.  **构建并启动容器:**
    ```bash
    docker-compose up --build
    ```
    服务器将在 `http://localhost:3000` 上运行。

### 运行测试

如果使用接口测试，请访问http://localhost:3000/quote?tokenIn=ETH&tokenOut=USD&amountIn=1&slippageTolerance=1
response: 
```json
{
  "amountIn": "1000000000000000000",
  "amountOut": "2278.513124",
  "dex": "UniswapV3",
  "calldata": "0x414bf389000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000685795160000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
  "gasEstimate": "138850"
}
```
同时console 会显示整体的报价流程：
```bash
--- Chainlink Oracle Price ---
ETH/USD: 2290.29

--- All Router Quotes ---
  - UniswapV3: AmountOut -> 2278513124, Gas -> 138850
  - SushiswapV2: AmountOut -> 2272854278, Gas -> 139331
--- Best Route Selected: UniswapV3 ---


--- 滑点保护检查 ---
Chainlink 价格: 2290.29
最佳报价价格: 2278.513124
价格偏差: 0.51%
滑点容差: 1%
滑点检查通过: 价格偏差在允许范围内
```


测试运行在由Hardhat管理的一个以太坊主网分叉上，这需要在您的 `.env` 文件中设置 `RPC_URL`。

```bash
npm run test
```

### 运行CLI

CLI是一个简单的工具，用于直接从命令行获取报价。

```bash
# 显示帮助和选项
npm run cli -- --help

# 示例: 获取1个ETH兑换DAI的报价
npm run cli -- --amountIn 1 --tokenIn ETH --tokenOut DAI
```

---

## 2. 架构与设计

### 架构概览

项目主要分为三个部分：

1.  **SDK (`/sdk`)**: 与单个DEX协议交互的核心逻辑。其设计是协议无关的。
2.  **聚合器 (`/router`)**: 查询所有SDK模块以找到最佳综合报价的逻辑。
3.  **接口 (`/api`, `/cli`)**: 面向用户的接口，通过HTTP API和命令行工具暴露聚合器的功能。

#### SDK布局

-   **`sdk/types.ts`**: 定义了每个特定协议的路由器必须实现的核心共享接口。关键接口是：
    -   `DexRouter`: 要求实现 `quoteExactIn` 和 `buildTx` 方法，确保为聚合器提供一致的API。
    -   `DexQuote`: 返回报价数据的标准化格式，包括最终的 `amountOut`、`gasEstimate` 和交易的 `calldata`。
-   **`sdk/UniswapV3Router.ts` & `sdk/SushiswapV2Router.ts`**: 这些是Uniswap V3和Sushiswap V2的具体实现。每个类都封装了为该特定DEX获取报价和构建有效交易的逻辑。这种模块化设计使得添加、移除或更新DEX集成变得容易，而不会影响应用程序的其他部分。
-   **`sdk/ChainlinkPriceOracle.ts`**: 一个用于从Chainlink获取参考价格的工具。这用于滑点保护和验证报价的合理性。

#### 聚合逻辑

-   **`router/BestRouteRouter.ts`**: 这是聚合引擎的核心。
    1.  它接收一个要查询的 `DexRouter` 模块列表。
    2.  它使用 `Promise.all` 并行调用所有路由器的 `quoteExactIn` 方法，以实现最高效率。
    3.  它比较所有有效报价返回的 `amountOut`。由于 `amountOut` 是来自区块链的 `uint256`，因此它被作为 `BigInt` 处理，以防止在比较过程中出现精度损失。
    4.  `amountOut` 最高的报价被选为最佳路由。

#### 模拟与测试框架

-   **主网分叉**: 测试套件使用 **Hardhat的主网分叉** 功能。这在 `hardhat.config.ts` 中配置。分叉允许我们的测试针对以太坊主网的实时状态快照执行。这是一个强大的方法，因为它为测试提供了真实、复杂的数据（如实时的流动性池水平），这在模拟环境中是无法复制的。
-   **`test/router.test.ts`**: 该文件包含 `BestRouteRouter` 的测试套件。
    -   它初始化了Uniswap和Sushiswap路由器。
    -   它包括一个针对1 ETH到DAI兑换的简单测试。
    -   它有一个 **模糊测试（Fuzz Test）**，用多个随机输入金额查询路由器，以确保逻辑在各种数值范围内都稳健。

#### CI流水线

本项目尚未���置CI流水线。使用GitHub Actions的标准设置将在每次推送或拉取请求时包括以下步骤：

1.  **安装依赖**: `npm install`
2.  **代码检查**: `npm run lint` 检查代码风格问题。
3.  **测试**: `npm run test` 针对分叉的主网运行Hardhat测试套件。

### 设计理念与权衡

-   **模块化**: SDK、聚合器和用户界面之间的明确分离是主要的设计目标。这使得代码库更易于维护、测试和扩展。例如，添加一个新的DEX只需要创建一个实现 `DexRouter` 接口的新类，而无需更改聚合逻辑。

-   **简单性与Gas优化（权衡）**: 当前的聚合逻辑仅根据最高的 `amountOut` 选择最佳路由。一个更高级的生产系统还会考虑每笔交易的 `gasEstimate`，因为一个 `amountOut` 稍低但Gas费用显著便宜的路由可能对用户来说是更好的整体选择。这是一个为了保持初始实现简单而做出的刻意权衡。

-   **固定与动态费用（权衡）**: Uniswap V3的集成使用固定的 `3000` (0.3%) 费用等级以求简单。然而，Uniswap V3上的最佳费用等级可能因代币对而异（例如，稳定币对为0.05%）。一个生产就绪的实现需要动态查询哪个费用等级的池子对给定的交易对有最多的流动性，以找到真正的最优价格。

-   **链下报价**: 所有的价格发现都是通过对区块链节点的链下 `staticCall` 请求完成的。这是一个标准的、高效的模式，允许我们免费获取报价，而无需发送任何链上交易。最终的输出是交易的 `calldata`，准备好由用户签名和发送。

