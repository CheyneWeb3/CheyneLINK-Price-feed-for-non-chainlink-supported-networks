require("dotenv").config();
const ethers = require("ethers");
const WebSocket = require("ws");

// Load Environment Variables
const {
  RPC_URL,
  BOT_PRIVATE_KEY,
  CONTRACT_ADDRESS,
  BOT_WALLET_ADDRESS,
  TOKEN_NAME,
  TOKEN_SYMBOL,
  PRICE_CHANGE_THRESHOLD,
  DEFAULT_GAS_LIMIT,
  MAX_FEE_PER_GAS_GWEI,
  WEBSOCKET_URL,
} = process.env;

// Set up constants and conversion factors
const THRESHOLD_PERCENT = parseFloat(PRICE_CHANGE_THRESHOLD) / 100000;
const DEFAULT_GAS_LIMIT_HEX = ethers.utils.hexlify(parseInt(DEFAULT_GAS_LIMIT, 10));
const INITIAL_GAS_PRICE = ethers.utils.parseUnits(MAX_FEE_PER_GAS_GWEI, "gwei");
const GAS_INCREMENT = ethers.utils.parseUnits("1", "gwei");

// Initialize provider, wallet, and contract
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(BOT_PRIVATE_KEY, provider);
const contractABI = [
  "function updatePrice(uint256 newPrice) external",
  "function getPrice() view returns (uint256)",
  "function transferOwnership(address newOwner) external",
  "function owner() view returns (address)"
];
const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, wallet);

let transactionCount = 0;
let isUpdating = false;

// Display bot header
function showHeader() {
  console.clear();
  console.log("CheyneLINK Price Feed Bot\n");
  console.log(`Token: ${TOKEN_NAME} (${TOKEN_SYMBOL})`);
  console.log(`Price Change Threshold: ±${(THRESHOLD_PERCENT * 100).toFixed(2)}%`);
  console.log("-------------------------------------------------------------");
}

// Display bot wallet balance
async function displayBotBalance() {
  try {
    const balance = await provider.getBalance(BOT_WALLET_ADDRESS);
    console.log(`Bot's Wallet Balance: ${ethers.utils.formatEther(balance)} ETH`);
  } catch (error) {
    console.error("Error fetching wallet balance:", error);
  }
}

// Update price on-chain with retry logic for gas pricing and nonce
async function updatePriceOnChain(newPrice, gasPrice = INITIAL_GAS_PRICE) {
  if (isUpdating) return;

  isUpdating = true;
  try {
    const nonce = await provider.getTransactionCount(wallet.address, "latest");
    const txOptions = { nonce, gasLimit: DEFAULT_GAS_LIMIT_HEX, gasPrice };

    const tx = await contract.updatePrice(newPrice, txOptions);
    console.log("Transaction sent:", tx.hash);
    const receipt = await tx.wait();
    console.log("Transaction confirmed:", receipt.transactionHash);

    transactionCount++;
  } catch (error) {
    await handleUpdateError(error, newPrice, gasPrice);
  } finally {
    isUpdating = false;
  }
}

// Handle errors in updatePriceOnChain with custom retry logic
async function handleUpdateError(error, newPrice, gasPrice) {
  if (error.code === 'REPLACEMENT_UNDERPRICED') {
    console.log("Increasing gas price and retrying...");
    await updatePriceOnChain(newPrice, gasPrice.add(GAS_INCREMENT));
  } else if (error.code === 'NONCE_EXPIRED') {
    console.log("Retrying with latest nonce...");
    await updatePriceOnChain(newPrice, gasPrice);
  } else if (error.code === 'UNSUPPORTED_OPERATION') {
    console.log("Retrying with fallback gas price...");
    await updatePriceOnChain(newPrice, ethers.utils.parseUnits("20", "gwei"));
  } else {
    console.error("Failed to update price on-chain:", error);
  }
}

// Connect to WebSocket for real-time price feed and process messages
async function connectToWebSocket() {
  const ws = new WebSocket(WEBSOCKET_URL);

  ws.on("open", () => {
    console.log("Connected to WebSocket for real-time price feed.");
  });

  ws.on("message", async (data) => {
    try {
      const { p: livePrice } = JSON.parse(data);
      const formattedLivePrice = ethers.utils.parseUnits(parseFloat(livePrice).toFixed(8), 8);

      const onChainPrice = await fetchOnChainPrice();
      if (onChainPrice) {
        const priceDifference = formattedLivePrice.sub(onChainPrice).abs();
        const thresholdValue = parseFloat(livePrice) * THRESHOLD_PERCENT / 10;

        showHeader();
        console.log(`Live Price Feed: $${livePrice}`);
        console.log(`On-Chain Price: $${ethers.utils.formatUnits(onChainPrice, 8)}`);
        console.log(`Threshold Value: ±$${thresholdValue.toFixed(2)}`);
        console.log(`Session Transactions: ${transactionCount}`);

        if (priceDifference.gt(ethers.utils.parseUnits(thresholdValue.toFixed(8), 8))) {
          console.log("Significant price change detected, updating...");
          await updatePriceOnChain(formattedLivePrice);
        } else {
          console.log("No significant price change.");
        }
      }
    } catch (error) {
      console.error("Error processing WebSocket message:", error);
    }
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });

  ws.on("close", () => {
    console.log("WebSocket disconnected, attempting to reconnect...");
    setTimeout(connectToWebSocket, 1000);
  });
}

// Fetch current on-chain price with error handling
async function fetchOnChainPrice() {
  try {
    const price = await contract.getPrice();
    return price;
  } catch (error) {
    console.error("Error fetching on-chain price:", {
      message: error.message,
      code: error.code,
      reason: error.reason,
      data: error.data,
    });
    return null;
  }
}

// Main function to start bot and connect to WebSocket
async function main() {
  showHeader();
  await displayBotBalance();
  connectToWebSocket();
}

main();
