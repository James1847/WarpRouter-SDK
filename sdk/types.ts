export interface DexQuote {
  amountIn: string;
  amountOut: string;
  dex: 'UniswapV3' | 'SushiswapV2';
  calldata: string;
  gasEstimate: bigint;
}

export interface DexRouter {
  quoteExactIn(amountIn: string, tokenIn: string, tokenOut: string): Promise<DexQuote>;
  buildTx(amountIn: string, minOut: string, recipient: string, tokenIn: string, tokenOut: string): Promise<string>;
}
