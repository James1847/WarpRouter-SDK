import { ethers } from "ethers";

// This is a simplified example. In a real app, you'd have a mapping of token pairs to price feed addresses.
const ETH_USD_PRICE_FEED = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419"; // Mainnet
const LINK_ETH_PRICE_FEED = "0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c"; // Mainnet

const aggregatorV3InterfaceABI = [
  {
    "inputs": [],
    "name": "latestRoundData",
    "outputs": [
      { "internalType": "uint80", "name": "roundId", "type": "uint80" },
      { "internalType": "int256", "name": "answer", "type": "int256" },
      { "internalType": "uint256", "name": "startedAt", "type": "uint256" },
      { "internalType": "uint256", "name": "updatedAt", "type": "uint256" },
      { "internalType": "uint80", "name": "answeredInRound", "type": "uint80" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decimals",
    "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }],
    "stateMutability": "view",
    "type": "function"
  }
];

export class ChainlinkPriceOracle {
    private provider: ethers.Provider;

    constructor(provider: ethers.Provider) {
        this.provider = provider;
    }

    async getPrice(tokenIn: string, tokenOut: string): Promise<number> {
        // This is a very simplified implementation.
        // A real implementation would need to handle different token pairs and find the correct price feed.
        // It might also need to handle inverse prices or triangulate through a common base currency like USD.

        let feedAddress: string;

        if ((tokenIn.toUpperCase() === 'ETH' && tokenOut.toUpperCase() === 'USD') || (tokenIn.toUpperCase() === 'USD' && tokenOut.toUpperCase() === 'ETH')) {
            feedAddress = ETH_USD_PRICE_FEED;
        } else if ((tokenIn.toUpperCase() === 'LINK' && tokenOut.toUpperCase() === 'ETH') || (tokenIn.toUpperCase() === 'ETH' && tokenOut.toUpperCase() === 'LINK')) {
            feedAddress = LINK_ETH_PRICE_FEED;
        } else {
            throw new Error(`Price feed not found for ${tokenIn}/${tokenOut}`);
        }

        const priceFeed = new ethers.Contract(feedAddress, aggregatorV3InterfaceABI, this.provider);
        const roundData = await priceFeed.latestRoundData();
        const decimals = await priceFeed.decimals();
        const price = Number(roundData.answer) / 10**Number(decimals);

        if (tokenIn.toUpperCase() === 'USD' || tokenIn.toUpperCase() === 'ETH') {
            return price;
        } else {
            return 1 / price;
        }
    }
}

