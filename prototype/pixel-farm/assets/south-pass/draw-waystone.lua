-- 柳湾南口的路碑：矮石基 + 不规则灰褐石碑 + 一块空白木牌。
-- 运行：D:\Aseprite\aseprite.exe --batch --script draw-waystone.lua
local output = app.fs.filePath(debug.getinfo(1, "S").source:sub(2))

local palette = {
  -- 石：压到中间偏暗，让浅色木牌跳出来；深边仍是本色最深一档
  edge      = 0x3B332E,
  stoneDark = 0x6D5D50,
  stoneSh   = 0x7D6D5D,
  stone     = 0x95806A,
  stoneLit  = 0xAC9479,
  stoneTop  = 0xBDA78B,
  chip      = 0xCBB99C, -- 缺角露出的新茬
  -- 苔：压暗的橄榄绿，跟草地同一族
  moss      = 0x5C6A3A,
  mossLit   = 0x748247,
  -- 木牌：暖色但压住饱和度，作为文字底
  woodEdge  = 0x3B2A1A,
  woodDark  = 0x664526,
  woodSh    = 0x7E5732,
  wood      = 0x9A6F41,
  woodLit   = 0xBC9364,
  woodTop   = 0xCFA97A,
}

for name, rgb in pairs(palette) do
  palette[name] = app.pixelColor.rgba((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, 255)
end

local function span(image, y, left, right, tone)
  for x = left, right do image:drawPixel(x, y, palette[tone]) end
end

local function spans(image, tone, segments)
  for _, s in ipairs(segments) do span(image, s[1], s[2], s[3], tone) end
end

local function layer(sprite, name, draw)
  local target = sprite:newLayer(); target.name = name
  local pixels = Image(sprite.width, sprite.height, ColorMode.RGB)
  draw(pixels)
  sprite:newCel(target, 1, pixels, Point(0, 0))
end

local function save(sprite, name)
  while #sprite.layers > 1 and sprite.layers[1].name == "Layer 1" do
    sprite:deleteLayer(sprite.layers[1])
  end
  assert(sprite:saveAs(app.fs.joinPath(output, name .. ".aseprite")))
  assert(sprite:saveCopyAs(app.fs.joinPath(output, name .. ".png")))
  sprite:close(); print("Exported " .. name)
end

-- 石碑剪影：左肩缺一口、右肩崩一块，脚部略外撇
local slab = {
  {14, 19, 23},
  {15, 19, 25},
  {16, 17, 26}, -- 右上崩掉一块，肩线断开
  {17, 16, 29},
  {18, 15, 31},
  {19, 15, 33},
  {20, 14, 34},
  {21, 14, 34},
  {22, 14, 34},
  {23, 14, 34},
  {24, 14, 34},
  {25, 14, 34},
  {26, 14, 34},
  {27, 14, 34},
  {28, 14, 34},
  {29, 14, 34},
  {30, 14, 33}, -- 右腰磕掉一列
  {31, 14, 34},
  {32, 14, 34},
  {33, 13, 34},
  {34, 13, 35},
  {35, 13, 35},
  {36, 14, 34},
  {37, 13, 35},
  {38, 13, 35},
}

-- 木牌：17 宽、10 行，1 像素木框包着 13×6 的单色空白面
local BOARD_T, BOARD_B = 20, 29
local FACE_L, FACE_R = 18, 30
local FACE_T, FACE_B = 22, 27

local waystone = Sprite(48, 48, ColorMode.RGB)

-- 先画碑身、再画石基：石基顶面盖住碑脚，读成碑插进石座
layer(waystone, "Slab", function(image)
  for _, r in ipairs(slab) do
    local y, l, rr = r[1], r[2], r[3]
    -- 外缘：本色最深的一档
    span(image, y, l, rr, "edge")
    if rr - l >= 3 then
      span(image, y, l + 1, l + 1, "stoneLit")
      span(image, y, l + 2, rr - 2, "stone")
      span(image, y, rr - 1, rr - 1, "stoneSh")
    end
  end
  -- 顶面：左亮右暗，逐行收进，别碰描边
  spans(image, "stoneLit", {{14, 20, 21}, {15, 20, 22}, {16, 18, 19}, {17, 17, 18}, {18, 16, 17}})
  spans(image, "stoneTop", {{14, 22, 22}, {15, 23, 24}})
  spans(image, "stone", {{16, 20, 24}, {17, 19, 26}, {18, 18, 28}, {19, 17, 31}})
  -- 顶面右角的崩口：露出浅茬
  spans(image, "chip", {{16, 25, 25}, {17, 27, 28}, {18, 29, 30}})
  -- 石面风化：只沿边缘与腰线，中段留平
  spans(image, "stoneSh", {{20, 33, 33}, {24, 33, 33}, {28, 33, 33}})
  spans(image, "stoneDark", {{30, 15, 15}, {34, 34, 34}})
  -- 一条从上往下的细裂纹，止于木牌上沿
  spans(image, "stoneDark", {{17, 27, 27}, {18, 27, 27}, {19, 27, 28}})
  -- 右腰磕掉那一列的暗面
  span(image, 31, 33, 33, "stoneSh")
  image:drawPixel(13, 35, palette.stoneDark)
  -- 苔：碑脚与右侧石缝
  spans(image, "moss", {{36, 14, 17}, {37, 13, 18}, {37, 33, 34}, {35, 35, 35}})
  spans(image, "mossLit", {{36, 14, 16}, {37, 14, 15}})
  image:drawPixel(20, 38, palette.moss)
  -- 碑脚插进石基的一道压暗接缝
  span(image, 38, 15, 33, "stoneDark")
end)

layer(waystone, "Base stone", function(image)
  -- 压低的石基：顶面两行、正面两行、接地一行
  local rows = {
    {39, 14, 34}, {40, 10, 37},
    {41, 10, 37}, {42, 11, 36}, {43, 12, 35},
  }
  for _, r in ipairs(rows) do
    local y, l, rr = r[1], r[2], r[3]
    span(image, y, l, rr, "edge")
    if y <= 40 then
      span(image, y, l + 1, rr - 1, y == 39 and "stoneLit" or "stone")
    else
      span(image, y, l + 1, rr - 1, "stoneSh")
    end
  end
  -- 顶面：后沿压暗一道，前沿留亮
  span(image, 39, 15, 33, "stone")
  spans(image, "stoneTop", {{39, 18, 30}})
  spans(image, "stoneLit", {{40, 11, 36}})
  -- 正面：左亮右暗
  spans(image, "stone", {{41, 12, 27}, {42, 14, 26}})
  spans(image, "stoneDark", {{41, 34, 36}, {42, 31, 35}})
  -- 石缝与缺口
  spans(image, "stoneDark", {{41, 20, 20}, {42, 20, 21}, {42, 17, 17}})
  image:drawPixel(14, 42, palette.stoneDark)
  image:drawPixel(31, 42, palette.stoneDark)
  -- 苔：石基左端与右侧底角
  spans(image, "moss", {{40, 12, 14}, {41, 11, 12}, {41, 34, 35}, {42, 31, 33}})
  spans(image, "mossLit", {{40, 13, 14}, {41, 12, 12}})
  -- 接地的一行压到最深，脚点才稳
  span(image, 43, 13, 34, "edge")
end)

layer(waystone, "Wood board", function(image)
  -- 手劈的小木牌：中部鼓、两端收，四角各啃掉一像素
  local rows = {
    {20, 17, 31},
    {21, 16, 32},
    {22, 16, 32},
    {23, 16, 32},
    {24, 16, 32},
    {25, 16, 32},
    {26, 16, 32},
    {27, 16, 32},
    {28, 16, 31},
    {29, 17, 30},
  }
  for index, r in ipairs(rows) do
    local y, l, rr = r[1], r[2], r[3]
    span(image, y, l, rr, "woodTop")
    local tone = "woodLit"
    if index == 1 then tone = "woodTop"
    elseif index == 2 then tone = "woodLit"
    elseif index == 9 then tone = "woodSh"
    elseif index == 10 then tone = "woodDark" end
    span(image, y, l + 1, rr - 1, tone)
  end
  -- 背光侧压深：板厚落在右下，左上不描边
  for _, r in ipairs(rows) do
    image:drawPixel(r[3], r[1], palette.woodEdge)
  end
  span(image, 29, 17, 29, "woodEdge")
  span(image, 28, 17, 30, "woodDark")
  -- 牌面：整块单色空白，给游戏写字
  for y = FACE_T, FACE_B do
    span(image, y, FACE_L, FACE_R, "woodLit")
  end
  -- 左右木框压暗一档，让空白面的边界看得清
  for y = FACE_T, FACE_B do
    image:drawPixel(FACE_L - 1, y, palette.woodSh)
    image:drawPixel(FACE_R + 1, y, palette.woodSh)
  end
  -- 钉子：左右木框各一颗
  image:drawPixel(17, 24, palette.woodEdge)
  image:drawPixel(31, 24, palette.woodEdge)
  -- 木牌在石面上投的接触阴影
  span(image, 30, 17, 31, "stoneDark")
  -- 苔从石碑爬上木牌左下角，破掉牌面的矩形感
  image:drawPixel(16, 28, palette.moss)
  image:drawPixel(16, 29, palette.mossLit)
end)

local placement = waystone:newSlice(Rectangle(0, 0, 48, 48))
placement.name = "Placement"
placement.pivot = Point(24, 43)

local textArea = waystone:newSlice(Rectangle(FACE_L, FACE_T, FACE_R - FACE_L + 1, FACE_B - FACE_T + 1))
textArea.name = "TextArea"
textArea.pivot = Point(24, 24)

save(waystone, "waystone-48x48")
