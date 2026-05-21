import { test } from "node:test";
import assert from "node:assert/strict";

import {
    pointerBoxToNatural,
    isValidCrop,
    cropToBase64,
    MIN_CROP_PX,
} from "../extension/crop.js";

test("pointerBoxToNatural scales display coords to image-natural coords", () => {
    const box = pointerBoxToNatural(
        { startX: 10, startY: 20, endX: 60, endY: 70 },
        { displayWidth: 200, displayHeight: 100, naturalWidth: 400, naturalHeight: 200 },
    );
    assert.deepEqual(box, { x: 20, y: 40, w: 100, h: 100 });
});

test("pointerBoxToNatural normalizes inverted drag (end before start)", () => {
    const box = pointerBoxToNatural(
        { startX: 60, startY: 70, endX: 10, endY: 20 },
        { displayWidth: 100, displayHeight: 100, naturalWidth: 100, naturalHeight: 100 },
    );
    assert.deepEqual(box, { x: 10, y: 20, w: 50, h: 50 });
});

test("pointerBoxToNatural clamps to image bounds", () => {
    const box = pointerBoxToNatural(
        { startX: -10, startY: -10, endX: 250, endY: 250 },
        { displayWidth: 200, displayHeight: 200, naturalWidth: 100, naturalHeight: 100 },
    );
    assert.deepEqual(box, { x: 0, y: 0, w: 100, h: 100 });
});

test("isValidCrop rejects boxes smaller than MIN_CROP_PX on either side", () => {
    assert.equal(MIN_CROP_PX, 20);
    assert.equal(isValidCrop({ x: 0, y: 0, w: 19, h: 100 }), false);
    assert.equal(isValidCrop({ x: 0, y: 0, w: 100, h: 19 }), false);
    assert.equal(isValidCrop({ x: 0, y: 0, w: 20, h: 20 }), true);
    assert.equal(isValidCrop(null), false);
});

test("cropToBase64 draws the box region and returns a base64 JPEG", async () => {
    const drawCalls = [];
    const fakeCtx = {
        drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) {
            drawCalls.push({ img, sx, sy, sw, sh, dx, dy, dw, dh });
        },
    };
    const fakeCanvas = {
        width: 0,
        height: 0,
        getContext: () => fakeCtx,
        convertToBlob: async ({ type, quality } = {}) => {
            return { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer, type: type || "image/jpeg", _quality: quality };
        },
    };
    const fakeImg = { naturalWidth: 800, naturalHeight: 600 };

    const result = await cropToBase64(fakeImg, { x: 100, y: 200, w: 300, h: 250 }, {
        createCanvas: (w, h) => { fakeCanvas.width = w; fakeCanvas.height = h; return fakeCanvas; },
    });

    assert.equal(fakeCanvas.width, 300);
    assert.equal(fakeCanvas.height, 250);
    assert.equal(drawCalls.length, 1);
    assert.deepEqual(drawCalls[0], {
        img: fakeImg, sx: 100, sy: 200, sw: 300, sh: 250, dx: 0, dy: 0, dw: 300, dh: 250,
    });
    assert.equal(result, "AQID");
});
