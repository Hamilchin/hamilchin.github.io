const canvas = document.getElementById('drawCanvas');
const ctx = canvas.getContext('2d');

// Set canvas dimensions to cover the entire page
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const backgroundColor = [230, 255, 250]; // in RGB
const squareColor = [175, 137, 100];

const squareSize = 4;
const rows = Math.ceil(canvas.height / squareSize);
const cols = Math.ceil(canvas.width / squareSize);
let grid = Array.from({ length: rows }, () => Array(cols).fill([0, 1])); // (status, opacity)
let isDrawing = false;
let isPaused = false; // Flag to control simulation

let dirtyCells = new Set(); // Track cells that need to be redrawn
let isDrawingScheduled = false; // Ensure draw is scheduled only once

// Draw only dirty cells
function drawGrid() {
    ctx.beginPath();
    dirtyCells.forEach(cell => {
        const [row, col] = cell.split(',').map(Number);
        ctx.fillStyle = getCellColor(grid[row][col]);
        ctx.fillRect(col * squareSize, row * squareSize, squareSize, squareSize);
    });
    ctx.closePath();
    dirtyCells.clear();
}

// Schedule a draw operation with requestAnimationFrame
function scheduleDraw() {
    if (!isDrawingScheduled) {
        isDrawingScheduled = true;
        requestAnimationFrame(() => {
            drawGrid();
            isDrawingScheduled = false;
        });
    }
}

function getCellColor(cellArray) {
    if (cellArray[0] === 0) {
        const [r, g, b] = backgroundColor;
        const a = cellArray[1]; // Opacity from 0 to 1
        return `rgba(${r}, ${g}, ${b}, ${a})`;
    } else if (cellArray[0] === 1) {
        const [r, g, b] = squareColor;
        const a = cellArray[1]; // Opacity from 0 to 1
        return `rgba(${r}, ${g}, ${b}, ${a})`;
    } else {
        throw new Error('cellArray status not valid: ' + String(cellArray[0]));
    }
}

// Change the color of the square and mark it as dirty
function changeSquareColor(row, col) {
    if (grid[row] && grid[row][col]) {
        grid[row][col] = [1, 1]; // Change to alive
        dirtyCells.add(`${row},${col}`); // Mark as dirty
    }
}

// Change the color of the square based on mouse position
function changeSquareColorAtEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const col = Math.floor(x / squareSize);
    const row = Math.floor(y / squareSize);
    changeSquareColor(row, col);
    scheduleDraw(); // Schedule a draw operation
}

// Update the grid every 2 seconds
function updateGridConway() {
    if (isPaused) return;

    const newGrid = Array.from({ length: rows }, () => Array(cols).fill([0, 1]));

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            let nextState = cellNextState(row, col);
            if (nextState === "alive") {
                newGrid[row][col] = [1, 1];
            } else if (nextState === "dead") {
                newGrid[row][col] = [0, 1];
            }
            // If state changes, mark the cell as dirty
            if (newGrid[row][col][0] !== grid[row][col][0]) {
                dirtyCells.add(`${row},${col}`);
            }
        }
    }

    grid = newGrid;
    scheduleDraw(); // Schedule a draw operation for updated cells

    function cellNextState(row, col) {
        const neighbors = countAliveNeighbors(row, col);
        if (grid[row][col][0] === 1) {
            return (neighbors === 2 || neighbors === 3) ? "alive" : "dead";
        } else if (grid[row][col][0] === 0) {
            return (neighbors === 3) ? "alive" : "dead";
        }
    }

    function countAliveNeighbors(row, col) {
        const directions = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1],          [0, 1],
            [1, -1], [1, 0], [1, 1],
        ];

        let count = 0;
        for (const [dx, dy] of directions) {
            const newRow = (row + dx + rows) % rows;
            const newCol = (col + dy + cols) % cols;

            if (grid[newRow][newCol][0] === 1) {
                count++;
            }
        }
        return count;
    }
}

// Handle mouse events
canvas.addEventListener('mousedown', (event) => {
    isDrawing = true; // Start drawing
    isPaused = true; // Pause the simulation
    changeSquareColorAtEvent(event);
});

canvas.addEventListener('mouseup', () => {
    isDrawing = false; // Stop drawing
    isPaused = false; // Resume the simulation
});

canvas.addEventListener('mouseleave', () => {
    isDrawing = false; // Stop drawing if mouse leaves the canvas
    isPaused = false; // Resume the simulation
});

canvas.addEventListener('mousemove', (event) => {
    if (isDrawing) {
        changeSquareColorAtEvent(event);
    }
});

// Start the update loop
setInterval(updateGridConway, 20);

drawGrid(); // Initial draw


