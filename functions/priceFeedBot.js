require("dotenv").config();
const ethers = require("ethers");
const WebSocket = require("ws");

// Environment Variables
const RPC_URL = process.env.RPC_URL;
const BOT_PRIVATE_KEY = process.env.BOT_PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const BOT_WALLET_ADDRESS = process.env.BOT_WALLET_ADDRESS;
const TOKEN_NAME = process.env.TOKEN_NAME;
const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL;
const TOKEN_DECIMALS = parseInt(process.env.TOKEN_DECIMALS, 10);
const PRICE_CHANGE_THRESHOLD = parseFloat(process.env.PRICE_CHANGE_THRESHOLD) / 100000;
const DEFAULT_GAS_LIMIT = ethers.utils.hexlify(parseInt(process.env.DEFAULT_GAS_LIMIT, 10));
const INITIAL_GAS_PRICE_GWEI = ethers.utils.parseUnits(process.env.MAX_FEE_PER_GAS_GWEI, "gwei");
const GAS_PRICE_INCREMENT_GWEI = ethers.utils.parseUnits("1", "gwei"); // Increment by 1 gwei if underpriced

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(BOT_PRIVATE_KEY, provider);
const abi = [
  "function updatePrice(uint256 newPrice) external",
  "function getPrice() view returns (uint256)",
  "function transferOwnership(address newOwner) external",
  "function owner() view returns (address)"
];
const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

let sessionTransactionCount = 0;

async function showHeader() {
  console.clear();
  console.log("CheyneLINK Price Feed Bot\n");
  console.log(`Token: ${TOKEN_NAME} (${TOKEN_SYMBOL})`);
  console.log(`Threshold: ±${(PRICE_CHANGE_THRESHOLD * 100).toFixed(2)}%`);
  console.log("-------------------------------------------------------------");
}

async function displayBotBalance() {
  try {
    const balance = await provider.getBalance(BOT_WALLET_ADDRESS);
    const formattedBalance = ethers.utils.formatEther(balance);
    console.log(`Bot's wallet balance: ${formattedBalance} ETH`);
  } catch (error) {
    console.error("Error fetching bot wallet balance:", error);
  }
}

let isUpdating = false;

async function updatePriceOnChain(newPrice, retryGasPrice = INITIAL_GAS_PRICE_GWEI) {
  if (isUpdating) {
    console.log("Update already in progress. Skipping this update attempt.");
    return;
  }

  isUpdating = true;
  try {
    const latestNonce = await provider.getTransactionCount(wallet.address, "latest");

    const txOptions = {
      nonce: latestNonce,
      gasLimit: DEFAULT_GAS_LIMIT,
      gasPrice: retryGasPrice,
    };

    const tx = await contract.updatePrice(newPrice, txOptions);
    console.log("Transaction sent:", tx.hash);
    const receipt = await tx.wait();
    console.log("Transaction confirmed:", receipt.transactionHash);

    sessionTransactionCount++;
  } catch (error) {
    if (error.code === 'REPLACEMENT_UNDERPRICED') {
      console.log("Replacement transaction underpriced. Retrying with higher gas price...");
      const increasedGasPrice = retryGasPrice.add(GAS_PRICE_INCREMENT_GWEI);
      await updatePriceOnChain(newPrice, increasedGasPrice);
    } else if (error.code === 'NONCE_EXPIRED') {
      console.log("Nonce expired. Retrying with latest nonce...");
      await updatePriceOnChain(newPrice, retryGasPrice);
    } else if (error.code === 'UNSUPPORTED_OPERATION') {
      console.log("Unsupported operation for gas data. Retrying with simple gas price...");
      await updatePriceOnChain(newPrice, ethers.utils.parseUnits("20", "gwei")); // Fallback gas price
    } else {
      console.error("Error updating price on-chain:", error);
    }
  } finally {
    isUpdating = false; // Reset the flag after the transaction completes or fails
  }
}

async function connectToWebSocket() {
  const ws = new WebSocket("wss://stream.binance.com:9443/ws/ethusdt@trade");

  ws.on("open", () => {
    console.log("Connected to Binance WebSocket for real-time ETH price.");
  });

  ws.on("message", async (data) => {
    const jsonData = JSON.parse(data);
    const livePrice = parseFloat(jsonData.p);
    const newPrice = ethers.utils.parseUnits(livePrice.toFixed(2), TOKEN_DECIMALS);

    try {
      const onChainPrice = await contract.getPrice();
      const priceDifference = newPrice.sub(onChainPrice).abs();
      const thresholdDollarValue = livePrice * PRICE_CHANGE_THRESHOLD /10;

      showHeader();
      console.log(`Live Price Feed: $${livePrice}`);
      console.log(`On-Chain Price: $${ethers.utils.formatUnits(onChainPrice, TOKEN_DECIMALS)}`);
      console.log(`Threshold Dollar Value: ±$${thresholdDollarValue.toFixed(2)}`);
      console.log(`Session Transactions: ${sessionTransactionCount}`);

      if (priceDifference.gt(ethers.utils.parseUnits(thresholdDollarValue.toFixed(2), TOKEN_DECIMALS))) {
        console.log("Price change significant, updating...");
        await updatePriceOnChain(newPrice);
      } else {
        console.log("Price change not significant, no update needed.");
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
    setTimeout(connectToWebSocket, 1000);
  });
}

async function main() {
  showHeader();
  await displayBotBalance();
  connectToWebSocket();
}

main();
