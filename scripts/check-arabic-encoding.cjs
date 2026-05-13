const fs = require("fs");

const files = ["app/index.tsx"];

// Detect common mojibake markers: ? ? ? ? ? ?
// Written with Unicode escapes so the script stays safe even when saved as ASCII.
const badPattern = /[\u00C3\u00D8\u00D9\u00C2\u00E2\uFFFD]/;

let failed = false;

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (badPattern.test(line)) {
      failed = true;
      console.error(`${file}:${index + 1}: possible mojibake -> ${line.trim()}`);
    }
  });
}

if (failed) {
  console.error("\nArabic encoding check failed.");
  process.exit(1);
}

console.log("Arabic encoding check passed.");
