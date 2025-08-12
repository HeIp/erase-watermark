import axios, { type AxiosProxyConfig } from "axios";
import { SignJWT } from "jose";
import sharp from "sharp";

export default class DeWatermark {
    private proxy?: AxiosProxyConfig;

    constructor(proxy?: AxiosProxyConfig) {
        this.proxy = proxy;
    }

    public async eraseWatermark(image: Buffer): Promise<Buffer> {
        const { data: html } = await axios.get("https://dewatermark.ai/upload");
        const { data: js } = await axios.get(`https://dewatermark.ai/_next/static/chunks/pages/_app${html.split("/_next/static/chunks/pages/_app")[1].split(".js")[0]}.js`);
        const jwtKey = js.split("https://api.dewatermark.ai\"")[1].split("\"")[1];

        const apiKey = "Bearer " + await this.createJWT(this.base64ToUint8Array(jwtKey), false);

        const resized = await this.resizeImage(image, 3560);

        const payload = new FormData();
        payload.append("original_preview_image", new Blob([resized]), "image.png");
        payload.append("zoom_factor", "2");

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

        if (!data.edited_image) throw new Error(data);

        return Buffer.from(data.edited_image.image, "base64");
    }

    private base64ToUint8Array(base64: string): Uint8Array {
        // Use Buffer.from with 'base64url' to handle URL-safe base64 strings,
        // which are common for JWT keys. This is more robust than atob().
        return Buffer.from(base64, "base64url");
    }

    private async createJWT(keyString: Uint8Array, er: boolean): Promise<string> {
        const key = await this.importKey(keyString);

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

    private async importKey(en: Uint8Array): Promise<CryptoKey> {
        return await crypto.subtle.importKey(
            "raw",
            en,
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign", "verify"]
        );
    }

    private async resizeImage(buffer: Buffer, targetWidth: number): Promise<Buffer> {
        const metadata = await sharp(buffer).metadata();

        if (!metadata.width || !metadata.height) throw new Error("Unable to retrieve image dimensions.");
        
        if (metadata.width <= targetWidth) return buffer;

        const targetHeight = Math.round((targetWidth / metadata.width) * metadata.height);

        const resizedBuffer = await sharp(buffer).resize(targetWidth, targetHeight).toBuffer();

        return resizedBuffer;
    }
}