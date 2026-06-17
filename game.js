const ROWS = 17;
const COLS = 10;
const TOTAL_CELLS = ROWS * COLS;
const GAME_SECONDS = 100;
const DEBUG = false;

const boardElement = document.getElementById("board");
const scoreElement = document.getElementById("score");
const timeElement = document.getElementById("time");
const timerBox = document.getElementById("timerBox");
const restartButton = document.getElementById("restartButton");
const startScreen = document.getElementById("startScreen");
const startButton = document.getElementById("startButton");
const gameOverElement = document.getElementById("gameOver");
const finalScoreElement = document.getElementById("finalScore");
const removedCountElement = document.getElementById("removedCount");
const resultSecondaryLabelElement = document.getElementById("resultSecondaryLabel");
const resultSecondaryValueElement = document.getElementById("resultSecondaryValue");
const resultTitleElement = document.getElementById("resultTitle");
const resultMoodElement = document.getElementById("resultMood");
const playAgainButton = document.getElementById("playAgainButton");

let board = [];
let solutionGroups = [];
let solutionSteps = [];
let cellsByKey = new Map();
let score = 0;
let timeLeft = GAME_SECONDS;
let timerId = null;
let timerEndsAt = 0;
let isDragging = false;
let dragStart = null;
let dragBoardRect = null;
let pendingDragCell = null;
let dragFrameId = null;
let currentSelection = null;
let gameState = "ready";

function now() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// count개의 1~9 숫자를 만들고 합계를 정확히 10으로 맞춥니다.
function makeNumbersThatSumToTen(count) {
  const presets = {
    2: [[1, 9], [2, 8], [3, 7], [4, 6], [5, 5]],
    3: [[1, 2, 7], [1, 3, 6], [1, 4, 5], [2, 3, 5], [2, 4, 4]],
    4: [[1, 2, 3, 4], [1, 1, 3, 5], [1, 2, 2, 5], [2, 2, 3, 3]]
  };
  const choice = presets[count][Math.floor(Math.random() * presets[count].length)];
  return shuffle(choice);
}

function createEmptyGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function findFirstEmpty(grid) {
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (grid[row][col] === null) {
        return { row, col };
      }
    }
  }
  return null;
}

function canPlaceRectangle(grid, startRow, startCol, height, width) {
  if (startRow + height > ROWS || startCol + width > COLS) {
    return false;
  }

  for (let row = startRow; row < startRow + height; row += 1) {
    for (let col = startCol; col < startCol + width; col += 1) {
      if (grid[row][col] !== null) {
        return false;
      }
    }
  }

  return true;
}

function placeGroup(grid, startRow, startCol, height, width, groupId) {
  const cells = [];
  const numbers = makeNumbersThatSumToTen(height * width);
  let numberIndex = 0;

  for (let row = startRow; row < startRow + height; row += 1) {
    for (let col = startCol; col < startCol + width; col += 1) {
      const value = numbers[numberIndex];
      grid[row][col] = {
        row,
        col,
        value,
        removed: false,
        groupId
      };
      cells.push({ row, col, value });
      numberIndex += 1;
    }
  }

  return {
    id: groupId,
    minRow: startRow,
    maxRow: startRow + height - 1,
    minCol: startCol,
    maxCol: startCol + width - 1,
    cells,
    sum: cells.reduce((total, cell) => total + cell.value, 0)
  };
}

function clearGroup(grid, group) {
  group.cells.forEach((cell) => {
    grid[cell.row][cell.col] = null;
  });
}

// 작은 직사각형 그룹으로 보드를 채워 최소 하나의 완전 클리어 경로를 보장합니다.
function buildSolvableBoard() {
  const shapes = [
    { height: 1, width: 2 },
    { height: 2, width: 1 },
    { height: 1, width: 3 },
    { height: 3, width: 1 },
    { height: 1, width: 4 },
    { height: 4, width: 1 },
    { height: 2, width: 2 }
  ];
  const grid = createEmptyGrid();
  const groups = [];
  let attempts = 0;

  function backtrack() {
    attempts += 1;
    if (attempts > 50000) {
      return false;
    }

    const empty = findFirstEmpty(grid);
    if (!empty) {
      return true;
    }

    for (const shape of shuffle(shapes)) {
      if (!canPlaceRectangle(grid, empty.row, empty.col, shape.height, shape.width)) {
        continue;
      }

      const group = placeGroup(grid, empty.row, empty.col, shape.height, shape.width, groups.length);
      groups.push(group);

      if (backtrack()) {
        return true;
      }

      groups.pop();
      clearGroup(grid, group);
    }

    return false;
  }

  if (!backtrack()) {
    return null;
  }

  return {
    board: grid.flat(),
    solutionGroups: groups,
    solutionSteps: groups.map((group) => ({
      minRow: group.minRow,
      maxRow: group.maxRow,
      minCol: group.minCol,
      maxCol: group.maxCol,
      cells: group.cells.map((cell) => ({ ...cell })),
      sum: group.sum
    }))
  };
}

