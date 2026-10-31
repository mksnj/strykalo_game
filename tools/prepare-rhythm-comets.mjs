// Package owner-provided vertical sprites, aligning their bright heads to the judging point.
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import layout from "../apps/web/src/game/assets/cometLayout.json" with { type: "json" };

const directory = "assets/source/rhythm-comets",
  output = "apps/web/public/assets/rhythm-comets";
const paths = [
  "docs/comet_vertical_1.png",
  "docs/comet_vertical_2.png",
  "docs/comet_vertical_3.png",
  "docs/comet_vertical_4.png",
];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
await mkdir(directory, { recursive: true });
await mkdir(output, { recursive: true });
const files = await Promise.all(
  paths.map(async (path) => {
    const bytes = await readFile(path),
      preserved = directory + "/" + path.split("/").at(-1);
    await copyFile(path, preserved);
    return {
      path,
      preserved,
      sha256: sha(bytes),
      data: bytes.toString("base64"),
    };
  }),
);
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage();
  const result = await page.evaluate(
    async ({ files, layout }) => {
      const atlas = document.createElement("canvas");
      atlas.width = layout.cellWidth * files.length;
      atlas.height = layout.cellHeight;
      const g = atlas.getContext("2d"),
        frames = [];
      for (const [frame, file] of files.entries()) {
        const image = new Image();
        image.src = "data:image/png;base64," + file.data;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
        let mass = 0,
          sumX = 0,
          sumY = 0,
          transparent = 0;
        for (let y = 0; y < image.height; y++)
          for (let x = 0; x < image.width; x++) {
            const i = (y * image.width + x) * 4;
            if (!pixels[i + 3]) transparent++;
            if (y < image.height * 0.65 || y > image.height * 0.9) continue;
            const light =
              (pixels[i] + pixels[i + 1] + pixels[i + 2]) / (3 * 255);
            const weight = (light ** 6 * pixels[i + 3]) / 255;
            mass += weight;
            sumX += x * weight;
            sumY += y * weight;
          }
        if (!transparent || !mass)
          throw new Error(
            "Expected transparent comet with a bright head: " + file.path,
          );
        const head = { x: sumX / mass, y: sumY / mass };
        const dx = layout.anchor.x - head.x * layout.sourceScale,
          dy = layout.anchor.y - head.y * layout.sourceScale;
        // Isolated cell clips only empty padding, never a neighbouring frame.
        canvas.width = layout.cellWidth;
        canvas.height = layout.cellHeight;
        ctx.drawImage(
          image,
          dx,
          dy,
          image.width * layout.sourceScale,
          image.height * layout.sourceScale,
        );
        const bytes = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let clipped = false;
        for (let y = 0; y < canvas.height; y++)
          for (let x = 0; x < canvas.width; x++) {
            if (
              (x === 0 ||
                y === 0 ||
                x === canvas.width - 1 ||
                y === canvas.height - 1) &&
              bytes[(y * canvas.width + x) * 4 + 3] > 1
            )
              clipped = true;
          }
        if (clipped)
          throw new Error("Visible comet touches cell edge: " + file.path);
        g.drawImage(canvas, frame * layout.cellWidth, 0);
        frames.push({
          frame,
          width: image.width,
          height: image.height,
          transparentPixels: transparent,
          head,
          translation: { x: dx, y: dy },
          clipped,
        });
      }
      return { png: atlas.toDataURL("image/png").split(",")[1], frames };
    },
    { files, layout },
  );
  const bytes = Buffer.from(result.png, "base64"),
    path = output + "/comets.png";
  await writeFile(path, bytes);
  const audit = {
    createdOn: "2026-10-30",
    method:
      "Deterministic atlas packing and uniform scaling of two provided vertical PNGs; alpha preserved, no colour removal, rotation or image generation.",
    sources: files.map(({ data, ...file }, i) => ({
      ...file,
      ...result.frames[i],
    })),
    layout,
    output: {
      path,
      width: layout.cellWidth * files.length,
      height: layout.cellHeight,
      bytes: bytes.length,
      sha256: sha(bytes),
    },
  };
  await writeFile(
    directory + "/audit.json",
    JSON.stringify(audit, null, 2) + "\n",
  );
  const provenancePath = "assets/source/provenance.json",
    provenance = JSON.parse(await readFile(provenancePath, "utf8"));
  provenance.generatedAssets = provenance.generatedAssets.filter(
    (entry) => entry.collection !== "rhythm-comets",
  );
  provenance.generatedAssets.push({
    collection: "rhythm-comets",
    createdOn: "2026-10-30",
    tool: audit.method,
    sources: paths,
    audit: directory + "/audit.json",
    license: "Owner-provided project artwork; no external material added",
  });
  await writeFile(provenancePath, JSON.stringify(provenance, null, 2) + "\n");
  console.log(JSON.stringify(audit.output));
} finally {
  await browser.close();
}
