import { readFileSync, existsSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  formatEther,
  http,
  keccak256,
  parseAbiParameters,
  parseEther,
  stringToHex,
  toBytes,
  toFunctionSelector,
} from "../ritual-chain-workshop/hardhat/node_modules/viem/_esm/index.js";
import { privateKeyToAccount } from "../ritual-chain-workshop/hardhat/node_modules/viem/_esm/accounts/index.js";
import { ECIES_CONFIG, encrypt } from "eciesjs";

ECIES_CONFIG.symmetricNonceLength = 12;

const chain = {
  id: 1979,
  name: "Ritual",
  nativeCurrency: { name: "RITUAL", symbol: "RITUAL", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.ritualfoundation.org"] } },
};

const SOVEREIGN_FACTORY = "0x9dC4C054e53bCc4Ce0A0Ff09E890A7a8e817f304";
const REGISTRY = "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F";
const TRACKER = "0xC069FFCa0389f44eCA2C626e55491b0ab045AEF5";

const factoryAbi = [
  {
    type: "function",
    name: "predictHarness",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "userSalt", type: "bytes32" },
    ],
    outputs: [
      { name: "harness", type: "address" },
      { name: "childSalt", type: "bytes32" },
    ],
  },
  {
    type: "function",
    name: "deployHarness",
    stateMutability: "nonpayable",
    inputs: [{ name: "userSalt", type: "bytes32" }],
    outputs: [{ name: "harness", type: "address" }],
  },
];

const registryAbi = [
  {
    type: "function",
    name: "getServicesByCapability",
    stateMutability: "view",
    inputs: [
      { name: "capability", type: "uint8" },
      { name: "checkValidity", type: "bool" },
    ],
    outputs: [
      {
        type: "tuple[]",
        components: [
          {
            name: "node",
            type: "tuple",
            components: [
              { name: "paymentAddress", type: "address" },
              { name: "teeAddress", type: "address" },
              { name: "teeType", type: "uint8" },
              { name: "publicKey", type: "bytes" },
              { name: "endpoint", type: "string" },
              { name: "certPubKeyHash", type: "bytes32" },
              { name: "capability", type: "uint8" },
            ],
          },
          { name: "isValid", type: "bool" },
          { name: "workloadId", type: "bytes32" },
        ],
      },
    ],
  },
];

const trackerAbi = [
  {
    type: "function",
    name: "hasPendingJobForSender",
    stateMutability: "view",
    inputs: [{ name: "sender", type: "address" }],
    outputs: [{ type: "bool" }],
  },
];

const harnessAbi = [
  {
    type: "function",
    name: "configured",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
];

function loadEnv(path = ".env") {
  if (!existsSync(path)) throw new Error(".env file not found");
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

function required(env, key) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing required .env key: ${key}`);
  return value;
}

function getLlmCredentials(env) {
  const provider = required(env, "LLM_PROVIDER").toLowerCase();
  const hfToken = required(env, "HF_TOKEN");
  if (provider === "openrouter") {
    return [
      {
        LLM_PROVIDER: "openrouter",
        OPENROUTER_API_KEY: required(env, "OPENROUTER_API_KEY"),
        HF_TOKEN: hfToken,
      },
      env.MODEL || "google/gemini-2.5-flash",
    ];
  }
  if (provider === "openai") {
    return [
      {
        LLM_PROVIDER: "openai",
        OPENAI_API_KEY: required(env, "OPENAI_API_KEY"),
        HF_TOKEN: hfToken,
      },
      env.MODEL || "gpt-4o-mini",
    ];
  }
  if (provider === "anthropic") {
    return [
      {
        LLM_PROVIDER: "anthropic",
        ANTHROPIC_API_KEY: required(env, "ANTHROPIC_API_KEY"),
        HF_TOKEN: hfToken,
      },
      env.MODEL || "claude-sonnet-4-5-20250929",
    ];
  }
  if (provider === "gemini") {
    return [
      {
        LLM_PROVIDER: "gemini",
        GEMINI_API_KEY: required(env, "GEMINI_API_KEY"),
        HF_TOKEN: hfToken,
      },
      env.MODEL || "gemini-2.5-flash",
    ];
  }
  throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
}

async function sendAndWait(publicClient, walletClient, request, label) {
  const hash = await walletClient.sendTransaction(request);
  console.log(`${label} tx: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    timeout: 180_000,
  });
  console.log(`${label} status: ${receipt.status} gas=${receipt.gasUsed}`);
  if (receipt.status !== "success") {
    throw new Error(`${label} failed`);
  }
  return receipt;
}

const env = loadEnv();
const privateKey = required(env, "PRIVATE_KEY");
const hfRepoId = required(env, "HF_REPO_ID");
const salt = process.env.SALT_OVERRIDE || env.SALT || "my-sovereign-agent";
const frequency = BigInt(process.env.FREQUENCY_OVERRIDE || env.FREQUENCY || "2000");
const windowNumCalls = BigInt(
  process.env.WINDOW_NUM_CALLS_OVERRIDE || env.WINDOW_NUM_CALLS || "5",
);
const rolloverThresholdBps = Number(
  process.env.ROLLOVER_THRESHOLD_BPS_OVERRIDE ||
    env.ROLLOVER_THRESHOLD_BPS ||
    "5000",
);
const fundAmount = process.env.FUND_AMOUNT_OVERRIDE || env.FUND_AMOUNT || "0.1";
const cliType = Number(env.CLI_TYPE || "5");
const prompt =
  env.AGENT_PROMPT?.trim() ||
  readFileSync("templates/default-prompt.txt", "utf8").trim();

