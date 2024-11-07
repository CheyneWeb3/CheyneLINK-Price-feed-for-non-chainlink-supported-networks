require("dotenv").config();
const ethers = require("ethers");
const axios = require("axios");

// Environment Variables
const RPC_URL = process.env.RPC_URL;
const BOT_PRIVATE_KEY = process.env.BOT_PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const GECKOTERMINAL_API_URL = process.env.GECKOTERMINAL_API_URL;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;

const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL, 10) || 60000;
const PRICE_CHANGE_THRESHOLD = ethers.BigNumber.from(process.env.PRICE_CHANGE_THRESHOLD || "200");
const SCALE_FACTOR = ethers.BigNumber.from(process.env.SCALE_FACTOR || "10000");
const DEFAULT_GAS_LIMIT = ethers.utils.hexlify(parseInt(process.env.DEFAULT_GAS_LIMIT) || 50000);
const FALLBACK_MAX_FEE_PER_GAS = ethers.utils.parseUnits(process.env.MAX_FEE_PER_GAS_GWEI || "5", "gwei");
const FALLBACK_MAX_PRIORITY_FEE_PER_GAS = ethers.utils.parseUnits(process.env.MAX_PRIORITY_FEE_PER_GAS_GWEI || "1", "gwei");

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(BOT_PRIVATE_KEY, provider);
const abi = [
  "function updatePrice(uint256 newPrice) external",
  "function getPrice() view returns (uint256)"
];
const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

async function fetchGasPrices() {
  try {
    const gasPrice = await provider.getGasPrice();
    const maxFeePerGas = gasPrice.mul(125).div(100); // Add a 25% buffer to current gas price
    const maxPriorityFeePerGas = maxFeePerGas.div(2); // Ensure priority fee is always lower than max fee

    return { maxFeePerGas, maxPriorityFeePerGas };
  } catch (error) {
    console.warn("Error fetching gas prices, using fallback:", error);
    return {
      maxFeePerGas: FALLBACK_MAX_FEE_PER_GAS,
      maxPriorityFeePerGas: FALLBACK_MAX_PRIORITY_FEE_PER_GAS,
    };
  }
}

async function fetchCurrentPrice() {
  try {
    const response = await axios.get(GECKOTERMINAL_API_URL);
    const tokenPrice = parseFloat(response.data.data.attributes.token_prices[TOKEN_ADDRESS]);
    console.log(`\x1b[36mFetched price:\x1b[0m ${tokenPrice}`);
    return ethers.utils.parseUnits(tokenPrice.toString(), 18);
  } catch (error) {
    console.error("\x1b[31mError fetching price from GeckoTerminal:\x1b[0m", error);
    return null;
  }
}

async function updatePriceOnChain(newPrice) {
  try {
    const gasPrices = await fetchGasPrices();
    const tx = await contract.updatePrice(newPrice, {
      ...gasPrices,
      gasLimit: DEFAULT_GAS_LIMIT,
    });
    console.log("\x1b[32mTransaction sent:\x1b[0m", tx.hash);
    await tx.wait();
    console.log("\x1b[32mPrice updated on-chain:\x1b[0m", newPrice.toString());
  } catch (error) {
    if (error.code === 'INSUFFICIENT_FUNDS') {
      console.error("\x1b[31mError:\x1b[0m Insufficient funds for gas. Please add funds to the wallet.");
    } else if (error.code === 'UNPREDICTABLE_GAS_LIMIT') {
      console.error("\x1b[31mError:\x1b[0m Gas estimation failed. Adjust gas settings or check network status.");
    } else {
      console.error("\x1b[31mError updating price on-chain:\x1b[0m", error);
    }
  }
}

function startCountdown(seconds) {
  let remaining = seconds / 1000;
  const interval = setInterval(() => {
    process.stdout.write(`\r\x1b[34mNext fetch in:\x1b[0m ${remaining--}s  `);
    if (remaining < 0) {
      clearInterval(interval);
      console.log("\n");
      main();
    }
  }, 1000);
}

async function main() {
  try {
    const fetchedPrice = await fetchCurrentPrice();
    if (!fetchedPrice) return;

    const currentPriceOnChain = await contract.getPrice();
    const priceDifference = fetchedPrice.sub(currentPriceOnChain).abs();
    const thresholdValue = currentPriceOnChain.mul(PRICE_CHANGE_THRESHOLD).div(SCALE_FACTOR);

    if (priceDifference.gt(thresholdValue)) {
      console.log(`\x1b[33mPrice change significant\x1b[0m (${priceDifference.toString()} > ${thresholdValue.toString()}), updating...`);
      await updatePriceOnChain(fetchedPrice);
    } else {
      console.log("\x1b[33mPrice change not significant, no update needed.\x1b[0m");
    }
  } catch (error) {
    console.error("\x1b[31mError in main execution:\x1b[0m", error);
  } finally {
    startCountdown(CHECK_INTERVAL);
  }
}

// Run the script initially
main();
