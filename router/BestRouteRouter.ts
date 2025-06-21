import { DexQuote, DexRouter } from "../sdk/types";

interface QuoteOptions {
  amountIn: string;
  tokenIn: string;
  tokenOut: string;
}

export class BestRouteRouter {
  static async getBestQuote(routers: DexRouter[], options: QuoteOptions): Promise<DexQuote | null> {
    const { amountIn, tokenIn, tokenOut } = options;

    const quotes = await Promise.all(
      routers.map(router => router.quoteExactIn(amountIn, tokenIn, tokenOut))
    );

    const validQuotes = quotes.filter(q => q !== null && parseFloat(q.amountOut) > 0);

    if (validQuotes.length === 0) {
      return null;
    }

    // Simple comparison: choose the route with the highest amountOut.
    // The more advanced gas-cost-based comparison can be re-implemented later.
    const bestQuote = validQuotes.reduce((best, current) => {
      if (parseFloat(current.amountOut) > parseFloat(best.amountOut)) {
        return current;
      }
      return best;
    });

    return bestQuote;
  }
}