function validateBoard(groups) {
  return groups.every((group) => {
    const sum = group.cells.reduce((total, cell) => total + cell.value, 0);
    return sum === 10 && group.sum === 10;
  });
}

function validateSolutionPath(originalBoard, steps) {
  const simulation = originalBoard.map((cell) => ({ ...cell, removed: false }));

  for (const step of steps) {
    const activeCells = simulation.filter((cell) => {
      return !cell.removed &&
        cell.row >= step.minRow &&
        cell.row <= step.maxRow &&
        cell.col >= step.minCol &&
        cell.col <= step.maxCol;
    });

    const sum = activeCells.reduce((total, cell) => total + cell.value, 0);
    if (sum !== 10) {
      if (DEBUG) {
        console.warn("검증 실패 step:", step, "계산된 합계:", sum);
      }
      return false;
    }

    activeCells.forEach((cell) => {
      cell.removed = true;
    });
  }

  return simulation.every((cell) => cell.removed);
}

function makeValidatedBoard() {
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    const result = buildSolvableBoard();
    if (!result) {
      continue;
    }

    const groupsOk = validateBoard(result.solutionGroups);
    const pathOk = validateSolutionPath(result.board, result.solutionSteps);
    if (groupsOk && pathOk) {
      if (DEBUG) {
        console.log("새 보드 검증 완료", {
          totalCells: result.board.length,
          solutionGroups: result.solutionGroups.length,
          solutionSteps: result.solutionSteps.length,
          allGroupsSumToTen: groupsOk,
          solutionPathClearsBoard: pathOk
        });
        console.log("solutionGroups", result.solutionGroups);
        console.log("solutionSteps", result.solutionSteps);
      }
      return result;
    }
  }

  throw new Error("검증 가능한 보드를 만들지 못했습니다.");
}

