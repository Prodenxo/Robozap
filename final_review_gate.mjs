// final_review_gate.mjs
import readline from "node:readline";

const rl = readline.createInterface({
 input: process.stdin,
 output: process.stdout,
 terminal: true,
});

function printHeader() {
 console.log("--- FINAL REVIEW GATE ACTIVE ---");
 console.log("AI has completed its primary actions. Awaiting your review or further sub-prompts.");
 console.log("Type your sub-prompt or 'TASK_COMPLETE' to allow AI to conclude.");
}

printHeader();

function prompt() {
 rl.question("REVIEW_GATE_AWAITING_INPUT:", (answer) => {
 const userInput = String(answer ?? "").trim();

 if (userInput.toUpperCase() === "TASK_COMPLETE") {
 console.log("--- REVIEW GATE: USER CONFIRMED TASK COMPLETE ---");
 rl.close();
 return;
 }

 if (userInput.length > 0) {
 console.log(`USER_REVIEW_SUB_PROMPT: ${userInput}`);
 }

 prompt();
 });
}

rl.on("close", () => {
 console.log("--- FINAL REVIEW GATE SCRIPT EXITED ---");
});

rl.on("SIGINT", () => {
 console.log("--- REVIEW GATE: SESSION INTERRUPTED BY USER (SIGINT) ---");
 rl.close();
});

rl.on("error", (e) => {
 console.log(`--- REVIEW GATE SCRIPT ERROR: ${e?.message ?? String(e)} ---`);
 rl.close();
});

prompt();
