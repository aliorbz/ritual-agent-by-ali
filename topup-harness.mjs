import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  parseEther,
} from "../ritual-chain-workshop/hardhat/node_modules/viem/_esm/index.js";
import { privateKeyToAccount } from "../ritual-chain-workshop/hardhat/node_modules/viem/_esm/accounts/index.js";

const [, , harnessArg, amountArg = "1"] = process.argv;

if (!harnessArg || !/^0x[a-fA-F0-9]{40}$/.test(harnessArg)) {
  console.error("Usage: node topup-harness.mjs 0xHarnessAddress 1");
  process.exit(1);
}

const chain = {
  id: 1979,
  name: "Ritual",
  nativeCurrency: { name: "RITUAL", symbol: "RITUAL", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.ritualfoundation.org"] } },
};

const RITUAL_WALLET = "0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948";
const LOCK_DURATION = 100_000_000n;

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

const env = loadEnv();
const account = privateKeyToAccount(env.PRIVATE_KEY);
const publicClient = createPublicClient({ chain, transport: http() });
const walletClient = createWalletClient({
  account,
  chain,
  transport: http(),
});

const before = await publicClient.readContract({
  address: RITUAL_WALLET,
  abi: walletAbi,
  functionName: "balanceOf",
  args: [harnessArg],
});

console.log(`Harness: ${harnessArg}`);
console.log(`Top-up amount: ${amountArg} RITUAL`);
console.log(`Balance before: ${formatEther(before)} RITUAL`);

const hash = await walletClient.writeContract({
  address: RITUAL_WALLET,
  abi: walletAbi,
  functionName: "depositFor",
  args: [harnessArg, LOCK_DURATION],
  value: parseEther(amountArg),
  account,
  gas: 200_000n,
  maxFeePerGas: 20_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n,
});

console.log(`Top-up tx: ${hash}`);
const receipt = await publicClient.waitForTransactionReceipt({
  hash,
  timeout: 180_000,
});
console.log(`Top-up status: ${receipt.status} gas=${receipt.gasUsed}`);

const after = await publicClient.readContract({
  address: RITUAL_WALLET,
  abi: walletAbi,
  functionName: "balanceOf",
  args: [harnessArg],
});
console.log(`Balance after: ${formatEther(after)} RITUAL`);
