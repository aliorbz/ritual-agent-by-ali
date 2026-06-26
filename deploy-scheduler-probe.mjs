import { readFileSync } from "node:fs";
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  formatEther,
  http,
  parseEther,
} from "../ritual-chain-workshop/hardhat/node_modules/viem/_esm/index.js";
import { privateKeyToAccount } from "../ritual-chain-workshop/hardhat/node_modules/viem/_esm/accounts/index.js";

const chain = {
  id: 1979,
  name: "Ritual",
  nativeCurrency: { name: "RITUAL", symbol: "RITUAL", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.ritualfoundation.org"] } },
};

const RITUAL_WALLET = "0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948";
const SCHEDULER = "0x56e776BAE2DD60664b69Bd5F865F1180ffB7D58B";

const walletAbi = [
  {
    type: "function",
    name: "depositFor",
    stateMutability: "payable",
    inputs: [
      { name: "user", type: "address" },
      { name: "lockDuration", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
];

function loadEnv(path = ".env") {
  const env = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    let value = rest.join("=").trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key.trim()] = value;
  }
  return env;
}

function compile() {
  const source = readFileSync("contracts/SchedulerProbe.sol", "utf8");
  const input = {
    language: "Solidity",
    sources: { "SchedulerProbe.sol": { content: source } },
    settings: {
      viaIR: true,
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        "*": { "*": ["abi", "evm.bytecode.object"] },
      },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = output.errors?.filter((error) => error.severity === "error");
  if (errors?.length) {
    throw new Error(errors.map((error) => error.formattedMessage).join("\n"));
  }
  const contract = output.contracts["SchedulerProbe.sol"].SchedulerProbe;
  return {
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
  };
}

async function wait(publicClient, hash, label) {
  console.log(`${label} tx: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    timeout: 180_000,
  });
  console.log(`${label} status: ${receipt.status} gas=${receipt.gasUsed}`);
  if (receipt.status !== "success") throw new Error(`${label} failed`);
  return receipt;
}

const env = loadEnv();
const account = privateKeyToAccount(env.PRIVATE_KEY);
const publicClient = createPublicClient({ chain, transport: http() });
const walletClient = createWalletClient({
  account,
  chain,
  transport: http(),
});

const { abi, bytecode } = compile();
const balance = await publicClient.getBalance({ address: account.address });
console.log(`Sender: ${account.address}`);
console.log(`Balance: ${formatEther(balance)} RITUAL`);

const deployHash = await walletClient.deployContract({
  abi,
  bytecode,
  account,
  gas: 1_500_000n,
  maxFeePerGas: 20_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n,
});
const deployReceipt = await wait(publicClient, deployHash, "deploy probe");
const probe = deployReceipt.contractAddress;
console.log(`Probe: ${probe}`);

const approveHash = await walletClient.writeContract({
  address: probe,
  abi,
  functionName: "approveScheduler",
  args: [SCHEDULER],
  account,
  gas: 100_000n,
  maxFeePerGas: 20_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n,
});
await wait(publicClient, approveHash, "approve scheduler");

const depositHash = await walletClient.writeContract({
  address: RITUAL_WALLET,
  abi: walletAbi,
  functionName: "depositFor",
  args: [probe, 100_000_000n],
  value: parseEther("0.02"),
  account,
  gas: 200_000n,
  maxFeePerGas: 20_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n,
});
await wait(publicClient, depositHash, "fund probe");

const walletBalance = await publicClient.readContract({
  address: RITUAL_WALLET,
  abi: walletAbi,
  functionName: "balanceOf",
  args: [probe],
});
console.log(`Probe RitualWallet balance: ${formatEther(walletBalance)} RITUAL`);

const startDelay = 20;
const numCalls = 2;
const frequency = 20;
const ttl = 100;
const scheduleHash = await walletClient.writeContract({
  address: probe,
  abi,
  functionName: "schedulePing",
  args: [startDelay, numCalls, frequency, ttl],
  account,
  gas: 900_000n,
  maxFeePerGas: 20_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n,
});
const scheduleReceipt = await wait(publicClient, scheduleHash, "schedule ping");

let scheduled;
for (const log of scheduleReceipt.logs) {
  if (log.address.toLowerCase() !== probe.toLowerCase()) continue;
  try {
    const decoded = decodeEventLog({ abi, data: log.data, topics: log.topics });
    if (decoded.eventName === "ProbeScheduled") scheduled = decoded.args;
  } catch {}
}

console.log(`ProbeScheduled: ${JSON.stringify(scheduled, (_, value) =>
  typeof value === "bigint" ? value.toString() : value
)}`);
console.log("Monitor with:");
console.log(`node .\\monitor-scheduler-probe.mjs ${probe}`);
