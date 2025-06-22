import express from 'express';
import rateLimit from 'express-rate-limit';
import axios from 'axios';
import { BestRouteRouter } from '../router/BestRouteRouter';
import { UniswapV3Router } from '../sdk/UniswapV3Router';
import { SushiswapV2Router } from '../sdk/SushiswapV2Router';
import { ChainlinkPriceOracle } from '../sdk/ChainlinkPriceOracle';
import { JsonRpcProvider, ethers } from 'ethers';
import client from 'prom-client';

const app = express();
const port = process.env.PORT || 3000;

// Rate limiting
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // Limit each IP to 100 requests per windowMs
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Apply the rate limiter to all requests
app.use(limiter);

// Create a Registry to register the metrics
const register = new client.Registry();
register.setDefaultLabels({
  app: 'warp-router-api'
});
client.collectDefaultMetrics({ register });

// Create a histogram to track latency
const dexQuoteLatency = new client.Histogram({
  name: 'dex_quote_latency_ms',
  help: 'Latency of DEX quote requests in milliseconds',
  labelNames: ['dex'],
});

// Create a counter to track errors
const dexQuoteErrors = new client.Counter({
  name: 'dex_quote_errors_total',
  help: 'Total number of errors while quoting DEXs',
  labelNames: ['dex'],
});

register.registerMetric(dexQuoteLatency);
register.registerMetric(dexQuoteErrors);

// You will need to provide your RPC_URL in the .env file
const rpcUrl = process.env.RPC_URL;
if (!rpcUrl) {
  console.error("RPC_URL is not set. Please add it to your .env file.");
  process.exit(1);
}

const provider = new JsonRpcProvider(rpcUrl);
const uniswapRouter = new UniswapV3Router(provider);
const sushiswapRouter = new SushiswapV2Router(provider);
const chainlinkOracle = new ChainlinkPriceOracle(provider);
const routers = [uniswapRouter, sushiswapRouter];

const tokenAddressMap: { [symbol: string]: string } = {
  'ETH': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH Address
  'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  'USD': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Alias for USDC
  'LINK': '0x514910771AF9Ca656af840dff83E8264EcF986CA'
};

async function getDecimals(tokenAddress: string): Promise<number> {
  const contract = new ethers.Contract(tokenAddress, ["function decimals() view returns (uint8)"], provider);
  return await contract.decimals();
}

