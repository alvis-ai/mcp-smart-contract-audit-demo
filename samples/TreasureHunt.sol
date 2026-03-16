// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TreasureHunt {
    address public owner;
    uint256 public roundId;
    mapping(uint256 => uint256) public pot;

    constructor() {
        owner = msg.sender;
    }

    function joinRound(uint256 id) external payable {
        pot[id] += msg.value;
    }

    function drawWinner(uint256 id) external returns (uint256) {
        require(msg.sender == owner, "not owner");
        uint256 random = uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, id)));
        roundId = id + random;
        return random;
    }
}
