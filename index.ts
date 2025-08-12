import axios, { type AxiosProxyConfig } from "axios";
import { SignJWT } from "jose";
import sharp from "sharp";

/**
 * A class to interact with the dewatermark.ai service to remove watermarks from images.
 * It handles fetching API keys, creating authentication tokens (JWT), and processing images.
 */
export default class DeWatermark {
    // Optional proxy configuration for all outgoing Axios requests.
    private proxy?: AxiosProxyConfig;

    /**
     * Initializes a new instance of the DeWatermark class.
     * @param proxy - Optional proxy configuration (e.g., { host: '127.0.0.1', port: 8888 }).
     */
    constructor(proxy?: AxiosProxyConfig) {
        this.proxy = proxy;
    }

    /**
     * The main public method to erase a watermark from a given image buffer.
     * @param image - A Buffer containing the image data.
     * @returns A Promise that resolves to a Buffer of the processed image without the watermark.
     */
    public async eraseWatermark(image: Buffer): Promise<Buffer> {
        // Step 1: Scrape the main page to find the relevant JavaScript file URL.
        // The dewatermark.ai website dynamically loads its scripts, and the JWT key is embedded within one of them.
        const { data: html } = await axios.get("https://dewatermark.ai/upload");

        // Step 2: Extract the script's path from the HTML and fetch the JavaScript file.
        // This is a bit of a hack and might break if the website structure changes.
        const { data: js } = await axios.get(`https://dewatermark.ai/_next/static/chunks/pages/_app${html.split("/_next/static/chunks/pages/_app")[1].split(".js")[0]}.js`);
        
        // Step 3: Extract the raw JWT key from the JavaScript code using string splitting.
        // This key is used to sign our own JWT to authenticate with their API.
        const jwtKey = js.split("https://api.dewatermark.ai\"")[1].split("\"")[1];

        // Step 4: Create a Bearer token. This involves converting the key and signing a new JWT.
        const apiKey = "Bearer " + await this.createJWT(this.base64ToUint8Array(jwtKey), false);

        // Step 5: Resize the image if it's wider than 3560px, as the API may have dimension limits.
        const resized = await this.resizeImage(image, 3560);

        // Step 6: Prepare the image data for upload as multipart/form-data.
        const payload = new FormData();
        payload.append("original_preview_image", new Blob([resized]), "image.png");
        payload.append("zoom_factor", "2");

        // Step 7: Send the request to the watermark removal API endpoint.
        // We include several headers to mimic a real browser request, including our generated Authorization token.
        const { data } = await axios.post("https://api.dewatermark.ai/api/object_removal/v5/erase_watermark", payload, {
            headers: {
                "X-Api-Mode": "AUTO",
                "X-Service": "REMOVE_WATERMARK",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "Referer": "https://dewatermark.ai/",
                "Origin": "https://dewatermark.ai",
                "Host": "api.dewatermark.ai",
                "Authorization": apiKey
            },
            proxy: this.proxy
        });

        // Step 8: Handle the API response. If the expected data isn't present, throw an error.
        if (!data.edited_image) throw new Error(data);

        // Step 9: The resulting image is base64 encoded. Decode it and return it as a Buffer.
        return Buffer.from(data.edited_image.image, "base64");
    }

    /**
     * Converts a base64url encoded string to a Uint8Array.
     * This is necessary because the JWT key from the website is in base64url format.
     * @param base64 - The base64url encoded string.
     * @returns A Uint8Array representation of the decoded string.
     */
    private base64ToUint8Array(base64: string): Uint8Array {
        // Use Buffer.from with 'base64url' to handle URL-safe base64 strings,
        // which are common for JWT keys. This is more robust than atob().
        return Buffer.from(base64, "base64url");
    }

    /**
     * Creates a JSON Web Token (JWT) to authenticate with the dewatermark.ai API.
     * @param keyString - The secret key as a Uint8Array.
     * @param er - A boolean flag, likely for "is_pro" status.
     * @returns A Promise that resolves to the signed JWT string.
     */
    private async createJWT(keyString: Uint8Array, er: boolean): Promise<string> {
        // First, import the raw key into a format the crypto library can use.
        const key = await this.importKey(keyString);

        // Use the 'jose' library to construct and sign the JWT.
        // The payload contains claims the API expects, like an expiration time ('exp').
        const jwt = await new SignJWT({
            sub: "ignore",
            platform: "web",
            is_pro: er,
            exp: Math.round(Date.now() / 1000) + 300
        })
        .setProtectedHeader({
            alg: "HS256",
            typ: "JWT"
        })
        .sign(key);

        return jwt;
    }

    /**
     * Imports a raw key for use with the Web Crypto API.
     * @param en - The raw key as a Uint8Array.
     * @returns A Promise that resolves to a CryptoKey object suitable for signing.
     */
    private async importKey(en: Uint8Array): Promise<CryptoKey> {
        return await crypto.subtle.importKey(
            // 'raw': The format of the key being imported.
            "raw",
            en,
            // 'algorithm': Specifies the algorithm the key will be used for.
            { name: "HMAC", hash: "SHA-256" },
            // 'extractable': Whether the key can be exported later (false for security).
            false,
            // 'keyUsages': What this key is allowed to be used for.
            ["sign", "verify"]
        );
    }

    /**
     * Resizes an image buffer if its width exceeds a target value, maintaining aspect ratio.
     * @param buffer - The input image Buffer.
     * @param targetWidth - The maximum desired width.
     * @returns A Promise that resolves to the (potentially resized) image Buffer.
     */
    private async resizeImage(buffer: Buffer, targetWidth: number): Promise<Buffer> {
        // Use the 'sharp' library to efficiently read image metadata without decoding the whole image.
        const metadata = await sharp(buffer).metadata();

        if (!metadata.width || !metadata.height) throw new Error("Unable to retrieve image dimensions.");
        
        // If the image is already smaller than or equal to the target width, no resizing is needed.
        if (metadata.width <= targetWidth) return buffer;

        // Calculate the corresponding height to maintain the original aspect ratio.
        const targetHeight = Math.round((targetWidth / metadata.width) * metadata.height);

        // Perform the resize operation and return the new image as a Buffer.
        const resizedBuffer = await sharp(buffer).resize(targetWidth, targetHeight).toBuffer();

        return resizedBuffer;
    }
}