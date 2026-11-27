-- 柳湾 · 家常盐水豌豆（32×32）
-- aseprite --batch --script draw-salted-peas.lua
-- 定稿画面按已选定的预览逐像素锁定：浅灰褐陶碟 + 三条熟荚（前一条微裂露豆）。
-- 色板 16 色；只落整像素，alpha 只有 0/255。

local out = app.fs.filePath(debug.getinfo(1, "S").source:sub(2))
local IC = 32

local function rgba(hex)
  return app.pixelColor.rgba((hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255)
end

local C = {
  ['#'] = rgba(0x3A332C), -- 陶碟外沿深边
  ['1'] = rgba(0x6B5E50), -- 沿口内暗缝
  ['2'] = rgba(0x8C7D6B), -- 碟壁暗面
  ['3'] = rgba(0xA3947F), -- 碟面
  ['4'] = rgba(0xB6A68F), -- 碟面受光
  ['5'] = rgba(0xC9B79E), -- 沿口高光
  ['w'] = rgba(0x7E7060), -- 碟心远侧阴影
  ['e'] = rgba(0x2C3B1D), -- 豆荚深边
  ['k'] = rgba(0x4A5E2C), -- 豆荚暗面
  ['g'] = rgba(0x617737), -- 豆荚橄榄面
  ['G'] = rgba(0x7C9346), -- 豆荚主体
  ['L'] = rgba(0x98AD5C), -- 豆荚受光
  ['P'] = rgba(0xB0C477), -- 豆瓣
  ['Q'] = rgba(0xCFDB9C), -- 豆瓣受光
  ['W'] = rgba(0xE6EAD0), -- 沥水亮面
  ['S'] = rgba(0xF2F0E0), -- 盐粒
}

local rows = {
    "................................",
    "................................",
    "................................",
    "................................",
    "................................",
    "................................",
    "................................",
    "................................",
    "..........##############........",
    ".......####55555eeeLLLLL##......",
    ".....###5115w33eLLLLLGGGGL#.....",
    "...###eeeee333eLLGGGGGGGGe###...",
    "..##5eLLWWLeeeeGGGWGGGkgge13##..",
    ".##5eGGGGGLLLLeegggekkeee3w13##.",
    ".##1ekGGGGGGGLLeeee3eW33333w1##.",
    ".#51wekgkGGGGGGe33333333333w12#.",
    ".#51w3eeekgkgGge3S33333S333w12#.",
    ".##1w444Leeeeeeeeee44444444w1##.",
    ".##41w4eegQPWPgPgkGe444444w12##.",
    "..##41eGGkPgGGGGGGe444444w12##..",
    "...###ekggggggggke44444w12###...",
    ".....##eeeWeeeeee44ww112###.....",
    ".......####3222222222####.......",
    "...###########################..",
    "..#######44333333333333########.",
    "...#########222222222#########..",
    ".........##############.........",
    "............#########...........",
    "................................",
    "................................",
    "................................",
    "................................",
}

local icon = Sprite(IC, IC, ColorMode.RGB)
local layer = icon:newLayer()
layer.name = "Dish"
local pixels = Image(IC, IC, ColorMode.RGB)
for y, row in ipairs(rows) do
  assert(#row == IC, "row " .. y .. " has " .. #row .. " chars")
  for x = 1, IC do
    local code = row:sub(x, x)
    if code ~= "." then pixels:drawPixel(x - 1, y - 1, assert(C[code], code)) end
  end
end
icon:newCel(layer, 1, pixels, Point(0, 0))

assert(icon:saveAs(app.fs.joinPath(out, "salted-peas-32x32.aseprite")))
assert(icon:saveCopyAs(app.fs.joinPath(out, "salted-peas-32x32.png")))
icon:close()
print("Exported salted-peas-32x32")
