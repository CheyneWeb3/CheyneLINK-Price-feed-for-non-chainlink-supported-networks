
# Price Feed Bot with Firebase Functions

This project is a serverless bot deployed on Firebase Functions to fetch the current price of a token from the GeckoTerminal API and update it on-chain using a secure Ethereum smart contract. The bot leverages Firebase’s Secret Manager to securely handle sensitive information, such as the bot’s private key.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Project Setup](#project-setup)
3. [Storing Sensitive Data](#storing-sensitive-data)
4. [Configuring Firebase](#configuring-firebase)
5. [Deploying the Firebase Function](#deploying-the-firebase-function)
6. [How It Works](#how-it-works)
7. [Important Security Considerations](#important-security-considerations)

## Prerequisites

- **Firebase Account**: [Firebase Console](https://console.firebase.google.com/)
- **Node.js and npm**: [Install Node.js](https://nodejs.org/)
- **Firebase CLI**: Install with `npm install -g firebase-tools`
- **Ethereum Node Provider** (e.g., Infura): To connect to Ethereum’s network

## Project Setup

**Contract link ** Deploy Contract (not in this scope)
https://basescan.org/address/0xe96FB24d029d94321336ddea22D63CE7cd4A491c#code

1. **Clone or initialize a project directory** for the bot, and install Firebase functions:

    ```bash
    firebase login
    firebase init functions
    ```

    - When prompted, select **Functions** and initialize with JavaScript or TypeScript.
    - Choose to install dependencies if prompted.

2. **Install required packages** in the `functions` directory:

    ```bash
    cd functions
    npm install ethers axios
    ```

3. **Create the function script** in `functions/index.js` (or `index.ts` for TypeScript).

## Storing Sensitive Data

To securely store the bot’s private key and encryption password, use Firebase’s Secret Manager.

1. **Add secrets to Firebase**:

    ```bash
    firebase functions:secrets:set PRIVATE_KEY
    firebase functions:secrets:set ENCRYPTION_PASSWORD
    ```

2. **Configure additional environment variables** for API URLs and contract addresses:

    ```bash
    firebase functions:config:set api.geckoterminal="https://api.geckoterminal.com/api/v1/price/your_token_id"
    firebase functions:config:set infura.url="https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID"
    firebase functions:config:set contract.address="your_contract_address_here"
    ```

## Configuring Firebase

In your `index.js` file, set up the function to securely fetch, decrypt, and update the token price.

```javascript
const { ethers } = require("ethers");
const axios = require("axios");
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const contractAddress = functions.config().contract.address;
const geckoTerminalAPI = functions.config().api.geckoterminal;
const infuraApiUrl = functions.config().infura.url;

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
```

## Deploying the Firebase Function

To deploy the function to Firebase:

```bash
firebase deploy --only functions
```

This will deploy the `updateTokenPrice` function, which will run every 15 minutes as scheduled.

## How It Works

1. **Scheduled Function**: The Firebase Function runs every 15 minutes to fetch the latest token price.
2. **Fetching Price**: The function retrieves the price from GeckoTerminal's API.
3. **Updating Smart Contract**: Using the bot’s private key (retrieved securely from Firebase Secret Manager), the function signs and sends a transaction to update the price in the smart contract on-chain.
4. **Access Control**: Only the designated wallet (bot) can call the `updatePrice` function in the contract.

## Important Security Considerations

- **Secret Storage**: Using Firebase Secret Manager keeps sensitive data out of your source code.
- **Access Control**: Ensure only the bot’s address can update the contract to prevent unauthorized changes.
- **Rate Limits**: Ensure GeckoTerminal API usage complies with rate limits to avoid service interruptions.
- **Environment Configuration**: Avoid storing secrets in `.env` files in production; use Firebase Config instead.

---

This setup securely fetches live token prices and updates the contract, making it accessible to other smart contracts for real-time data.
