import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Convert the module URL to a file path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const extensions = [".jsx", ".css", ".js"];
const excludedDirs = new Set(["node_modules", "public", ".idea"]);
const outputFile = "all_code.txt";

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(file => {
        const dirPath = path.join(dir, file);
        const isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory && !excludedDirs.has(file)) {
            walkDir(dirPath, callback);
        } else if (extensions.some(ext => file.endsWith(ext))) {
            callback(dirPath);
        }
    });
}

const outputStream = fs.createWriteStream(outputFile, { encoding: 'utf-8' });

walkDir('..', (filePath) => {
    const content = fs.readFileSync(filePath, { encoding: 'utf-8', flag: 'r' });
    outputStream.write(`===== ${filePath} =====\n`);
    outputStream.write(content + '\n\n');
});

outputStream.end();
console.log(`Code copied to ${outputFile}, excluding ${[...excludedDirs].join(', ')}`);