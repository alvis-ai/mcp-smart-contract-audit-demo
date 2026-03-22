# Example Requests

这个文档提供几个最小可用的 MCP JSON-RPC 请求示例，方便直接联调。

## 1. initialize

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"demo-client","version":"0.1.0"}}}
```

## 2. tools/list

```json
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
```

## 3. 审计线上已部署合约地址

```json
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"audit_contract_address","arguments":{"address":"0x1234567890abcdef1234567890abcdef12345678","chainId":1}}}
```

## 4. 审计 LaunchPad 示例合约

```json
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"audit_contract_file","arguments":{"path":"samples/PowerLaunchPad.sol","contractType":"launchpad"}}}
```

## 5. 直接审计 Solidity 代码

```json
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"audit_contract_code","arguments":{"contractType":"nft","code":"pragma solidity ^0.8.20; contract Demo { function mint() external {} }"}}}
```

## 6. 查询 LaunchPad 知识库

```json
{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"search_audit_knowledge","arguments":{"query":"launchpad whitelist replay claim refund access control","topic":"launchpad"}}}
```

## 7. 生成借贷协议审计清单

```json
{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"generate_audit_checklist","arguments":{"projectType":"lending"}}}
```

## 8. 读取 LaunchPad 风险资源

```json
{"jsonrpc":"2.0","id":8,"method":"resources/read","params":{"uri":"kb://audit/launchpad"}}
```

## 9. 获取 LaunchPad 审计工作流 Prompt

```json
{"jsonrpc":"2.0","id":9,"method":"prompts/get","params":{"name":"launchpad_audit_skill","arguments":{"contract_name":"PowerLaunchPad","risk_focus":"whitelist signatures and claim flow"}}}
```

## 10. initialized 通知

```json
{"jsonrpc":"2.0","method":"notifications/initialized"}
```

## 推荐演示顺序

1. `initialize`
2. `tools/list`
3. `resources/read`
4. `tools/call` 审计线上地址或示例合约
5. `tools/call` 检索知识库
6. `prompts/get`

## CLI 示例

```bash
node scripts/audit-address.js 0x1234567890abcdef1234567890abcdef12345678 1 launchpad
```

## HTTP 启动示例

```bash
PORT=3000 HOST=127.0.0.1 node src/http-server.js
```

## HTTP 调用示例

```bash
curl -X POST http://127.0.0.1:3000/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0.1.0"}}}'
```
