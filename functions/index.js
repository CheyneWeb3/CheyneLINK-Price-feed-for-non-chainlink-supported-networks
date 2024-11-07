//11 CheyneLinkPriceFeed Bot code
const { ethers } = require("ethers");
const axios = require("axios");
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const contractAddress = functions.config().contract.address; // Set in Firebase Config
const geckoTerminalAPI = functions.config().api.geckoterminal; // Set in Firebase Config
const infuraApiUrl = functions.config().infura.url; // Set in Firebase Config

const abi = [
  "function updatePrice(uint256 newPrice) external",
];

async function fetchPrice() {
  try {
    const response = await axios.get(geckoTerminalAPI);
    const price = response.data.data.price;
    return ethers.utils.parseUnits(price.toString(), 18);
  } catch (error) {
    console.error("Error fetching price:", error);
    return null;
  }
}

async function updatePriceOnChain(newPrice, wallet) {
  const provider = new ethers.providers.JsonRpcProvider(infuraApiUrl);
  const signer = wallet.connect(provider);
  const contract = new ethers.Contract(contractAddress, abi, signer);

  try {
    const tx = await contract.updatePrice(newPrice);
    console.log("Transaction hash:", tx.hash);
    await tx.wait();
    console.log("Price updated on-chain:", ethers.utils.formatUnits(newPrice, 18));
  } catch (error) {
    console.error("Error updating price on-chain:", error);
  }
}

exports.updateTokenPrice = functions.pubsub.schedule("every 15 minutes").onRun(async () => {
  const price = await fetchPrice();
  if (!price) {
    console.log("Failed to fetch price.");
    return;
  }

  // Retrieve the private key securely using Firebase Secret Manager
  const privateKey = await functions.config().secret.private_key;
  const wallet = new ethers.Wallet(privateKey);

  await updatePriceOnChain(price, wallet);
});
