import {
  createPublicClient,
  decodeEventLog,
  formatEther,
  http,
} from "../ritual-chain-workshop/hardhat/node_modules/viem/_esm/index.js";

const [, , probe] = process.argv;

if (!probe || !/^0x[a-fA-F0-9]{40}$/.test(probe)) {
  console.error("Usage: node monitor-scheduler-probe.mjs 0xProbeAddress");
  process.exit(1);
}

const chain = {
  id: 1979,
  name: "Ritual",
  nativeCurrency: { name: "RITUAL", symbol: "RITUAL", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.ritualfoundation.org"] } },
};

const RITUAL_WALLET = "0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948";
const SCHEDULER = "0x56e776BAE2DD60664b69Bd5F865F1180ffB7D58B";

const probeAbi = [
  {
    type: "function",
    name: "lastCallId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "wakeCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "lastExecutionIndex",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "lastWakeBlock",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "lastSender",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "lastOrigin",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "event",
    name: "ProbeScheduled",
    inputs: [
      { indexed: true, name: "callId", type: "uint256" },
      { indexed: false, name: "startBlock", type: "uint32" },
      { indexed: false, name: "numCalls", type: "uint32" },
      { indexed: false, name: "frequency", type: "uint32" },
      { indexed: false, name: "ttl", type: "uint32" },
    ],
  },
  {
    type: "event",
    name: "ProbeWake",
    inputs: [
      { indexed: true, name: "executionIndex", type: "uint256" },
      { indexed: false, name: "wakeCount", type: "uint256" },
      { indexed: false, name: "blockNumber", type: "uint256" },
      { indexed: false, name: "sender", type: "address" },
      { indexed: false, name: "origin", type: "address" },
    ],
  },
];

const walletAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
];

const client = createPublicClient({ chain, transport: http() });

async function read(functionName) {
  return client.readContract({
    address: probe,
    abi: probeAbi,
    functionName,
  });
}

const latest = await client.getBlockNumber();
const [lastCallId, wakeCount, lastExecutionIndex, lastWakeBlock, lastSender, lastOrigin] =
  await Promise.all([
    read("lastCallId"),
    read("wakeCount"),
    read("lastExecutionIndex"),
    read("lastWakeBlock"),
    read("lastSender"),
    read("lastOrigin"),
  ]);
const walletBalance = await client.readContract({
  address: RITUAL_WALLET,
  abi: walletAbi,
  functionName: "balanceOf",
  args: [probe],
});

console.log(`Probe: ${probe}`);
console.log(`Latest block: ${latest}`);
console.log(`Last call id: ${lastCallId}`);
console.log(`Wake count: ${wakeCount}`);
console.log(`Last execution index: ${lastExecutionIndex}`);
console.log(`Last wake block: ${lastWakeBlock}`);
console.log(`Last sender: ${lastSender}`);
console.log(`Last origin: ${lastOrigin}`);
console.log(`RitualWallet balance: ${formatEther(walletBalance)} RITUAL`);

const fromBlock = latest > 10_000n ? latest - 10_000n : 0n;
const probeLogs = await client.getLogs({ address: probe, fromBlock, toBlock: latest });
console.log(`Probe logs in last 10000 blocks: ${probeLogs.length}`);
for (const log of probeLogs) {
  try {
    const decoded = decodeEventLog({
      abi: probeAbi,
      topics: log.topics,
      data: log.data,
    });
    console.log(
      `  block=${log.blockNumber} event=${decoded.eventName} tx=${log.transactionHash}`,
    );
  } catch {
    console.log(`  block=${log.blockNumber} topic0=${log.topics[0]} tx=${log.transactionHash}`);
  }
}

if (lastCallId > 0n) {
  const schedulerLogs = await client.getLogs({
    address: SCHEDULER,
    fromBlock,
    toBlock: latest,
  });
  const callIdTopic = `0x${lastCallId.toString(16).padStart(64, "0")}`;
  const exactLogs = schedulerLogs.filter((log) => log.topics.includes(callIdTopic));
  console.log(`Scheduler logs for call id in last 10000 blocks: ${exactLogs.length}`);
  for (const log of exactLogs) {
    console.log(`  block=${log.blockNumber} topic0=${log.topics[0]} tx=${log.transactionHash}`);
  }
}
