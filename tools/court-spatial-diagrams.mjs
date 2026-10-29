import { mkdir, writeFile } from 'node:fs/promises';
const dir = 'docs/previews/court-spatial-v8';
await mkdir(dir, { recursive: true });
const shell = (height, content) => `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${height}" viewBox="0 0 1100 ${height}"><style>text{font:16px Arial;fill:#d8e1e6}.small{font-size:13px}.title{font-size:24px}rect,path,line{vector-effect:non-scaling-stroke}</style><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#c7ad77"/></marker></defs><rect width="1100" height="${height}" fill="#17212b"/>${content}</svg>`;
await writeFile(`${dir}/plan.svg`, shell(760, `
<text x="35" y="38" class="title">План двора сверху — уровень земли один</text>
<rect x="50" y="95" width="130" height="405" fill="#3e4650" stroke="#92a0ac"/><text x="64" y="130">Жилой дом</text><text x="62" y="155" class="small">вне арены</text>
<rect x="220" y="95" width="710" height="410" fill="#303d47" stroke="#8b999f"/>
<path d="M220 505 V95 H930 V505 M220 505 H270 M400 505 H790 M920 505 H930" fill="none" stroke="#ad8f74" stroke-width="4"/>
<text x="470" y="80">Дальняя ограда и деревья</text><text x="943" y="270" class="small">Ограда</text>
<rect x="255" y="120" width="640" height="335" fill="none" stroke="#9fbcbd" stroke-dasharray="7 5"/>
<text x="445" y="310">Арена: свободные X и Y</text><text x="430" y="336" class="small">логические 640 × 134; изображение 640 × 281,4</text>
<text x="270" y="435" class="small">X=180…820; Y=356…490 (симуляция)</text>
<rect x="430" y="100" width="70" height="10" fill="#a3a2a0"/><ellipse cx="465" cy="123" rx="16" ry="8" fill="none" stroke="#ac8770" stroke-width="3"/>
<text x="510" y="113" class="small">Одно кольцо, 3,05 м</text>
<rect x="35" y="525" width="1010" height="40" fill="#596065"/><text x="45" y="552">Тротуар и низкий бордюр; под проходами бордюра нет</text>
<rect x="35" y="578" width="1010" height="90" fill="#303940"/><text x="45" y="657">Улица раннера</text><text x="825" y="657">Продолжение →</text>
<path d="M60 610 H335 V477 L575 287.5" fill="none" stroke="#c7ad77" stroke-width="4" marker-end="url(#arrow)"/>
<path d="M575 287.5 L855 477 V610 H1030" fill="none" stroke="#c7ad77" stroke-width="4" stroke-dasharray="10 5" marker-end="url(#arrow)"/>
<text x="260" y="495" class="small">Вход, 130 px</text><text x="795" y="495" class="small">Выход, 130 px</text>
<text x="35" y="711">Сплошная стрелка — вход за 4,8 с; пунктир — выход за 4,6 с.</text>
<text x="35" y="737" class="small">Схема топологии. Экранные Y — проекция глубины, не высота над землёй.</text>`));
await writeFile(`${dir}/depth.svg`, shell(535, `
<text x="35" y="38" class="title">Глубина композиции и отображение</text>
<path d="M80 90 V475" stroke="#8296a6" stroke-width="2" marker-end="url(#arrow)"/>
<text x="100" y="97">Дальний город / деревья — основание за дальней оградой</text>
<text x="100" y="155">Y=80 — дальняя ограда и опора кольца (за ареной)</text>
<rect x="100" y="183" width="900" height="135" fill="#303d47" stroke="#9fbcbd"/>
<text x="125" y="217">Арена: Y изображения = 100 + (Y симуляции − 356) × 2,1</text>
<text x="125" y="251">Стопы героя: Y=100…381,4; спрайт 94 × 94 с исходными полями</text>
<text x="125" y="285">Звезда: радиусы опасной области 29 × 27,405; те же X/Y, что у стоп</text>
<text x="100" y="355">Y=408 — ближняя низкая ограда, два открытых прохода</text>
<text x="100" y="397">Y=420…434 — тротуар; бордюр обычной высоты</text>
<text x="100" y="439">Y=438 — улица, стопы раннера; дом слева опирается на Y=435</text>
<text x="35" y="493" class="small">RUNNER: верх кадра 0. COURT_ACTIVE: −115 (landscape), −170 (portrait, ширина 800).</text>
<text x="35" y="518" class="small">Вид с улицы: Y = 438 + (Y арены − 438) × 0,25. При входе сокращение плавно уходит к 1.</text>`));
console.log(`Spatial diagrams: ${dir}`);
