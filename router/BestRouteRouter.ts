import { DexQuote, DexRouter } from "../sdk/types";
import { ChainlinkPriceOracle } from "../sdk/ChainlinkPriceOracle";
import { ethers } from "ethers";

const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

interface QuoteOptions {
  amountIn: string;
  tokenIn: string;
  tokenOut: string;
  maxSlippagePct?: number;
  provider?: ethers.Provider;
}

export class BestRouteRouter {
  static async getBestQuote(routers: DexRouter[], options: QuoteOptions): Promise<DexQuote | null> {
    const { amountIn, tokenIn, tokenOut, maxSlippagePct, provider } = options;

    const tokenInAddress = tokenIn.toUpperCase() === "ETH" ? WETH_ADDRESS : tokenIn;
    const tokenOutAddress = tokenOut.toUpperCase() === "ETH" ? WETH_ADDRESS : tokenOut;

    const quotes = await Promise.all(
      routers.map(router => router.quoteExactIn(amountIn, tokenInAddress, tokenOutAddress))
    );

    console.log("\n--- All Quotes from Routers ---");
    quotes.forEach(q => {
      if (q) {
        console.log(`  - ${q.dex}: AmountOut -> ${q.amountOut}`);
      } else {
        console.log("  - One router returned a null quote.");
      }
    });
    console.log("---------------------------------");

    let validQuotes = quotes.filter(q => q !== null && parseFloat(q.amountOut) > 0);

    if (validQuotes.length === 0) {
      return null;
    }

    // Simple comparison: choose the route with the highest amountOut.
    // The more advanced gas-cost-based comparison can be re-implemented later.
    let bestQuote = validQuotes.reduce((best, current) => {
      if (BigInt(current.amountOut) > BigInt(best.amountOut)) {
        return current;
      }
      return best;
    });

    // Price oracle validation
    if (provider) {
        try {
            const oracle = new ChainlinkPriceOracle(provider);
            // This is a simplified example. A real implementation would need to handle token decimals.
            const oraclePrice = await oracle.getPrice(tokenIn, tokenOut);
            const bestQuotePrice = parseFloat(bestQuote.amountOut) / parseFloat(bestQuote.amountIn);

            const priceDifference = Math.abs(bestQuotePrice - oraclePrice) / oraclePrice;
            if (priceDifference > (maxSlippagePct || 2) / 100) { // Default to 2% if not provided for oracle validation
                console.warn(`Warning: Best quote differs from Chainlink oracle by ${priceDifference * 100}%. This may indicate a stale price or an opportunity for arbitrage.`);
                // Depending on strictness, you might want to return null here.
                // For this example, we'll just log a warning.
            }
        } catch (error) {
            if (error instanceof Error) {
                console.error("Could not validate price against Chainlink oracle:", error.message);
            } else {
                console.error("Could not validate price against Chainlink oracle:", String(error));
            }
            // Depending on requirements, you might want to fail if the oracle is unavailable.
        }
    }


    if (maxSlippagePct) {
        const bestPrice = parseFloat(bestQuote.amountOut) / parseFloat(bestQuote.amountIn);
        validQuotes = validQuotes.filter(q => {
            const price = parseFloat(q.amountOut) / parseFloat(q.amountIn);
            const slippage = (bestPrice - price) / bestPrice;
            return slippage * 100 <= maxSlippagePct;
        });

        if (validQuotes.length === 0) {
            // This can happen if the only valid quote is the best one, and it gets filtered out by itself.
            // In this case, we should just return the best quote.
            return bestQuote;
        }

        bestQuote = validQuotes.reduce((best, current) => {
            if (BigInt(current.amountOut) > BigInt(best.amountOut)) {
                return current;
            }
            return best;
        });
    }


    return bestQuote;
  }
}
