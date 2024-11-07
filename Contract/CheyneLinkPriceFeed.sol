/*
How to and Guide here (Keep the name scabs)

Introduction

Contract for the Price Feed Bot with Firebase Functions
This project is a serverless bot deployed on Firebase Functions to fetch the current price of a token from the GeckoTerminal API and update it on-chain using a secure Ethereum smart contract. The bot leverages Firebase’s Secret Manager to securely handle sensitive information, such as the bot’s private key.

deployed firstly at https://basescan.org/address/0xe96FB24d029d94321336ddea22D63CE7cd4A491c#code

https://github.com/ArielRin/CheyneLINK-Price-feed-for-non-chainlink-supported-networks
*/


// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract CheyneLinkPriceFeed {
    uint256 private currentPrice;
    address private owner;

    event PriceUpdated(uint256 newPrice);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function updatePrice(uint256 newPrice) external onlyOwner {
        currentPrice = newPrice;
        emit PriceUpdated(newPrice);
    }

    function getPrice() external view returns (uint256) {
        return currentPrice;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
