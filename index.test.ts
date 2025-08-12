import { test, expect } from "bun:test";
import { readdirSync, rmSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import DeWatermark from "./";

const inputDir = "images";
const outputDir = "results";

// Find all image files in the input directory.
// This is done outside the test to dynamically calculate the timeout.
const imageFiles = existsSync(inputDir)
    ? readdirSync(inputDir).filter(file => /\.(jpe?g|png|webp)$/i.test(file))
    : [];

// Calculate a dynamic timeout: 20 seconds per image, with a minimum of 30s.
const dynamicTimeout = Math.max(30000, 20000 * imageFiles.length);

test(`should erase watermarks from all images in the '${inputDir}' folder`, async () => {
    // This assertion provides a clear message if the 'images' folder is missing or empty.
    expect(imageFiles.length).toBeGreaterThan(0, `No images found in '${inputDir}' to test.`);

    const dewatermark = new DeWatermark();

    // Clean and create the output directory for a fresh run.
    if (existsSync(outputDir)) {
        rmSync(outputDir, { recursive: true, force: true });
    }
    mkdirSync(outputDir, { recursive: true });

    const processingPromises = imageFiles.map(async (imageFile) => {
        const inputImagePath = join(inputDir, imageFile);
        const outputImagePath = join(outputDir, imageFile);

        console.log(`Processing ${inputImagePath}...`);
        const imageBuffer = await dewatermark.eraseWatermark(
            Buffer.from(await Bun.file(inputImagePath).arrayBuffer())
        );

        await Bun.write(outputImagePath, imageBuffer);

        // Assertions can be done inside the map as well.
        expect(existsSync(outputImagePath)).toBe(true, `Output file ${outputImagePath} was not created.`);
        expect(Bun.file(outputImagePath).size).toBeGreaterThan(0, `Output file ${outputImagePath} is empty.`);
        console.log(` -> Saved result to ${outputImagePath}`);
    });

    await Promise.all(processingPromises);
}, dynamicTimeout);