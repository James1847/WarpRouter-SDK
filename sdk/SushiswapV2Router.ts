import { Contract, JsonRpcProvider, Interface, parseEther, formatUnits } from "ethers";
import { DexQuote, DexRouter } from "./types";

const SUSHISWAP_V2_ROUTER_ADDRESS = "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F";
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // Example, should be dynamic

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
    const amountInWei = parseEther(amountIn); // Assumes 18 decimals

    const tokenInAddress = tokenIn.toUpperCase() === 'ETH' ? WETH_ADDRESS : tokenIn;
    const path = [tokenInAddress, tokenOut];

    const amounts = await this.router.getAmountsOut.staticCall(amountInWei, path);
    const amountOut = amounts[1];

    // For gas estimation, we use a dummy recipient and a minOut of 0 to prevent reverts
    const calldata = await this.buildTx(amountIn, "0", "0x0000000000000000000000000000000000000001", tokenIn, tokenOut);

    const gasEstimate = await this.provider.estimateGas({
        to: SUSHISWAP_V2_ROUTER_ADDRESS,
        data: calldata,
        value: tokenIn.toUpperCase() === 'ETH' ? amountInWei : 0,
    });

    return {
      amountIn,
      amountOut: formatUnits(amountOut, 18), // Assumes 18 decimals
      dex: "SushiswapV2",
      calldata: calldata,
      gasEstimate: gasEstimate,
    };
  }

  async buildTx(amountIn: string, minOut: string, recipient: string, tokenIn: string, tokenOut: string): Promise<string> {
    const amountInWei = parseEther(amountIn);
    const minOutWei = parseEther(minOut);
    const tokenInAddress = tokenIn.toUpperCase() === 'ETH' ? WETH_ADDRESS : tokenIn;
    const path = [tokenInAddress, tokenOut];
    const deadline = Math.floor(Date.now() / 1000) + 60 * 15; // 15 minutes from now

    if (tokenIn.toUpperCase() === 'ETH') {
        return this.routerInterface.encodeFunctionData("swapExactETHForTokens", [
            minOutWei,
            path,
            recipient,
            deadline
        ]);
    } else {
        return this.routerInterface.encodeFunctionData("swapExactTokensForTokens", [
            amountInWei,
            minOutWei,
            path,
            recipient,
            deadline
        ]);
    }
  }
}
