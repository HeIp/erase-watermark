import { test, expect } from "bun:test";
import { readdirSync, rmSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import DeWatermark from "./";

// Define constants for the input and output directories to keep the code clean.
const inputDir = "images";
const outputDir = "results";

// Find all supported image files (jpg, jpeg, png, webp) in the input directory.
// This is done once outside the test block for efficiency and to help calculate a dynamic timeout.
const imageFiles = existsSync(inputDir)
    ? readdirSync(inputDir).filter(file => /\.(jpe?g|png|webp)$/i.test(file))
    : [];

// Calculate a dynamic timeout for the test. This prevents the test from failing
// prematurely if many images are being processed, as each API call can take time.
// We allocate 20 seconds per image, with a minimum total timeout of 30 seconds.
const dynamicTimeout = Math.max(30000, 20000 * imageFiles.length);

// Define the test case using Bun's `test` function.
test(`should erase watermarks from all images in the '${inputDir}' folder`, async () => {
    // First, assert that there are actually images to process.
    // This provides a clear, actionable error message if the 'images' folder is empty or missing.
    expect(imageFiles.length).toBeGreaterThan(0, `No images found in '${inputDir}' to test.`);

    // Instantiate the class we want to test.
    const dewatermark = new DeWatermark();

    // Before running the test, ensure a clean state by removing the old results
    // directory if it exists, and then creating a new empty one.
    if (existsSync(outputDir)) {
        rmSync(outputDir, { recursive: true, force: true });
    }
    mkdirSync(outputDir, { recursive: true });

    // Process all found images concurrently for better performance.
    // `map` creates an array of Promises, where each promise represents the processing of one image.
    const processingPromises = imageFiles.map(async (imageFile) => {
        const inputImagePath = join(inputDir, imageFile);
        const outputImagePath = join(outputDir, imageFile);

        console.log(`Processing ${inputImagePath}...`);

        // The `eraseWatermark` method expects a Buffer.
        // We read the file from disk as an ArrayBuffer using Bun's API and then convert it to a Buffer.
        const imageBuffer = await dewatermark.eraseWatermark(
            Buffer.from(await Bun.file(inputImagePath).arrayBuffer())
        );

        // Write the processed image buffer to the results directory.
        await Bun.write(outputImagePath, imageBuffer);

        // After processing, run assertions to verify the outcome for each image.
        // 1. Check that the output file was actually created.
        expect(existsSync(outputImagePath)).toBe(true, `Output file ${outputImagePath} was not created.`);
        // 2. Check that the created file is not empty.
        expect(Bun.file(outputImagePath).size).toBeGreaterThan(0, `Output file ${outputImagePath} is empty.`);

        console.log(` -> Saved result to ${outputImagePath}`);
    });

    // `Promise.all` waits for all the image processing promises to complete before the test finishes.
    // If any of the promises reject (i.e., an error occurs), `Promise.all` will also reject, failing the test.
    await Promise.all(processingPromises);
}, dynamicTimeout);