require("dotenv").config();
const ethers = require("ethers");
const axios = require("axios");
const readline = require("readline");

// Environment Variables
const RPC_URL = process.env.RPC_URL;
const BOT_PRIVATE_KEY = process.env.BOT_PRIVATE_KEY;
const BOT_WALLET_ADDRESS = process.env.BOT_WALLET_ADDRESS;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const TOKEN_NAME = process.env.TOKEN_NAME || "Unknown Token";
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
const GECKOTERMINAL_API_URL = process.env.GECKOTERMINAL_API_URL;
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL, 10) || 60000;
const PRICE_CHANGE_THRESHOLD = ethers.BigNumber.from(process.env.PRICE_CHANGE_THRESHOLD || "100");
const SCALE_FACTOR = ethers.BigNumber.from(process.env.SCALE_FACTOR || "10000");
const DEFAULT_GAS_LIMIT = ethers.utils.hexlify(parseInt(process.env.DEFAULT_GAS_LIMIT, 10) || 300000);
const MIN_ETH_BALANCE = ethers.utils.parseEther("0.000002");

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(BOT_PRIVATE_KEY, provider);
const abi = [
  "function updatePrice(uint256 newPrice) external",
  "function getPrice() view returns (uint256)"
];
const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

let lastFetchedPrice = null;
let lastUpdate = "N/A";

// Helper function to fetch gas prices
async function fetchGasPrices() {
  try {
    const gasPrice = await provider.getGasPrice();
    const maxFeePerGas = gasPrice.mul(2);
    const maxPriorityFeePerGas = ethers.utils.parseUnits("1", "gwei");

    return {
      maxFeePerGas: maxFeePerGas.gte(maxPriorityFeePerGas) ? maxFeePerGas : maxPriorityFeePerGas.mul(2),
      maxPriorityFeePerGas
    };
  } catch (error) {
    console.warn("Error fetching gas prices, using fallback:", error);
    return {
      maxFeePerGas: ethers.utils.parseUnits("10", "gwei"),
      maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei"),
    };
  }
}

// Helper function to fetch the token price
async function fetchCurrentPrice() {
  try {
    const response = await axios.get(GECKOTERMINAL_API_URL);
    const tokenPrice = parseFloat(response.data.data.attributes.token_prices[TOKEN_ADDRESS]);
    lastFetchedPrice = ethers.utils.parseUnits(tokenPrice.toString(), 18);
    return lastFetchedPrice;
  } catch (error) {
    console.error("Error fetching price from GeckoTerminal:", error);
    return null;
  }
}

// Helper function to check the bot's ETH balance
async function fetchBotBalance() {
  const balance = await provider.getBalance(BOT_WALLET_ADDRESS);
  const sufficientFunds = balance.gte(MIN_ETH_BALANCE);
  return { balance, sufficientFunds };
}

// Helper function to update the price on-chain
async function updatePriceOnChain(newPrice) {
  try {
    const gasPrices = await fetchGasPrices();
    const tx = await contract.updatePrice(newPrice, {
      ...gasPrices,
      gasLimit: DEFAULT_GAS_LIMIT,
    });
    await tx.wait();
    lastUpdate = new Date().toLocaleTimeString();
    displayDashboard("Price updated on-chain", newPrice.toString());
  } catch (error) {
    displayDashboard("Error updating price on-chain", error.message);
  }
}

// Countdown display
function startCountdown(seconds) {
  let remaining = seconds / 1000;
  const interval = setInterval(() => {
    readline.cursorTo(process.stdout, 0);
    displayDashboard("Waiting for next fetch", `Next update in: ${remaining--}s`);
    if (remaining < 0) {
      clearInterval(interval);
      main();
    }
  }, 1000);
}

// Display the dashboard in the console
async function displayDashboard(status, details) {
  const { balance, sufficientFunds } = await fetchBotBalance();
  const balanceDisplay = ethers.utils.formatEther(balance);

  console.clear();
  console.log("=".repeat(50));
  console.log("      Welcome to CheyneLink Price Feed Bot");
  console.log("=".repeat(50));
  console.log(`\x1b[36mWallet Address:\x1b[0m ${BOT_WALLET_ADDRESS}`);
  console.log(`\x1b[36mToken Name:\x1b[0m ${TOKEN_NAME}`);
  console.log(`\x1b[36mToken Address:\x1b[0m ${TOKEN_ADDRESS}`);
  console.log(`\x1b[36mBot ETH Balance:\x1b[0m ${balanceDisplay} ETH ${sufficientFunds ? "\x1b[32m✔\x1b[0m" : "\x1b[31m✘\x1b[0m"}`);
  console.log(`\x1b[36mStatus:\x1b[0m ${status}`);
  console.log(`\x1b[36mDetails:\x1b[0m ${details}`);
  console.log(`\x1b[36mLast Price Update:\x1b[0m ${lastUpdate}`);
  console.log(`\x1b[36mCurrent Price:\x1b[0m ${lastFetchedPrice ? ethers.utils.formatUnits(lastFetchedPrice, 18) : "Fetching..."}`);
  console.log("\n");
}

// Main execution
async function main() {
  const fetchedPrice = await fetchCurrentPrice();
  if (!fetchedPrice) {
    displayDashboard("Error", "Failed to fetch price");
    startCountdown(CHECK_INTERVAL);
    return;
  }

  const currentPriceOnChain = await contract.getPrice();
  const priceDifference = fetchedPrice.sub(currentPriceOnChain).abs();
  const thresholdValue = currentPriceOnChain.mul(PRICE_CHANGE_THRESHOLD).div(SCALE_FACTOR);

  if (priceDifference.gt(thresholdValue)) {
    displayDashboard("Significant price change detected", `Updating on-chain to ${ethers.utils.formatUnits(fetchedPrice, 18)}`);
    await updatePriceOnChain(fetchedPrice);
  } else {
    displayDashboard("Price change not significant", `Current Price: ${ethers.utils.formatUnits(fetchedPrice, 18)}`);
  }

  startCountdown(CHECK_INTERVAL);
}

// Start the bot
main();
