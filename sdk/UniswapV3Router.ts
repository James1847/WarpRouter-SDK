import { Contract, JsonRpcProvider, Interface, parseEther, formatUnits } from "ethers";
import { DexQuote, DexRouter } from "./types";

const UNISWAP_V3_QUOTER_ADDRESS = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6";
const UNISWAP_V3_ROUTER_ADDRESS = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // Example, should be dynamic

const quoterAbi = [
    "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)"
];

const routerAbi = [
    "function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
];

export class UniswapV3Router implements DexRouter {
  private readonly provider: JsonRpcProvider;
  private readonly quoter: Contract;
  private readonly routerInterface: Interface;

  constructor(provider: JsonRpcProvider) {
    this.provider = provider;
    this.quoter = new Contract(UNISWAP_V3_QUOTER_ADDRESS, quoterAbi, this.provider);
    this.routerInterface = new Interface(routerAbi);
  }

  async quoteExactIn(amountIn: string, tokenIn: string, tokenOut: string): Promise<DexQuote> {
    // For simplicity, we'll use a fixed fee tier. In a real app, this should be determined dynamically.
    const fee = 3000; // 0.3%
    const amountInWei = parseEther(amountIn); // Assumes 18 decimals for input token

    // If tokenIn is "ETH", we use WETH address
    const tokenInAddress = tokenIn.toUpperCase() === 'ETH' ? WETH_ADDRESS : tokenIn;

    const amountOut = await this.quoter.quoteExactInputSingle.staticCall(
        tokenInAddress,
        tokenOut,
        fee,
        amountInWei,
        0
    );

    // For gas estimation, we use a dummy recipient and a minOut of 0 to prevent "STF" reverts
    const calldata = await this.buildTx(amountIn, "0", "0x0000000000000000000000000000000000000001", tokenIn, tokenOut);

    const gasEstimate = await this.provider.estimateGas({
        to: UNISWAP_V3_ROUTER_ADDRESS,
        data: calldata,
        value: tokenIn.toUpperCase() === 'ETH' ? amountInWei : 0,
    });

    return {
      amountIn,
      amountOut: formatUnits(amountOut, 18), // Assumes 18 decimals for output token
      dex: "UniswapV3",
      calldata: calldata,
      gasEstimate: gasEstimate,
    };
  }

  async buildTx(amountIn: string, minOut: string, recipient: string, tokenIn: string, tokenOut: string): Promise<string> {
    const amountInWei = parseEther(amountIn);
    const minOutWei = parseEther(minOut);
    const tokenInAddress = tokenIn.toUpperCase() === 'ETH' ? WETH_ADDRESS : tokenIn;

    // Deadline is 15 minutes from now
    const deadline = Math.floor(Date.now() / 1000) + 60 * 15;

    const params = {
      tokenIn: tokenInAddress,
      tokenOut: tokenOut,
      fee: 3000, // 0.3%
      recipient: recipient,
      deadline: deadline,
      amountIn: amountInWei,
      amountOutMinimum: minOutWei,
      sqrtPriceLimitX96: 0,
    };

    return this.routerInterface.encodeFunctionData("exactInputSingle", [params]);
  }
}
