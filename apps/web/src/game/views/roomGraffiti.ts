import type Phaser from 'phaser';

// Hand-drawn Cyrillic strokes, in a 20×30 design cell. No system font or luminous text.
const strokes: Record<string, number[][]> = {
  'П': [[0,30,1,1,19,0,20,30]], 'У': [[0,0,10,17,20,0],[10,17,6,28,1,31]],
  'С': [[19,3,14,0,5,1,0,8,0,22,5,29,14,30,20,27]],
  'Т': [[0,0,20,0],[10,0,10,30]], 'Ь': [[0,0,0,30,12,30,20,26,20,20,15,16,0,16]],
  'Р': [[0,30,0,0,13,0,20,5,20,12,14,17,0,17]],
  'Е': [[20,0,0,0,0,30,20,30],[0,14,16,14]],
  'Ш': [[0,0,0,30,20,30,20,0],[10,0,10,30]],
  'И': [[0,0,0,30,20,0,20,30]], 'Я': [[20,30,20,0,7,0,0,4,0,12,6,17,20,17],[12,17,0,30]],
  'А': [[0,30,9,0,12,0,20,30],[4,19,16,19]],
  'М': [[0,30,0,0,10,16,20,0,20,30]],
  'О': [[10,0,3,2,0,10,1,23,6,30,15,29,20,22,20,8,16,1,10,0]],
  'Б': [[20,0,0,0,0,30,13,30,20,25,20,19,14,14,0,14]],
  'Й': [[0,0,0,30,20,0,20,30],[5,-8,8,-5,13,-5,16,-8]],
};

export function roomGraffiti(scene: Phaser.Scene): string {
  const key = 'room-painted-graffiti';
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, 480, 160)!;
  const c = texture.context;
  let seed = 617;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const [row, text] of ['ПУСТЬ РЕШИТСЯ', 'САМО СОБОЙ'].entries()) {
    const advance = 32, left = (480 - text.length * advance) / 2;
    [...text].forEach((letter, index) => {
      if (letter === ' ') return;
      c.save(); c.translate(left + index * advance, 25 + row * 68 + random() * 5);
      c.transform(1, random() * .08 - .04, -.12, 1.35 + random() * .15, 0, 0);
      c.rotate((random() - .5) * .10);
      for (const path of strokes[letter]) {
        c.beginPath();
        for (let i = 0; i < path.length; i += 2) {
          const x = path[i] + (random() - .5) * .9, y = path[i + 1] + (random() - .5) * .9;
          if (!i) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.strokeStyle = `rgba(159,144,123,${.68 + random() * .23})`;
        c.lineWidth = 2.4 + random() * 1.4; c.stroke();
      }
      if (index % 4 === 1) {
        c.beginPath(); c.moveTo(1, 28); c.lineTo(1.4, 35 + random() * 7);
        c.lineWidth = .7; c.strokeStyle = '#9b8b7560'; c.stroke();
      }
      c.restore();
    });
  }
  // Sparse paint, pores and worn chips use the same seeded surface on every visit.
  c.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 2200; i++) {
    c.globalAlpha = .2 + random() * .65;
    c.fillRect(random() * 480, random() * 160, .5 + random() * 2, .4 + random());
  }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; texture.refresh();
  return key;
}
