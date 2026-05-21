export const MIN_CROP_PX = 20;

export function pointerBoxToNatural(pointer, dims) {
    const { startX, startY, endX, endY } = pointer;
    const { displayWidth, displayHeight, naturalWidth, naturalHeight } = dims;
    const scaleX = naturalWidth / displayWidth;
    const scaleY = naturalHeight / displayHeight;
    const x0 = Math.min(startX, endX) * scaleX;
    const y0 = Math.min(startY, endY) * scaleY;
    const x1 = Math.max(startX, endX) * scaleX;
    const y1 = Math.max(startY, endY) * scaleY;
    const cx0 = Math.max(0, Math.min(naturalWidth, x0));
    const cy0 = Math.max(0, Math.min(naturalHeight, y0));
    const cx1 = Math.max(0, Math.min(naturalWidth, x1));
    const cy1 = Math.max(0, Math.min(naturalHeight, y1));
    return {
        x: Math.round(cx0),
        y: Math.round(cy0),
        w: Math.round(cx1 - cx0),
        h: Math.round(cy1 - cy0),
    };
}

export function isValidCrop(box) {
    if (!box) return false;
    return box.w >= MIN_CROP_PX && box.h >= MIN_CROP_PX;
}

function defaultCreateCanvas(w, h) {
    return new OffscreenCanvas(w, h);
}

export async function cropToBase64(imgElement, box, opts = {}) {
    const createCanvas = opts.createCanvas || defaultCreateCanvas;
    const quality = opts.quality ?? 0.9;
    const canvas = createCanvas(box.w, box.h);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imgElement, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
    const buf = await blob.arrayBuffer();
    return arrayBufferToBase64(buf);
}

function arrayBufferToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}
