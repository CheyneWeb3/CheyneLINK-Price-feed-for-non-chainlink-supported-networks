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
