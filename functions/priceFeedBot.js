require("dotenv").config();
const ethers = require("ethers");
const WebSocket = require("ws");

// Environment Variables
const RPC_URL = process.env.RPC_URL;
const BOT_PRIVATE_KEY = process.env.BOT_PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const BOT_WALLET_ADDRESS = process.env.BOT_WALLET_ADDRESS;
const TOKEN_NAME = process.env.TOKEN_NAME || "Token";
const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL || "SYM";
const TOKEN_DECIMALS = parseInt(process.env.TOKEN_DECIMALS, 10) || 18;

const PRICE_CHANGE_THRESHOLD = ethers.BigNumber.from(process.env.PRICE_CHANGE_THRESHOLD || "100"); // 1% change threshold
const SCALE_FACTOR = ethers.BigNumber.from(process.env.SCALE_FACTOR || "10000");
const DEFAULT_GAS_LIMIT = ethers.utils.hexlify(parseInt(process.env.DEFAULT_GAS_LIMIT) || 50000);
const FALLBACK_MAX_FEE_PER_GAS = ethers.utils.parseUnits(process.env.MAX_FEE_PER_GAS_GWEI || "10", "gwei");
const FALLBACK_MAX_PRIORITY_FEE_PER_GAS = ethers.utils.parseUnits(process.env.MAX_PRIORITY_FEE_PER_GAS_GWEI || "2", "gwei");

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(BOT_PRIVATE_KEY, provider);
const abi = [
  "function updatePrice(uint256 newPrice) external",
  "function getPrice() view returns (uint256)",
  "function transferOwnership(address newOwner) external",
  "function owner() view returns (address)"
];
const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

function showHeader() {
  console.clear();
  console.log("CheyneLINK Price Feed Bot\n");
  console.log(`Monitoring ${TOKEN_NAME} (${TOKEN_SYMBOL}) and updating on-chain as needed.`);
  console.log("-------------------------------------------------------------");
}

async function ensureOwnership() {
  try {
    const currentOwner = await contract.owner();
    if (currentOwner.toLowerCase() !== BOT_WALLET_ADDRESS.toLowerCase()) {
      console.log("\x1b[33mTransferring ownership to bot wallet...\x1b[0m");
      const tx = await contract.transferOwnership(BOT_WALLET_ADDRESS, {
        gasLimit: DEFAULT_GAS_LIMIT,
        maxFeePerGas: FALLBACK_MAX_FEE_PER_GAS,
        maxPriorityFeePerGas: FALLBACK_MAX_PRIORITY_FEE_PER_GAS,
      });
      console.log("Ownership transfer transaction sent:", tx.hash);
      await tx.wait();
      console.log("Ownership transferred to bot wallet.");
    } else {
      console.log("Ownership already set to bot wallet.");
    }
  } catch (error) {
    console.error("\x1b[31mOwnership check failed:\x1b[0m", error);
  }
}

async function updatePriceOnChain(newPrice) {
  try {
    const gasPrice = await provider.getGasPrice();
    const tx = await contract.updatePrice(newPrice, {
      gasLimit: DEFAULT_GAS_LIMIT,
      gasPrice: gasPrice,
      type: 0, // Set transaction type to legacy for compatibility
    });
    console.log("\x1b[32mTransaction sent:\x1b[0m", tx.hash);
    await tx.wait();
    console.log("\x1b[32mPrice updated on-chain:\x1b[0m", newPrice.toString());
  } catch (error) {
    if (error.code === 'INSUFFICIENT_FUNDS') {
      console.error("\x1b[31mError:\x1b[0m Insufficient funds for gas. Please add funds to the wallet.");
    } else {
      console.error("\x1b[31mError updating price on-chain:\x1b[0m", error);
    }
  }
}

async function displayBotBalance() {
  try {
    const balance = await provider.getBalance(BOT_WALLET_ADDRESS);
    const formattedBalance = ethers.utils.formatEther(balance);
    const balanceStatus = balance.gte(ethers.utils.parseEther("0.0002"))
      ? "\x1b[32m\u25CF\x1b[0m" // Green circle
      : "\x1b[31m\u2716\x1b[0m"; // Red X
    console.log(`\x1b[36mBot's wallet balance:\x1b[0m ${formattedBalance} ETH ${balanceStatus}`);
  } catch (error) {
    console.error("\x1b[31mError fetching bot wallet balance:\x1b[0m", error);
  }
}

async function connectToWebSocket() {
  const ws = new WebSocket("wss://stream.binance.com:9443/ws/ethusdt@trade");

  ws.on("open", () => {
    console.log("Connected to Binance WebSocket for real-time ETH price.");
  });

  ws.on("message", async (data) => {
    const jsonData = JSON.parse(data);
    const price = parseFloat(jsonData.p);
    console.log(`\x1b[36mReal-time price update for ${TOKEN_NAME} (${TOKEN_SYMBOL}): $${price}\x1b[0m`);

    const newPrice = ethers.utils.parseUnits(price.toString(), TOKEN_DECIMALS);

    try {
      const currentPriceOnChain = await contract.getPrice();
      const priceDifference = newPrice.sub(currentPriceOnChain).abs();
      const thresholdValue = currentPriceOnChain.mul(PRICE_CHANGE_THRESHOLD).div(SCALE_FACTOR);

      if (priceDifference.gt(thresholdValue)) {
        console.log(`\x1b[33mPrice change significant\x1b[0m (${priceDifference.toString()} > ${thresholdValue.toString()}), updating...`);
        await updatePriceOnChain(newPrice);
      } else {
        console.log("\x1b[33mPrice change not significant, no update needed.\x1b[0m");
      }
    } catch (error) {
      console.error("Error during price comparison or update:", error);
    }
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });

  ws.on("close", () => {
    console.log("WebSocket connection closed. Reconnecting...");
    setTimeout(connectToWebSocket, 1000); // Attempt to reconnect after a short delay
  });
}

async function main() {
  showHeader();
  await ensureOwnership();
  await displayBotBalance();
  connectToWebSocket(); // Start WebSocket connection for live price feed
}

// Run the script initially
main();
