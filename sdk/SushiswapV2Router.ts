import { Contract, JsonRpcProvider, Interface } from "ethers";
import { DexQuote, DexRouter } from "./types";

const SUSHISWAP_V2_ROUTER_ADDRESS = "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F";
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const routerAbi = [
    "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)",
    "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
    "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
];

export class SushiswapV2Router implements DexRouter {
  private readonly provider: JsonRpcProvider;
  private readonly router: Contract;
  private readonly routerInterface: Interface;

  constructor(provider: JsonRpcProvider) {
    this.provider = provider;
    this.router = new Contract(SUSHISWAP_V2_ROUTER_ADDRESS, routerAbi, this.provider);
    this.routerInterface = new Interface(routerAbi);
  }

  async quoteExactIn(amountIn: string, tokenIn: string, tokenOut: string): Promise<DexQuote> {
    const path = [tokenIn, tokenOut];

    const amounts = await this.router.getAmountsOut.staticCall(amountIn, path);
    const amountOut = amounts[1];

    // For gas estimation, we use a dummy recipient and a minOut of 0 to prevent reverts
    const calldata = await this.buildTx(amountIn, "0", "0x0000000000000000000000000000000000000001", tokenIn, tokenOut);

    const gasEstimate = await this.provider.estimateGas({
        to: SUSHISWAP_V2_ROUTER_ADDRESS,
        data: calldata,
        value: tokenIn === WETH_ADDRESS ? amountIn : 0,
    });

    return {
      amountIn,
      amountOut: amountOut.toString(),
      dex: "SushiswapV2",
      calldata: calldata,
      gasEstimate: gasEstimate,
    };
  }

  async buildTx(amountIn: string, minOut: string, recipient: string, tokenIn: string, tokenOut: string): Promise<string> {
    const path = [tokenIn, tokenOut];
    const deadline = Math.floor(Date.now() / 1000) + 60 * 15; // 15 minutes from now

    if (tokenIn === WETH_ADDRESS) {
        return this.routerInterface.encodeFunctionData("swapExactETHForTokens", [
            minOut,
            path,
            recipient,
            deadline
        ]);
    } else {
        return this.routerInterface.encodeFunctionData("swapExactTokensForTokens", [
            amountIn,
            minOut,
            path,
            recipient,
            deadline
        ]);
    }
  }
}
