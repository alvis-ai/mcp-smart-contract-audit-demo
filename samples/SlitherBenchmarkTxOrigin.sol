// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SlitherBenchmarkTxOrigin {
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    function privilegedAction() external view returns (bool) {
        require(tx.origin == owner, "owner only");
        return true;
    }
}
