// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SlitherBenchmarkUncheckedCall {
    function forward(address payable target) external payable {
        target.call{value: msg.value}("");
    }
}
