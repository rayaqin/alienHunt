const summaryCards = document.querySelector("#summaryCards");
const summaryText = document.querySelector("#summaryText");
const historyRows = document.querySelector("#historyRows");
const message = document.querySelector("#message");
const refreshButton = document.querySelector("#refreshButton");

refreshButton.addEventListener("click", loadHuntHistory);

loadHuntHistory();

async function loadHuntHistory() {
  setMessage("Loading hunt history...");
  refreshButton.disabled = true;

  try {
    const response = await fetch("/stats");

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const result = await response.json();
    const hunts = result.stats ?? [];

    renderSummary(hunts);
    renderRows(hunts);
    setMessage(hunts.length === 0 ? "No hunts have been recorded yet." : "");
  } catch (error) {
    setMessage(`Could not load hunt history: ${error.message}`, true);
  } finally {
    refreshButton.disabled = false;
  }
}

function renderSummary(hunts) {
  const completed = hunts.filter((hunt) => hunt.outcome !== null);
  const victories = hunts.filter((hunt) => hunt.outcome === "victory");
  const deaths = hunts.filter((hunt) => hunt.outcome === "death");
  const active = hunts.length - completed.length;
  const totalMoves = sum(hunts, "moves");
  const totalShots = sum(hunts, "shots");
  const totalTrackerUses = sum(hunts, "motionTrackerUses");

  summaryText.textContent =
    hunts.length === 0
      ? "No persisted hunt history yet."
      : `${hunts.length} hunts recorded · ${completed.length} completed · ${active} unfinished`;

  summaryCards.replaceChildren(
    createSummaryCard("Hunts", hunts.length),
    createSummaryCard("Victories", victories.length),
    createSummaryCard("Deaths", deaths.length),
    createSummaryCard(
      "Avg Actions",
      formatAverage(totalMoves + totalShots + totalTrackerUses, hunts.length),
    ),
  );
}

function renderRows(hunts) {
  historyRows.replaceChildren();

  if (hunts.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.className = "empty";
    cell.colSpan = 10;
    cell.textContent = "Start a hunt to populate this table.";
    row.append(cell);
    historyRows.append(row);
    return;
  }

  for (const hunt of hunts) {
    historyRows.append(createHistoryRow(hunt));
  }
}

function createHistoryRow(hunt) {
  const row = document.createElement("tr");
  row.append(
    createTextCell(hunt.huntId, "hunt-id"),
    createBadgeCell(hunt.outcome),
    createTextCell(formatDifficulty(hunt.difficulty)),
    createTextCell(formatStrategy(hunt.searchStrategy)),
    createTextCell(formatNumber(hunt.moves)),
    createTextCell(formatNumber(hunt.shots)),
    createTextCell(formatNumber(hunt.motionTrackerUses)),
    createTextCell(formatDuration(hunt.startedAt, hunt.endedAt)),
    createTextCell(formatDate(hunt.startedAt)),
    createReplayCell(hunt),
  );
  return row;
}

function createSummaryCard(label, value) {
  const card = document.createElement("article");
  card.className = "summary-card";

  const labelElement = document.createElement("div");
  labelElement.className = "summary-label";
  labelElement.textContent = label;

  const valueElement = document.createElement("div");
  valueElement.className = "summary-value";
  valueElement.textContent = value;

  card.append(labelElement, valueElement);
  return card;
}

function createTextCell(value, className = "") {
  const cell = document.createElement("td");
  cell.textContent = value;

  if (className) {
    cell.className = className;
  }

  return cell;
}

function createBadgeCell(outcome) {
  const cell = document.createElement("td");
  const badge = document.createElement("span");
  const badgeClass = outcome ?? "unfinished";
  badge.className = `badge ${badgeClass}`;
  badge.textContent = outcome ?? "Unfinished";
  cell.append(badge);
  return cell;
}

function createReplayCell(hunt) {
  const cell = document.createElement("td");

  if (hunt.outcome === null) {
    cell.textContent = "Unfinished";
    return cell;
  }

  const link = document.createElement("a");
  link.className = "row-link";
  link.href = `/replay?huntId=${encodeURIComponent(hunt.huntId)}`;
  link.textContent = "replay";
  cell.append(link);
  return cell;
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function sum(items, key) {
  return items.reduce((total, item) => total + (item[key] ?? 0), 0);
}

function formatAverage(total, count) {
  if (count === 0) {
    return "0";
  }

  return (total / count).toFixed(1);
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value ?? 0);
}

function formatStrategy(value) {
  if (!value) {
    return "Unknown";
  }

  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDifficulty(value) {
  if (!value) {
    return "Unknown";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDate(value) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);
  const month = new Intl.DateTimeFormat("en", { month: "short" })
    .format(date)
    .toLowerCase();
  const day = date.getDate();
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  }).format(date);

  return `${month} ${day} - ${time}`;
}

function formatDuration(startedAt, endedAt) {
  if (!startedAt || !endedAt) {
    return "Unfinished";
  }

  const durationMs =
    new Date(endedAt).getTime() - new Date(startedAt).getTime();

  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return "Unknown";
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}
