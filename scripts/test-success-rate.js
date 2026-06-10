const path = require("node:path");
const { spawn } = require("node:child_process");
const { getStats } = require("./alien-hunt-client");

const HUNT_ID_PATTERN = /Started hunt ([^\s]+)/;

async function main() {
  const [scriptArg, runCountArg] = process.argv.slice(2);

  if (!scriptArg) {
    printUsageAndExit();
  }

  const runCount = runCountArg === undefined ? 10 : Number(runCountArg);

  if (!Number.isInteger(runCount) || runCount < 1) {
    throw new Error("Run count must be a positive integer.");
  }

  const scriptPath = path.resolve(process.cwd(), scriptArg);
  const huntIds = [];
  const failedRuns = [];

  renderProgress(0, runCount);

  for (let runNumber = 1; runNumber <= runCount; runNumber++) {
    const result = await runScript(scriptPath);

    if (result.huntId) {
      huntIds.push(result.huntId);
    }

    if (result.exitCode !== 0) {
      failedRuns.push({
        runNumber,
        exitCode: result.exitCode,
        errorOutput: result.errorOutput,
      });
    }

    renderProgress(runNumber, runCount);
  }

  process.stdout.write("\n");

  const { stats } = await getStats();
  const statsByHuntId = new Map(
    stats.map((huntStats) => [huntStats.huntId, huntStats]),
  );
  const testedStats = huntIds
    .map((huntId) => statsByHuntId.get(huntId))
    .filter(Boolean);
  const victories = testedStats.filter(
    (huntStats) => huntStats.outcome === "victory",
  ).length;
  const successRate = (victories / runCount) * 100;

  console.log(`Runs requested: ${runCount}`);
  console.log(`Hunts tracked: ${huntIds.length}`);
  console.log(`Victories: ${victories}`);
  console.log(`Success rate: ${successRate.toFixed(2)}%`);

  if (failedRuns.length > 0) {
    console.log(`Failed script runs: ${failedRuns.length}`);
    for (const failedRun of failedRuns) {
      console.log(
        `Run ${failedRun.runNumber} exited with code ${failedRun.exitCode}.`,
      );
      if (failedRun.errorOutput) {
        console.log(failedRun.errorOutput.trim());
      }
    }
  }

  const missingStatsCount = huntIds.length - testedStats.length;
  if (missingStatsCount > 0) {
    console.log(`Tracked hunts missing from stats: ${missingStatsCount}`);
  }
}

function runScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const command = getScriptCommand(scriptPath);
    const child = spawn(command.executable, command.args, {
      cwd: process.cwd(),
      env: process.env,
    });
    let huntId = null;
    let errorOutput = "";

    child.stdout.on("data", (chunk) => {
      huntId ??= extractHuntId(chunk.toString());
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      huntId ??= extractHuntId(text);
      errorOutput += text;
    });

    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({
        exitCode,
        huntId,
        errorOutput,
      });
    });
  });
}

function getScriptCommand(scriptPath) {
  if (scriptPath.endsWith(".py")) {
    return {
      executable: "python3",
      args: [scriptPath],
    };
  }

  return {
    executable: "node",
    args: [scriptPath],
  };
}

function extractHuntId(output) {
  return output.match(HUNT_ID_PATTERN)?.[1] ?? null;
}

function renderProgress(completed, total) {
  const width = 30;
  const filled = Math.round((completed / total) * width);
  const empty = width - filled;
  const percentage = ((completed / total) * 100).toFixed(0).padStart(3, " ");

  process.stdout.write(
    `\r[${"#".repeat(filled)}${"-".repeat(empty)}] ${percentage}% (${completed}/${total})`,
  );
}

function printUsageAndExit() {
  console.error("Usage: npm run test <script-file> [run-count]");
  process.exit(1);
}

main().catch((error) => {
  console.error(error.stack ?? error);
  process.exit(1);
});
