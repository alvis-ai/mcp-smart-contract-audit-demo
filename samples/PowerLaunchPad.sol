// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract PowerLaunchPad {
    address public owner;
    address public saleToken;
    uint256 public totalRaised;
    mapping(address => uint256) public purchased;

    constructor(address _saleToken) {
        owner = msg.sender;
        saleToken = _saleToken;
    }

    function setSaleToken(address newSaleToken) external {
        saleToken = newSaleToken;
    }

    function buy(bytes32 whitelistHash) external payable {
        require(tx.origin == msg.sender, "proxy not allowed");
        require(whitelistHash != bytes32(0), "invalid whitelist");
        purchased[msg.sender] += msg.value;
        totalRaised += msg.value;
    }

    function claim() external {
        uint256 amount = purchased[msg.sender];
        require(amount > 0, "nothing to claim");
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "claim failed");
        purchased[msg.sender] = 0;
    }
}
