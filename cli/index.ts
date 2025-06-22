import { Command } from 'commander';
import * as dotenv from 'dotenv';
import { BestRouteRouter } from '../router/BestRouteRouter';
import { UniswapV3Router } from '../sdk/UniswapV3Router';
import { SushiswapV2Router } from '../sdk/SushiswapV2Router';
import { JsonRpcProvider, ethers } from 'ethers';

dotenv.config();

const tokenAddressMap: { [symbol: string]: string } = {
    'ETH': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH Address
    'DAI': '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    'LINK': '0x514910771AF9Ca656af840dff83E8264EcF986CA'
  };

const program = new Command();

program
  .name('warp-router-cli')
  .description('CLI to interact with the WarpRouter SDK')
  .version('1.0.0')
  .requiredOption('--amountIn <number>', 'Amount of the input token to swap')
  .requiredOption('--tokenIn <string>', 'Input token symbol or address (e.g., ETH)')
  .requiredOption('--tokenOut <string>', 'Output token address')
  .action(async (options) => {
    const { amountIn, tokenIn, tokenOut } = options;

    if (!process.env.RPC_URL) {
      console.error('Error: RPC_URL is not set. Please create a .env file with your QuickNode RPC URL.');
      process.exit(1);
    }

    const provider = new JsonRpcProvider(process.env.RPC_URL);
    const uniswapRouter = new UniswapV3Router(provider);
    const sushiswapRouter = new SushiswapV2Router(provider);
    const routers = [uniswapRouter, sushiswapRouter];

    console.log(`Fetching best quote for ${amountIn} ${tokenIn} -> ${tokenOut}...`);

    try {
      const tokenInAddress = tokenAddressMap[tokenIn.toUpperCase()] || tokenIn;
      const tokenOutAddress = tokenAddressMap[tokenOut.toUpperCase()] || tokenOut;

      // A more robust solution would dynamically fetch decimals for the input token
      const amountInWei = ethers.parseUnits(amountIn, 18).toString();

      const bestQuote = await BestRouteRouter.getBestQuote(routers, {
        amountIn: amountInWei,
        tokenIn: tokenInAddress,
        tokenOut: tokenOutAddress,
      });

      if (!bestQuote) {
        console.log('No quotes found for the given pair.');
        return;
      }

      // A more robust solution would dynamically fetch decimals for the output token
      const formattedAmountOut = ethers.formatUnits(bestQuote.amountOut, 18);

      console.log('Best Route:', bestQuote.dex);
      console.log('Amount Out:', formattedAmountOut);
      console.log('Gas:', bestQuote.gasEstimate.toString());
      console.log('Tx Calldata:', bestQuote.calldata);
    } catch (error) {
      console.error('An error occurred while fetching quotes:', error);
    }
  });

program.parse(process.argv);