if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
  throw new Error("PRIVATE_KEY must be 0x-prefixed 32-byte hex");
}
if (!/^[^/\s]+\/[^/\s]+$/.test(hfRepoId)) {
  throw new Error("HF_REPO_ID must look like username/repo-name");
}
if (frequency * windowNumCalls > 10_000n) {
  throw new Error("FREQUENCY * WINDOW_NUM_CALLS must be <= 10000");
}

const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain, transport: http() });
const walletClient = createWalletClient({
  account,
  chain,
  transport: http(),
});

const [secrets, model] = getLlmCredentials(env);
const balance = await publicClient.getBalance({ address: account.address });
console.log(`Sender: ${account.address}`);
console.log(`Chain: ${await publicClient.getChainId()}`);
console.log(`Balance: ${formatEther(balance)} RITUAL`);
console.log(`Model: ${model}`);
console.log(`Frequency: ${frequency} blocks`);
console.log(`Window calls: ${windowNumCalls}`);

const pending = await publicClient.readContract({
  address: TRACKER,
  abi: trackerAbi,
  functionName: "hasPendingJobForSender",
  args: [account.address],
});
if (pending) throw new Error("Sender has a pending async job. Wait or use a different key.");
console.log("No pending async job for sender.");

const userSalt = keccak256(stringToHex(salt));
const [predictedHarness] = await publicClient.readContract({
  address: SOVEREIGN_FACTORY,
  abi: factoryAbi,
  functionName: "predictHarness",
  args: [account.address, userSalt],
});

console.log(`Predicted harness: ${predictedHarness}`);

const existingCode = await publicClient.getCode({ address: predictedHarness });
if (!existingCode || existingCode === "0x") {
  const data = encodeFunctionData({
    abi: factoryAbi,
    functionName: "deployHarness",
    args: [userSalt],
  });
  await sendAndWait(
    publicClient,
    walletClient,
    {
      to: SOVEREIGN_FACTORY,
      data,
      gas: 3_000_000n,
      maxFeePerGas: 20_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
    },
    "deployHarness",
  );
} else {
  console.log("Harness already exists at predicted address.");
  const alreadyConfigured = await publicClient
    .readContract({
      address: predictedHarness,
      abi: harnessAbi,
      functionName: "configured",
    })
    .catch(() => false);
  if (alreadyConfigured) {
    throw new Error(
      "Predicted harness is already configured. Use a fresh SALT_OVERRIDE for a new deployment.",
    );
  }
}

const services = await publicClient.readContract({
  address: REGISTRY,
  abi: registryAbi,
  functionName: "getServicesByCapability",
  args: [0, true],
});
if (!services.length) throw new Error("No valid TEE executor found");

const node = services[0].node;
const executor = node.teeAddress;
const publicKeyHex = Buffer.from(toBytes(node.publicKey)).toString("hex");
const encryptedSecrets = encrypt(publicKeyHex, Buffer.from(JSON.stringify(secrets)));
const deliverySelector = toFunctionSelector("onSovereignAgentResult(bytes32,bytes)");

console.log(`Executor: ${executor}`);
console.log(`Encrypted secrets bytes: ${encryptedSecrets.length}`);
console.log(`Prompt chars: ${prompt.length}`);

const params = [
  executor,
  500n,
  "0x",
  5n,
  6000n,
  "SOVEREIGN_AGENT_TASK",
  predictedHarness,
  deliverySelector,
  3_000_000n,
  1_000_000_000n,
  100_000_000n,
  cliType,
  prompt,
  `0x${Buffer.from(encryptedSecrets).toString("hex")}`,
  ["hf", `${hfRepoId}/sessions/session-001.jsonl`, "HF_TOKEN"],
  ["hf", `${hfRepoId}/artifacts/`, "HF_TOKEN"],
  [],
  ["hf", `${hfRepoId}/prompts/default-system.md`, ""],
  model,
  [],
  50,
  8192,
  "",
];

const schedule = [
  500_000,
  Number(frequency),
  500,
  20_000_000_000n,
  1_000_000_000n,
  0n,
];
const rolling = [Number(windowNumCalls), rolloverThresholdBps, 1];

const encodedArgs = encodeAbiParameters(
  parseAbiParameters(
    "(address,uint256,bytes,uint64,uint64,string,address,bytes4,uint256,uint256,uint256,uint16,string,bytes,(string,string,string),(string,string,string),(string,string,string)[],(string,string,string),string,string[],uint16,uint32,string), (uint32,uint32,uint32,uint256,uint256,uint256), (uint32,uint16,uint16), uint256",
  ),
  [params, schedule, rolling, 100_000_000n],
);

const configureData = `0xb1906702${encodedArgs.slice(2)}`;
await sendAndWait(
  publicClient,
  walletClient,
  {
    to: predictedHarness,
    data: configureData,
    value: parseEther(fundAmount),
    gas: 5_000_000n,
    maxFeePerGas: 20_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
  },
  "configureFundAndStart",
);

console.log("Deployment complete.");
console.log(`Harness: ${predictedHarness}`);
console.log(`Explorer: https://explorer.ritualfoundation.org/address/${predictedHarness}`);
