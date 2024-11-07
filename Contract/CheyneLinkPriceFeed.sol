/*
How to and Guide here (Keep the name scabs)

Introduction

https://github.com/ArielRin/CheyneLINK-Price-feed-for-non-chainlink-supported-networks



                                                                                                       ....       .
              .:==:.                                                                                   .   ....
           .-=+++++++-:.                                                                               .       ...
       .:=++++++++++++++=:.                                                                           ....
    .-=+++++++++++++++++++++-:                                                                        .   ......
  -+++++++++++-:. .-=++++++++++-                                                                     ..         ...
  =+++++++=:.        .:=++++++++                                                      .--  -=:       ....:-:
  =+++++=.               -++++++  .-=++=-:  -=.                                       .++  --:      ..   :+-.......
  =+++++-                :++++++ .++:..:==. =+::::.   .:::. .::   :: .:.:::.   .:::.  .++  :-. .--:==-.  :+- .---.
  =+++++-                :++++++ -+-        =+=:-++..=+-:=+:.++. :+- -++-:++: -+-:=+: .++  =+: .++-:-++. :+-:++-.
  =+++++-                :++++++ -+=    ::. =+:  ++.:++--=+- :+=.++. -+-  =+-.++---+= .++  =+: .+= . =+: :++++-....
  =+++++-                :++++++ .=+=::-++. =+:  ++..++:.-=.  -+++.  -+-  -+- =+-.-=: .++  =+: .+= . =+: :+=.-+=. .
  =++++++=:.          .:-+++++++   .:---:   :-.  :-. .:---.    ++:   :-.  :-.  :---:  .--  :-. .--.. --..:-:..:--..
  =+++++++++=-.    .:=++++++++++                             =++-                                 ....            .
  .:-+++++++++++--+++++++++++-:.                                                                  .         .......
      .:=++++++++++++++++=-.                                                                     .   .......     .
          :-++++++++++-:.                                                                        ....        ......
             .:=++=-.                                                                           .       .....     .
                 .                                                                              .   ....      ....

*/



// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

contract CheyneLinkPriceFeed {
    uint256 private currentPrice;
    address public owner;

    event PriceUpdated(uint256 newPrice);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), owner);
    }

    // Function to transfer ownership
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner is zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // Function to update the price, restricted to the owner
    function updatePrice(uint256 newPrice) external onlyOwner {
        currentPrice = newPrice;
        emit PriceUpdated(newPrice);
    }

    function getPrice() external view returns (uint256) {
        return currentPrice;
    }


    function latestAnswer() external view returns (uint256) {
        return currentPrice;
    }

    receive() external payable {}

    function withdrawEth() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }
}
