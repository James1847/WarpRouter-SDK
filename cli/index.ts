import { Command } from 'commander';
import * as dotenv from 'dotenv';
import { BestRouteRouter } from '../router/BestRouteRouter';
import { UniswapV3Router } from '../sdk/UniswapV3Router';
import { SushiswapV2Router } from '../sdk/SushiswapV2Router';
import { JsonRpcProvider } from 'ethers';

dotenv.config();

const program = new Command();

program
  .name('warp-router-cli')
  .description('CLI to interact with the WarpRouter SDK')
  .version('1.0.0');

program
  .command('quote')
  .description('Get the best quote for a token swap')
  .argument('<tokenIn>', 'Input token symbol or address (e.g., ETH)')
  .argument('<tokenOut>', 'Output token address')
  .requiredOption('-a, --amount <number>', 'Amount of the input token to swap')
  .action(async (tokenIn, tokenOut, options) => {
    const { amount } = options;

    if (!process.env.RPC_URL) {
      console.error('Error: RPC_URL is not set. Please create a .env file with your QuickNode RPC URL.');
      process.exit(1);
    }

    const provider = new JsonRpcProvider(process.env.RPC_URL);
    const uniswapRouter = new UniswapV3Router(provider);
    const sushiswapRouter = new SushiswapV2Router(provider);
    const routers = [uniswapRouter, sushiswapRouter];

    console.log(`Fetching best quote for ${amount} ${tokenIn} -> ${tokenOut}...`);

    try {
      const bestQuote = await BestRouteRouter.getBestQuote(routers, {
        amountIn: amount,
        tokenIn: tokenIn,
        tokenOut: tokenOut,
      });

      if (!bestQuote) {
        console.log('No quotes found for the given pair.');
        return;
      }

      console.log('Best Route:', bestQuote.dex);
      console.log('Amount Out:', bestQuote.amountOut);
      console.log('Gas:', bestQuote.gasEstimate); // Placeholder
      console.log('Tx Calldata:', bestQuote.calldata); // Placeholder
    } catch (error) {
      console.error('An error occurred while fetching quotes:', error);
    }
  });

program.parse(process.argv);