function keyFor(row, col) {
  return `${row},${col}`;
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function renderBoard() {
  boardElement.innerHTML = "";
  cellsByKey = new Map();

  board.forEach((cell) => {
    const button = document.createElement("button");
    button.className = "cell";
    button.type = "button";
    button.dataset.row = String(cell.row);
    button.dataset.col = String(cell.col);
    button.setAttribute("aria-label", `${cell.row + 1}행 ${cell.col + 1}열 숫자 ${cell.value}`);

    const number = document.createElement("span");
    number.className = "number";
    number.textContent = String(cell.value);

    button.append(number);
    boardElement.append(button);
    cellsByKey.set(keyFor(cell.row, cell.col), button);
  });
}

function updateCellVisual(cell) {
  const element = cellsByKey.get(keyFor(cell.row, cell.col));
  if (!element) {
    return;
  }
  element.classList.toggle("removed", cell.removed);
}

function animateRemoval(cell) {
  const element = cellsByKey.get(keyFor(cell.row, cell.col));
  if (!element) {
    return;
  }

  element.classList.add("removing");
  window.setTimeout(() => {
    element.classList.remove("removing");
    element.classList.add("removed");
  }, 180);
}

function updateStats() {
  scoreElement.textContent = String(score);
  timeElement.textContent = formatTime(timeLeft);

  timerBox.classList.toggle("is-low", gameState === "playing" && timeLeft <= 10);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function cellFromBoardPoint(clientX, clientY, shouldClamp, rect = boardElement.getBoundingClientRect()) {
  const isOutside = clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom;

  if (isOutside && !shouldClamp) {
    return null;
  }

  const x = clamp(clientX, rect.left, rect.right - 0.01) - rect.left;
  const y = clamp(clientY, rect.top, rect.bottom - 0.01) - rect.top;
  const col = clamp(Math.floor((x / rect.width) * COLS), 0, COLS - 1);
  const row = clamp(Math.floor((y / rect.height) * ROWS), 0, ROWS - 1);

  return {
    row,
    col
  };
}

function requestFrame(callback) {
  if (window.requestAnimationFrame) {
    return window.requestAnimationFrame(callback);
  }
  return window.setTimeout(callback, 16);
}

function cancelFrame(frameId) {
  if (window.cancelAnimationFrame) {
    window.cancelAnimationFrame(frameId);
    return;
  }
  window.clearTimeout(frameId);
}

function getCell(row, col) {
  return board.find((cell) => cell.row === row && cell.col === col);
}

function calculateSelection(start, end) {
  const minRow = Math.min(start.row, end.row);
  const maxRow = Math.max(start.row, end.row);
  const minCol = Math.min(start.col, end.col);
  const maxCol = Math.max(start.col, end.col);
  const selectedCells = board.filter((cell) => {
    return cell.row >= minRow &&
      cell.row <= maxRow &&
      cell.col >= minCol &&
      cell.col <= maxCol;
  });
  const activeCells = selectedCells.filter((cell) => !cell.removed);
  const sum = activeCells.reduce((total, cell) => total + cell.value, 0);

  return { minRow, maxRow, minCol, maxCol, selectedCells, activeCells, sum };
}

function hasAvailableMove() {
  const activeValues = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

  board.forEach((cell) => {
    if (!cell.removed) {
      activeValues[cell.row][cell.col] = cell.value;
    }
  });

  const prefix = Array.from({ length: ROWS + 1 }, () => Array(COLS + 1).fill(0));
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      prefix[row + 1][col + 1] = activeValues[row][col] +
        prefix[row][col + 1] +
        prefix[row + 1][col] -
        prefix[row][col];
    }
  }

  for (let minRow = 0; minRow < ROWS; minRow += 1) {
    for (let maxRow = minRow; maxRow < ROWS; maxRow += 1) {
      for (let minCol = 0; minCol < COLS; minCol += 1) {
        for (let maxCol = minCol; maxCol < COLS; maxCol += 1) {
          const sum = prefix[maxRow + 1][maxCol + 1] -
            prefix[minRow][maxCol + 1] -
            prefix[maxRow + 1][minCol] +
            prefix[minRow][minCol];

          if (sum === 10) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

function clearSelection() {
  document.querySelectorAll(".cell.selected").forEach((element) => {
    element.classList.remove("selected", "good", "over");
  });
  currentSelection = null;
  updateStats();
}

function paintSelection(selection) {
  document.querySelectorAll(".cell.selected").forEach((element) => {
    element.classList.remove("selected", "good", "over");
  });

  selection.selectedCells.forEach((cell) => {
    const element = cellsByKey.get(keyFor(cell.row, cell.col));
    if (!element) {
      return;
    }
    element.classList.add("selected");
    element.classList.toggle("good", selection.sum === 10);
    element.classList.toggle("over", selection.sum > 10);
  });

  currentSelection = selection;
  updateStats();
}

function scheduleSelectionPaint(cell) {
  pendingDragCell = cell;
  if (dragFrameId !== null) {
    return;
  }

  dragFrameId = requestFrame(() => {
    dragFrameId = null;
    if (!isDragging || !dragStart || !pendingDragCell || gameState !== "playing") {
      pendingDragCell = null;
      return;
    }

    paintSelection(calculateSelection(dragStart, pendingDragCell));
    pendingDragCell = null;
  });
}

function cancelSelectionPaint() {
  if (dragFrameId !== null) {
    cancelFrame(dragFrameId);
    dragFrameId = null;
  }
  pendingDragCell = null;
}

function startDrag(pointerEvent) {
  if (gameState !== "playing") {
    return;
  }

  const start = cellFromBoardPoint(pointerEvent.clientX, pointerEvent.clientY, false);
  if (!start) {
    return;
  }

  const cell = getCell(start.row, start.col);
  if (!cell) {
    return;
  }

  pointerEvent.preventDefault();
  isDragging = true;
  dragStart = start;
  dragBoardRect = boardElement.getBoundingClientRect();
  boardElement.setPointerCapture(pointerEvent.pointerId);
  paintSelection(calculateSelection(dragStart, start));
}

function moveDrag(pointerEvent) {
  if (!isDragging || !dragStart || gameState !== "playing") {
    return;
  }

  pointerEvent.preventDefault();
  const current = cellFromBoardPoint(pointerEvent.clientX, pointerEvent.clientY, true, dragBoardRect);
  if (!current) {
    return;
  }

  scheduleSelectionPaint(current);
}

function finishDrag(pointerEvent) {
  if (!isDragging) {
    return;
  }

  isDragging = false;
  cancelSelectionPaint();
  if (boardElement.hasPointerCapture(pointerEvent.pointerId)) {
    boardElement.releasePointerCapture(pointerEvent.pointerId);
  }

  const end = cellFromBoardPoint(pointerEvent.clientX, pointerEvent.clientY, true, dragBoardRect);
  if (end && dragStart) {
    currentSelection = calculateSelection(dragStart, end);
  }
  dragBoardRect = null;

  let removedAny = false;
  if (currentSelection && currentSelection.sum === 10 && currentSelection.activeCells.length > 0) {
    currentSelection.activeCells.forEach((cell) => {
      cell.removed = true;
      animateRemoval(cell);
    });
    score += currentSelection.activeCells.length;
    removedAny = true;
  }

  clearSelection();
  updateStats();

  if (removedAny) {
    const remainingActiveCells = board.filter((cell) => !cell.removed).length;
    if (remainingActiveCells === 0) {
      endGame("clear");
    } else if (!hasAvailableMove()) {
      endGame("noMoves");
    }
  }
}

function stopTimer() {
  if (timerId !== null) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

function refreshTimer() {
  const remainingMs = Math.max(0, timerEndsAt - now());
  timeLeft = Math.ceil(remainingMs / 1000);
  updateStats();

  if (remainingMs <= 0) {
    endGame("timeout");
  }
}

function startTimer() {
  stopTimer();
  timerEndsAt = now() + GAME_SECONDS * 1000;
  timeLeft = GAME_SECONDS;
  updateStats();
  timerId = window.setInterval(refreshTimer, 1000);
}

function prepareBoard() {
  const result = makeValidatedBoard();
  board = result.board;
  solutionGroups = result.solutionGroups;
  solutionSteps = result.solutionSteps;

  // 콘솔에서만 확인할 수 있는 개발용 검증 정보입니다.
  window.debugFruitPuzzle = {
    board,
    solutionGroups,
    solutionSteps,
    validateBoard: () => validateBoard(solutionGroups),
    validateSolutionPath: () => validateSolutionPath(board, solutionSteps)
  };

  renderBoard();
}

function resetGameState() {
  stopTimer();
  score = 0;
  timeLeft = GAME_SECONDS;
  gameState = "ready";
  isDragging = false;
  dragStart = null;
  dragBoardRect = null;
  cancelSelectionPaint();
  currentSelection = null;
  gameOverElement.hidden = true;
  updateStats();
}

function startNewGame() {
  resetGameState();
  prepareBoard();
  startScreen.hidden = true;
  gameState = "playing";
  if (!hasAvailableMove()) {
    endGame("noMoves");
    return;
  }
  startTimer();
}

function showStartScreen() {
  resetGameState();
  board = [];
  solutionGroups = [];
  solutionSteps = [];
  cellsByKey = new Map();
  boardElement.innerHTML = "";
  startScreen.hidden = false;
}

function endGame(reason) {
  if (gameState !== "playing") {
    return;
  }

  gameState = "ended";
  isDragging = false;
  dragBoardRect = null;
  cancelSelectionPaint();
  stopTimer();
  clearSelection();

  const removedCount = board.filter((cell) => cell.removed).length;
  const remainingCount = TOTAL_CELLS - removedCount;
  finalScoreElement.textContent = String(score);
  removedCountElement.textContent = String(removedCount);
  resultSecondaryLabelElement.textContent = "남은 과일";
  resultSecondaryValueElement.textContent = String(remainingCount);

  const titles = {
    timeout: "시간 종료!",
    clear: "클리어!",
    noMoves: "더 이상 조합 없음!"
  };
  const moods = {
    timeout: "조금만 더!",
    clear: "복숭아 바구니 완성!",
    noMoves: "새 판에서 다시 도전!"
  };

  resultTitleElement.textContent = titles[reason] || titles.timeout;
  resultMoodElement.textContent = moods[reason] || moods.timeout;

  gameOverElement.hidden = false;
}

boardElement.addEventListener("pointerdown", startDrag);
boardElement.addEventListener("pointermove", moveDrag);
boardElement.addEventListener("pointerup", finishDrag);
boardElement.addEventListener("pointercancel", finishDrag);
restartButton.addEventListener("click", startNewGame);
startButton.addEventListener("click", startNewGame);
playAgainButton.addEventListener("click", startNewGame);

showStartScreen();
