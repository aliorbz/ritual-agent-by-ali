# Ritual Sovereign Agent Deployment Guide

<div align="center">

## A complete, beginner-friendly guide for deploying a Sovereign Agent on Ritual testnet

Prepare everything first. Then deploy, monitor, and maintain the agent step by step.

</div>

---

## Table of Contents

- [Overview](#overview)
- [What You Will Build](#what-you-will-build)
- [How The Agent Works](#how-the-agent-works)
- [Guide Structure](#guide-structure)
- [Part 1: Preparation](#part-1-preparation)
  - [Preparation Checklist](#preparation-checklist)
  - [Choose Your Operating System](#choose-your-operating-system)
  - [Install Node.js](#install-nodejs)
  - [Prepare Your Wallet](#prepare-your-wallet)
  - [Choose An LLM Provider](#choose-an-llm-provider)
  - [Prepare Hugging Face](#prepare-hugging-face)
  - [Choose A Safe Schedule](#choose-a-safe-schedule)
  - [Write Your Agent Prompt](#write-your-agent-prompt)
  - [Prepare Your Environment Values](#prepare-your-environment-values)
- [Part 2: Manual Work](#part-2-manual-work)
  - [Manual Work Checklist](#manual-work-checklist)
  - [Open The Project Folder](#open-the-project-folder)
  - [Install Project Packages](#install-project-packages)
  - [Create The `.env` File](#create-the-env-file)
  - [Deploy The Agent](#deploy-the-agent)
  - [Save The Harness Address](#save-the-harness-address)
  - [Monitor The Agent](#monitor-the-agent)
  - [Check Ritual Explorer](#check-ritual-explorer)
  - [Top Up The Agent](#top-up-the-agent)
- [Recommended `.env` Templates](#recommended-env-templates)
- [Common Problems And Fixes](#common-problems-and-fixes)
- [File Reference](#file-reference)
- [Final Checklist](#final-checklist)

---

## Overview

A Ritual Sovereign Agent is an AI agent connected to an on-chain smart contract.

The agent is not just a normal script. It is deployed on Ritual testnet through a smart contract called a **harness**. The harness can schedule itself, wake up later, call Ritual's Sovereign Agent precompile, and send work to a TEE executor.

In simple English:

```text
You deploy the agent.
The chain wakes it on schedule.
The agent runs your AI prompt.
The agent keeps running while it has schedule calls and funding.
```

This guide is split into two clear parts:

1. **Preparation**: collect everything you need before touching commands.
2. **Manual Work**: run the actual setup, deploy, monitor, and top-up commands.

---

## What You Will Build

You will build a Sovereign Agent that can:

- use your own prompt
- wake up on a schedule
- run with an LLM provider such as OpenAI, OpenRouter, Anthropic, or Gemini
- use Hugging Face for history and artifacts
- pay scheduled execution fees from RitualWallet
- show scheduled wake transactions on Ritual Explorer
- be monitored and topped up after deployment

This guide uses the factory-backed harness pattern.

---

## How The Agent Works

The full flow looks like this:

```text
Your wallet
   |
   | deployHarness
   v
Sovereign Agent Factory
   |
   | creates a harness
   v
Harness Contract
   |
   | configureFundAndStart
   v
RitualWallet + Scheduler
   |
   | scheduled wake
   v
Harness Contract
   |
   | calls Sovereign Agent precompile 0x080C
   v
TEE Executor
   |
   | runs your LLM task
   v
Async result flow
```

Main pieces:

| Piece | Simple Meaning |
|---|---|
| Wallet | Pays for deployment and top-ups |
| Factory | Creates the harness contract |
| Harness | The deployed agent contract |
| Scheduler | Wakes the harness in future blocks |
| RitualWallet | Holds funds used to pay scheduled execution fees |
| Sovereign Agent precompile | Ritual system entry point for agent execution |
| TEE executor | Runs the off-chain AI task |
| LLM provider | Provides the model |
| Hugging Face | Stores history and files |

---

## Guide Structure

Do not start by running commands.

First, finish **Part 1: Preparation**.

After that, move to **Part 2: Manual Work**.

This prevents the most common beginner problem: reaching a command and then realizing a key, token, wallet, dataset, or schedule value is missing.

---

# Part 1: Preparation

This part is for collecting everything you need.

By the end of Part 1, you should have:

- Node.js installed
- a funded wallet
- one LLM API key
- a Hugging Face token
- a Hugging Face dataset repo
- a safe schedule
- a clear agent prompt
- all `.env` values ready

Do not deploy yet.

---

## Preparation Checklist

Before starting manual work, prepare these:

| Item | Needed? | Notes |
|---|---:|---|
| Node.js | Yes | Used to run scripts |
| Wallet private key | Yes | Used locally to sign transactions |
| RITUAL tokens | Yes | Pays for deploy and scheduled execution |
| LLM API key | Yes | Choose one provider |
| Hugging Face token | Yes | Needs write access |
| Hugging Face dataset repo | Yes | Format must be `username/repo-name` |
| Agent prompt | Yes | The task your agent performs |
| Safe schedule values | Yes | Must follow the schedule rule |

---

## Choose Your Operating System

You can use:

- Windows PowerShell
- macOS Terminal
- Linux terminal
- Ubuntu on WSL

All are fine.

For Windows users, PowerShell is okay. If you prefer Linux-style commands, use Ubuntu on WSL.

---

## Install Node.js

Node.js is required because the deployment scripts are JavaScript files.

### Windows

1. Download Node.js LTS:

   https://nodejs.org

2. Install with default options.
3. Open PowerShell.
4. Check:

```powershell
node --version
npm.cmd --version
```

If `npm` does not work in PowerShell, use `npm.cmd`.

### macOS

Option A: install Node.js from:

https://nodejs.org

Option B: install with Homebrew:

```bash
brew install node
node --version
npm --version
```

### Linux

Ubuntu or Debian:

```bash
sudo apt update
sudo apt install -y nodejs npm git
node --version
npm --version
```

Fedora:

```bash
sudo dnf install -y nodejs npm git
node --version
npm --version
```

Arch:

```bash
sudo pacman -S nodejs npm git
node --version
npm --version
```

### Ubuntu On WSL

WSL means Windows Subsystem for Linux.

Open PowerShell as Administrator:

```powershell
wsl --install
```

Restart if Windows asks.

Then open Ubuntu and run:

```bash
sudo apt update
sudo apt install -y nodejs npm git
node --version
npm --version
```

---

## Prepare Your Wallet

You need a wallet with RITUAL tokens.

The wallet pays for:

- harness deployment
- agent configuration
- initial RitualWallet funding
- future top-ups

You also need the wallet private key.

Important:

```text
The private key stays in your local .env file.
The deployed contract does not know your private key.
The agent cannot automatically spend from your wallet.
```

The agent only spends from its own RitualWallet balance.

---

## Choose An LLM Provider

Choose one provider only.

### Option A: OpenAI

Use this if you want a simple common setup.

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=OPENAI_API_KEY_HERE
MODEL=gpt-4o-mini
```

Get a key:

https://platform.openai.com/api-keys

### Option B: OpenRouter

Use this if you want access to many models through one API.

```env
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=OPENROUTER_API_KEY_HERE
MODEL=google/gemini-2.5-flash
```

Get a key:

https://openrouter.ai/keys

### Option C: Anthropic

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=ANTHROPIC_API_KEY_HERE
MODEL=claude-sonnet-4-5-20250929
```

Get a key:

https://console.anthropic.com/settings/keys

### Option D: Google Gemini

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-key
MODEL=gemini-2.5-flash
```

Get a key:

https://aistudio.google.com/apikey

---

## Prepare Hugging Face

Hugging Face is used for the agent's history and output files.

1. Create an account:

   https://huggingface.co

2. Create a write token:

   https://huggingface.co/settings/tokens

3. Create a dataset repo:

   https://huggingface.co/new-dataset

4. Write down these values:

```env
HF_TOKEN=hf_your_token
HF_REPO_ID=username/repo-name
```

Correct `HF_REPO_ID`:

```text
alice/my-agent-data
```

Wrong `HF_REPO_ID`:

```text
https://huggingface.co/datasets/alice/my-agent-data
```

---

## Choose A Safe Schedule

The schedule decides how often the agent wakes.

Use this rule:

```text
FREQUENCY * WINDOW_NUM_CALLS < 10000
```

### Recommended Real-Agent Schedule

```env
FREQUENCY=2000
WINDOW_NUM_CALLS=4
```

This wakes about every 2000 blocks and stays inside the Scheduler limit.

### Faster Testing Schedule

```env
FREQUENCY=100
WINDOW_NUM_CALLS=2
```

Use this only when you want to see wakeups quickly.

### Slower Schedule

```env
FREQUENCY=3000
WINDOW_NUM_CALLS=3
```

This wakes less often.

### Schedule Examples

| Frequency | Window Calls | Product | Good? |
|---:|---:|---:|---|
| 2000 | 4 | 8000 | Yes |
| 3000 | 3 | 9000 | Yes |
| 1000 | 5 | 5000 | Yes |
| 100 | 2 | 200 | Yes |

Keep the product below `10000`.

---

## Write Your Agent Prompt

The prompt tells the agent what to do each time it wakes up.

Good prompt:

```text
You are a Ritual market research agent.
Every time you wake up, check recent market information,
summarize important changes, and write a short useful report.
Keep the report clear and practical.
```

Another good prompt:

```text
You are a DeFi monitoring agent.
Track important token and protocol activity.
Look for unusual changes.
Return a short alert-style summary.
```

Weak prompt:

```text
Do something useful.
```

Use a clear task. The agent performs better when the prompt is specific.

---

## Prepare Your Environment Values

Before manual work, write down these values:

```env
PRIVATE_KEY=
LLM_PROVIDER=
OPENAI_API_KEY=
OPENROUTER_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
MODEL=
HF_TOKEN=
HF_REPO_ID=
SALT=
CLI_TYPE=5
FREQUENCY=2000
WINDOW_NUM_CALLS=4
ROLLOVER_THRESHOLD_BPS=5000
FUND_AMOUNT=0.5
AGENT_PROMPT=
```

You only need the API key for the provider you choose.

For example, if you choose OpenAI, you do not need OpenRouter, Anthropic, or Gemini keys.

---

# Part 2: Manual Work

Now you will run commands.

Do these steps in order.

---

## Manual Work Checklist

| Step | Action |
|---:|---|
| 1 | Open the project folder |
| 2 | Install project packages |
| 3 | Create `.env` |
| 4 | Deploy the agent |
| 5 | Save the harness address |
| 6 | Monitor the agent |
| 7 | Check Ritual Explorer |
| 8 | Top up when needed |

---

## Open The Project Folder

Open the folder that contains:

```text
deploy-node.mjs
monitor-harness.mjs
topup-harness.mjs
```

That is the project folder.

All commands in this section should be run from that folder.

---

## Install Project Packages

Windows PowerShell:

```powershell
npm.cmd install --cache .\.npm-cache
```

macOS, Linux, or WSL:

```bash
npm install
```

This installs the packages used by the deployment scripts.

---

## Create The `.env` File

Create a file named:

```text
.env
```

Put it in the same folder as `deploy-node.mjs`.

Example:

```env
PRIVATE_KEY=0xyour_private_key_here

LLM_PROVIDER=openai
OPENAI_API_KEY=OPENAI_API_KEY_HERE
MODEL=gpt-4o-mini

HF_TOKEN=hf_your_huggingface_token_here
HF_REPO_ID=yourname/your-dataset-name

SALT=my-sovereign-agent-001
CLI_TYPE=5

FREQUENCY=2000
WINDOW_NUM_CALLS=4
ROLLOVER_THRESHOLD_BPS=5000
FUND_AMOUNT=0.5

AGENT_PROMPT=You are a helpful sovereign AI agent. Write a useful report every time you wake up.
```

### `.env` Rules

- Do not publish `.env`.
- Use a fresh `SALT` for every new deployment.
- Keep `HF_REPO_ID` in `username/repo-name` format.
- Keep `FREQUENCY * WINDOW_NUM_CALLS` below `10000`.
- Make sure your wallet has enough RITUAL.

---

## Deploy The Agent

Windows PowerShell:

```powershell
node .\deploy-node.mjs
```

macOS, Linux, or WSL:

```bash
node ./deploy-node.mjs
```

The script will:

1. read `.env`
2. load your wallet
3. check for pending jobs
4. predict the harness address
5. deploy the harness
6. discover a TEE executor
7. encrypt your secrets
8. configure the agent
9. fund the harness in RitualWallet
10. start the schedule

At the end, you will see:

```text
Harness: 0xYourHarnessAddress
Explorer: https://explorer.ritualfoundation.org/address/0xYourHarnessAddress
```

---

## Save The Harness Address

After deployment, save this:

```text
0xYourHarnessAddress
```

You need it for:

- monitoring
- top-ups
- Explorer checks
- support/debugging

---

## Deploy With Temporary Overrides

This is optional.

Use overrides when you want to deploy with temporary values without editing `.env`.

Windows PowerShell:

```powershell
$env:SALT_OVERRIDE='my-agent-001'
$env:FREQUENCY_OVERRIDE='2000'
$env:WINDOW_NUM_CALLS_OVERRIDE='4'
$env:FUND_AMOUNT_OVERRIDE='0.5'
node .\deploy-node.mjs
```

macOS, Linux, or WSL:

```bash
SALT_OVERRIDE='my-agent-001' \
FREQUENCY_OVERRIDE='2000' \
WINDOW_NUM_CALLS_OVERRIDE='4' \
FUND_AMOUNT_OVERRIDE='0.5' \
node ./deploy-node.mjs
```

Use a new salt each time.

---

## Monitor The Agent

Windows PowerShell:

```powershell
node .\monitor-harness.mjs 0xYourHarnessAddress
```

macOS, Linux, or WSL:

```bash
node ./monitor-harness.mjs 0xYourHarnessAddress
```

Good output looks like:

```text
Configured: true
Wake mode: 1
Active call id: 2764541
Current series id: 1
Active num calls: 4
Schedule config: [500000, 2000, 500, ...]
RitualWallet balance: 0.5 RITUAL
```

After a scheduled wake, you should see:

- new harness logs
- RitualWallet balance going down
- scheduled transaction on Ritual Explorer

---

## Check Ritual Explorer

Open:

```text
https://explorer.ritualfoundation.org/address/0xYourHarnessAddress
```

A scheduled wake transaction may show:

```text
From: 0x0000...fa7e
To: Scheduler
Method: execute()
```

That is normal.

The transaction may include:

- Scheduler logs
- RitualWallet fee logs
- harness logs
- internal calls to the Sovereign Agent precompile

The Sovereign Agent precompile is:

```text
0x000000000000000000000000000000000000080c
```

---

## Top Up The Agent

The deployed agent cannot refill itself from your wallet.

It spends from its RitualWallet balance.

Top up before the balance becomes too low.

Recommended minimum:

```text
0.05 RITUAL
```

Top up `1 RITUAL`:

Windows PowerShell:

```powershell
node .\topup-harness.mjs 0xYourHarnessAddress 1
```

macOS, Linux, or WSL:

```bash
node ./topup-harness.mjs 0xYourHarnessAddress 1
```

This deposits funds into RitualWallet for the harness.

It uses:

```text
depositFor(harness, 100000000)
```

That means:

```text
Deposit funds for the harness and lock them for scheduled execution use.
```

---

## Recommended `.env` Templates

### OpenAI Template

```env
PRIVATE_KEY=0xyour_private_key_here

LLM_PROVIDER=openai
OPENAI_API_KEY=OPENAI_API_KEY_HERE
MODEL=gpt-4o-mini

HF_TOKEN=hf_your_huggingface_token_here
HF_REPO_ID=yourname/your-dataset-name

SALT=my-sovereign-agent-001
CLI_TYPE=5

FREQUENCY=2000
WINDOW_NUM_CALLS=4
ROLLOVER_THRESHOLD_BPS=5000
FUND_AMOUNT=0.5

AGENT_PROMPT=Write your agent task here.
```

### OpenRouter Template

```env
PRIVATE_KEY=0xyour_private_key_here

LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=OPENROUTER_API_KEY_HERE
MODEL=google/gemini-2.5-flash

HF_TOKEN=hf_your_huggingface_token_here
HF_REPO_ID=yourname/your-dataset-name

SALT=my-sovereign-agent-001
CLI_TYPE=5

FREQUENCY=2000
WINDOW_NUM_CALLS=4
ROLLOVER_THRESHOLD_BPS=5000
FUND_AMOUNT=0.5

AGENT_PROMPT=Write your agent task here.
```

### Anthropic Template

```env
PRIVATE_KEY=0xyour_private_key_here

LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=ANTHROPIC_API_KEY_HERE
MODEL=claude-sonnet-4-5-20250929

HF_TOKEN=hf_your_huggingface_token_here
HF_REPO_ID=yourname/your-dataset-name

SALT=my-sovereign-agent-001
CLI_TYPE=5

FREQUENCY=2000
WINDOW_NUM_CALLS=4
ROLLOVER_THRESHOLD_BPS=5000
FUND_AMOUNT=0.5

AGENT_PROMPT=Write your agent task here.
```

### Gemini Template

```env
PRIVATE_KEY=0xyour_private_key_here

LLM_PROVIDER=gemini
GEMINI_API_KEY=your_key_here
MODEL=gemini-2.5-flash

HF_TOKEN=hf_your_huggingface_token_here
HF_REPO_ID=yourname/your-dataset-name

SALT=my-sovereign-agent-001
CLI_TYPE=5

FREQUENCY=2000
WINDOW_NUM_CALLS=4
ROLLOVER_THRESHOLD_BPS=5000
FUND_AMOUNT=0.5

AGENT_PROMPT=Write your agent task here.
```

---

## Common Problems And Fixes

### The Agent Deploys But Does Not Wake

Check:

```text
FREQUENCY * WINDOW_NUM_CALLS < 10000
```

Recommended:

```env
FREQUENCY=2000
WINDOW_NUM_CALLS=4
```

### The Script Says The Harness Is Already Configured

You reused the same salt.

Use a new one:

```env
SALT=my-sovereign-agent-002
```

Or use a temporary override.

### The Wallet Balance Is Too Low

Add more RITUAL to your wallet.

Then deploy or top up again.

### The Harness RitualWallet Balance Is Low

Run:

```powershell
node .\topup-harness.mjs 0xYourHarnessAddress 1
```

### The Private Key Fails

The private key must:

- start with `0x`
- be 32 bytes
- be written as hex

### Hugging Face Does Not Work

Check:

```env
HF_REPO_ID=username/repo-name
```

Do not use a Hugging Face URL.

### npm Is Blocked On Windows

Use:

```powershell
npm.cmd install --cache .\.npm-cache
```

### The Agent Has A Pending Job

Async jobs can take time.

Wait and monitor:

```powershell
node .\monitor-harness.mjs 0xYourHarnessAddress
```

---

## File Reference

| File | Purpose |
|---|---|
| `deploy-node.mjs` | Deploys, configures, funds, and starts the agent |
| `monitor-harness.mjs` | Checks harness status, schedule, balance, and logs |
| `topup-harness.mjs` | Adds RITUAL to the harness RitualWallet balance |
| `deploy-scheduler-probe.mjs` | Optional Scheduler test tool |
| `monitor-scheduler-probe.mjs` | Optional Scheduler test monitor |
| `.env` | Private configuration and secrets |

---

## Final Checklist

### Preparation Complete

- Node.js installed
- wallet ready
- RITUAL tokens available
- LLM provider chosen
- API key ready
- Hugging Face token ready
- Hugging Face dataset repo ready
- safe schedule chosen
- prompt written
- `.env` values prepared

### Manual Work Complete

- project packages installed
- `.env` file created
- agent deployed
- harness address saved
- first monitor check completed
- Explorer page checked
- top-up method understood

---

## Final Notes

The agent can keep waking while it has schedule calls and RitualWallet balance.

The agent cannot automatically refill itself from your wallet.

Use a new salt for every new deployment.

Keep this schedule rule:

```text
FREQUENCY * WINDOW_NUM_CALLS < 10000
```

Monitor the first few wakeups before leaving the agent unattended.