app.get('/metrics', async (req, res) => {
  res.setHeader('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/quote', async (req, res) => {
  const { tokenIn, tokenOut, amountIn, slippageTolerance } = req.query;
  const slippagePercent = slippageTolerance ? parseFloat(slippageTolerance as string) : 0.5; // 默认滑点容差 0.5%

  if (!tokenIn || !tokenOut || !amountIn) {
    return res.status(400).json({ error: 'Missing required query parameters: tokenIn, tokenOut, amountIn' });
  }

  const end = dexQuoteLatency.startTimer();

  try {
    // 尝试获取 Chainlink 报价作为参考价格
    let chainlinkPrice = null;
    try {
      chainlinkPrice = await chainlinkOracle.getPrice(tokenIn as string, tokenOut as string);
      console.log(`\n--- Chainlink Oracle Price ---`);
      console.log(`${tokenIn}/${tokenOut}: ${chainlinkPrice}`);
    } catch (error) {
      console.log(`\n--- Chainlink Oracle Price ---`);
      console.log(`无法获取 Chainlink 价格: ${error instanceof Error ? error.message : String(error)}`);
    }

    const tokenInAddress = tokenAddressMap[tokenIn as string] || tokenIn as string;
    const tokenOutAddress = tokenAddressMap[tokenOut as string] || tokenOut as string;

    try {
      const decimals = await getDecimals(tokenInAddress);
      const amountInWei = ethers.parseUnits(amountIn as string, decimals);

      const quotes = await Promise.all(
        routers.map(router => router.quoteExactIn(amountInWei.toString(), tokenInAddress, tokenOutAddress)
          .catch(err => {
            console.error(`Error fetching quote from ${router.constructor.name}:`, err);
            dexQuoteErrors.inc({ dex: router.constructor.name.replace('Router', '') });
            return null;
          })
        )
      );

      const validQuotes = quotes.filter((q): q is import('../sdk/types').DexQuote => q !== null);

      if (validQuotes.length === 0) {
        dexQuoteErrors.inc({ dex: 'aggregator' });
        end({ dex: 'aggregator' });
        return res.status(404).json({ error: 'No quotes found for the given pair.' });
      }

      console.log("\n--- All Router Quotes ---");
      validQuotes.forEach(q => {
        console.log(`  - ${q.dex}: AmountOut -> ${q.amountOut}, Gas -> ${q.gasEstimate.toString()}`);
      });


      const bestQuote = validQuotes.reduce((best, current) => {
        if (BigInt(current.amountOut) > BigInt(best.amountOut)) {
          return current;
        }
        return best;
      });

      console.log(`--- Best Route Selected: ${bestQuote.dex} ---\n`);

      // Get decimals for the output token to format it for display and checks
      const decimalsOut = await getDecimals(tokenOutAddress);
      const formattedAmountOut = ethers.formatUnits(bestQuote.amountOut, decimalsOut);

      // 滑点保护检查
      if (chainlinkPrice !== null) {
        // 计算与 Chainlink 价格的偏差
        const quotePrice = parseFloat(formattedAmountOut) / parseFloat(amountIn as string);
        const priceDiff = Math.abs((quotePrice - chainlinkPrice) / chainlinkPrice * 100);

        console.log(`\n--- 滑点保护检查 ---`);
        console.log(`Chainlink 价格: ${chainlinkPrice}`);
        console.log(`最佳报价价格: ${quotePrice}`);
        console.log(`价格偏差: ${priceDiff.toFixed(2)}%`);
        console.log(`滑点容差: ${slippagePercent}%`);

        if (priceDiff > slippagePercent) {
          console.log(`警告: 价格偏差 (${priceDiff.toFixed(2)}%) 超过滑点容差 (${slippagePercent}%)`);

          // 可以选择拒绝交易或者添加警告
          if (priceDiff > slippagePercent * 2) { // 如果偏差超过容差的两倍，拒绝交易
            end({ dex: 'aggregator' });
            return res.status(400).json({
              error: '价格滑点过高',
              details: {
                chainlinkPrice,
                quotePrice,
                priceDifference: `${priceDiff.toFixed(2)}%`,
                slippageTolerance: `${slippagePercent}%`
              }
            });
          }
        } else {
          console.log(`滑点检查通过: 价格偏差在允许范围内`);
        }
      } else {
        console.log(`\n--- 滑点保护检查 ---`);
        console.log(`无法进行滑点检查: Chainlink 价格不可用`);
      }

      // Fire a webhook if a URL is provided
      if (process.env.WEBHOOK_URL) {
        axios.post(process.env.WEBHOOK_URL, {
          ...bestQuote,
          amountOut: formattedAmountOut,
          gasEstimate: bestQuote.gasEstimate.toString(),
        }).catch(error => {
          if (error instanceof Error) {
            console.error('Error sending webhook:', error.message);
          } else {
            console.error('Error sending webhook:', String(error));
          }
        });
      }

      end({ dex: bestQuote.dex });
      res.json({
        ...bestQuote,
        amountOut: formattedAmountOut,
        gasEstimate: bestQuote.gasEstimate.toString(),
      });

    } catch (error) {
      console.error(error);
      dexQuoteErrors.inc({ dex: 'aggregator' });
      end({ dex: 'aggregator' });
      res.status(500).json({ error: 'An error occurred while fetching quotes.' });
    }
  } catch (error) {
    console.error(error);
    dexQuoteErrors.inc({ dex: 'aggregator' });
    end({ dex: 'aggregator' });
    res.status(500).json({ error: 'An error occurred while fetching quotes.' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
