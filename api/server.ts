import express from 'express';
import { BestRouteRouter } from '../router/BestRouteRouter';
import { UniswapV3Router } from '../sdk/UniswapV3Router';
import { SushiswapV2Router } from '../sdk/SushiswapV2Router';
import { JsonRpcProvider } from 'ethers';
import client from 'prom-client';

const app = express();
const port = process.env.PORT || 3000;

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
const routers = [uniswapRouter, sushiswapRouter];

app.get('/metrics', async (req, res) => {
  res.setHeader('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/quote', async (req, res) => {
  const { tokenIn, tokenOut, amountIn } = req.query;

  if (!tokenIn || !tokenOut || !amountIn) {
    return res.status(400).json({ error: 'Missing required query parameters: tokenIn, tokenOut, amountIn' });
  }

  const end = dexQuoteLatency.startTimer();

  try {
    const quotes = await Promise.all(
      routers.map(router => router.quoteExactIn(amountIn as string, tokenIn as string, tokenOut as string)
        .catch(err => {
          // Log errors from individual DEXs but don't crash the request
          console.error(`Error fetching quote from ${router.constructor.name}:`, err.message);
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
      if (parseFloat(current.amountOut) > parseFloat(best.amountOut)) {
        return current;
      }
      return best;
    });

    console.log(`--- Best Route Selected: ${bestQuote.dex} ---\n`);

    end({ dex: bestQuote.dex });
    res.json({
      ...bestQuote,
      gasEstimate: bestQuote.gasEstimate.toString(),
    });
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
