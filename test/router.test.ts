import { expect } from "chai";
import { ethers } from "hardhat";
import { BestRouteRouter } from "../router/BestRouteRouter";
import { UniswapV3Router } from "../sdk/UniswapV3Router";
import { SushiswapV2Router } from "../sdk/SushiswapV2Router";
import { DexRouter } from "../sdk/types";
import { JsonRpcProvider } from "ethers";

describe("BestRouteRouter on a forked mainnet", () => {
  let routers: DexRouter[];

  before(() => {
    // We get the provider from hardhat's environment
    const provider = new JsonRpcProvider(process.env.RPC_URL);
    const uniswapRouter = new UniswapV3Router(provider);
    const sushiswapRouter = new SushiswapV2Router(provider);
    routers = [uniswapRouter, sushiswapRouter];
  });

  it("should get a quote for ETH to DAI", async () => {
    const options = {
      amountIn: ethers.parseEther("1").toString(),
      tokenIn: "ETH",
      tokenOut: "0x6B175474E89094C44Da98b954EedeAC495271d0F", // DAI
    };

    const bestQuote = await BestRouteRouter.getBestQuote(routers, options);

    expect(bestQuote).to.not.be.null;
    expect(bestQuote).to.have.property('dex');
    expect(bestQuote).to.have.property('amountOut');
    expect(parseFloat(bestQuote!.amountOut)).to.be.greaterThan(0);
    expect(bestQuote!.gasEstimate).to.be.a('bigint');
    expect(bestQuote!.gasEstimate > 0n).to.be.true;

    console.log(`1 ETH -> ${bestQuote!.amountOut} DAI via ${bestQuote!.dex} (Gas: ${bestQuote!.gasEstimate})`);
  });

  it("should handle various random amounts for ETH to DAI (Fuzz Test)", async () => {
    for (let i = 0; i < 5; i++) { // Run 5 iterations for the fuzz test
      const randomAmount = (Math.random() * (10 - 0.01) + 0.01).toFixed(4);
      const options = {
        amountIn: ethers.parseEther(randomAmount).toString(),
        tokenIn: "ETH",
        tokenOut: "0x6B175474E89094C44Da98b954EedeAC495271d0F", // DAI
      };

      console.log(`Fuzz test #${i + 1}: Quoting for ${randomAmount} ETH...`);

      const bestQuote = await BestRouteRouter.getBestQuote(routers, options);

      expect(bestQuote).to.not.be.null;
      expect(bestQuote).to.have.property('dex');
      expect(bestQuote).to.have.property('amountOut');
      expect(parseFloat(bestQuote!.amountOut)).to.be.greaterThan(0);
      expect(bestQuote!.gasEstimate).to.be.a('bigint');
      expect(bestQuote!.gasEstimate > 0n).to.be.true;

      console.log(`  -> ${randomAmount} ETH -> ${bestQuote!.amountOut} DAI via ${bestQuote!.dex} (Gas: ${bestQuote!.gasEstimate})`);
    }
  }).timeout(60000); // Increase timeout for multiple async calls
});
