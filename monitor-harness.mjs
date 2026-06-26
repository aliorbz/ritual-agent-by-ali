import {
  createPublicClient,
  formatEther,
  http,
} from "../ritual-chain-workshop/hardhat/node_modules/viem/_esm/index.js";

const [, , harnessArg] = process.argv;

if (!harnessArg || !/^0x[a-fA-F0-9]{40}$/.test(harnessArg)) {
  console.error("Usage: node monitor-harness.mjs 0xYourHarnessAddress");
  process.exit(1);
}

const chain = {
  id: 1979,
  name: "Ritual",
  nativeCurrency: { name: "RITUAL", symbol: "RITUAL", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.ritualfoundation.org"] } },
};

const client = createPublicClient({ chain, transport: http() });
const harness = harnessArg;
const ritualWallet = "0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948";

const harnessAbi = [
  {
    type: "function",
    name: "configured",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "wakeMode",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "activeCallId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "currentSeriesId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "activeNumCalls",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint32" }],
  },
  {
    type: "function",
    name: "scheduleConfig",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { type: "uint32" },
      { type: "uint32" },
      { type: "uint32" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
    ],
  },
];

const walletAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
];

async function read(functionName) {
  try {
    const value = await client.readContract({
      address: harness,
      abi: harnessAbi,
      functionName,
    });
    return stringify(value);
  } catch (error) {
    return `ERR: ${error.shortMessage ?? error.message}`;
  }
}

function stringify(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) {
    return `[${value.map((item) => stringify(item)).join(", ")}]`;
  }
  return String(value);
}

const latestBlock = await client.getBlockNumber();
const walletBalance = await client.readContract({
  address: ritualWallet,
  abi: walletAbi,
  functionName: "balanceOf",
  args: [harness],
});

console.log(`Harness: ${harness}`);
console.log(`Latest block: ${latestBlock}`);
console.log(`Configured: ${await read("configured")}`);
console.log(`Owner: ${await read("owner")}`);
console.log(`Wake mode: ${await read("wakeMode")}`);
console.log(`Active call id: ${await read("activeCallId")}`);
console.log(`Current series id: ${await read("currentSeriesId")}`);
console.log(`Active num calls: ${await read("activeNumCalls")}`);
console.log(`Schedule config: ${await read("scheduleConfig")}`);
console.log(`RitualWallet balance: ${formatEther(walletBalance)} RITUAL`);

for (const span of [10_000n, 50_000n]) {
  const logs = await client.getLogs({
    address: harness,
    fromBlock: latestBlock - span,
    toBlock: latestBlock,
  });
  console.log(`Logs in last ${span} blocks: ${logs.length}`);
  for (const log of logs.slice(-10)) {
    console.log(
      `  block=${log.blockNumber} tx=${log.transactionHash} topic0=${log.topics[0]}`,
    );
  }
}
